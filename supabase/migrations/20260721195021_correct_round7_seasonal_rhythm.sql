-- Data correction: seasonal_rhythm stage slips found by the seasonal_care
-- cross-check (scripts/cross-check-seasonal-care.ts), reviewed and applied
-- 2026-07-21. See docs/architecture.md §28.
--
-- Context: the round-7 seasonal_care distillation copied 11 wrong-stage
-- actions faithfully from seasonal_rhythm (the checker's UPSTREAM trace).
-- The care lines were fixed the same day via apply-seasonal-care-fixes.ts
-- (decisions: reports/seasonal-care-round7-fixes.csv, local); this migration
-- fixes the SOURCE text so a future re-distillation cannot regenerate the
-- slips. Rhythm entries behind flags ruled "keep - checker bias" are
-- deliberately untouched, as is Raspberry, whose rhythm text was accurate.
--
-- One-time record of corrections, NOT schema. Guards:
--   * matched on scientific_name (portable across environments), and
--   * only touches rows whose stage text still holds the exact reviewed
--     value, so any later edit wins and re-running is a no-op.
-- No is_curated guard: unlike the 2026-07-09 corrections these ARE the
-- editorial pass, and round-7 rows are already is_curated = true.

-- 1. African marigold: frost clear-away belongs with the autumn frost kill,
--    not winter.
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{autumn}',
  to_jsonb('Flowering persists until the first frosts. Plants continue to produce blooms well into autumn, then are killed by frost and should be cleared away.'::text))
where scientific_name = 'Tagetes erecta'
  and seasonal_rhythm->>'autumn' = 'Flowering persists until the first frosts. Plants continue to produce blooms well into autumn, providing reliable colour until killed by frost.';

update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{winter}',
  to_jsonb('Beds stand empty over winter. Being frost-tender annuals, they do not survive winter and must be replanted the following year.'::text))
where scientific_name = 'Tagetes erecta'
  and seasonal_rhythm->>'winter' = 'Plants are killed by first hard frost and should be cleared away. Being frost-tender annuals, they do not survive winter and must be replanted the following year.';

-- 2. Aji pepper: bringing plants indoors happens before first frost (autumn);
--    winter describes the already-overwintering state.
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{autumn}',
  to_jsonb('Fruiting slows as temperatures cool, with remaining peppers ripening on the plant. In mild climates plants continue growing; in cooler areas harvest final fruits and bring plants indoors before first frost.'::text))
where scientific_name = 'Capsicum baccatum'
  and seasonal_rhythm->>'autumn' = 'Fruiting slows as temperatures cool, with remaining peppers ripening on the plant. In mild climates plants continue growing; in cooler areas harvest final fruits before frost.';

update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{winter}',
  to_jsonb('Plants may survive as perennials in frost-free climates with reduced growth. In cooler regions plants left outside die back after frost; those brought in during autumn overwinter indoors.'::text))
where scientific_name = 'Capsicum baccatum'
  and seasonal_rhythm->>'winter' = 'Plants may survive as perennials in frost-free climates with reduced growth. In cooler regions plants die back or are removed after frost, though they can be overwintered indoors.';

-- 3. Caraway: seed collection / self-seeding decision sits at late-summer
--    maturity, so name it there instead of leaving autumn to imply it.
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{late_summer}',
  to_jsonb('Seeds mature and turn brown, ready for harvest or to leave for self-seeding. Plants complete their lifecycle after seed production.'::text))
where scientific_name = 'Carum carvi'
  and seasonal_rhythm->>'late_summer' = 'Seeds mature and turn brown, ready for harvest. Plants complete their lifecycle after seed production.';

-- 4. Catnip: by autumn the deadheading window has passed; drop the
--    "if not deadheaded" hook that generated a too-late care line.
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{autumn}',
  to_jsonb('Flowering tapers off in autumn. Foliage begins to fade and any seed heads left from summer self-sow freely.'::text))
where scientific_name = 'Nepeta cataria'
  and seasonal_rhythm->>'autumn' = 'Flowering tapers off in autumn. Foliage begins to fade and plants set seed if not deadheaded, often self-sowing freely.';

-- 5. Chervil is a cool-season herb: midsummer sowing bolts, re-sowing waits
--    for late summer (already described in the late_summer entry).
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{summer}',
  to_jsonb('White umbel flowers appear on established plants from May through August. Plants bolt readily in heat, ending the spring crop; fresh sowings wait until cooler late summer.'::text))
where scientific_name = 'Anthriscus cerefolium'
  and seasonal_rhythm->>'summer' = 'White umbel flowers appear on established plants from May through August. Plants bolt readily in heat and should be replaced with successive sowings for autumn.';

-- 6. Purslane sheds seed through summer; pulling unwanted plants belongs in
--    late summer, and autumn should not imply a last chance before frost.
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{late_summer}',
  to_jsonb('Continues flowering and producing seed; unwanted plants are best pulled now, before seed drops. Plants remain lush and green even in hot, dry conditions.'::text))
where scientific_name = 'Portulaca oleracea'
  and seasonal_rhythm->>'late_summer' = 'Continues flowering and producing seed. Plants remain lush and green even in hot, dry conditions.';

update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{autumn}',
  to_jsonb('Plants decline and collapse as temperatures cool, most of their seed already shed.'::text))
where scientific_name = 'Portulaca oleracea'
  and seasonal_rhythm->>'autumn' = 'Plants begin to decline as temperatures cool. Late flowers produce final seed before frost arrives.';

-- 7. Rocoto: the move indoors happens in autumn (already described there);
--    winter describes the overwintering state, not the move.
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{winter}',
  to_jsonb('In mild, frost-free climates, plants remain evergreen and may continue slow growth. In cooler zones, plants brought in during autumn overwinter indoors, or are treated as annuals and replanted in spring.'::text))
where scientific_name = 'Capsicum pubescens'
  and seasonal_rhythm->>'winter' = 'In mild, frost-free climates, plants remain evergreen and may continue slow growth. In cooler zones, plants must be protected indoors or treated as annuals and replanted in spring.';

-- 8. Sorrel: stalk removal is a spring/summer action already covered twice;
--    drop the late-summer "if not removed" hook that produced a third copy.
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{late_summer}',
  to_jsonb('Flowering continues into September. Seeds develop and ripen on any remaining flower stalks.'::text))
where scientific_name = 'Rumex acetosa'
  and seasonal_rhythm->>'late_summer' = 'Flowering continues into September. Seeds develop and ripen on flower stalks if not removed.';

-- 9. Stevia: plants do not reach pinching size until late spring; move the
--    15cm pinch cue there and keep early spring descriptive.
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{early_spring}',
  to_jsonb('New growth emerges in warm climates or when started indoors from cuttings, growing slowly until real warmth arrives.'::text))
where scientific_name = 'Stevia rebaudiana'
  and seasonal_rhythm->>'early_spring' = 'New growth emerges in warm climates or when started indoors from cuttings. Begin pinching tips once plants reach 15cm to encourage branching.';

update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{late_spring}',
  to_jsonb('Vigorous growth occurs with warming temperatures. Regular harvesting of leaves can begin. Pinch tips from 15cm tall to build a bushy shape.'::text))
where scientific_name = 'Stevia rebaudiana'
  and seasonal_rhythm->>'late_spring' = 'Vigorous growth occurs with warming temperatures. Regular harvesting of leaves can begin. Continue pinching to maintain bushy shape.';

-- 10. Sweet cicely flowers May-June and sheds seed fast: the cut-back cue
--     belongs in summer, and late summer is past flowering.
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{summer}',
  to_jsonb('White umbel flowers appear from June onwards, attracting pollinators. Cutting flower stems right after bloom prevents heavy self-seeding; the anise-scented foliage remains lush.'::text))
where scientific_name = 'Myrrhis odorata'
  and seasonal_rhythm->>'summer' = 'White umbel flowers appear from June onwards, attracting pollinators. The anise-scented foliage remains lush and attractive.';

update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{late_summer}',
  to_jsonb('Flowering has finished. Seeds ripen quickly and scatter freely if flower stems were left in place.'::text))
where scientific_name = 'Myrrhis odorata'
  and seasonal_rhythm->>'late_summer' = 'Flowering continues into late summer. Seeds develop and ripen, ready to disperse.';

-- 10b. Sweet cicely autumn carried the same "if not deadheaded" hook one
--      stage later still; by autumn the seed has long scattered. (Spotted
--      after the main batch; applied separately via execute_sql same day.)
update public.plants set seasonal_rhythm = jsonb_set(seasonal_rhythm, '{autumn}',
  to_jsonb('Foliage begins to yellow and die back as temperatures cool. Any seed not cut earlier has already scattered.'::text))
where scientific_name = 'Myrrhis odorata'
  and seasonal_rhythm->>'autumn' = 'Foliage begins to yellow and die back as temperatures cool. Seeds scatter freely if not deadheaded.';
