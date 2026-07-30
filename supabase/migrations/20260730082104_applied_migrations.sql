-- Migration: expose the applied-migration ledger to the drift check
--
-- WHY THIS EXISTS — trap 14 in docs/database-log.md. A committed migration is
-- not an applied migration, and nothing was watching: a garden-level diary
-- migration was merged and deployed without ever being applied, so saving a
-- note failed in production for a day. The check that catches it has to
-- compare supabase/migrations/ against the remote's own ledger, and CI has to
-- be able to read that ledger.
--
-- WHY A FUNCTION AND NOT THE OBVIOUS ROUTES. PostgREST only serves the
-- exposed schemas (public, graphql_public), and supabase_migrations is not
-- one of them, so the service role key alone cannot read the table. The two
-- alternatives were worse:
--
--   · exposing the supabase_migrations schema in the project's API settings
--     opens the whole schema to reach the anon key's surface, to solve a
--     read of two columns
--   · the Management API's migrations endpoint needs a personal access token,
--     which is a NEW repo secret, and a PAT is far broader than the service
--     role key -- it can act on every project in the organisation
--
-- This function needs no new secret and grants no new reach: service_role can
-- already read every table in the database, so handing it two columns of a
-- ledger widens nothing.
create or replace function public.applied_migrations()
returns table (version text, name text)
language sql
security definer
set search_path = ''
as $$
  select m.version, m.name
  from supabase_migrations.schema_migrations m
  order by m.version
$$;

-- security definer means this runs with the owner's rights, so the grant is
-- the only thing between a signed-in user and the schema history. Postgres
-- grants execute to public by default; revoke that and hand it to the service
-- role alone, which is the only context the drift check runs in. Same pattern
-- as public.expired_demo_users.
revoke execute on function public.applied_migrations() from public;
revoke execute on function public.applied_migrations() from anon;
revoke execute on function public.applied_migrations() from authenticated;
grant execute on function public.applied_migrations() to service_role;
