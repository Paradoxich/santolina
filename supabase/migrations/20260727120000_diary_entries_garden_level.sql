-- Garden-level diary entries: notes about the garden itself (weather, first
-- frost, general observations), not any one plant. plant_id is the only
-- discriminator — no separate "kind"/"entry_type" column — a null plant_id
-- simply means the entry belongs to the garden, not a plant.

alter table public.diary_entries
  alter column plant_id drop not null;

-- palette_plant_id is meaningless without a plant; keep that pairing honest
-- as the schema now allows plant_id to be null.
alter table public.diary_entries
  add constraint diary_entries_palette_requires_plant
    check (plant_id is not null or palette_plant_id is null);
