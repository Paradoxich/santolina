-- Migration: per-column stamp locks, so a run can earn `confirming` back
--
-- WHAT THIS IS FOR — trap 29. A stamp witness asks `stamp ∈ [started_at,
-- finished_at]`, which is a question about COINCIDENCE, not authorship. Two
-- runs of the same step from two worktrees against this one database overlap:
-- A stamps rows 1-20, B stamps 21-40, both query the column, both see 40, both
-- satisfy `count >= rowCount`, and both would record `confirmed` for work
-- neither did. The fix shipped in August was to stop claiming it — every stamp
-- is `corroborating` because exclusivity was never established.
--
-- This establishes it. A run takes a lock on each stamp column it may write,
-- and only a run that HELD its lock for its whole window may call a stamp
-- witness confirming.
--
-- WHY THIS IS ONLY MEANINGFUL NOW. Trap 29 said it plainly: a lock cannot bind
-- a script that does not take it, and six writers were not yet on run
-- provenance, so a lock added then "would fail to lock while licensing
-- confirmed". `RUNS_WITHOUT_PROVENANCE` reached zero on 2026-08-17. Every
-- script that writes a stamp now goes through `beginRun`, so a lock acquired
-- there binds all of them — and shape 8 fails the day one stops.
--
-- WHY A TABLE AND NOT `pg_advisory_lock`. A session-level advisory lock lives
-- on the CONNECTION, and every one of these scripts talks to PostgREST through
-- a connection pool: the connection is handed back between statements, so the
-- lock would be released at a moment nothing in the script can observe. A
-- transaction-level advisory lock has the opposite problem — these runs are
-- hundreds of separate statements over an hour, not one transaction. So the
-- lock has to be a row.
--
-- WHY IT EXPIRES. A process killed with SIGKILL leaves its row behind, and a
-- lock nobody can clear turns into a step nobody can run — the failure mode
-- that gets a safety mechanism deleted. `expires_at` lets the next run take an
-- abandoned lock. The TTL is generous rather than clever: the longest real pass
-- is a whole-catalog curation run measured in hours.
--
-- WHY EXPIRY DOES NOT SILENTLY WEAKEN THE CLAIM. A run whose lock expired
-- mid-way, or was taken by someone else, has NOT been exclusive. It cannot
-- detect that by holding a boolean it set at the start, so `holds_stamp_lock`
-- is re-checked at finalisation and a run that lost its lock records
-- `corroborating` with the reason. Verification happens at finalisation, inside
-- the run, for the same reason the rest of this module does it there.

create table if not exists public.stamp_locks (
  -- One row per COLUMN, not per step. Trap 29's whole point: five of the
  -- witnessed columns have more than one writing step, so a per-step lock
  -- would serialise the wrong thing and prove nothing.
  column_name text primary key,
  run_id text not null,
  step text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);

comment on table public.stamp_locks is 'Per-column write locks held by an in-flight run (scripts/run-provenance.ts). A row means some run may be writing that stamp column right now. Rows are transient; an expired row is abandoned and may be taken.';

-- No policies, so RLS denies everyone. The service role bypasses RLS and is the
-- only context these scripts run in. Same shape as the rest of the pipeline's
-- service-only surface.
alter table public.stamp_locks enable row level security;

revoke all on table public.stamp_locks from anon, authenticated;
grant all on table public.stamp_locks to service_role;

-- Take the lock, or report who holds it.
--
-- The insert-on-conflict is what makes this atomic: two runs racing for the
-- same column both issue this statement and Postgres serialises them on the
-- primary key, so exactly one sees `acquired = true`. Checking-then-inserting
-- from the client would be a race with a comment claiming it wasn't.
create or replace function public.acquire_stamp_lock(
  p_column text,
  p_run_id text,
  p_step text,
  p_ttl_seconds integer default 21600
)
returns table (acquired boolean, holder_run_id text, holder_step text, holder_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- clock_timestamp(), not now(): now() is TRANSACTION start time and is frozen
  -- for the whole statement batch. Each RPC call is its own transaction in
  -- production so the two agree there, but they do not agree under a psql batch
  -- or a future caller that wraps several acquisitions — and a lock whose
  -- expiry silently depends on how it was invoked is not a lock.
  v_now timestamptz := clock_timestamp();
begin
  insert into public.stamp_locks as l (column_name, run_id, step, acquired_at, expires_at)
  values (p_column, p_run_id, p_step, v_now, v_now + make_interval(secs => p_ttl_seconds))
  on conflict (column_name) do update
    set run_id = excluded.run_id,
        step = excluded.step,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
    -- Only an ABANDONED lock may be taken. A live holder keeps it, and the
    -- caller is told who and until when rather than being handed a failure it
    -- cannot act on.
    where l.expires_at < v_now;

  if found then
    return query select true, p_run_id, p_step, v_now + make_interval(secs => p_ttl_seconds);
    -- `return query` APPENDS to the result set and does NOT exit the function.
    -- Without this the successful path fell through to the lookup below and the
    -- caller got TWO rows — an `acquired = true` followed by an
    -- `acquired = false` for the lock it had just taken. Caught by running it.
    return;
  end if;

  return query
    select false, l.run_id, l.step, l.expires_at
    from public.stamp_locks l
    where l.column_name = p_column;
end;
$$;

-- Did THIS run still hold the lock? Re-checked at finalisation, because a lock
-- that expired mid-run bought no exclusivity for the part of the window after
-- it lapsed.
create or replace function public.holds_stamp_lock(p_column text, p_run_id text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stamp_locks
    where column_name = p_column
      and run_id = p_run_id
      and expires_at >= clock_timestamp()
  )
$$;

-- Release only your own. A run must never free a lock another run took after
-- its own expired, or the second run's exclusivity claim would be broken by the
-- first run's cleanup.
create or replace function public.release_stamp_lock(p_column text, p_run_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.stamp_locks
  where column_name = p_column and run_id = p_run_id;
  return found;
end;
$$;

revoke execute on function public.acquire_stamp_lock(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.holds_stamp_lock(text, text) from public, anon, authenticated;
revoke execute on function public.release_stamp_lock(text, text) from public, anon, authenticated;
grant execute on function public.acquire_stamp_lock(text, text, text, integer) to service_role;
grant execute on function public.holds_stamp_lock(text, text) to service_role;
grant execute on function public.release_stamp_lock(text, text) to service_role;
