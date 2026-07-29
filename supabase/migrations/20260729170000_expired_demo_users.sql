-- Migration: list expired demo accounts for the purge script
--
-- Demo visitors ("Look around first" on /login) are anonymous auth users. The
-- purge script needs to find the old ones, and the obvious way — the GoTrue
-- admin listUsers endpoint — cannot be relied on: that endpoint returns
-- 500 "Database error finding users" whenever per_page exceeds the total number
-- of users in the project. Verified July 29 2026 against this project at 5
-- users: per_page=5 returns 200, per_page=6 returns 500. So it fails exactly
-- when the user table is small, which is most of the time right now, and no
-- page size is safe as the count changes underneath it.
--
-- This function reads auth.users directly instead. It is deliberately narrow:
-- it returns ids and creation times for anonymous users past a cutoff, and
-- nothing else — no emails, no metadata, and nothing about real accounts. A
-- converted demo user (one who added an email via "Keep this garden") is no
-- longer anonymous and is invisible here, so the purge can never reach them.
create or replace function public.expired_demo_users(cutoff timestamptz)
returns table (user_id uuid, created_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select u.id, u.created_at
  from auth.users u
  where u.is_anonymous
    and u.created_at < cutoff
  order by u.created_at
$$;

-- security definer means this runs with the owner's rights, so the grant is the
-- only thing standing between a signed-in user and a list of auth ids. Postgres
-- grants execute to public by default; revoke that and hand it to the service
-- role alone, which is the only context the purge script runs in.
revoke execute on function public.expired_demo_users(timestamptz) from public;
revoke execute on function public.expired_demo_users(timestamptz) from anon;
revoke execute on function public.expired_demo_users(timestamptz) from authenticated;
grant execute on function public.expired_demo_users(timestamptz) to service_role;
