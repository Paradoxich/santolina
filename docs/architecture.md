# Santolina — Architecture Decisions

This document holds the **rationale** behind Santolina's architecture: why a
thing is shaped the way it is, and what was rejected on the way. Sections are
grouped by the part of the product they govern, oldest first within a group, so
a decision and the one that replaced it read as one story.

**What one round found is not rationale.** Counts, dated run results, per-plant
editorial calls and "this is what went wrong on July 27" belong in
[`database-log.md`](database-log.md), which is the decision and incident log.
A number typed here is stale the week after; generated counts live in
[`catalog-state.md`](catalog-state.md) and are linked, never retyped.

**Write compact.** If a paragraph can be a sentence, write the sentence. Do not
restate what a script header, a migration, or a component's own props already
say — link to it. Nobody reads a doc that describes the same thing three times,
which means the overlong version does not just waste space, it stops the load-
bearing parts from being read at all.

- [Plant data: the source, the schema, and the trust boundary](#group-plant-data)
- [The curation pipeline](#group-curation)
- [Accounts, sessions, and access](#group-accounts)
- [The garden you own](#group-garden)
- [Views derived at render time](#group-derived)
- [Interface conventions](#group-interface)

**Cite a section by its anchor, never by a number.** The `<a id="...">` above
each heading is the address: `docs/architecture.md#safe-upsert` from code,
`[the safe Trefle upsert](#safe-upsert)` from prose. Sections were numbered
until July 30 2026 and this file could not be reorganised while 220 citations
pointed at those numbers. `pnpm docs:links` fails on a reference that resolves
to nothing and on any new `§N`; the numbers still cited by applied migrations
and archived reports are mapped in [the appendix](#appendix-retired-numbers).

**A decision that supersedes another replaces it.** Cut the superseded section
down to what only it holds — the alternative that was rejected and why it looked
right — and delete the current-state description, which now lives in the section
that replaced it. Two copies is precisely what rots: one gets updated, both keep
reading as fact. Never bolt an amendment on the end.

---

<a id="group-plant-data"></a>

## Plant data: the source, the schema, and the trust boundary

<a id="plant-data-provider"></a>

### Plant data provider: Trefle, not Perenual

**Decision:** Use [Trefle](https://trefle.io) (`TREFLE_API_KEY`) as the plant species data source. Perenual was evaluated and rejected.

**Rationale:**

- Perenual's free tier is effectively paywalled. A direct comparison against the same 5 species showed that `hardiness`, `care_level`, `sunlight`, `watering`, and `description` all returned `null` on the free tier. Two species (Lavandula, Hydrangea) returned HTTP 429 ("Please Upgrade Plan") at the detail endpoint. Rosa canina wasn't searchable at all.
- Trefle is open-source, free, and returned real data for all 5 test species. Its data gaps are genuine (some species simply haven't had growth data contributed), not paywall-gated.
- Trefle has a significantly larger species database (~417,000 species vs Perenual's catalog).

**Trade-offs accepted:**

- Trefle has patchy `growth` data for well-known ornamentals (Lavandula angustifolia, Hydrangea macrophylla, Echinacea purpurea all had entirely null growth objects). This is addressed by the AI curation pass (see [the curation model](#curation-model)).
- Trefle's rate limit is 120 req/min. The seed script paces at 1.5s between species (2 calls each) to stay safely under the limit.

<a id="provider-agnostic-columns"></a>

### Database column naming: provider-agnostic

**Decision:** The column that holds the external species identifier is named `source_species_id` (integer) with a companion `data_source` text column (default `'trefle'`), not `perenual_id`.

**Rationale:** During the switch from Perenual to Trefle, the original `perenual_id` column was renamed. The new naming reflects that the column holds whatever the current provider's numeric ID is, making a future provider change non-breaking at the DB level. `data_source` is set explicitly in every upsert from code, not relying on the DB default, so the provider is always traceable in the data itself.

<a id="trefle-field-mapping"></a>

### Trefle field mapping decisions

**The mapping itself lives in `mapTrefleDetail()` in `lib/trefle.ts`** and is not
restated here — a hand-copied table drifts, and this one did: it described
`native_to` as coming from `data.distribution.native[]` long after the code
stopped taking it from Trefle at all. What belongs here is the handful of
mapping calls that are judgements rather than plumbing:

- **Every mapping was confirmed against live API responses before any code was written.** Trefle's docs and its payloads disagree in places, which is also how the `tdwg_code` trap ([native_region](#native-region)) was possible.
- **`care_level` is left null rather than derived.** Trefle has no equivalent and a plausible guess would be indistinguishable from a real value.
- **`height_min_cm` takes Trefle's _average_ height** as a "typical minimum" proxy. There is no true minimum in the payload, and an absent range reads worse than a slightly conservative one.
- **`image_urls` captures every category key, including undocumented ones.** Trefle sometimes returns an unnamed `""` image category, so `mapImages` iterates `Object.keys(images)` instead of a fixed list, and `TrefleImages` carries an index signature so the type admits the open-ended shape. The hero still comes from a priority list, with unknown categories last.
- **Empty arrays, not nulls, are the no-data case** for `bloom_months`, `sun_requirements` and `image_urls` — the columns are NOT NULL. This is why the safe upsert needs a separate `array_length` rule rather than `COALESCE` ([the safe Trefle upsert](#safe-upsert)).

<a id="plants-schema"></a>

### What writes which column

There is no column list here. One lived here until July 30 2026, carried a note
admitting it was "not maintained retroactively", and by then was missing 14 of
the columns migrations had added — including `native_region`, `seasonal_care`,
`hardiness_rating`, `sun_thrives` and every `*_checked_at` stamp. Read
`supabase/migrations/` for the schema.

What is not in the migrations is **who owns each column**, and that is the part
worth writing down, because it is the whole basis of the safe upsert and the
re-seed guarantees:

- **Trefle-sourced** — botanical facts the sync writes and fills: names, family, description, heights, bloom months, raw image URLs.
- **AI-drafted** — everything the curation pass generates: plant type, care and placement copy, spreads, colours, tags, `seasonal_rhythm`, `seasonal_care`.
- **Editorial** — set or corrected by a person and never machine-written: `is_curated`, `hardiness_rating`, and any field Ana has corrected on a curated row.
- **Operational** — stamps and provenance the scripts write about themselves: `ai_drafted_at`, the `*_checked_at` guard columns, `image_pick_confidence`.

An owner is a promise about who may overwrite: the Trefle path physically cannot
touch the other three ([the safe Trefle upsert](#safe-upsert)).

**Two taxonomies that look like one.** `style_tags` is aesthetic garden style
(`cottage`, `mediterranean`, `wildflower`, `modern`, `lush`, `classic`);
`garden_use_tags` is practical application (`"pollinator gardens"`, `"gravel
gardens"`, `"sunny borders"`). They are filtered separately and must not be
merged.

<a id="safe-upsert"></a>

### Data integrity: safe Trefle upsert function

**The bug:** re-running `seed-plants.ts` against already-curated plants silently overwrote `description`, `care_level`, and `height_min_cm` with Trefle's null values. 25 of 29 plants lost AI-drafted data after a re-seed. The root cause is that Trefle has no data for these fields on most ornamental species, so `mapTrefleDetail()` sets them to `null` in the payload — and a plain `INSERT ... ON CONFLICT DO UPDATE SET *` cannot distinguish "Trefle genuinely has no data for this field" from "intentionally clear this field". Every re-seed was a destructive overwrite.

**The fix:** `supabase/migrations/20260706000000_upsert_trefle_plant.sql` — a `upsert_trefle_plant` Postgres function with per-column conflict strategies. `plants-db.ts`'s `upsertPlant()` now calls it via `db.rpc('upsert_trefle_plant', {...})` instead of a plain `.upsert()`.

**Per-column strategies:**

| Strategy                                                                                                                     | Fields                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Always overwrite** (Trefle-authoritative)                                                                                  | `data_source`, `common_name`, `scientific_name`                                                                                               |
| **`COALESCE`** (keep existing non-null value; update only when Trefle provides data)                                         | `family`, `native_to`, `description`, `care_level`, `height_min_cm`, `height_max_cm`, `hardiness_zone_min`, `hardiness_zone_max`, `image_url` |
| **`CASE WHEN array_length > 0`** (empty array ≠ null, so `COALESCE` doesn't work; keep existing when Trefle returns nothing) | `common_name_aliases`, `bloom_months`, `sun_requirements`, `image_urls`                                                                       |
| **Derived**                                                                                                                  | `peak_season` — follows `bloom_months`'s update rule, since it is derived from it                                                             |
| **Monotonic**                                                                                                                | `is_curated` — stored as `plants.is_curated OR EXCLUDED.is_curated`; can only become `true`, never reverts to `false` on re-seed              |

**AI-only fields are not referenced anywhere in the function body.** `plant_type`, `plant_type_label`, `style_tags`, `space_types`, `bloom_color`, `foliage_color`, `spread_min_cm`, `spread_max_cm`, `water_needs`, `water_needs_summary`, `light_needs`, `soil_needs`, `maintenance_notes`, `common_issues`, `best_placement`, `environment_benefits`, `seasonal_rhythm`, `garden_use_tags`, and `ai_drafted_at` cannot be overwritten via the Trefle sync path — this is a structural guarantee, not a convention.

**Revised July 9, 2026 — the original rules were fill-only in the wrong direction.** The table above protected fields only when Trefle sends _nothing_: `COALESCE(EXCLUDED.x, plants.x)` lets an incoming non-null Trefle value overwrite the stored one, and the array `CASE` rules pointed the same way. That was fine against Trefle's nulls (the original bug) but destructive wherever Trefle _has_ data and the stored value had since been editorially corrected — the round-3 full re-seed reverted 49 of the 62 editorial `sun_requirements` corrections ([the botanical cross-check](#botanical-cross-check)) this way. `supabase/migrations/20260709210000_fill_only_trefle_upsert.sql` replaces the function with uniform **fill-only** semantics: on UPDATE the stored value always wins and Trefle can only fill gaps (null scalars, empty arrays); `common_name`/`scientific_name`/`data_source` are no longer rewritten either. INSERTs are unchanged. Trade-off: a re-seed can no longer refresh names/images/bloom data on existing rows — refreshing from Trefle now requires explicit tooling that declares which fields it overwrites. Alongside this, `seed-plants.ts` now skips already-cataloged species by default (matched on scientific name, then on resolved Trefle ID to catch synonym remaps); `--include-existing` restores full-list behavior. Verified live: a hostile upsert against a corrected row left every field intact, and a full default seed run made zero writes (145 skipped).

<a id="curation-layer"></a>

### Plants table is a cache with a manual curation layer

**Decision:** The `plants` table caches external data but has a separate curation layer that is never overwritten by the provider integration.

**Two distinct write paths:**

1. **Trefle sync** (`lib/trefle.ts` → `lib/plants-db.ts`): Populates botanical facts. Never touches `style_tags`, `space_types`, `bloom_color`, `foliage_color`, `plant_type`, care instructions, or any AI-drafted fields.
2. **AI curation** (`scripts/curate-plants.ts` → Claude): Fills gaps and generates garden-specific metadata. Never overwrites fields that already have data.

**`is_curated` flag:** Set to `false` on all automated writes. Flipping it to `true` is a deliberate manual step after human review. This means the plants table always has a clear distinction between "machine-drafted" and "human-verified" rows.

**What "human review" means (redefined July 2026):** the reviewer isn't a botanist, so `is_curated = true` asserts an _editorial_ pass, not botanical verification: the image shows the right plant, the description reads well and on-brand, and the style/space tags make product sense. Botanical facts (hardiness, sun, bloom months) are verified by a separate AI cross-check pass — a second, independent model run prompted to fact-check the curation output and flag disagreements for human spot-checking (built; see [the botanical cross-check](#botanical-cross-check)).

**Note:** this separation was not fully enforced until a bug was found and fixed (see [the safe Trefle upsert](#safe-upsert)). Initially, re-running the Trefle seed against already-curated plants silently overwrote `description`, `care_level`, and `height_min_cm` with Trefle's null values, since these are fields both Trefle and AI can populate. The fix ([the safe Trefle upsert](#safe-upsert)) makes this structurally impossible going forward, not just a convention.

**`ai_drafted_at` timestamp:** Set on every successful curation pass. Provides a review queue: `WHERE ai_drafted_at IS NOT NULL AND is_curated = false`.

<a id="plant-type-label"></a>

### `plant_type` is a functional label, not strict botany

**Decided July 10, 2026** (Ana delegated the ruling during the round-4 sweep). The round-4 cross-check flagged 10 `plant_type` disagreements where a blind second AI applied stricter botany than the product needs. `plant_type` is a **gardener-facing "what kind of plant is this"** label — how you buy, place, and care for it — not a botanical growth-form classification. The catalog's existing labels were already internally consistent, so 8 of the 10 flags were rejected as false positives. The convention, for future rounds:

- **Geophytes → `bulb`.** Anything sold and planted as a dormant storage organ — true bulbs, corms, tubers. Precedent already in the catalog: Crocus/Colchicum (corms), Iris reticulata, Cyclamen (tubers), Hesperantha (corm) are all `bulb`. Do **not** reclassify corms/tubers to `perennial`.
- **`succulent` only for fleshy mat/rosette succulents** (Sedum acre, Sempervivum). Border perennials with semi-succulent foliage that die back — Hylotelephium (border sedum), Euphorbia myrsinites — stay `perennial`. The deciding test is the storage/dieback habit, not xeric looks: `Yucca filamentosa` is xeric and rosette-forming but builds **persistent woody stems and never dies back**, so it is a `shrub`, not a perennial or succulent (corrected July 10, 2026 — the round-4 sweep had wrongly filed it as perennial).
- **Mediterranean subshrubs → `shrub`.** Woody-based evergreen subshrubs (lavender, rosemary, santolina, thyme, helichrysum, sage, wall germander, `Euphorbia characias`) are filed `shrub`; the descriptive `plant_type_label` may carry the nuance ("Evergreen subshrub"). Round-4 aligned the two outliers still at `perennial` — **Salvia officinalis** and **Teucrium chamaedrys** — to `shrub` / "Evergreen subshrub" so the group is uniform.
- **`shrub` vs `tree` by garden use, not ultimate size.** A large shrub / small tree grown as a garden shrub (e.g. `Pittosporum tenuifolium`) stays `shrub`; `tree` is reserved for plants grown as standalone specimens (Taxus, Ilex).
- **Life-cycle by how it's grown in a temperate ornamental garden.** Tender perennials grown as annuals keep `annual` (`Eschscholzia californica`); short-lived perennials keep `perennial` (`Rudbeckia hirta`).

Corrections that follow this convention are applied by the same guarded, reversible method as [the botanical cross-check](#botanical-cross-check) (update by `scientific_name`/`id`, guarded on `is_curated = false` and an exact match on the prior value). They do **not** flip `is_curated` — a functional-classification fix is not Ana's editorial pass.

---

<a id="group-curation"></a>

## The curation pipeline

<a id="curation-model"></a>

### AI curation model: claude-sonnet-4-5

**Decision:** Use `claude-sonnet-4-5` for the curation pass (`CURATION_MODEL` constant in `lib/anthropic-client.ts`).

**Rationale:** Better factual reliability than Haiku for botanical claims (hardiness zones, growth habits, native ranges). Cost is negligible at the volume of a plant catalog seed (~30–200 species).

**Two model constants, deliberately split — do not merge them.** `lib/anthropic-client.ts` exports `CURATION_MODEL` (`claude-sonnet-4-5`) and `VISION_MODEL` (`claude-sonnet-5`). Every **text** curation and cross-check script is pinned to the first: `curate-plants`, `cross-check-plants`, `curate-combinations`, `curate-styles`, `curate-greenery`, `draft-hardiness`, and the seasonal-care pair. Only the image pass (`pick-plant-images`, `feed-wikimedia-candidates`) uses the second, because vision needs current generation — Sonnet 5 reads images at up to 2576px on the long edge where 4.5 downscales to 1568px and loses the focus and framing detail the pick depends on ([the hero image pass](#hero-images)).

**Bumping `CURATION_MODEL` is a data migration, not a version bump.** A new model silently re-rolls every field those scripts draft, so it needs its own sample review — the same discipline as the seasonal_care and combinations sample passes. The image pass had no such baseline to protect, which is the only reason it could start on the newer model.

**Prompt strategy:**

- System prompt: `"Respond with ONLY valid JSON, no markdown, no code fences, no preamble, no explanation."`
- The model sometimes still wraps output in a ` ```json ``` ` fence — the parser defensively strips it before `JSON.parse`.
- Each prompt sends the plant's known data and requests **only the missing fields** — never asks Claude to regenerate data Trefle already provided.
- `plant_type` is requested first in every prompt since it gates the hardiness zone decision.

**Annual hardiness logic:**

- If `plant_type === 'annual'` (either already in the DB or returned by Claude in the same response): `hardiness_zone_min` and `hardiness_zone_max` are explicitly set to `null` in the DB patch, overriding any model output. Annuals complete their lifecycle in one season; USDA zones are not applicable.

**Confidence flagging:**

- Claude is instructed to set `hardiness_confidence: 'low'` when it has meaningfully lower confidence (uncommon species, cultivar-specific range, ambiguous). Low-confidence rows are listed in the terminal summary and surfaced in the review queue.

<a id="seeding-scripts"></a>

### Every pass is resumable, and none of them aborts a batch

The scripts' flags and usage live in their own headers and in `package.json`;
this section used to copy them and ended up printing a `seed-plants.ts` command
that no longer runs, since scope flags became mandatory
([the round runbook](#round-runbook)).

The durable shape is that **a failure is per-row, never per-run.** A species
Trefle cannot resolve, or a plant whose curation call returns unparseable JSON,
is counted in the summary and skipped; the run continues and exits non-zero.
Nothing is half-written, so the fix is always to run the same command again.
Every later guard inherits this through its `*_checked_at` stamp — a killed run
leaves the rest unstamped and the next pass picks up exactly there
([the botanical cross-check](#botanical-cross-check)).

<a id="plant-combinations"></a>

### Plant combinations: AI companion pass, capped and idempotent

**The gap:** the "Works well with" drawer section and the "Pairs naturally with" bullet were fully built read-side (`lib/plant-detail.ts`, `components/plant-detail/WorksWellWithSection.tsx`, `lib/good-for-your-garden.ts`), but `plant_combinations` had no write path anywhere — the feature was invisible except for a handful of hand-seeded rows.

**Decision:** `scripts/curate-combinations.ts` populates the table via the same AI-pass pattern as `curate-plants.ts` (Claude via `CURATION_MODEL`, service-role writes, 2s pacing, per-plant loop with a summary). Chosen over hand-seeding or raw SQL — recorded July 8, 2026.

**Constraints enforced by the script, not just the prompt:**

- **Catalog-only pairs.** The FK requires both sides to exist in `plants`. Claude is given a roster of candidate ids and told to copy them exactly; every returned id is validated against the roster in code, and unknown/invented ids are dropped and counted in the summary (`⚠ N invalid id(s) dropped`).
- **Cap of 5 companions per plant** (the UI shows at most 5), counting _both_ directions of existing rows. Counts are seeded from the DB at startup and updated in memory as rows are inserted, so a plant filled up by earlier iterations stops being offered as a candidate. Plants already at cap are skipped without an API call.
- **Reversed-pair dedupe.** The schema has a no-self-pair check but no pair-uniqueness constraint, so the script canonicalizes every pair to a sorted-id key and skips any pair already present in either direction. This is what makes re-runs idempotent — existing rows are never deleted or overwritten, only missing pairs added, so the script is safe to re-run as new plants are seeded.
- **Enum coercion, not rejection.** `combination_type` (`visual`/`ecological`/`seasonal`) and `strength` (`strong`/`moderate`/`weak`) are check-constrained but nullable; an invalid model value is coerced to `null` rather than losing the pair.

**Prompt shape:** the target plant is described with its drafted metadata (type, styles, sun, bloom months/colors, height); candidates are a compact `id — scientific (common)` roster — Claude's own botanical knowledge fills in the rest. The model is explicitly told fewer suggestions beat weak ones, and that `combination_type` is the _dominant_ reason the pair works.

**Why new plants pair mostly among themselves (cap-saturation, not siloing).** The candidate roster is drawn from the _whole_ catalog, not the current seed batch — a new plant can in principle pair with any existing species. But the 5-companion cap counts both directions, so any older plant already at 5 companions is excluded as a candidate. After a few rounds most established plants are saturated, leaving a fresh batch to pair with whatever older plants still have open slots plus each other. The effect looks like per-batch siloing but is purely the cap filling up on a first-come basis: the additive, never-rewire design means later rounds can only fill leftover slots, never displace an existing pairing. This is intended for the current data-completeness goal; revisiting it is tracked as a future inspiration-layer rethink (see the Build Backlog).

<a id="botanical-cross-check"></a>

### Botanical cross-check: blind second pass, flags only, never edits data

**Why (see [the curation layer](#curation-layer)):** `is_curated = true` is an editorial pass, not botanical verification — the reviewer isn't a botanist. Botanical facts drafted by the first AI pass need an independent check.

**Decision:** `scripts/cross-check-plants.ts` re-derives the four load-bearing botanical fields — `plant_type`, `hardiness_zone_min`/`max`, `sun_requirements`, `bloom_months` — for every plant with `ai_drafted_at` set, and flags disagreements. It **never edits catalog data**; resolving a flag is a human decision. (The one column it does write is the operational `botanical_checked_at` stamp — see below — which is not a botanical or editorial field.)

**Blind by design:** the check prompt contains only the species identity (common name, scientific name, family) — never the stored values — so the second pass can't be anchored by the first pass's answers. Independence comes from blindness, not from a different model (`CURATION_MODEL` is used for both).

**Comparison happens in code, with tolerance rules** — botanical sources legitimately disagree at the margins, so exact-match would drown real errors in noise:

| Field              | `disagree` (spot-check)                                                              | `minor` (listed, likely fine)                                               |
| ------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `plant_type`       | any mismatch                                                                         | —                                                                           |
| `hardiness_zone_*` | ≥ 2 zones apart                                                                      | one side null (±1 zone passes silently)                                     |
| `sun_requirements` | no set overlap, or stored is a proper subset of the check (under-reported tolerance) | genuine shift: partial overlap that is neither a subset nor a contradiction |
| `bloom_months`     | no shared months                                                                     | window boundary drifts > 1 month; one side reports no bloom                 |

Annuals with null zones on both sides are not flagged (nulls are correct there, per [the curation model](#curation-model)'s annual rule).

**A directional error pattern is a design signal, not noise.** The first full
run flagged 68 disagreements of which 61 were sun, and almost all in the same
direction: the stored range narrower than the check. Random disagreement is
tolerance; a pattern is a defect in how the field is drafted. So a stored range
that is a strict subset of the check is treated as a real gap and flagged
`disagree` rather than `minor`, and the drafting prompt was changed to ask for
every exposure the species reliably grows in. The eventual root fix was to stop
using one list at all ([the two-field sun model](#sun-model)).

**A bulk correction is allowed, and must stay reversible.** When a pattern
rather than a scatter is found, the flags may be applied in one pass instead of
per-plant — but each row is updated by id, guarded on `is_curated = false` **and
an exact match on the prior value** taken from the report, so a row that drifted
since is skipped rather than overwritten. Corrections are also captured as a
data migration keyed on `scientific_name` rather than live UUIDs, which makes
them portable and idempotent: a no-op against already-corrected rows and against
any environment that never had the bad values. What the one such pass actually
changed is in [`database-log.md`](database-log.md). A botanical correction never
flips `is_curated` — it is not the editorial pass.

**Output:** terminal report grouped disagreements-first, plus a timestamped JSON report in `apps/web/reports/` (gitignored) recording every flag with stored vs checked values — the artifact for Ana's spot-check sweep and the source of record for any bulk correction. `--limit N` for testing.

**Checked-at stamp — guard scoping (July 2026, migration `20260716120000`).** The guard stamps `plants.botanical_checked_at` on each row the moment it finishes checking it (flagged or clean — the stamp records that the check _ran_, not its verdict). This is operational metadata, not catalog content, so the flags-only rule holds — it never touches a botanical or editorial field. The stamp makes `--new-only` state-based (`WHERE botanical_checked_at IS NULL`): exact (no UTC-midnight batch split), and resumable — a killed run leaves the rest unstamped for the next pass, replacing the earlier newest-calendar-day heuristic. It's a timestamp, not a boolean, so a prompt revision can re-scope by date (`... OR botanical_checked_at < '<date>'`). **Cascade rule:** any script that _mutates_ a checked field must null the matching stamp so the guard re-checks — e.g. `scripts/archive/regenerate-native-to.ts` nulls `native_checked_at` in the same write that rewrites `native_to`. The sibling `native_to` guard (`cross-check-native-to.ts`) carries its own `native_checked_at` stamp on the identical model; `check-bloom-colors.ts` has none by design (a free local validator with no Claude call, it always runs over the whole catalog).

<a id="sun-widening"></a>

### The sun-widening sweep: treating a symptom, and the two rules it left behind

> **Superseded by [the two-field sun model](#sun-model) the same day.** Once sun
> is drafted as `sun_thrives` + `sun_tolerates`, first drafts capture the
> tolerated range at the source and the corrective sweep leaves the round.
> `apply-sun-widening.ts` survives as a fallback for a legacy flat-list report,
> and its header holds the mechanism.

**Why it existed:** a single flat `sun_requirements` list drafts too narrow on
every batch, because one list cannot distinguish where a plant thrives from
where it merely copes, so the model names the textbook optimum. Prompt wording
did not fix it, and hand-writing a correction migration per round does not scale
to a 500 species catalog. The sweep automated the correction.

Two rules from it outlived it, and both generalise past sun:

- **A machine may widen toward a corroborated second read; it may not narrow.** Widening on strict-subset flags only is exactly the union of two independent reads, so the sweep could add an exposure but never remove one. Contradictions and lateral shifts went to a person, because nothing automatic can tell "narrow but right" from "wrong direction".
- **`is_curated = true` is a freeze line.** An uncurated row is machine-maintained toward the corroborated range; a curated one is human-owned and untouchable. The first version ignored this and widened `Ajuga`, a shade groundcover a human had deliberately narrowed, back to full sun.

**It was never the cure.** A backstop that keeps bad drafts off the page is not
the same as drafting well, which is what [the two-field sun model](#sun-model)
went on to do.

<a id="sun-model"></a>

### Sun modelled as best + tolerated (the root fix)

**Why:** [the botanical cross-check](#botanical-cross-check)/[the sun-widening sweep](#sun-widening) treated the symptom (a single flat `sun_requirements` list drafts too narrow, so we detect and widen). The cause is the field itself: one list can't say where a plant _thrives_ versus where it merely _tolerates_ an exposure, so the drafter defaults to the optimum and every batch under-reports. Modelling the two ideas separately removes the ambiguity at the source. Chosen July 9, 2026, pulled ahead of the 500–700 species expansion so new plants are captured correctly the first time rather than re-curated later.

**Model (migration `20260709220000`):**

- `sun_thrives text[]` — exposures where the plant performs at its best (usually one, sometimes two; non-empty once curated).
- `sun_tolerates text[]` — additional exposures it accepts but isn't at its best in; disjoint from `sun_thrives`; may be empty.
- `sun_requirements` (unchanged, app-facing) — a **derived mirror**, kept as `canonical(sun_thrives ∪ sun_tolerates)` by a `BEFORE INSERT OR UPDATE` trigger whenever either source field is non-empty. Every existing read site (`good-for-your-garden.ts`, plant detail, garden tile, `format-plant.ts`) keeps reading `sun_requirements` untouched — the app is unchanged; only the source of the data moved underneath it.

**Integrity** is enforced in the DB, not by convention: CHECK constraints require both sets to be valid exposures, disjoint, and forbid "tolerates without a thrives" (a plant with any sun data must have a best). A bonus effect: because the trigger recomputes `sun_requirements` from the two source fields on every write, the Trefle seed path can no longer perturb a split plant's sun even if the fill-only upsert ([the safe Trefle upsert](#safe-upsert)) ever let a value through — the derived value is a pure function of the AI/editorial source fields.

**Curation** (`curate-plants.ts`) now drafts the two fields directly — `sun_thrives` (best) and `sun_tolerates` (additional, disjoint) — instead of the flat list. The two-field ask is what fixes the under-reporting: naming "where it also merely tolerates" explicitly is exactly the question the old single list elided. `sun_requirements` is no longer drafted or sent as known data; the trigger owns it.

**The backfill was set-preserving, which is the part worth copying.** Splitting
the existing catalog only ever partitioned the exposures a plant _already had_,
clamped in code, so `sun_thrives ∪ sun_tolerates` always equalled the previous
`sun_requirements`. The app-visible value was provably unchanged for every row,
so no prior editorial correction or widening could be lost by a data-model
change. A migration that reshapes a field should be able to prove it did not
alter what the field means.

**Editorial boundary unchanged:** all rows stay `is_curated = false`; the split is a data-model change, not an editorial sign-off. When Ana finalizes a plant she edits the two source fields, and the trigger keeps the mirror in sync.

**Still deferred to post-test:** surfacing the distinction in the UI ("thrives in full sun, tolerates part shade") and using it in matching (prefer thrive-matches, still surface tolerate-matches). The data is captured now; the presentation waits for the test to inform it.

<a id="native-region"></a>

### `native_region`: WGSRPD Level-2, and why the source needed a second opinion

**Model (Option A, Ana signed off).** `native_region text[]` holds TDWG WGSRPD
**Level-2** region names — 52 regions, one consistent zoom level for the whole
catalog — and powers Explore's "native to my region" lens. It replaced an ad-hoc
`mediterranean`/`balkans`/`croatia` tag set that was a prompt artifact. The
reason a controlled vocabulary was worth the migration: **a filter fails
invisibly.** A wrong or missing tag does not error, it just hides a plant from
the person looking for it.

**Generated from Trefle Level-3 codes rolled up to Level-2**, with the plant's
prose as a fallback where Trefle's native list is empty, and a small reviewed
override table. It is generate-then-`--apply`, and it must re-run after every
seed or new plants stay untagged. The mechanics are in
`regenerate-native-region.ts`; the failures are worth keeping here because they
share one shape.

**Two traps, one shape: a failure that looks like an answer.** Trefle's zone
objects carry the region under `tdwg_code`, not `code`, so a misread produced
untagged plants rather than an error — and it stayed dormant for weeks because
the existing catalog was served from cache and only new species forced a fetch
(trap 9). Then the fetch loop paced at ~500 req/min against a 120 req/min limit,
the resulting 429s were cached as entries, and **an errored entry was
indistinguishable from an empty native list**, so each one silently took the
prose fallback. The run reported success with a plausible source mix that was
really 466 rate-limit errors laundered into model guesses (trap 1). The rule
both produce: **where a fallback exists, a failed fetch must never be allowed to
look like a negative result.** The loader now throws rather than hand back a
degraded cache.

**Trefle does not separate native range from introduced range.** This one is
different — the fetch succeeds and the answer is wrong, which no amount of
pipeline hardening was going to catch. `distributions.native[]` includes
naturalised occurrences, so the field is closer to "where this grows now" than
"where it comes from", and the native filter is the one feature that depends on
the difference. `Imperata cylindrica` was tagged with precisely the range it was
_introduced_ into: 16 regions wrong, and inverted.

**The guard needs no AI, which is the point.** `cross-check-native-region.ts`
compares the tags against WCVP, Kew's World Checklist, read through GBIF. WCVP
is the right authority for a mechanical comparison rather than a judgement call:
it is what POWO publishes, it stores one row per WGSRPD Level 3 region — the
same geography this field rolls up from — and it marks introduced occurrences
explicitly. Two sources speaking the same vocabulary need reconciling, not
judging, unlike [the botanical cross-check](#botanical-cross-check).

**How widespread the problem was belongs in the log** — and the numbers moved. A
60-plant sample read as ~2%; the real rate over the 475 rows the tail covered
was 11%, because the sample was drawn from a different population than the job
([`database-log.md`](database-log.md)). The design consequence is what stays:
the rate was never knowable in advance, which is why the script defaults to
report-only.

**Four ways this could go quietly wrong, guarded in the script.** Three are
documented at their code sites: a lookup returning nothing is not a finding that
a plant has no native range (clearing a row needs `--allow-empty`, not just
`--apply`); an unrecognised region name throws instead of being dropped, since
silently shrinking a range looks confident; and a Level 2 region resting on one
Level 3 row is reported as thin evidence rather than arbitrated by the script.
The fourth is worth stating here because it is a shape, not a detail: **a name
lookup that fails upward is worse than one that fails.** GBIF answers an unknown
binomial by climbing the taxonomy, so `Pennisetum alopecuroides` came back as
the genus `Cenchrus` and the script cheerfully proposed widening one grass to 41
regions including Brazil. Only an exact match at species rank is accepted now.
It is the seed-by-ID trap in a new costume, and it surfaced only because the run
was report-only.

**Review before applying, always.** Both of the worst failure modes produced
confident, plausible, badly wrong answers rather than errors, and both were
caught by a person reading a report. That is why `--apply` follows a human read
of the diff instead of replacing it.

<a id="hardiness"></a>

### Hardiness: RHS rating is canonical, drafted then human-verified

**The problem.** Hardiness gates the real user question ("will it survive my winter"), but a July 2026 audit found **no free per-species hardiness source exists**: Trefle's `growth.minimum_temperature` is null for 100% of the catalog (so the old Trefle→USDA-zone mapping was dead code and was removed — see [the Trefle field mapping](#trefle-field-mapping)); RHS publishes ratings but offers no API or dataset and its content is copyrighted (bulk scraping barred); USDA's APIs map a _location_ to a zone, not a _species_; Wikidata's hardiness properties are effectively empty (23 taxa worldwide). Before this model, every plant's `hardiness_zone_min`/`max` was a single unanchored Claude estimate.

**Decision (Ana, July 14 2026).** The **RHS hardiness rating (H1a–H7) is the canonical field**, a good fit for the Euro/Med-skewed catalog. USDA zone, where shown, is **derived from the rating at render time** (`lib/hardiness.ts`) — never stored alongside. Two columns (migration `20260714164514`): `hardiness_rating text` (CHECK `H1a…H7`) and `hardiness_verified boolean default false`.

**Draft-then-verify flow:**

- **Draft baseline** — `draft-hardiness.ts` rates every plant **blind**, on species identity alone, the same discipline as the cross-check, and leaves `hardiness_verified = false`. Verified rows are never re-selected.
- **Human verification** — a person confirms each rating against RHS public plant pages (reading pages by hand is fine; only bulk scraping is barred) and flips `hardiness_verified = true`, in **priority order: the six garden-style starter palettes first** (highest user exposure); the long tail can stay drafted-but-unverified.

**`hardiness_verified` gates assertion, it doesn't excuse it.** The UI must only present a hardiness claim confidently when `hardiness_verified = true`; unverified rows say nothing or carry a quiet "approximate" marker. This is the opposite of a confidence flag that would license showing unanchored numbers everywhere.

**Re-seed safe by construction.** `hardiness_rating` is **editorial-owned**, the same category as `style_tags` and Ana's editorial corrections. It is not referenced by `upsert_trefle_plant` ([the safe Trefle upsert](#safe-upsert)), so a Trefle re-seed physically cannot touch it; `curate-plants` doesn't write it; the draft skips rated/verified rows. Verification work survives re-seeds — the failure mode Ana flagged (like the pre-COALESCE editorial wipe, [the safe Trefle upsert](#safe-upsert)) is closed.

**Follow-ups (not built yet):** (1) the UI gating above; (2) then **drop the legacy `hardiness_zone_min`/`max` columns** — "don't store both" — but only _after_ the render path derives from the rating, or hardiness display breaks; (3) once verification is done, record in the build log **what fraction of AI drafts survived RHS verification unchanged vs. got corrected** — that ratio is the real measure of the draft's quality.

**Status: PARKED** (code merged via PR #58, July 15 2026). The rating feeds only the dormant survive-winter bullet, so verification stopped partway and the track waits on that feature plus location wiring being scheduled. Two consequences worth knowing before resuming:

- **The denominator moved.** Verification ran against a much smaller catalog than exists now, so the unverified share has grown with every seed round since — current counts are in [`catalog-state.md`](catalog-state.md), and the gap is larger than the raw verified figure suggests.
- **`round-status.ts` reports `draft-hardiness` at WARN, not FAIL,** precisely because the field is parked. That is correct for a parked field and wrong for a shipped one — it is the same configuration that let round 7's batch go unrated for twelve days. **Promote it to FAIL in the same change that un-parks this work**, not afterwards.

<a id="seasonal-care"></a>

### Care Tips v2: `seasonal_care`, a field built to answer "why now?"

**Supersedes [Care Tips v1](#care-tips-v1).** The shipped v1 drawer exposed the
flaw: `maintenance_notes` is the plant's care manual — several actions,
permanent truths, no timeframe — so at ~20 plants the card became the
encyclopedia re-sorted. The ruling (Notion spec, locked July 15 2026): **a tip
is one action, one plant, one timeframe, and it must answer "why now?"**.
`maintenance_notes` cannot, and left the tips system entirely.

**The field.** `plants.seasonal_care jsonb` (migration `20260715120000`) carries
the same six stage keys as `seasonal_rhythm`, each an imperative one-liner or
`null`. `null` means "nothing to do this stage" and is the expected value for
most plants most stages. Where `seasonal_rhythm` _describes_, `seasonal_care`
_prescribes_. Only the current stage surfaces, and only for planted plants, so
volume self-limits to plants with an action due. Editorial-owned, outside the
Trefle upsert path ([the safe Trefle upsert](#safe-upsert)).

**It is distilled from existing fields, never freshly invented.**
`curate-seasonal-care.ts` rewrites `maintenance_notes` + `seasonal_rhythm` +
`bloom_months` into the six lines and adds no botanical facts, because a new
generation would be a new set of claims nobody had checked. Its line validator
is the first in the curation scripts to enforce shape in code rather than by
prompt — length, imperative verb, vocabulary, no "as needed". A line that fails
twice is **flagged and not written**: copy is never silently truncated or
rewritten to fit. The rules themselves live in the script, next to the code that
applies them.

**A blind second pass checks the season, because that is the part that is
genuinely arguable.** Distillation reliably kills the error classes;
whether a given plant divides in spring or autumn is model-stochastic.
`cross-check-seasonal-care.ts` hides each action's assigned stage, asks where it
belongs, and compares — flags only, in the style of
[the botanical cross-check](#botanical-cross-check). Only the draft step is part
of a round; the check and `apply-seasonal-care-fixes.ts` are editorial
follow-ups.

**Upstream-correction rule (Ana, July 15 2026).** When a wrong-stage flag traces
to the plant's own `seasonal_rhythm` — Scilla's late-summer bulb-planting line
came straight from it — the fix belongs in `seasonal_rhythm`, not only on the
`seasonal_care` line, or the same error regenerates on the next distillation.
Fix where the data lives.

**No hard-pin override table**, and this is the reasoning worth keeping: rules
like "bulbs → autumn" or "divide → early spring" are right often enough to look
correct and wrong at exactly the margins a catalog is full of — a
summer-flowering bulb, a bearded iris divided in summer. Source-faithful
distillation, a flags-only second pass and human correction beat a rule that
silently rewrites correct lines. Same lesson as
[the sun-widening sweep](#sun-widening).

**Status: COMPLETE**, merged as PR #63 (July 15 2026); coverage is in
[`catalog-state.md`](catalog-state.md). Three editorial rounds over the flags,
including the per-plant decisions and the two systematic checker biases they
exposed, are recorded in [`database-log.md`](database-log.md).

<a id="hero-images"></a>

### Hero images: a category-recovered shortlist, then an AI vision pick

**The problem.** `plants.image_url` was never a curation decision — `mapImages`
takes the first image of the highest-priority category Trefle returned, and ~89%
of candidate URLs are PlantNet identification photos. So the catalog's heroes
included herbarium sheets, hands holding a leaf, and nursery pots with plastic
labels. Once Explore went image-forward this was its most visible quality gap.

**A measurement changed the design.** The backlog assumed a heuristic prefilter
on resolution and sharpness would cut each plant to ~6 candidates. Measured, the
catalog averaged **27.7 candidates per plant, ~13.7k images** — so the prefilter
was the engineering problem, not the vision call. Two facts settled it:

- **Trefle labels every image** `flower` / `habit` / `leaf` / `bark` / `fruit`, and `mapImages` was throwing the label away. That label is the strongest prefilter available and maps straight onto quality: a `flower` image is a bloom shot by construction. Recovering it cost 494 API calls and **zero image downloads**, where sharpness scoring would have cost 13.7k downloads to approximate something the model judges better anyway.
- **Resolution still has to be measured**, because the model cannot see it. It is shown a resized copy, so a well-composed 320px photo looks identical to a 2000px one and would win a pick it cannot deliver on a full-bleed card.

The pipeline that follows — recover categories, shortlist, probe, pick — is
described in `recover-image-categories.ts` and `pick-plant-images.ts`, and the
shortlist and probe rules are in `lib/image-shortlist.ts` and
`lib/image-probe.ts` with their tests.

**Two design rules from it that generalise.** **A header parse, not a
content-type, decides whether a URL is an image**: Trefle's CloudFront images,
the highest-resolution in the catalog, serve valid JPEGs as
`application/octet-stream`, so gating on content-type would have rejected all
1,138 of them, while the failure actually worth catching — an HTML error page
returned as HTTP 200 — can claim any content-type and never parses as an image
header. And **the incumbent is pinned inside the candidate cap**, so the model
judges the current hero against the alternatives; unpinned, a low-resolution
incumbent sorts below six sharper options, gets sliced off, and the pass
"upgrades" a plant without ever comparing the two — and could never confirm an
already-good hero.

**Index resolution is manifest-backed, not re-derived.** The batch returns only
a `chosen_index`, so the exact list each request was built from is persisted.
Re-probing at collection time would be wrong as well as wasteful: probing is a
live network call, so a URL reachable at request time and 404ing an hour later
would shorten the list and shift every index after it, writing a confidently
worded pick that points at **the wrong photograph**.

**Ownership.** Writes `image_url_curated`, never `image_url`, so a Trefle
re-seed and this pass cannot clobber each other — the same arrangement as
`hardiness_rating` ([hardiness](#hardiness)). Reads go through `heroImageUrl()`,
which prefers the curated pick and falls back, so the code was safe to ship
ahead of the data. Every pick carries a confidence and a one-line reason, and
low confidence is a review queue, not a rejection. **None of this is editorial
sign-off** ([the curation layer](#curation-layer)).

<a id="wikimedia-attribution"></a>

### Wikimedia heroes, and the attribution they oblige

The vision pass can only choose among the photos Trefle surfaced, which are ~89%
PlantNet identification snapshots — so even a confident pick is best-of-a-poor
pool. Wikimedia Commons is a second source, added as a **feeder rather than a
new pipeline**: `feed-wikimedia-candidates.ts` resolves each plant's Wikidata
P18 image, appends it to the candidate list tagged as Wikimedia, and clears the
checked-at stamp so the existing pass re-picks across the combined pool. The
shortlist force-includes and pins Wikimedia candidates, so a curated photograph
always reaches the vision call no matter how many sharp Trefle snapshots a plant
has. On the 56 review-flagged plants, 8 Wikimedia photos won, each a clear
upgrade.

**Attribution is the real product work, not the fetching.** CC-BY and CC-BY-SA
oblige a visible credit, so `plants.image_attribution` is written whenever a
credited photo wins and cleared when a Trefle photo wins or a revert lands. It
renders as one line in the plant detail drawer, not on browse cards: "any
reasonable manner" is satisfied by a reachable credit, so the cards stay clean.
**The licence guard runs before ingest** — `isCommercialSafeLicense()` rejects
NC, ND and GFDL-only files, because Santolina is a commercial product. It has
already kept a GFDL-1.2 photo out of the catalog.

Three Wikimedia-specific reliability traps, all of which failed silently, are
documented at their call sites in `lib/wikimedia.ts` and `pick-plant-images.ts`.
The shape they share is worth carrying: **the whole integration was
zero-for-zero on its first run and nothing errored** — a missing User-Agent had
every candidate rejected at probe time, and the pass simply reported that no
Wikimedia photo had won.

**The gallery caps at 10 photos, and the rejected alternative is the durable
part.** A plant averages ~28 candidates, so something has to cut them. Filtering
to Trefle's `flower`/`habit` labels was the obvious lever and lost on three
counts: **category describes a photo's subject, not its quality**, so a `flower`
image can still be a blurry nursery-pot shot; it has a **coverage cliff**, with
59 plants holding zero flower or habit candidates and 47 of those having no
Wikimedia fallback, so their galleries would empty; and a naive category filter
**deletes every hand-sourced Wikimedia hero**, which carry no Trefle category at
all — the best photographs in the catalog would be the first thing removed. A
cap has none of those failure modes.

<a id="round-runbook"></a>

### Why a plant round is shaped the way it is

**The steps are not here.** [`round-runbook.md`](round-runbook.md) is generated
from the array `run-round.ts` actually executes, so it cannot describe an order
different from the one that runs; a hand-written copy can, and this section was
one until July 30 2026. What went wrong on a given round is in
[`database-log.md`](database-log.md) — read its standing rules and traps before
running anything, and append an entry after. This section is only the reasoning
behind the shape.

**A round is a batch with an identity, not a date range.** Every step scopes to
`rounds/<label>/manifest.json`, the ids the seed run recorded. The alternative
looks equivalent and is not: a state predicate like `hardiness_rating IS NULL`
reads as "the new plants" and means "every plant this pass has never reached",
so it silently widens the moment an earlier round leaves a gap. That is one
mechanism behind most cross-round writes this project has had to trace by hand
(log standing rule 3, trap 2). It is also why a manifest that seeded nothing
throws instead of running: a pass reporting success having touched nothing is
how several log entries begin.

**Seeding sits outside the runner** because it is where a round's judgment
lives — which species, chosen against which measured gap — and it is a different
script each time. The one rule that never varies is **seed by verified Trefle ID
or exact scientific-name match, never the top name-search hit** (trap 7); name
search resolves to sibling species silently, and woodland genera in particular
have been widely re-segregated, so synonym groups belong in the dry run.

**Guards flag; they do not fix.** A cross-check writes nothing but its own
`*_checked_at` stamp, because resolving a disagreement is a judgment and a
machine that quietly "corrects" the catalog destroys the evidence that it
disagreed. Two consequences worth stating: the stamp makes every guard resumable
and re-runnable without re-billing, and a guard's accuracy bar is a product
decision. `cross-check-native-to` is deliberately aimed at ~90%, catching
continent-level nonsense only, because in-app user flagging is the real review
and chasing the tail costs a Claude pass to buy very little.

**The image verification pass asks a different question, not the same one
again.** The pick is comparative — six candidates, which is best — so a `medium`
confidence is often a statement about the field rather than the winner.
`--verify` shows the model the single winning image alone and asks an absolute
question: right species, good enough to be a hero. Re-running the pick could not
answer that; it would only re-stage the comparison. The promotion rule is code
rather than prompt wording, so "an unconfirmed species never clears, at any
photo quality" is under test instead of asked for politely.

**Editorial sign-off is genuinely last**, not merely numbered last: it judges
the output of every step above, so it cannot run until they have. Nothing else
in the pipeline touches `is_curated` ([the curation layer](#curation-layer)) —
curation drafts, guards flag, and botanical or functional corrections are
guarded reversible fixes, not a sign-off.

**A WARN is right for a parked field and wrong for a shipped one.** The step
registry grades each step, and two steps went unrun for weeks because they were
graded WARN when the features behind them had gone live
([hardiness](#hardiness) is still parked and still correctly WARN). Promote the
grade in the same change that un-parks the work, never afterwards.

**The catalog is the one thing that cannot be regenerated**, which is why a
gzipped copy is committed per round rather than left in a gitignored local
backup. Curation is a stochastic model pass and the editorial corrections on top
are one of a kind, so a lost catalog is not re-derivable at any price; Free-plan
Supabase projects also cannot restore their own daily backups. The mechanics are
log standing rule 1.

**Working-tree discipline.** These scripts write to the live Supabase project —
there is one, and no staging for catalog data — so a seed or curate run mutates
production. When another session shares the checkout, run round code from a
`git worktree` and stage by explicit path; never `git add -A` on a tree you do
not own.

<a id="group-accounts"></a>

## Accounts, sessions, and access

<a id="server-only-clients"></a>

### Server-only boundary: three clients

Three clients are server-only and must never be imported into client components:

| File                      | Client                 | Key                                        |
| ------------------------- | ---------------------- | ------------------------------------------ |
| `lib/supabase.ts`         | Supabase anon client   | `NEXT_PUBLIC_SUPABASE_ANON_KEY`            |
| `lib/supabase-admin.ts`   | Supabase service role  | `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS |
| `lib/anthropic-client.ts` | Anthropic Messages API | `ANTHROPIC_API_KEY`                        |

All three are lazily instantiated (client created on first call, not at module load time) so they don't throw at import time in contexts where env vars aren't set.

<a id="rls-shim"></a>

### The single-tenant shim, and why it wasn't a permissive RLS policy

> **Superseded by [the auth cutover](#auth), July 2026.** `lib/current-garden.ts`,
> the hardcoded garden id and the seed garden are all deleted. What follows is
> the diagnosis and the rejected alternative, which are the parts still worth
> having.

**RLS returning zero rows looks exactly like no data.** `getPlantDetail()` fell
back to a hardcoded mock garden behind a comment blaming missing onboarding.
That was the wrong diagnosis. The policies on `gardens` and `palette_plants`
require `auth.uid()` to match the owner, the app had no session, so `auth.uid()`
was null and every query returned nothing — with a real garden row present the
whole time. `.maybeSingle()` then presented a permissions failure as "no row
yet". **A silently empty result from an RLS-protected table should be suspected
as a policy block before it is read as absent data.**

**The rejected alternative was a temporary permissive policy** (`USING (true)`,
or an anon carve-out). It lost because it had to be written now and correctly
reverted later, and an un-reverted one is a production data leak. Bypassing RLS
at the client layer instead — service-role, scoped to one garden id — left the
real `auth.uid() = user_id` policies untouched and correct, so the cutover
became a client swap and a file deletion rather than a policy migration. That
turned out right: the cutover deleted the shim exactly as planned.

<a id="auth"></a>

### Auth + single-garden identity: the cutover from single-tenant shim to real accounts

**Decided July 10, 2026.** Auth is being pulled forward from post-test into the build. The reasoning: accounts are what make the product "real," and they define the account-settings surface that has to exist before any public launch. This section records the finalized shape. It supersedes the shims documented in [the RLS service-role shim](#rls-shim) (`current-garden.ts`) and [the palette write path](#palette-write-path) (service-role palette writes) — those get _deleted_, not extended, by this work.

**Auth and onboarding are decoupled.** The original plan ([the RLS service-role shim](#rls-shim), and the Notion spec) bundled auth with the 5-step onboarding wizard and deferred both together. They separate cleanly: auth is infrastructure; the wizard (sun/style/size, which feed palette _recommendations_) is product and stays deferred. What auth needs from onboarding is exactly one field — **location** — because location is the only profile input anything consumes today (it drives the Open-Meteo climate/hardiness/frost derivation in [the weather integration](#weather), which feeds the weather-derived dashboard copy shipped in PR #18). So we collect location and nothing else.

**Auth methods: magic link (default) + Google OAuth.** Passwordless email is the default — Supabase ships it out of the box, and it removes password friction at exactly the sign-up moment. Google OAuth sits alongside it (not instead), because European beginners skew toward "sign in with Google." Both are near-zero implementation cost on Supabase. Consequence: **there is no password anywhere**, so account settings has no password management to build.

**Garden provisioning: auto-created, never "set up."** v1 is one garden per user, so there is nothing to choose or configure. A Postgres trigger on `auth.users` insert creates the `users` row _and_ an empty `gardens` row. The user never "creates a garden" — it exists the moment they exist.

**The garden profile exists as data but has no UI.** All `gardens` profile columns (location, space type, sun, style, size) are present from day one, but only `location` is populated this phase (by the first-run step below). The rest stay null until the deferred onboarding wizard fills them. There is **no profile screen** — the profile is plumbing, not a surface.

**First-run: a single required location step. Null location _is_ the gate — no separate "onboarded" flag.** After auth, a user whose garden has a null `location` is routed to a one-field location capture; once set, they reach the app. The gate logic is a single condition (`garden.location IS NULL → location step`), so there is no `onboarding_complete` boolean to keep in sync. Location is **required** (not skippable) on purpose: guaranteeing it exists before the dashboard lets us delete all profile-less-fallback code — the app may always assume a location. This is the one "forced" input, a deliberate exception to the never-required ethos, justified because the entire climate layer depends on it.

**The whole app is gated; only the santolina.app landing stays public.** This reverses the earlier documented philosophy ("no account gate, value shown immediately, prompt only at first save") — a conscious change, not drift. Landing page sells the product; everything under it (dashboard, explore, my garden, diary) requires a session. Middleware redirects unauthenticated requests to the landing/login. Consequence: the "prompt at first save" logic never needs building.

**RLS cutover is the real work and the real risk.** Every user-scoped server action (`palette-actions.ts`, `diary-actions.ts`, `garden-actions.ts`) switches from the service-role client (which bypasses RLS) to a session client via `@supabase/ssr`, so the existing `auth.uid()` policies actually run. Service-role is retained _only_ for the plants catalog writes (Trefle sync, curation scripts — [the server-only clients](#server-only-clients)). The RLS policies in `20260706093045_initial_schema.sql` have never been exercised against a real session, so expect policy bugs on first login — this is the part to test hardest.

**Account settings: the basics only.** Email, sign out, delete account, **reset garden** (destructive-confirm dialog — doubles as the easy way to clear test data), and **edit location** (the one live profile field needs a home; settings is it). Nothing else.

**The seed garden is discarded.** `7055368c…` holds 5 palette rows and 1 diary entry — throwaway test data, not real plants. It is not migrated or claimed; it's dropped. The shared `plants`/`plant_combinations` catalog is garden-independent (public read) and wholly unaffected — every new user sees all catalog species immediately.

**Sidebar identity** is wired to the authenticated user / `users` table, replacing the hardcoded "PA / Paradoxich" in `AppSidebar.tsx`.

**Ordered work items:** (1) `@supabase/ssr` + three client flavors + `middleware.ts` session refresh; (2) `handle_new_user` trigger creating `users` + empty `gardens`; (3) magic-link + Google auth UI and callback route; (4) required first-run location step, gated on null `location`; (5) flip the three server actions to the session client, delete `current-garden.ts` and its hardcoded id; (6) full-app middleware gate, landing stays public; (7) sidebar identity from `users`; (8) account settings surface. Operational, not code: custom SMTP (Resend/Postmark) for magic-link deliverability before public launch — Supabase's built-in sender is rate-limited; and a Google Cloud OAuth app + redirect URLs configured in Google and Supabase.

---

<a id="group-garden"></a>

## The garden you own

<a id="palette-write-path"></a>

### Palette write path: an application-level upsert

**Decision:** `server/palette-actions.ts` is the only write path for
`palette_plants`, and every write filters on `garden_id` before mutating —
`updateStatus` and `removeFromPalette` throw rather than silently touch a row in
another garden. That guard predates real auth and is kept as defence in depth
now that the actions run on the session client under RLS
([the auth cutover](#auth)).

**`addToPalette` upserts in the application, not with `ON CONFLICT`.** There is
no unique constraint on `(garden_id, plant_id)`, so it selects the pair, then
updates or inserts. The effect a DB-level upsert would give — re-adding a plant
you already have updates the row instead of duplicating it — without a schema
change. The constraint is still the better long-term answer; this is the version
that shipped without one.

**Feedback while a write is in flight is local component state**, not a global
store: the button label swaps, and failure renders an inline `text-critical`
banner. On success the client calls `router.refresh()` to re-pull server data,
because there is no client-side cache to invalidate. This is the app's general
mutation pattern, and the reason Zustand is still unused. Confirmation and undo
are a toast ([toast notifications](#toasts)).

**A reused drawer instance needs a cancellation guard.** Explore keeps one
`PlantDetailDrawer` mounted across plant selections (`ExploreClient`'s static
`key`), so a fast switch can land an older `getPaletteStatus` response after a
newer one. The fetch is guarded for it.

<a id="transition-labels"></a>

### "Add to garden" vs. "Move to growing": two different transitions, two different labels

**The problem:** the drawer's second button used to say "Add to garden" in every state except `planted`, covering two operations that are not the same thing to a user: (1) adding a plant to the palette for the first time (source: `manual`, brand new row) and (2) promoting an already-planned plant to planted (`updateStatus`, same row, no new insert). Reusing one label for both made the button's meaning ambiguous — "Add to garden" on a plant you'd already planned reads as if it might create a duplicate entry, when it actually just changes that plant's status.

**Decision:** these stay two distinct labels everywhere the transition appears, tied strictly to what's actually happening to the data, not to which button/card triggered it:

- **"Add to plan" / "Add to garden"** — only for the not-in-palette state. A fresh `addToPalette` insert.
- **"Move to growing"** — only for promoting an existing `planned` row to `planted`. An `updateStatus` in place, same `paletteId`. Applies to the drawer's second button when `palette.status === 'planned'`, and to the Planned card's primary action in My Garden (`PlannedPlantTile`) — same underlying transition, same label, regardless of where it's triggered from.

Toast copy follows the same split: "Added to your garden" only fires for a fresh insert; "Moved to growing" fires for the promotion, in both the drawer and the My Garden card. `PlantDetailDrawer`'s handler for this button is named `handleSecondaryAction` (not `handleAddToGarden`) precisely because it isn't always "add to garden" — it branches into insert, promote, or remove depending on current state, matching `secondaryActionLabel`'s three-way branch.

<a id="growing-vs-planned"></a>

### Growing vs. Planned: a record you inspect vs. a draft you act on

**Decision:** the two My Plants tabs use different card interaction models on
purpose, and this is not an inconsistency to reconcile.

A **Growing** card is a record of something already in the ground, so the whole
card is one target (`GardenPlantTile`, `MediaCard as="button"`) that opens the
plant. A **Planned** card is a draft awaiting a decision, so its body is inert
and only the footer icons act. With three sibling targets already in that
footer, letting the image and title do a fourth thing makes it impossible to
predict what a click does; reserving the card's main surface for the two
decisions it exists to prompt is worth the extra tap to view details.

Planned cards use `MediaCard`'s `surface="inset"` so they recede toward the page
background, reinforcing "this isn't real yet" alongside the dashed border. The
prop's own doc comment carries the token detail.

<a id="diary-identity"></a>

### Diary: identity is (garden, plant), not the palette row

**Decision:** `diary_entries` keys a thread by `garden_id` + `plant_id`, with
`palette_plant_id` as a nullable, set-null-on-delete convenience link rather
than the thread's real identity.

**Why not key by `palette_plant_id`:** removing a plant from the garden
hard-deletes its `palette_plants` row. If that row were the diary's foreign key
under `on delete cascade`, every note the user had written would vanish with it
— far more destructive than the action they actually took. Keying on
`garden_id`+`plant_id` says the notes are about the plant, not about the act of
currently tracking it, so removing and re-adding reattaches the history for
free. Entries written while the plant was out simply carry a null
`palette_plant_id`.

**Storage is superseded.** The original public-bucket posture was explicitly
temporary and expired when auth shipped — see
[private diary photos](#diary-photos-private). The upload path convention
`{gardenId}/{plantId}/{timestamp}-{filename}` survived it, and is what the
ownership policies key on.

**Still deliberately unbuilt: synthesis across entries.** A "how this plant did
this season" narrative written from the notes themselves is Agent work,
deferred. Until it exists, nothing fakes it with static text.

<a id="diary-photos-private"></a>

### Diary photos go private: signed URLs on a garden-owned bucket

**Decided July 15, 2026.** [diary identity](#diary-identity)'s public-bucket posture was explicitly temporary ("revisit once real auth/profiles exist"); auth shipped ([the auth cutover](#auth)), so this is that revisit. This section supersedes [diary identity](#diary-identity)'s storage paragraph.

**The exposure was worse than [diary identity](#diary-identity) documented.** Beyond the bucket being public, the three storage policies from `20260708121933` had no role or ownership restriction: anyone holding the `NEXT_PUBLIC` anon key could **list** the whole bucket via the storage API (so "unguessable UUID paths" protected nothing), **upload** arbitrary objects into it, and **delete** other users' photos. And Supabase doesn't strip EXIF, so public photos likely carried GPS coordinates of users' homes.

**The shape now** (migration `20260715100000` + `lib/diary-photos.ts`):

- **Bucket private, policies keyed on garden ownership.** All three operations (select/insert/delete) are restricted to `authenticated` and require the path's first folder — the `{gardenId}` of the unchanged `{gardenId}/{plantId}/{timestamp}-{filename}` convention — to be a garden the caller owns (`storage.foldername(name)[1]` joined to `gardens.user_id = auth.uid()`).
- **The DB stores storage paths, not URLs.** `addDiaryEntry` writes the bucket-relative path into `photo_urls` (filenames sanitized to safe storage-key characters). Reads sign on the way out: `withSignedPhotoUrls` in `server/diary-actions.ts` batches one `createSignedUrls` call (1h TTL) per read, so `DiaryEntry.photoUrls` is always renderable for callers and **no component or `lib/diary.ts` code changed at all** — signing lives entirely at the module boundary.
- **No data migration for old rows.** Pre-cutover rows stored full public URLs, percent-encoded — rewriting them to paths in SQL would need URL-decoding, which Postgres lacks natively. Instead `toDiaryPhotoPath` normalizes both formats (URL → decoded path; path → itself) at read time, permanently. Old public URLs die when the bucket flips — by design.
- **Deletes now remove photo objects.** `deleteDiaryEntry`, `deleteDiaryThread`, `resetGarden`, and `deleteAccount` all remove the entries' photos from storage, best-effort after the row deletes succeed (an orphaned object in a private bucket costs storage, not privacy — so a storage hiccup never fails a delete that already happened). This closes [diary identity](#diary-identity)'s orphaned-file gap and makes the delete-confirm copy ("permanently delete this note and N photos") true. `deleteAccount` does it via the session client _before_ signing out, since the DB cascade can't reach storage.

**Deploy order matters: code first, then migration.** New code on the still-public bucket works fine (signing works on public buckets; new uploads store paths, which old URLs' normalizer also handles). The migration on old code breaks photo rendering (old code renders stored public URLs raw, which 404 on a private bucket). So: merge + deploy, then apply `20260715100000`.

**Not solving now:** EXIF stripping on upload (the other half of the location-leak story — private bucket contains it, signed-URL recipients still see it); the shared plants catalog images stay public, which is correct for public catalog data.

**Post-ship fix (same day, migration `20260715110000`): qualify `objects.name` in the policies.** The original policies referenced the object path as bare `name` inside the `EXISTS (select … from gardens …)` subquery — where Postgres resolved it to `gardens.name` (gardens has its own `name` column), not `storage.objects.name`. Every ownership check compared the garden id against the foldername of the garden's _display name_, always false, so all uploads/reads/deletes were denied for everyone. The rule: in a storage policy whose subquery joins any table with a `name` column, always write `storage.foldername(objects.name)`. Found via prod storage logs (400s) + Postgres logs (`new row violates row-level security policy for table "objects"`), confirmed by impersonated-role inserts. The same incident surfaced a second, unrelated blocker: Next's default 1mb server-action body cap rejected multi-photo notes with an opaque "unexpected response" error — raised to 4mb in `next.config.ts` (just under Vercel's ~4.5mb request ceiling, which no config can raise).

**Client-side photo processing (same day, follow-up to the above).** Real files immediately broke both remaining assumptions: a 5.5mb PNG exceeded even the 4mb cap, and a HEIC uploaded fine (bytes are bytes) but rendered as an empty box forever — neither most browsers nor the Vercel image optimizer (`next/image`) can decode HEIC. Fix: `lib/photo-processing.ts` decodes, downscales (2000px long edge), and re-encodes every picked photo to JPEG in the browser before upload. One step solves three problems: size (a 2000px JPEG lands far under the cap), format (everything stored is renderable JPEG; files the browser can't decode — e.g. HEIC outside Safari — are rejected at pick time with a composer message instead of becoming permanently broken photos), and privacy (canvas re-encoding strips EXIF, closing the GPS-metadata follow-up above — browsers apply EXIF rotation during decode, so orientation survives). Trade-off accepted: animated GIFs flatten to a still frame.

<a id="plant-story-subpage"></a>

### Diary retires as a destination; the plant's story moves onto a dedicated subpage

**Decided July 27, 2026.** The Diary page (`/diary`) duplicated My Plants — most rows sat empty ("Waiting for their first note"), and its drawer was 90% plant info wrapped around a notes timeline. `diary_entries` already keyed a thread by `(garden_id, plant_id)` ([diary identity](#diary-identity)) — the data model already treated notes as belonging to the plant, not to a separate destination. Nav drops to Overview / My Plants / Explore / Reflections; the `/diary` route, its list page, and its drawer are deleted outright, not just unlinked.

**A second split fell out of the same move: species vs. owned instance.** `PlantDetailDrawer` had been serving two different things through one UI — a catalog species browsed from Explore, and a plant actually owned and growing. Splitting them completes the same principle the Diary retirement is built on: **every piece of the plant's story has one home, on the thing the user actually owns.**

- **The plant subpage (`PlantDetailPage`, reached at `/plants/[plantId]`) is "my plant."** It carries the same reference sections as the Explore drawer (About, Care, Seasonal Rhythm, etc.) plus the Story (`StorySection`/`StoryComposer`, extracted near-verbatim from the old `DiaryDetailDrawer`) and every owned-instance mutation: remove from garden (with its diary-aware confirmation — zero notes removes immediately, any notes ask first), and the planned→growing transition. Nothing else in the app embeds the Story; other surfaces only ever link to it.
- **`PlantDetailDrawer` stays catalog-only — the species.** It keeps the reference sections and the add-to-plan/add-to-garden actions for a plant with no relationship yet, but never mutates an owned instance and never shows Story. For a plant that's currently planted or was removed with history, its one "primary action" becomes a link to the subpage instead (`hasDiaryEntries` — a count-only check, no signed photo URLs — decides which of the two states applies).
- **Routing is a real path segment, and the flat convention it broke is worth knowing.** Every "detail" view in this app used to be `?plant=` on a flat page (`/plants`, the old `/diary`, `/explore`), and this subpage originally kept that convention on the argument that one screen does not justify the app's first `[id]` route. That argument was sound and lasted two days (PR #129, July 29 2026): detail and its notes have to **share a route tree**, or moving between them remounts through the list. So `app/(app)/plants/[plantId]` and `/plants/[plantId]/notes` are real segments. One screen would not have been worth it; a second screen hanging off the same record is. `GardenClient` no longer renders a detail drawer at all.
- **No orphaned history.** A plant removed from the palette disappears from My Plants but stays in the catalog, so it's still reachable by searching Explore — which is how a removed-but-diaried plant's notes stay reachable without reviving a "removed plants" list.

**Garden-level entries: `plant_id` becomes nullable, no new discriminator column.** Weather, first frost, and general observations aren't about any one plant. Migration `20260728193759` drops `plant_id`'s `NOT NULL` and adds a check that `palette_plant_id` stays null whenever `plant_id` is — `plant_id IS NULL` is the only signal a garden-level entry needs; `event_types` stays the plant-care vocabulary it already was (planted/watered/fertilized/pruned) and garden-level entries simply never set it, rather than inventing a parallel chip set nobody asked for. RLS needed no change — the existing policy was already garden-scoped, not plant-scoped.

**Capture surface: a plain note on the Overview "Recent activity" card, not a new destination.** `getRecentActivity()` replaces `getPlantDiaries()` as the Overview data source — one direct `diary_entries` query ordered/limited at the DB, instead of pulling every plant's full history just to take the newest few. The card (renamed from `DiaryRecentCard`) shows entries across the whole garden, plant-attached and garden-level alike (`plantName: null` renders as "Your garden"), plus a single-line freeform input — text only, no photo attach, no chips — staying a small module rather than growing into the thing that was just retired.

**The diary drawer is deleted, not relocated** (PR #133, July 29 2026). `StorySection` moved onto the plant page and the notes list became its own route, so there is no drawer holding a plant's story in any form. The rule it existed to enforce is the one that survives: **the Story has exactly one home, on the thing the user owns**, and other surfaces only link to it.

**A structural Next.js constraint learned here, worth stating once.** A parent `loading.tsx` wraps every child route beneath it, so the list skeleton was flashing over `activity` and `notes` on navigation. Overview and My Plants each keep their `loading.tsx` inside a **route group** scoped to the list page alone. **A parent `loading.tsx` must not wrap unrelated child routes.**

<a id="plant-dashboard"></a>

### The plant you own is a dashboard for that plant

**Decided July 29 2026** (PR #129), for plants you are **growing**. Planned and removed-with-history plants keep the linear layout: a planned plant has no diary (Ana, July 21), so most of these cards would be permanently empty for it.

**It reuses the dashboard's card system rather than inventing a second visual language** — `Panel`, the same grid ratios, `CardIllustration` for empty cards. The first attempt built its own and was thrown away. The principle: a plant you own is the same _kind_ of surface as the garden you own, so it should not look like a different product.

**Reference content lives in drawers, not inline sections.** Plant care on the dashboard already worked this way, and a measurement settles it: an inline reference panel inside a third-width card would have set two `StatCard`s side by side in ~360px. (Relatedly, the year timeline clamps stage descriptions to two lines, which is why `SeasonalRhythmSection` stays in the drawer rather than being deleted — the timeline is the at-a-glance view, the drawer holds the full text.)

**No health status, and this is a standing ruling rather than a scoping cut.** Inferring "needs water" from the _absence_ of logs is trap 1 in a new costume — a fallback that turns missing data into a confident-looking claim. The app does not know a plant is thirsty; it knows nobody wrote anything down. Those are different facts and only one of them is true.

**Two fields the page wants and the schema lacks**, both cut from the hero rather than rendered as "not recorded" placeholders. `palette_plants.planted_at`: age is currently inferred from a `planted` diary event, so a plant marked planted without logging has no age at all — **and every establishment rule in `CARE_EVENT_RULES` silently never fires for it**. And a placement field, for where in the garden a plant actually sits.

`/plant-preview` is a dev harness behind the auth gate; it renders the real `GardenPlantView` rather than a copy, so it cannot drift.

---

<a id="group-derived"></a>

## Views derived at render time

<a id="bloom-status"></a>

### Bloom status is computed, never stored

**Decision:** a plant's bloom status (`blooming` / `pre-bloom` / `done` /
`resting` / `evergreen`) is a pure function of `bloom_months` and today's date,
in `lib/bloom-status.ts`. It is never written to a column.

**Why not store it:** unlike a hardiness zone, which needed an external
temperature table to derive, bloom status needs no data the row does not already
carry. Storing it would mean re-deriving it on a schedule to stop it going
stale, so a cron job and a staleness window would exist purely to cache
arithmetic. Computing at render time makes staleness structurally impossible.
The same reasoning governs the weather forecast ([weather](#weather)) and, for a
while, care tips.

The algorithm and its known limitation — a bloom window crossing December into
January breaks the `min`/`max` boundary, and no catalog plant currently does —
are documented on the function itself, which is the only place they can be
checked against the code.

<a id="care-tips-v1"></a>

### Care Tips v1: descriptive text is not actionable text

> **Superseded by [seasonal_care](#seasonal-care), July 15 2026.** The tips
> system no longer reads `maintenance_notes`, and none of v1's selection
> mechanics survive. One finding does.

The first Care Tips card displayed `seasonal_rhythm[currentSeason]`, which
sounded right and was not: `seasonal_rhythm` **describes** what the plant is
doing ("Peak flowering occurs with masses of papery blooms"), where a card
titled "Care tips" has to **prescribe** what you do ("Deadhead spent blooms to
encourage reflowering"). v1 fixed this by switching to `maintenance_notes`.

That switch was itself only half right, and the reason is the durable one: a
care manual is not a tip either. `maintenance_notes` holds several actions with
no timeframe, so at ~20 plants the card became the encyclopedia re-sorted. Both
mistakes are the same mistake — **taking a field that exists and hoping it
answers "why now?"** — which is what produced the purpose-built field in
[seasonal_care](#seasonal-care).

<a id="weather"></a>

### Weather integration: Open-Meteo geocoding + forecast, both free, no key

**Decision:** Open-Meteo backs the dashboard's Weather card through two
endpoints, neither of which needs an API key — geocoding for the location
picker, forecast for the card. Chosen for having no key and no billing at all,
against a city-level resolution limit we accept.

**Geocoding returns `name`/`admin1`/`country` on purpose.** Cities share names,
and both "Springfield" and "Opatija" turned out to have real duplicates in the
results during testing, so the picker must show the region to be usable at all.
The 300ms debounce came with the app's first `useDebounce` hook.

**The forecast is fetched fresh on every dashboard load** (`cache: 'no-store'`),
and `gardens` stores the location, never the weather. Same reasoning as
[bloom status](#bloom-status): a cached forecast is a stale forecast, and
weather is the one thing where that is obvious to the user.

**`mapWeatherCode` collapses ~30 Open-Meteo codes into 7 semantic concepts**
rather than mapping them one to one, so the icon set stays small enough to
actually draw. The mapping is in `lib/weather-icon.ts`; day/night variants
remain deliberately unbuilt.

<a id="explore-ranking"></a>

### Explore: search results are ranked, and the query stopped over-fetching

**Decided July 30 2026** ([PR #149](https://github.com/Paradoxich/santolina/pull/149)).

**Ranking lives in `searchRank` in `lib/explore-filters.ts`, and so does its rationale** — the five-tier ladder, why an exact hit on a plant's own common name gets a tier above an alias hit (_Lantana camara_ carries the literal alias "sage" and was beating _Salvia officinalis_ on alphabetical order), and why the sort must be stable. Read it there; it is the file anyone changing the behaviour will open. Two calls are still unvoiced by Ana: that extra exact tier, and prefix-over-substring putting "Sagebrush" above "Russian sage".

**`image_urls` is out of the Explore query, and the correction to the framing is what belongs here** rather than in any one file. The backlog item said the column "ships ~879 kB to the browser." It **never reached the browser at all** — `CatalogPlant` has no field for it. The real cost was **1350 kB of a 1997 kB Postgres read**, fetched and discarded by the Next server on every view of a force-dynamic page. **The number was right-ish and the hop was wrong**; the fix for a payload problem and the fix for a query problem are different fixes, so check which hop a cost sits on before optimising it. Sibling of the docs-are-not-evidence rule.

**Why dropping it loses no image**, which spans three files and therefore has no code home: `heroImageUrl`'s `image_urls[0]` fallback is unreachable from these queries, because `mapImages` in `lib/trefle.ts` resolves a hero from **any** category when no priority category matches — so `image_url` is null only when `image_urls` is empty too. Measured on the live catalog at merge time: 0 of 695 rows relied on it. The parameter stays for callers that do pass the column (`getPlantDetail`'s `select('*')`, and the drawer gallery, which needs the full list).

---

<a id="group-interface"></a>

## Interface conventions

<a id="toasts"></a>

### Toasts live in the framework package, and group by entity

**Where it lives:** `packages/ui`. A toast provider knows nothing about gardens,
so by the project's Layer 2/3 split it is framework, not product. `Toast` had
existed as an unwired presentational primitive; the provider, the stack and
`useToast()` were built when the palette actions needed confirmation and undo.
It is mounted once in `app/(app)/layout.tsx`, which is what lets a toast survive
client-side navigation between Explore and My Plants.

**`groupKey` exists because an undo can outlive the row it would undo.** Two
fast actions on the same plant stacked two toasts, and the older one's Undo
closure still held the `paletteId` the newer action had already deleted —
clicking it threw. Every palette toast now passes the plant id as `groupKey`,
and the provider drops any existing toast with that key, so only the latest
valid undo is ever on screen. The general shape is worth remembering: **an undo
button is a captured mutation, and it must not outlive its own precondition.**

**Each undo is handwritten at the call site**, not derived. Insert, update and
delete each have a different correct inverse, so a generic "undo the last
mutation" would rebuild the same branching one layer further from the code that
knows the answer. Clicking any toast action dismisses it immediately, so a
double-click cannot fire a completed undo twice.

Toast copy is not reproduced here; the `toast({...})` call sites are the copy.

<a id="content-width"></a>

### One content width across the app

**Decided July 29 2026.** Three surfaces disagreed about how wide the app is: the dashboard capped content at 1032px, and **Explore and My Plants were not capped at all**, so on a wide display they ran several hundred pixels wider than the dashboard sitting beside them in the same nav. Recorded here because no single file owns "the app has one width" — the cap, the gutter, and the sidebar offset now derive from one another in `packages/tokens/index.css`, **and that file carries the derivation** (1512 − 232 − 40 − 40) and the history of the 40/48 asymmetry. Do not restate either here.

`lib/chart-colors.ts` exists for the same reason at a smaller scale: the dashboard chart's muted palette was private to `bloom-timeline.ts` until the plant page's year timeline needed it, and the choice was to import it or grow a second copy that drifts.

<a id="appendix-retired-numbers"></a>

## Appendix: section numbers cited in frozen artifacts

Applied migrations and archived round reports cite sections by the number they
carried when they were written, and neither can be edited: a migration that has
run is history, and a round report is the record of what one run found. This
table keeps those citations resolvable. It is closed — nothing new should cite
a number, and `pnpm docs:links` fails if anything does. Titles are the sections'
current ones, which in several cases are not what the citing artifact saw.

| Cited as | Section                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| §1       | [Plant data provider: Trefle, not Perenual](#plant-data-provider)                                                                        |
| §2       | [Database column naming: provider-agnostic](#provider-agnostic-columns)                                                                  |
| §3       | [Plants table is a cache with a manual curation layer](#curation-layer)                                                                  |
| §4       | [Trefle field mapping decisions](#trefle-field-mapping)                                                                                  |
| §5       | [Server-only boundary: three clients](#server-only-clients)                                                                              |
| §6       | [AI curation model: claude-sonnet-4-5](#curation-model)                                                                                  |
| §7       | [Every pass is resumable, and none of them aborts a batch](#seeding-scripts)                                                             |
| §8       | [What writes which column](#plants-schema)                                                                                               |
| §9       | [Data integrity: safe Trefle upsert function](#safe-upsert)                                                                              |
| §10      | [Bloom status computation: derived, not stored](#bloom-status)                                                                           |
| §11      | [The single-tenant shim, and why it wasn't a permissive RLS policy](#rls-shim)                                                           |
| §12      | [Palette write path: an application-level upsert](#palette-write-path)                                                                   |
| §13      | [Toasts live in the framework package, and group by entity](#toasts)                                                                     |
| §14      | ["Add to garden" vs. "Move to growing": two different transitions, two different labels](#transition-labels)                             |
| §15      | [Growing vs. Planned: a record you inspect vs. a draft you act on](#growing-vs-planned)                                                  |
| §16      | [Care Tips v1: descriptive text is not actionable text](#care-tips-v1)                                                                   |
| §17      | [Weather integration: Open-Meteo geocoding + forecast, both free, no key](#weather)                                                      |
| §18      | [Diary: identity is (garden, plant), not the palette row](#diary-identity)                                                               |
| §19      | [Plant combinations: AI companion pass, capped and idempotent](#plant-combinations)                                                      |
| §20      | [Botanical cross-check: blind second pass, flags only, never edits data](#botanical-cross-check)                                         |
| §21      | [The sun-widening sweep: treating a symptom, and the two rules it left behind](#sun-widening)                                            |
| §22      | [Sun modelled as best + tolerated (the root fix)](#sun-model)                                                                            |
| §23      | [`plant_type` is a functional label, not strict botany](#plant-type-label)                                                               |
| §24      | [Auth + single-garden identity: the cutover from single-tenant shim to real accounts](#auth)                                             |
| §25      | [The plant-expansion round: current end-to-end cadence (runbook)](#round-runbook)                                                        |
| §26      | [`native_region`: WGSRPD Level-2, regenerated from Trefle (and the `tdwg_code` trap)](#native-region)                                    |
| §27      | [Hardiness: RHS rating is canonical, drafted then human-verified](#hardiness)                                                            |
| §28      | [Care Tips v2 Tier 1: `seasonal_care`, a distilled prescriptive field (replaces `maintenance_notes` in the tips system)](#seasonal-care) |
| §29      | [Diary photos go private: signed URLs on a garden-owned bucket](#diary-photos-private)                                                   |
| §30      | [Hero images: category-recovered shortlist, then an AI vision pick](#hero-images)                                                        |
| §31      | [Wikimedia hero photos + image attribution](#wikimedia-attribution)                                                                      |
| §32      | [Diary retires as a destination; the plant's story moves onto a dedicated subpage](#plant-story-subpage)                                 |
| §33      | [One content width across the app](#content-width)                                                                                       |
| §34      | [The plant you own is a dashboard for that plant](#plant-dashboard)                                                                      |
| §35      | [Explore: search results are ranked, and the query stopped over-fetching](#explore-ranking)                                              |
