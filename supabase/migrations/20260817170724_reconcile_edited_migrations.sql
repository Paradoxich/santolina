-- Migration: restate the one statement that lived only in a FILE
--
-- WHERE THIS CAME FROM. The content half of `pnpm migrations:check` shipped
-- 2026-08-17 and, on its first run against production, found three migrations
-- whose committed text no longer matched the SQL the ledger recorded. Each was
-- checked against the live database rather than assumed, and only one needed
-- anything applied:
--
--   20260712201853  the file was later schema-qualified and given
--                   `if not exists`. Same effect, so it was reverted to the
--                   applied text and there is nothing to re-apply.
--
--   20260714120000  the file's `comment on column diary_entries.event_type`
--                   never ran — and CANNOT run now. `event_type` (text) was
--                   replaced by `event_types` (text[]) three days later by
--                   20260724081741, which carries its own column comment. So
--                   the file was reverted to the ALTER it actually applied and
--                   the orphaned comment is simply gone. Applying it here
--                   failed with "column event_type does not exist", which is
--                   how the supersession was found: a null col_description
--                   means "no comment" OR "no column", and the first reading
--                   was taken for the second.
--
--   20260721195021  one `update` the file's own comment says was applied via
--                   execute_sql, so the file claimed a statement no ledger row
--                   had ever recorded. Verified first: Myrrhis odorata's autumn
--                   text in production is already the corrected sentence.
--                   Restated below, guarded.
--
-- WHY RESTATE A NO-OP. It changes nothing today, and that is the point: the
-- defect was never the data, it was a committed file describing a write with no
-- record behind it. Deleting the statement outright would have thrown away the
-- reasoning for a correction that really was made; this keeps it and makes the
-- record true. The `where` clause means a re-run and a fresh replay both land
-- on the same state.
--
-- THE RULE THIS ENFORCES, now that something checks it: never edit an applied
-- migration in place. Write a new one.

-- Guarded on the OLD text, so this is a no-op wherever the correction already
-- landed (production) and a real write on a replay from scratch (local).
update public.plants
set seasonal_rhythm = jsonb_set(
  seasonal_rhythm,
  '{autumn}',
  to_jsonb('Foliage begins to yellow and die back as temperatures cool. Any seed not cut earlier has already scattered.'::text)
)
where scientific_name = 'Myrrhis odorata'
  and seasonal_rhythm->>'autumn' = 'Foliage begins to yellow and die back as temperatures cool. Seeds scatter freely if not deadheaded.';
