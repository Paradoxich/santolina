-- Track when AI curation has drafted a plant's fields, separately from
-- is_curated (which should mean "human-reviewed and confirmed").
alter table public.plants
  add column ai_drafted_at timestamptz;
comment on column public.plants.ai_drafted_at is 'When the AI curation pass last drafted fields for this plant. is_curated stays false until a human reviews and confirms.';
