-- Make table access an explicit fact of the schema instead of an accident of
-- when the production project was created.
--
-- FOUND BY THE FIRST LOCAL REPLAY (2026-08-13). No migration has ever granted
-- table privileges: production's anon / authenticated / service_role got full
-- DML from the platform's default privileges as they stood when the project
-- was created in July 2026. Current Supabase images ship a harder baseline —
-- API roles get no SELECT / INSERT / UPDATE / DELETE by default — so replaying
-- these migrations on a fresh instance yields a database PostgREST can see and
-- the app cannot read ("permission denied for table plants", found by the
-- cross-check smoke test against the local stack).
--
-- That fresh instance is not hypothetical: it is the disaster-recovery path.
-- The db-backups dump is restored INTO a newly created project by replaying
-- this directory first, and until this migration the result was broken in a
-- way no local test had ever been able to see.
--
-- WHAT IS GRANTED mirrors what production already has, so pushing this is a
-- no-op there: full table DML to the three API roles, with row access gated
-- by RLS and its policies exactly as today. Grants are the door, policies are
-- the lock; this migration adds no reach that production does not already
-- have. The narrower per-table story (public read on the catalog, owner-only
-- on user tables) lives in the policies, which are already in this directory.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;

-- Future tables created by postgres (i.e. every later migration) get the same
-- grants, matching production's default privileges.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
