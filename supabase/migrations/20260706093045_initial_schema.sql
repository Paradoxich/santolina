-- Migration: initial schema
--
-- Represents the schema state at the very FIRST migration, i.e. BEFORE the
-- later migrations that rename perenual_id -> source_species_id, add
-- data_source, ai_drafted_at, the full plant-detail fields, the
-- upsert_trefle_plant function, the plant-detail display fields, and the
-- garden lat/lon columns.
--
-- Reconstructed from the live database by reversing migrations 2-7, so that
-- applying the migrations in order (this file first) reproduces the current
-- live schema with no drift. Note that at this point the external-species
-- column is still named `perenual_id`; its unique constraint and index keep
-- the `plants_perenual_id_key` / `plants_perenual_id_idx` names even after the
-- later rename, which is why the live database still reports those names.

-- ============================================================
-- Tables
-- ============================================================

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text,
  avatar_url text,
  experience_level text check (experience_level in ('beginner', 'intermediate', 'confident'))
);

create table public.gardens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text,
  city text,
  country text,
  climate_zone text,
  hardiness_zone text,
  space_type text check (space_type in ('ground_garden', 'raised_beds', 'terrace_balcony', 'mixed')),
  sun_exposure text check (sun_exposure in ('full_sun', 'partial_sun', 'shade', 'mixed')),
  size text check (size in ('small', 'medium', 'large', 'unknown')),
  style text[] not null default '{}',
  notes text
);

create table public.plants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  perenual_id integer unique,
  common_name text not null,
  scientific_name text,
  description text,
  care_level text check (care_level in ('low', 'medium', 'high')),
  bloom_months integer[] not null default '{}',
  peak_season text check (peak_season in ('spring', 'summer', 'autumn', 'winter')),
  height_min_cm integer,
  height_max_cm integer,
  hardiness_zone_min text,
  hardiness_zone_max text,
  sun_requirements text[] not null default '{}',
  space_types text[] not null default '{}',
  style_tags text[] not null default '{}',
  bloom_color text[] not null default '{}',
  foliage_color text,
  image_url text,
  image_urls text[] not null default '{}',
  is_curated boolean not null default false
);

create table public.palette_plants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  garden_id uuid not null references public.gardens (id) on delete cascade,
  plant_id uuid not null references public.plants (id) on delete cascade,
  status text check (status in ('planned', 'planted', 'considering')),
  source text check (source in ('generated', 'manual', 'existing')),
  position integer,
  notes text,
  added_at timestamptz not null default now()
);

create table public.plant_combinations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plant_id_a uuid not null references public.plants (id) on delete cascade,
  plant_id_b uuid not null references public.plants (id) on delete cascade,
  combination_type text check (combination_type in ('visual', 'ecological', 'seasonal')),
  strength text check (strength in ('strong', 'moderate', 'weak')),
  notes text,
  constraint plant_combinations_no_self_pair check (plant_id_a <> plant_id_b)
);

create table public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  garden_id uuid not null unique references public.gardens (id) on delete cascade,
  summary text,
  last_active timestamptz
);

-- ============================================================
-- Indexes
-- ============================================================

create index plants_perenual_id_idx on public.plants (perenual_id);
create index plants_is_curated_idx on public.plants (is_curated);
create index plants_style_tags_idx on public.plants using gin (style_tags);
create index plants_sun_requirements_idx on public.plants using gin (sun_requirements);
create index palette_plants_garden_id_idx on public.palette_plants (garden_id);
create index palette_plants_plant_id_idx on public.palette_plants (plant_id);
create index plant_combinations_plant_id_a_idx on public.plant_combinations (plant_id_a);
create index plant_combinations_plant_id_b_idx on public.plant_combinations (plant_id_b);

-- ============================================================
-- updated_at trigger
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger gardens_set_updated_at before update on public.gardens
  for each row execute function public.set_updated_at();
create trigger plants_set_updated_at before update on public.plants
  for each row execute function public.set_updated_at();
create trigger palette_plants_set_updated_at before update on public.palette_plants
  for each row execute function public.set_updated_at();
create trigger agent_sessions_set_updated_at before update on public.agent_sessions
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.users enable row level security;
alter table public.gardens enable row level security;
alter table public.plants enable row level security;
alter table public.palette_plants enable row level security;
alter table public.plant_combinations enable row level security;
alter table public.agent_sessions enable row level security;

create policy "Users can read own row" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own row" on public.users
  for update using (auth.uid() = id);

create policy "Users can manage own gardens" on public.gardens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Anyone can read plants" on public.plants
  for select using (true);

create policy "Users can manage palette plants for own garden" on public.palette_plants
  for all using (
    exists (
      select 1 from public.gardens
      where gardens.id = palette_plants.garden_id
        and gardens.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.gardens
      where gardens.id = palette_plants.garden_id
        and gardens.user_id = auth.uid()
    )
  );

create policy "Anyone can read plant combinations" on public.plant_combinations
  for select using (true);

create policy "Users can read own agent sessions" on public.agent_sessions
  for select using (
    exists (
      select 1 from public.gardens
      where gardens.id = agent_sessions.garden_id
        and gardens.user_id = auth.uid()
    )
  );
