-- Migration: auto-provision a profile + garden on signup
--
-- When a new auth user is created, create their public.users row and one
-- empty public.gardens row. This is the "garden auto-provisioned, never set
-- up" decision (docs/architecture.md §24): the app is single-garden in v1, so
-- there is nothing to configure — the garden exists the moment the user does.
--
-- The garden is deliberately left empty. Its `city`/`lat`/`lon` stay null; a
-- null location is the first-run flag that routes the user to the required
-- location step. No separate "onboarding complete" column is needed.
--
-- display_name / avatar_url are populated from OAuth identity metadata when
-- present (Google supplies full_name/name/avatar_url); for magic-link signups
-- they are null and the sidebar falls back to the email.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.gardens (user_id)
  values (new.id);

  return new;
end;
$$;

-- Fires once per new auth user. `security definer` lets the function insert
-- into RLS-protected tables; the empty search_path forces schema-qualified
-- names so the definer context can't be hijacked by a spoofed search_path.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
