-- Migration: add full plant-detail ("plant detail page") fields
--
-- Adds aliases, a coarse plant_type enum used for logic, taxonomy/origin,
-- spread, and the AI-curated prose fields backing the plant detail page.
-- Column types, defaults, checks and comments were reconstructed from the
-- live database. Columns are added in their live ordinal order.
alter table public.plants
  add column common_name_aliases text[] not null default '{}',
  add column plant_type text check (plant_type in ('annual', 'perennial', 'biennial', 'shrub', 'tree', 'grass', 'climber', 'succulent', 'bulb')),
  add column family text,
  add column native_to text,
  add column spread_min_cm integer,
  add column spread_max_cm integer,
  add column water_needs text,
  add column soil_needs text,
  add column maintenance_notes text,
  add column common_issues text,
  add column best_placement text,
  add column environment_benefits text,
  add column seasonal_rhythm jsonb,
  add column garden_use_tags text[] not null default '{}';

comment on column public.plants.plant_type is 'Life form/cycle: determines whether hardiness_zone is even meaningful (e.g. true annuals should have null hardiness zone)';
comment on column public.plants.seasonal_rhythm is 'jsonb object with keys: early_spring, late_spring, summer, late_summer, autumn, winter — each a short prose description';
comment on column public.plants.garden_use_tags is 'Use-case tags like "pollinator gardens", "gravel gardens" — distinct taxonomy from style_tags (cottage/mediterranean/etc.)';
