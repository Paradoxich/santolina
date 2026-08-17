-- Migration: have the applied-migration ledger return the SQL it applied
--
-- WHAT THE DRIFT CHECK COULD NOT SEE. `public.applied_migrations()` returned
-- version and name, so `pnpm migrations:check` compared IDENTITY only. A file
-- that was applied and then EDITED in the repo matched perfectly: same
-- version, same name, different SQL. That is trap 14's own shape one step
-- along — a migration file reading as applied when what is live is something
-- else — and it is the more likely form now that the loud version has a check.
--
-- Nothing is exposed that was not already reachable: `statements` is a column
-- of the same ledger row this function already reads, and the grant is
-- unchanged (service_role only, revoked from public/anon/authenticated). The
-- SQL text is DDL that is committed in this repository anyway.
--
-- WHY THE COMPARISON NORMALISES rather than comparing text to text. The ledger
-- stores PARSED statements, not the file, so the two never match literally:
-- measured against the local stack on 2026-08-17, a comment-and-whitespace
-- normalisation matched 0 of 38 migrations, and adding statement separators to
-- the normalisation matched 38 of 38. Comments, whitespace and semicolons are
-- therefore ignored; anything else differing is real drift. That measurement
-- is the whole warrant for the check, and it is repeatable — see
-- `normaliseSql` in apps/web/lib/migration-drift.ts.
-- DROP FIRST, because the return type is part of the signature and Postgres
-- refuses `create or replace` that changes it ("cannot change return type of
-- existing function"). Verified against the local stack before this landed.
drop function if exists public.applied_migrations();

create function public.applied_migrations()
returns table (version text, name text, statements text[])
language sql
security definer
set search_path = ''
as $$
  select m.version, m.name, m.statements
  from supabase_migrations.schema_migrations m
  order by m.version
$$;

-- The drop takes the grants with it, so a fresh function arrives with
-- Postgres's default `execute to public`. Repeating the revokes is not
-- belt-and-braces, it is required.
revoke execute on function public.applied_migrations() from public;
revoke execute on function public.applied_migrations() from anon;
revoke execute on function public.applied_migrations() from authenticated;
grant execute on function public.applied_migrations() to service_role;
