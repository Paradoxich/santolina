-- Fields discovered missing when mapping the real Plant Detail Figma frame
-- to the schema. All three are AI-curated, same as the other prose fields.
alter table public.plants
  add column light_needs text,
  add column water_needs_summary text,
  add column plant_type_label text;
comment on column public.plants.light_needs is 'Prose light requirements, parallel to water_needs/soil_needs (e.g. "Performs best in full sun. Tolerates light afternoon shade.")';
comment on column public.plants.water_needs_summary is 'Short category phrase for compact display (e.g. "Low to moderate") — distinct from the longer prose in water_needs';
comment on column public.plants.plant_type_label is 'Descriptive display label (e.g. "Herbaceous perennial") — distinct from the coarse plant_type enum used for logic (e.g. "perennial")';
