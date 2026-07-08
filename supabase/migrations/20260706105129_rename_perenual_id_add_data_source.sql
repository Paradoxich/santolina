-- Rename perenual_id to a provider-neutral name, now that we're using Trefle,
-- and track which provider supplied each row so future multi-source use is explicit.
alter table public.plants
  rename column perenual_id to source_species_id;
alter table public.plants
  add column data_source text not null default 'trefle';
comment on column public.plants.source_species_id is 'ID of the species in the external source API (Trefle, or others in future)';
comment on column public.plants.data_source is 'Which external API supplied this row''s botanical data, e.g. trefle';
