-- Diary: one thread per (garden, plant) pair, surviving palette removal.
-- palette_plant_id is a convenience link to the live palette row, nullable
-- so entries persist even after a plant is removed from the garden.

create table public.diary_entries (
  id                uuid primary key default gen_random_uuid(),
  garden_id         uuid not null references public.gardens(id) on delete cascade,
  plant_id          uuid not null references public.plants(id),
  palette_plant_id  uuid references public.palette_plants(id) on delete set null,
  note              text,
  photo_urls        text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger diary_entries_set_updated_at
  before update on public.diary_entries
  for each row execute function set_updated_at();

create index diary_entries_garden_id_idx on public.diary_entries(garden_id);
create index diary_entries_plant_id_idx on public.diary_entries(plant_id);
create index diary_entries_palette_plant_id_idx on public.diary_entries(palette_plant_id);

alter table public.diary_entries enable row level security;

-- Matches the same pattern as gardens/palette_plants: real policy for when
-- auth exists, even though writes currently go through the service-role
-- client via the same temporary hardcoded-garden approach as everything else.
create policy "Users can manage diary entries for own garden"
  on public.diary_entries for all
  using (
    exists (
      select 1 from public.gardens
      where gardens.id = diary_entries.garden_id
      and gardens.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.gardens
      where gardens.id = diary_entries.garden_id
      and gardens.user_id = auth.uid()
    )
  );

comment on column public.diary_entries.palette_plant_id is 'Convenience link to the live palette_plants row. Nullable and set-null-on-delete so diary entries survive removing a plant from the garden — garden_id + plant_id is the true identity of a diary thread.';

-- Storage bucket for diary photos. Public read for now (no real per-user
-- privacy boundary exists yet — single hardcoded dev garden), matching the
-- same posture as the public plants catalog images. Revisit once real
-- auth/profiles exist — see docs/repo-strategy.md-style reasoning.
insert into storage.buckets (id, name, public)
values ('diary-photos', 'diary-photos', true)
on conflict (id) do nothing;

create policy "Anyone can view diary photos"
  on storage.objects for select
  using (bucket_id = 'diary-photos');

-- Write policy mirrors the table's real-auth-ready shape; service-role
-- writes bypass this entirely for now, same temporary pattern as everywhere else.
create policy "Users can upload their own diary photos"
  on storage.objects for insert
  with check (bucket_id = 'diary-photos');

create policy "Users can delete their own diary photos"
  on storage.objects for delete
  using (bucket_id = 'diary-photos');
