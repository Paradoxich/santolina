# Santolina — Architecture Decisions

This document records the architectural decisions made during the build of the plant data layer. Decisions are ordered chronologically.

---

## 1. Plant data provider: Trefle, not Perenual

**Decision:** Use [Trefle](https://trefle.io) (`TREFLE_API_KEY`) as the plant species data source. Perenual was evaluated and rejected.

**Rationale:**

- Perenual's free tier is effectively paywalled. A direct comparison against the same 5 species showed that `hardiness`, `care_level`, `sunlight`, `watering`, and `description` all returned `null` on the free tier. Two species (Lavandula, Hydrangea) returned HTTP 429 ("Please Upgrade Plan") at the detail endpoint. Rosa canina wasn't searchable at all.
- Trefle is open-source, free, and returned real data for all 5 test species. Its data gaps are genuine (some species simply haven't had growth data contributed), not paywall-gated.
- Trefle has a significantly larger species database (~417,000 species vs Perenual's catalog).

**Trade-offs accepted:**

- Trefle has patchy `growth` data for well-known ornamentals (Lavandula angustifolia, Hydrangea macrophylla, Echinacea purpurea all had entirely null growth objects). This is addressed by the AI curation pass (see §6).
- Trefle's rate limit is 120 req/min. The seed script paces at 1.5s between species (2 calls each) to stay safely under the limit.

---

## 2. Database column naming: provider-agnostic

**Decision:** The column that holds the external species identifier is named `source_species_id` (integer) with a companion `data_source` text column (default `'trefle'`), not `perenual_id`.

**Rationale:** During the switch from Perenual to Trefle, the original `perenual_id` column was renamed. The new naming reflects that the column holds whatever the current provider's numeric ID is, making a future provider change non-breaking at the DB level. `data_source` is set explicitly in every upsert from code, not relying on the DB default, so the provider is always traceable in the data itself.

---

## 3. Plants table is a cache with a manual curation layer

**Decision:** The `plants` table caches external data but has a separate curation layer that is never overwritten by the provider integration.

**Two distinct write paths:**

1. **Trefle sync** (`lib/trefle.ts` → `lib/plants-db.ts`): Populates botanical facts. Never touches `style_tags`, `space_types`, `bloom_color`, `foliage_color`, `plant_type`, care instructions, or any AI-drafted fields.
2. **AI curation** (`scripts/curate-plants.ts` → Claude): Fills gaps and generates garden-specific metadata. Never overwrites fields that already have data.

**`is_curated` flag:** Set to `false` on all automated writes. Flipping it to `true` is a deliberate manual step after human review. This means the plants table always has a clear distinction between "machine-drafted" and "human-verified" rows.

**What "human review" means (redefined July 2026):** the reviewer isn't a botanist, so `is_curated = true` asserts an _editorial_ pass, not botanical verification: the image shows the right plant, the description reads well and on-brand, and the style/space tags make product sense. Botanical facts (hardiness, sun, bloom months) are verified by a separate AI cross-check pass — a second, independent model run prompted to fact-check the curation output and flag disagreements for human spot-checking (built; see §20).

**Note:** this separation was not fully enforced until a bug was found and fixed (see §9). Initially, re-running the Trefle seed against already-curated plants silently overwrote `description`, `care_level`, and `height_min_cm` with Trefle's null values, since these are fields both Trefle and AI can populate. The fix (§9) makes this structurally impossible going forward, not just a convention.

**`ai_drafted_at` timestamp:** Set on every successful curation pass. Provides a review queue: `WHERE ai_drafted_at IS NOT NULL AND is_curated = false`.

---

## 4. Trefle field mapping decisions

**Confirmed against live API responses before writing any mapping code.**

| Our column            | Trefle field                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_species_id`   | `data.id`                                  | Numeric integer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `common_name`         | `data.common_name`                         | Falls back to `scientific_name` if null — many Trefle entries have no common name                                                                                                                                                                                                                                                                                                                                                                                                              |
| `common_name_aliases` | `data.common_names.eng[]`                  | English entries from the multi-language `common_names` object; primary name excluded                                                                                                                                                                                                                                                                                                                                                                                                           |
| `scientific_name`     | `data.scientific_name`                     | Plain string (not an array — unlike Perenual)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `family`              | `data.family`                              | Top-level string, present on all records                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `native_to`           | `data.distribution.native[]`               | Flat string array joined as `"France, Italy, Spain"`. Used `distribution` (singular, flat) not `distributions` (plural, full objects)                                                                                                                                                                                                                                                                                                                                                          |
| `description`         | `data.growth.description`                  | Lives under growth sub-object; null on most records                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `care_level`          | —                                          | **null** — Trefle has no equivalent; explicitly not fabricated                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `bloom_months`        | `data.growth.bloom_months`                 | Array of 3-letter month abbreviations (`jan`–`dec`) converted to integers 1–12                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `peak_season`         | —                                          | Derived: whichever season contains the most `bloom_months` entries                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `height_min_cm`       | `data.specifications.average_height.cm`    | Average height used as "typical minimum" proxy; already in cm                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `height_max_cm`       | `data.specifications.maximum_height.cm`    | Already in cm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `hardiness_zone_min`  | —                                          | **Mapping removed July 2026 (§27)** — the `minimum_temperature` → USDA-zone derivation was dead code (the field is null for 100% of the catalog) and was deleted; hardiness is now the editorial RHS rating (§27)                                                                                                                                                                                                                                                                              |
| `hardiness_zone_max`  | —                                          | **null** — Trefle's max temp does not cleanly map to a max zone                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `sun_requirements`    | `data.growth.light` (0–10 integer)         | 0–3 → `shade`, 4–6 → `partial_sun`, 7–10 → `full_sun`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `image_url`           | `data.images.flower[0]` → `habit` → others | Prefers flower then habit categories                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `image_urls`          | All image URLs across all category keys    | Trefle sometimes returns an undocumented `""` (empty-string) image category alongside the documented ones. `mapImages` iterates `Object.keys(images)` so all categories are captured regardless of name. `image_url` (hero) still uses a priority list (`flower` → `habit` → `leaf` → …) with any unknown categories as a final fallback. `TrefleImages` carries an index signature (`[key: string]: TrefleImage[] \| null \| undefined`) so the type honestly reflects this open-ended shape. |

**NOT NULL constraint defaults discovered during seeding:**

- `bloom_months` — defaults to `[]` (empty array) when Trefle has no data
- `sun_requirements` — defaults to `[]` when Trefle has no `light` value
- `image_urls` — defaults to `[]` when Trefle has no images (e.g. Centaurea cyanus)

---

## 5. Server-only boundary: three clients

Three clients are server-only and must never be imported into client components:

| File                      | Client                 | Key                                        |
| ------------------------- | ---------------------- | ------------------------------------------ |
| `lib/supabase.ts`         | Supabase anon client   | `NEXT_PUBLIC_SUPABASE_ANON_KEY`            |
| `lib/supabase-admin.ts`   | Supabase service role  | `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS |
| `lib/anthropic-client.ts` | Anthropic Messages API | `ANTHROPIC_API_KEY`                        |

All three are lazily instantiated (client created on first call, not at module load time) so they don't throw at import time in contexts where env vars aren't set.

---

## 6. AI curation model: claude-sonnet-4-5

**Decision:** Use `claude-sonnet-4-5` for the curation pass (`CURATION_MODEL` constant in `lib/anthropic-client.ts`).

**Rationale:** Better factual reliability than Haiku for botanical claims (hardiness zones, growth habits, native ranges). Cost is negligible at the volume of a plant catalog seed (~30–200 species).

**Two model constants, deliberately split — do not merge them.** `lib/anthropic-client.ts` exports `CURATION_MODEL` (`claude-sonnet-4-5`) and `VISION_MODEL` (`claude-sonnet-5`). Every **text** curation and cross-check script is pinned to the first: `curate-plants`, `cross-check-plants`, `curate-combinations`, `curate-styles`, `curate-greenery`, `draft-hardiness`, and the seasonal-care pair. Only the image pass (`pick-plant-images`, `feed-wikimedia-candidates`) uses the second, because vision needs current generation — Sonnet 5 reads images at up to 2576px on the long edge where 4.5 downscales to 1568px and loses the focus and framing detail the pick depends on (§30).

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

---

## 7. Seeding architecture

**`scripts/seed-plants.ts`** — fetches from Trefle, writes to Supabase.

- Accepts either Trefle numeric IDs or scientific/common name strings. Names are resolved via `/api/v1/plants/search` first.
- Upserts on `source_species_id` via the `upsert_trefle_plant` Postgres function (see §9), which is what makes re-runs safe — a plain client-side upsert was found to overwrite curated data and has been replaced.
- Paces at **1.5s between species** (2 Trefle calls each: search + detail) to stay under the 120 req/min rate limit. Full 25-species run takes ~53s.
- Continues past individual failures; prints a summary at the end; exits 1 if any failed.

**`scripts/curate-plants.ts`** — calls Claude, writes AI drafts to Supabase.

- Queries all `is_curated = false` rows.
- Paces at **2s between plants** (one Claude call each).
- Only patches fields that are actually missing — never overwrites.
- Summary flags: low-confidence hardiness zones, plants with no assignable `plant_type`.
- Does not flip `is_curated` — that is always a manual step.

**Running scripts:**

```bash
cd apps/web

# Seed from Trefle
./node_modules/.bin/tsx --env-file=.env.local scripts/seed-plants.ts

# AI curation pass
./node_modules/.bin/tsx --env-file=.env.local scripts/curate-plants.ts
```

The `pnpm seed` script in `package.json` is equivalent to the first command.

---

## 8. Plants schema overview

Column list as of early July 2026. **Not maintained retroactively** — later migrations added `sun_thrives`/`sun_tolerates` (§22), `native_region` (§26), `hardiness_rating`/`hardiness_verified` (§27), and `seasonal_care` (§28); the migrations themselves are the source of truth for the current schema.

| Column                 | Type                         | Source                    |
| ---------------------- | ---------------------------- | ------------------------- |
| `id`                   | uuid                         | auto                      |
| `source_species_id`    | integer                      | Trefle                    |
| `data_source`          | text                         | code (`'trefle'`)         |
| `common_name`          | text                         | Trefle                    |
| `common_name_aliases`  | text[]                       | Trefle                    |
| `scientific_name`      | text                         | Trefle                    |
| `family`               | text                         | Trefle                    |
| `native_to`            | text                         | Trefle / AI               |
| `description`          | text                         | Trefle / AI               |
| `plant_type`           | text (enum check)            | AI                        |
| `plant_type_label`     | text                         | AI                        |
| `care_level`           | text (`low`/`medium`/`high`) | AI                        |
| `bloom_months`         | integer[]                    | Trefle / AI               |
| `peak_season`          | text                         | derived from bloom_months |
| `height_min_cm`        | integer                      | Trefle / AI               |
| `height_max_cm`        | integer                      | Trefle / AI               |
| `spread_min_cm`        | integer                      | AI                        |
| `spread_max_cm`        | integer                      | AI                        |
| `hardiness_zone_min`   | text                         | Trefle (derived) / AI     |
| `hardiness_zone_max`   | text                         | AI                        |
| `sun_requirements`     | text[]                       | Trefle / AI               |
| `water_needs`          | text                         | AI                        |
| `water_needs_summary`  | text                         | AI                        |
| `light_needs`          | text                         | AI                        |
| `soil_needs`           | text                         | AI                        |
| `maintenance_notes`    | text                         | AI                        |
| `common_issues`        | text                         | AI                        |
| `best_placement`       | text                         | AI                        |
| `environment_benefits` | text                         | AI                        |
| `seasonal_rhythm`      | jsonb                        | AI                        |
| `image_url`            | text                         | Trefle                    |
| `image_urls`           | text[]                       | Trefle                    |
| `style_tags`           | text[]                       | AI / manual               |
| `space_types`          | text[]                       | AI / manual               |
| `garden_use_tags`      | text[]                       | AI / manual               |
| `bloom_color`          | text[]                       | AI / manual               |
| `foliage_color`        | text                         | AI / manual               |
| `is_curated`           | boolean                      | manual                    |
| `ai_drafted_at`        | timestamptz                  | script                    |
| `created_at`           | timestamptz                  | auto                      |
| `updated_at`           | timestamptz                  | auto                      |

**Taxonomy note:** `style_tags` and `garden_use_tags` are distinct taxonomies:

- `style_tags`: aesthetic garden style (`cottage`, `mediterranean`, `wildflower`, `modern`, `lush`, `classic`)
- `garden_use_tags`: practical application (`"pollinator gardens"`, `"gravel gardens"`, `"sunny borders"` etc.)

---

## 9. Data integrity: safe Trefle upsert function

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

**Revised July 9, 2026 — the original rules were fill-only in the wrong direction.** The table above protected fields only when Trefle sends _nothing_: `COALESCE(EXCLUDED.x, plants.x)` lets an incoming non-null Trefle value overwrite the stored one, and the array `CASE` rules pointed the same way. That was fine against Trefle's nulls (the original bug) but destructive wherever Trefle _has_ data and the stored value had since been editorially corrected — the round-3 full re-seed reverted 49 of the 62 editorial `sun_requirements` corrections (§20) this way. `supabase/migrations/20260709210000_fill_only_trefle_upsert.sql` replaces the function with uniform **fill-only** semantics: on UPDATE the stored value always wins and Trefle can only fill gaps (null scalars, empty arrays); `common_name`/`scientific_name`/`data_source` are no longer rewritten either. INSERTs are unchanged. Trade-off: a re-seed can no longer refresh names/images/bloom data on existing rows — refreshing from Trefle now requires explicit tooling that declares which fields it overwrites. Alongside this, `seed-plants.ts` now skips already-cataloged species by default (matched on scientific name, then on resolved Trefle ID to catch synonym remaps); `--include-existing` restores full-list behavior. Verified live: a hostile upsert against a corrected row left every field intact, and a full default seed run made zero writes (145 skipped).

---

## 10. Bloom status computation: derived, not stored

**Decision:** A palette plant's bloom status (`blooming` / `pre-bloom` / `done` / `resting` / `evergreen`) is computed on the fly from `plants.bloom_months` via a pure function, `getBloomStatus()` in `apps/web/lib/bloom-status.ts`. It is never written to a column.

**Rationale:** Unlike hardiness zone derivation (§4), which needed a historical temperature-threshold table to map a Trefle temperature value to a USDA zone, bloom status needs no external data at all — `bloom_months` already exists on every curated plant, and "what's the status today" is a pure function of that array plus the current date. Storing a computed status would mean re-deriving it on a schedule (a cron, a nightly job) to keep it from going stale; computing it at render time makes staleness structurally impossible and needs no extra infrastructure.

**The rule:**

```
normalizeMonth(m) = ((m - 1 + 12) % 12) + 1

getBloomStatus(bloomMonths, today = now):
  if bloomMonths is empty                              → 'evergreen'
  if currentMonth ∈ bloomMonths                         → 'blooming'
  if currentMonth == normalizeMonth(min(bloomMonths) - 1) → 'pre-bloom'
  if currentMonth == normalizeMonth(max(bloomMonths) + 1) → 'done'
  otherwise                                              → 'resting'
```

Checked in priority order as listed. `currentMonth` is `today.getMonth() + 1` (1–12).

**Known limitation — contiguous-window assumption:** `min`/`max` over `bloomMonths` only produce the correct bloom-window boundary when the bloom period doesn't cross the December→January wrap. A plant blooming `[11, 12, 1, 2]` (Nov–Feb) has `min = 1` and `max = 12`, which is backwards — `pre-bloom`/`done` would be computed against the wrong edge of the window. None of the currently curated plants have a bloom window that wraps the year boundary, so this is an accepted v1 limitation, not a bug being fixed now. If a future species needs it, the fix is to detect the wrap (a large gap between sorted consecutive months, e.g. via circular clustering) rather than a plain `Math.min`/`Math.max`.

---

## 11. RLS blocker on `gardens`/`palette_plants`: service-role client, hardcoded garden id

> **Superseded by §24 (auth cutover, July 2026).** `lib/current-garden.ts` and the hardcoded garden id are deleted; server actions now run on the session client and the RLS policies are live. The seed garden referenced below was discarded, not migrated. Kept for the record.

**The bug:** `getPlantDetail()` always fell back to a hardcoded `DEFAULT_GARDEN` mock object, with a comment claiming this was "while onboarding/auth don't exist yet." That was the wrong diagnosis. The real cause: `gardens`' and `palette_plants`' RLS policies both require `auth.uid()` to match the garden's `user_id` (directly on `gardens`, via a join on `palette_plants`). Since the app has no real auth session, the anon client's `auth.uid()` is always null, so every query against these two tables silently returned zero rows — not because the data didn't exist (a real garden row was seeded and present the whole time), but because RLS was quietly blocking it. The `.maybeSingle()` fallback masked this as "no row yet" instead of surfacing it as a permissions problem.

**Decision:** Reads/writes to `gardens` and `palette_plants` go through the service-role client (`lib/supabase-admin.ts`, same client already used for the Trefle sync) scoped to one hardcoded, known-good garden id, via a new `lib/current-garden.ts` helper (`getCurrentGardenId()`, `getCurrentGarden()`). RLS policies themselves are untouched.

**Why this over a temporary permissive RLS policy:** A permissive policy (e.g. `USING (true)` or an anon-role carve-out) would need to be written now and correctly reverted later — an easy thing to forget, and a real risk if it ships to production. The existing `auth.uid() = user_id` policies are already correct for when real auth exists; bypassing them at the client layer for this one single-tenant test phase keeps the policies untouched and the eventual auth cutover simpler — swap `getCurrentGarden()`'s hardcoded id for a real session lookup, delete `lib/current-garden.ts`, done. It also mirrors a pattern already established in this codebase (§5): service-role access for privileged, script-like operations, kept out of the client bundle.

**Explicitly temporary:** `lib/current-garden.ts` hardcodes the single seeded garden's id (`7055368c-6158-46b9-a592-223974c7a319`) and is commented as such. It assumes single-tenant, single-garden usage — do not build multi-user or multi-garden features on top of it. It gets deleted, not extended, once onboarding creates real garden rows tied to real auth sessions.

---

## 12. Palette write path: application-level upsert, reversible button state machine

> **Client/scoping half superseded by §24 (auth cutover, July 2026)** — palette actions now run on the session client under RLS, not the service-role client with a hardcoded garden id. The application-level upsert and the button state machine below still stand.

**Decision:** `server/palette-actions.ts` (`addToPalette`, `updateStatus`, `removeFromPalette`, `getPaletteStatus`, `listPalette`) is the write path for `palette_plants`. Same pattern as §11: the service-role client, scoped to `getCurrentGardenId()`. Every write also filters on `garden_id` before mutating — `updateStatus`/`removeFromPalette` no-op (throw) rather than silently touching a row outside the current garden, which matters once this stops being single-tenant.

**`addToPalette` is an application-level upsert, not `ON CONFLICT`:** there's no unique constraint on `(garden_id, plant_id)` in the live schema, and adding one was out of scope (no schema changes for this pass). `addToPalette` selects for an existing row on that pair first, then updates it (status/source) if found, or inserts if not. This means clicking "Add to plan" on an already-planned plant, or "I have this" on an already-planted one, just updates the existing row instead of creating a duplicate — the same behavior a DB-level upsert would give, implemented at the application layer instead.

**Drawer button state machine — fully reversible, two buttons, three states:**

```
not-in-palette ⇄ planned ⇄ planted
```

- **not-in-palette:** both buttons active. "Add to plan" → `addToPalette(status: 'planned')`. "Add to garden" → `addToPalette(status: 'planted')`.
- **planned:** "Add to plan" becomes "Remove from plan" → `removeFromPalette`, back to not-in-palette. "Add to garden" stays active, unchanged label → `updateStatus(status: 'planted')`, upgrading in place (same `paletteId`, no new row).
- **planted:** "Add to garden" becomes "Remove from garden" → `removeFromPalette`, back to not-in-palette. "Add to plan" is disabled — downgrading planted→planned isn't a meaningful action via this button, so it's the one non-actionable state rather than a dead-end label pretending to do something.

(Originally shipped as "I have this" — renamed to "Add to garden" for symmetry with "Add to plan" when toast notifications were added, see §13.)

`getPaletteStatus` is fetched on drawer mount and whenever the displayed plant changes (the drawer is a single reused component instance across plant selections in Explore, not remounted per plant — see `ExploreClient`'s static `key`), with a cancellation guard so a fast plant switch can't let a stale response overwrite the newer one.

Loading/error feedback while a request is in flight is local component state: button labels swap to "Adding…"/"Saving…"/"Removing…", and a small inline banner (`text-critical`, same token Badge/Toast already use for their critical variant) shows on failure. My Garden's Planned-tab actions (remove, mark as planted) follow the same local-state pattern, calling `router.refresh()` on success to re-run the server component and pull fresh `listPalette()` data — there's no client-side cache to invalidate. Success feedback (confirmation + undo) is a toast — see §13.

---

## 13. Toast notifications: built from scratch, grouped by entity to prevent stale actions

**No toast/notification system existed in the app** before this — `Toast` in `@paradoxui/ui` was an unwired presentational primitive, only ever rendered in the design-system showcase, with no provider, state management, or stacking logic anywhere. Adding confirmation + undo toasts to the palette actions (§12) required building this from scratch.

**Where it lives:** `packages/ui` — a toast provider/hook is generic UI infrastructure with no garden knowledge, so per the project's Layer 2/3 split it belongs in the framework package, not `apps/web`.

- `components/Toast.tsx` — extended with an optional `actions?: ToastAction[]` slot (label + onClick), rendered as inline text buttons below the description. Backward compatible; the design-system showcase usage is untouched.
- `components/ToastProvider.tsx` — new. `ToastProvider` (context + a fixed-position stack rendered via `Toast`) and `useToast()` (`{ toast(options) }`). Auto-dismisses each toast after `duration` (default 6000ms). Mounted once in `app/(app)/layout.tsx`, so the Explore drawer and My Garden share one toast stack and toasts survive client-side navigation between them (the layout doesn't remount on route change within the group).

**Bug found during testing, fixed before shipping — `groupKey` dedup:** rapid actions on the same plant (e.g. Add to plan → Remove from plan in quick succession, well within the 6s auto-dismiss window) stacked two toasts. The older toast's "Undo" button stayed mounted and clickable, but its closure captured the _original_ `paletteId` — which the newer action had already deleted. Clicking that stale Undo threw "Palette row not found in the current garden" (a real, reachable error, not just a test artifact — reproduced by scripting the exact click sequence a fast/impatient user could produce). Fix: `ToastOptions.groupKey` — every palette toast call passes the plant's id as `groupKey`; `ToastProvider.toast()` removes any existing toast with the same `groupKey` before adding the new one, so only the latest, valid action's toast (and its correctly-scoped Undo) is ever on screen for a given plant. A second bug surfaced by the same fix: `groupKey` was being spread onto the underlying `<div>` via `{...toastProps}` (React DOM prop warning) — fixed by explicitly destructuring it out before the spread, alongside `id` and `actions`.

**Copy and undo semantics, by action:**

| Action                                         | Toast                      | Extra action                          | Undo does                                                                                              |
| ---------------------------------------------- | -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Add to plan                                    | "Added to your plan"       | See planned (→ `/plants?tab=planned`) | `removeFromPalette` (delete the row just created)                                                      |
| Remove from plan                               | "Removed from plan"        | —                                     | `addToPalette` (re-insert with the captured prior status/source/notes)                                 |
| Add to garden (fresh)                          | "Added to your garden"     | —                                     | `removeFromPalette`                                                                                    |
| Move to growing (drawer, promote from planned) | "Moved to growing"         | —                                     | `updateStatus(status: 'planned')` — reverts in place, doesn't delete                                   |
| Remove from garden                             | "Removed from your garden" | —                                     | `addToPalette` (re-insert)                                                                             |
| Move to growing (My Garden card)               | "Moved to growing"         | —                                     | `updateStatus(status: 'planned')`                                                                      |
| Remove from planned — trash icon (My Garden)   | "Removed from plan"        | —                                     | `addToPalette` (re-insert, using the row captured from the still-valid `palette` prop before deletion) |

Each Undo closure is handwritten per call site rather than derived generically — insert/update/delete each has a different correct inverse (delete a fresh insert, revert a status change, re-insert a deletion), and a generic "undo the last mutation" abstraction would have to reconstruct that same branching anyway. Any action button click (Undo or "See planned") dismisses its own toast immediately, rather than waiting for the timer — prevents a double-click from re-firing an already-completed undo.

---

## 14. "Add to garden" vs. "Move to growing": two different transitions, two different labels

**The problem:** the drawer's second button used to say "Add to garden" in every state except `planted`, covering two operations that are not the same thing to a user: (1) adding a plant to the palette for the first time (source: `manual`, brand new row) and (2) promoting an already-planned plant to planted (`updateStatus`, same row, no new insert). Reusing one label for both made the button's meaning ambiguous — "Add to garden" on a plant you'd already planned reads as if it might create a duplicate entry, when it actually just changes that plant's status.

**Decision:** these stay two distinct labels everywhere the transition appears, tied strictly to what's actually happening to the data, not to which button/card triggered it:

- **"Add to plan" / "Add to garden"** — only for the not-in-palette state. A fresh `addToPalette` insert.
- **"Move to growing"** — only for promoting an existing `planned` row to `planted`. An `updateStatus` in place, same `paletteId`. Applies to the drawer's second button when `palette.status === 'planned'`, and to the Planned card's primary action in My Garden (`PlannedPlantTile`) — same underlying transition, same label, regardless of where it's triggered from.

Toast copy follows the same split: "Added to your garden" only fires for a fresh insert; "Moved to growing" fires for the promotion, in both the drawer and the My Garden card. `PlantDetailDrawer`'s handler for this button is named `handleSecondaryAction` (not `handleAddToGarden`) precisely because it isn't always "add to garden" — it branches into insert, promote, or remove depending on current state, matching `secondaryActionLabel`'s three-way branch.

## 15. Growing vs. Planned: a record you inspect vs. a draft you act on

**Decision:** the two My Garden tabs intentionally use different card interaction models, not an inconsistency to reconcile:

- **Growing (`GardenPlantTile`)** — a record of what's already in the ground. The whole card is a button (`MediaCard as="button"`) that opens the detail drawer; there's nothing else to do to a growing plant from the grid itself.
- **Planned (`PlannedPlantTile`)** — a draft awaiting a decision (move it to growing, or drop it). The card body is inert on purpose; only the explicit trash / info / "Move to growing" icons in the footer are interactive. A whole-card click here would fight with those adjacent actions — with three sibling click targets already in the footer, clicking anywhere else on the card doing yet another thing (opening the drawer) makes it hard to tell what a click on the image or title vs. the footer will do. Requiring the small info icon for "view details" keeps the card's primary surface reserved for the two decisions it exists to prompt.

**Visual reinforcement:** `MediaCard` gained a `surface?: 'card' | 'sunken'` prop (`bg-surface-card` vs `bg-surface-sunken`) so Planned cards can recede relative to Growing cards without inventing a new token — `surface-sunken` resolves to the same sage-200 as the page background (already used this way by `StatCard`'s `neutral` tone), so a Planned card reads as blending into the page rather than sitting on it, reinforcing "this isn't real yet" alongside the existing dashed border.

---

## 16. Care tips: `maintenance_notes` for the text, `seasonal_rhythm` only for timing — no new AI or API calls

> **Tier 1 superseded by §28 (Care Tips v2, July 15 2026).** The `maintenance_notes`-as-tip-text decision below was the v1 model; it is replaced by the distilled `seasonal_care` field. `maintenance_notes` leaves the tips system entirely. The season-derivation and fallback mechanics here still stand. Kept for the record.

**Decision:** the Dashboard's Care Tips card (`getCareTips()` in `apps/web/lib/care-tips.ts`) is built entirely from data that already exists on curated plants — no new AI generation, no new external API, no new DB column. This is the same "derive at render time" philosophy as bloom status (§10).

**Correction — the tip text source was wrong at first:** this originally read `plant.seasonal_rhythm[currentSeason]` for the displayed tip text. `seasonal_rhythm` is _descriptive_ narrative about what the plant is doing that season (e.g. "Peak flowering occurs with masses of papery blooms") — not something a user can act on. `maintenance_notes` is the field actually written as _prescriptive_ care guidance (e.g. "Deadhead spent blooms to encourage reflowering"), which is what a card titled "Care tips" should show. Fixed to read `plant.maintenance_notes` for the tip text; `seasonal_rhythm`/season are no longer used to select the text at all, only kept for prioritization (below).

**Season derivation:** there was no existing month→season mapping onto the 6-value `seasonal_rhythm` vocabulary anywhere in the codebase — `lib/bloom-status.ts` derives a 5-value bloom status from `bloom_months`, and `lib/trefle.ts` has a separate, unexported 4-value month→season map (`spring`/`summer`/`autumn`/`winter`) used only at Trefle-ingestion time to set `peak_season`. Neither fits. `getCurrentSeason()` adds a standalone month→season lookup for a Mediterranean/European climate: Dec–Feb → `winter`, Mar–Apr → `early_spring`, May–Jun → `late_spring`, Jul–Aug → `summer`, Sep → `late_summer`, Oct–Nov → `autumn`. It still drives the `STATIC_SEASONAL_TIPS` fallback and is available for prioritization, even though it no longer picks the tip text itself.

**Selection and prioritization:** for each palette plant with status `planted` or `planned`, `getCareTips()` reads `plant.maintenance_notes`; plants where it's null are skipped rather than erroring (shouldn't happen given full curation, but defended against). Capped at 5 tips. When there are more than 5 candidates, plants currently `blooming` or `pre-bloom` (via the existing `getBloomStatus()`, §10, itself derived from `bloom_months`, independent of `seasonal_rhythm`) are prioritized to the front of the list — a plant actively flowering right now is more actionable than one just sitting dormant — with the remaining slots filled in `listPalette()`'s existing order (most recently added first).

**Fallback:** an empty palette, or one where every plant lacks `maintenance_notes`, falls back to `STATIC_SEASONAL_TIPS`, a hardcoded `Record<Season, CareTip[]>` of generic, plant-agnostic seasonal tasks (e.g. "Water deeply in early morning to reduce evaporation loss." for summer) keyed by `getCurrentSeason()`. This was already written as genuine advice, not pulled from `seasonal_rhythm` — unaffected by this fix.

**Not building yet:** more specific, event-relative advice — e.g. "fertilize ~3 weeks after planting" — would need dated Diary entries to anchor "since when" and a care-timing ruleset keyed by `plant_type`/`care_level`. Neither exists yet; the Diary itself hasn't been built (still in the test-version scope per `CLAUDE.md`). Revisit once Diary entries give a real planting date to compute against.

---

## 17. Weather integration: Open-Meteo geocoding + forecast, both free, no key

**Decision:** the Dashboard's Weather card is now backed by two Open-Meteo endpoints, neither requiring an API key:

- **Geocoding** (`geocoding-api.open-meteo.com/v1/search`) — called directly from the browser as the user types in the location picker (`components/dashboard/LocationPickerModal.tsx`), debounced 300ms via a new `useDebounce` hook (`hooks/useDebounce.ts` — no debounce utility existed in the codebase before this). Returns `name`/`admin1`/`country` specifically so cities that share a name (e.g. multiple "Springfield"s, multiple "Opatija"s) can be told apart in the results list — confirmed during testing that both cases actually occur in the wild, not just a hypothetical.
- **Forecast** (`api.open-meteo.com/v1/forecast`, `daily=weathercode,temperature_2m_max,temperature_2m_min`) — called server-side from the dashboard page (`lib/open-meteo.ts` → `getForecast()`), same "derive at render time, no new DB column" philosophy as bloom status (§10) and care tips (§16): the `gardens` table only stores `lat`/`lon` (added in migration `20260707141438_add_garden_coordinates.sql`, before this pass added a matching `lat`/`lon` to the `Garden` TS type — the DB column existed before the type did); the actual forecast is fetched fresh on every dashboard load (`cache: 'no-store'`) rather than cached.

**Write path:** selecting a city calls `setGardenLocation()` (`server/garden-actions.ts`), a `'use server'` action following the same service-role-client-scoped-to-the-hardcoded-garden-id pattern as `palette-actions.ts` (§11/§12) — writes `city`, `country`, `lat`, `lon` in one update, then the modal closes and calls `router.refresh()`, matching how palette mutations already trigger live updates (no `revalidatePath` anywhere in this codebase; client-side refresh is the established pattern).

**Icon mapping — a 7-concept collapse, not a 1:1 code map:** `lib/weather-icon.ts` adds `mapWeatherCode(code: number): WeatherIconType`, collapsing Open-Meteo's ~30 numeric weathercodes into 7 semantic concepts (`sunny`, `partly-cloudy`, `cloudy`, `foggy`, `rain`, `snow`, `thunderstorm`). It's pure and keyed only on the code, not time of day — day/night icon variants are an explicit future item, not part of this pass.

**Icon assets — 3 of 7 concepts have a dedicated asset today:** `public/icons/` only has `weather-sunny.svg`, `weather-cloudy.svg`, and `weather-rain.svg` (added in a recent merge). `getWeatherIconAsset()` folds the 4 concepts without a dedicated asset onto the closest existing one as a deliberate, visible placeholder rather than silently inventing new SVGs:

| Concept         | Asset used       | Dedicated asset exists? |
| --------------- | ---------------- | ----------------------- |
| `sunny`         | `weather-sunny`  | Yes                     |
| `rain`          | `weather-rain`   | Yes                     |
| `thunderstorm`  | `weather-rain`   | **No — falls back**     |
| `cloudy`        | `weather-cloudy` | Yes                     |
| `partly-cloudy` | `weather-cloudy` | **No — falls back**     |
| `foggy`         | `weather-cloudy` | **No — falls back**     |
| `snow`          | `weather-cloudy` | **No — falls back**     |

**Not building yet:** dedicated `partly-cloudy`/`foggy`/`snow`/`thunderstorm` icon assets — flagged here so the gap is chosen deliberately rather than papered over with an invented SVG. Day/night icon variants, similarly deferred.

---

## 18. Diary: identity is (garden, plant), not the palette row

**Decision:** `diary_entries` keys a thread by `garden_id` + `plant_id`, with `palette_plant_id` as a nullable, set-null-on-delete convenience link (`references palette_plants(id) on delete set null`) rather than the thread's real identity.

**Why not key by `palette_plant_id` directly:** `removeFromPalette` (§11/§12) hard-deletes the `palette_plants` row when a plant is removed from the garden. If that row were the diary's foreign key with `on delete cascade`, every note a user wrote about that plant would vanish the moment they removed it from their palette — a much more destructive action than the user is actually taking. Keying on `garden_id`+`plant_id` instead means the notes are about the plant, not about the act of currently tracking it; removing and re-adding the same plant later reattaches its history automatically (new entries just won't have a `palette_plant_id` for the gap in between).

**Two sources feed the list:** `lib/diary.ts`'s `getPlantDiaries()` returns one `PlantDiary` per `planted` (growing) row in the _current_ `palette_plants` for the garden (so a freshly-planted plant shows up with an empty thread, ready for its first note) — `planned` plants don't get one yet, since a diary is for tracking something you're actually tending, not a plan. It then adds a second bucket: any plant with `diary_entries` in this garden that's no longer in `palette_plants` at all. Those get `paletteId: null`, and `DiaryListRow` renders a small "Removed from garden" tag next to the plant name instead of hiding the thread — removal is destructive to the palette row, not to the plant's history. Still writable: the composer works the same for a removed plant's diary (e.g. a closing note), since `addDiaryEntry`'s `paletteId` is optional and the schema never required a live palette row.

**Storage — superseded:** the original public-bucket posture ("no real per-user privacy boundary yet — revisit once real auth/profiles exist") expired when auth shipped (§24). The bucket is now private with garden-ownership policies and signed-URL reads — see §29, which supersedes this paragraph. The upload path convention `{gardenId}/{plantId}/{timestamp}-{filename}` (set in `addDiaryEntry`, `server/diary-actions.ts`) is unchanged and is what the ownership policies key on.

**Not solving now:** ~~`deleteDiaryEntry` removes the `diary_entries` row but leaves its uploaded photos in the bucket — an accepted orphaned-file gap for v1~~ (closed in §29: deletes now remove photo objects best-effort). `deleteDiaryEntry` is also not wired to any UI affordance yet (`NoteCard` has no delete button); it exists in `server/diary-actions.ts` for completeness and future use.

**Scope cut — no AI synthesis:** the diary drawer's summary paragraph (`diary.summary`) is the plant's static `plants.description` field (Trefle-sourced botanical description), not a synthesized "how this plant did this season" narrative generated from the diary's own notes. Synthesizing across entries is an explicit future Agent feature (deferred per `CLAUDE.md`) — the chat icon in the drawer header stays present but unwired, not faked with static text pretending to be dynamic.

---

## 19. Plant combinations: AI companion pass, capped and idempotent

**The gap:** the "Works well with" drawer section and the "Pairs naturally with" bullet were fully built read-side (`lib/plant-detail.ts`, `components/plant-detail/WorksWellWithSection.tsx`, `lib/good-for-your-garden.ts`), but `plant_combinations` had no write path anywhere — the feature was invisible except for a handful of hand-seeded rows.

**Decision:** `scripts/curate-combinations.ts` populates the table via the same AI-pass pattern as `curate-plants.ts` (Claude via `CURATION_MODEL`, service-role writes, 2s pacing, per-plant loop with a summary). Chosen over hand-seeding or raw SQL — recorded July 8, 2026.

**Constraints enforced by the script, not just the prompt:**

- **Catalog-only pairs.** The FK requires both sides to exist in `plants`. Claude is given a roster of candidate ids and told to copy them exactly; every returned id is validated against the roster in code, and unknown/invented ids are dropped and counted in the summary (`⚠ N invalid id(s) dropped`).
- **Cap of 5 companions per plant** (the UI shows at most 5), counting _both_ directions of existing rows. Counts are seeded from the DB at startup and updated in memory as rows are inserted, so a plant filled up by earlier iterations stops being offered as a candidate. Plants already at cap are skipped without an API call.
- **Reversed-pair dedupe.** The schema has a no-self-pair check but no pair-uniqueness constraint, so the script canonicalizes every pair to a sorted-id key and skips any pair already present in either direction. This is what makes re-runs idempotent — existing rows are never deleted or overwritten, only missing pairs added, so the script is safe to re-run as new plants are seeded.
- **Enum coercion, not rejection.** `combination_type` (`visual`/`ecological`/`seasonal`) and `strength` (`strong`/`moderate`/`weak`) are check-constrained but nullable; an invalid model value is coerced to `null` rather than losing the pair.

**Flags:** `--limit N` (first N plants, for testing), `--dry-run` (real Claude calls, no writes).

**Prompt shape:** the target plant is described with its drafted metadata (type, styles, sun, bloom months/colors, height); candidates are a compact `id — scientific (common)` roster — Claude's own botanical knowledge fills in the rest. The model is explicitly told fewer suggestions beat weak ones, and that `combination_type` is the _dominant_ reason the pair works.

**Why new plants pair mostly among themselves (cap-saturation, not siloing).** The candidate roster is drawn from the _whole_ catalog, not the current seed batch — a new plant can in principle pair with any existing species. But the 5-companion cap counts both directions, so any older plant already at 5 companions is excluded as a candidate. After a few rounds most established plants are saturated, leaving a fresh batch to pair with whatever older plants still have open slots plus each other. The effect looks like per-batch siloing but is purely the cap filling up on a first-come basis: the additive, never-rewire design means later rounds can only fill leftover slots, never displace an existing pairing. This is intended for the current data-completeness goal; revisiting it is tracked as a future inspiration-layer rethink (see the Build Backlog).

---

## 20. Botanical cross-check: blind second pass, flags only, never edits data

**Why (see §3):** `is_curated = true` is an editorial pass, not botanical verification — the reviewer isn't a botanist. Botanical facts drafted by the first AI pass need an independent check.

**Decision:** `scripts/cross-check-plants.ts` re-derives the four load-bearing botanical fields — `plant_type`, `hardiness_zone_min`/`max`, `sun_requirements`, `bloom_months` — for every plant with `ai_drafted_at` set, and flags disagreements. It **never edits catalog data**; resolving a flag is a human decision. (The one column it does write is the operational `botanical_checked_at` stamp — see below — which is not a botanical or editorial field.)

**Blind by design:** the check prompt contains only the species identity (common name, scientific name, family) — never the stored values — so the second pass can't be anchored by the first pass's answers. Independence comes from blindness, not from a different model (`CURATION_MODEL` is used for both).

**Comparison happens in code, with tolerance rules** — botanical sources legitimately disagree at the margins, so exact-match would drown real errors in noise:

| Field              | `disagree` (spot-check)                                                              | `minor` (listed, likely fine)                                               |
| ------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `plant_type`       | any mismatch                                                                         | —                                                                           |
| `hardiness_zone_*` | ≥ 2 zones apart                                                                      | one side null (±1 zone passes silently)                                     |
| `sun_requirements` | no set overlap, or stored is a proper subset of the check (under-reported tolerance) | genuine shift: partial overlap that is neither a subset nor a contradiction |
| `bloom_months`     | no shared months                                                                     | window boundary drifts > 1 month; one side reports no bloom                 |

Annuals with null zones on both sides are not flagged (nulls are correct there, per §6's annual rule).

**Why `sun_requirements` under-reporting is a `disagree`, not `minor`:** the first full run surfaced a systematic first-pass tendency — 61 of 68 flags were sun `minor` drift, almost all the stored range being narrower than the check (e.g. stored `[full_sun]`, checked `[full_sun, partial_sun]`). Because the pattern is directional and pervasive rather than random noise, a stored range that is a strict subset of the check is treated as a real gap worth correcting and flagged `disagree`; only a genuine shift (overlap that is neither a subset nor a contradiction) stays `minor`. The paired forward fix is in `curate-plants.ts`: the `sun_requirements` field spec now instructs the drafter to include every exposure the species reliably grows in, not just its single optimum, so future drafts don't reproduce the narrowing.

**One-time bulk correction (July 9, 2026), Ana-authorized:** rather than route all ~62 flagged rows through the per-plant editorial sweep, the first run's sun disagreements were applied in bulk after Ana reviewed the pattern — the 61 under-reported rows widened to the check's range, and the single contradiction (Ajuga, stored `[full_sun]` on a shade groundcover → `[partial_sun, shade]`) corrected. The update was still human-gated per §3 (Ana made the call), and kept reversible and safe: each row was updated by `id` with a guard on `is_curated = false` **and** an exact match on the prior value, sourced from the cross-check report (which records every stored-vs-checked pair). Two hardiness overstatements the same run flagged were corrected the same way (`Hedera helix` zone_max 11→9, `Salvia officinalis` 10→8). All corrected rows remain `is_curated = false`; the botanical corrections don't substitute for Ana's editorial pass. Future runs' disagreements still default to the sweep unless a pattern again warrants a bulk pass.

**Replayable record:** the corrections are captured as a data migration, `supabase/migrations/20260709092512_correct_crosscheck_botanical_fields.sql`, so the diff isn't the only trace of what was applied. It re-keys off `scientific_name` rather than the live UUIDs (portable across environments) and carries the same guards (`is_curated = false` plus an exact prior-value match), so it is idempotent — a no-op against the already-corrected live rows, and against any environment whose values don't match the recorded pre-correction state. It's a one-off record, not part of the seed path; a fresh seed drafts its own values and these specific corrections simply won't match.

**Output:** terminal report grouped disagreements-first, plus a timestamped JSON report in `apps/web/reports/` (gitignored) recording every flag with stored vs checked values — the artifact for Ana's spot-check sweep and the source of record for any bulk correction. `--limit N` for testing.

**Checked-at stamp — guard scoping (July 2026, migration `20260716120000`).** The guard stamps `plants.botanical_checked_at` on each row the moment it finishes checking it (flagged or clean — the stamp records that the check _ran_, not its verdict). This is operational metadata, not catalog content, so the flags-only rule holds — it never touches a botanical or editorial field. The stamp makes `--new-only` state-based (`WHERE botanical_checked_at IS NULL`): exact (no UTC-midnight batch split), and resumable — a killed run leaves the rest unstamped for the next pass, replacing the earlier newest-calendar-day heuristic. It's a timestamp, not a boolean, so a prompt revision can re-scope by date (`... OR botanical_checked_at < '<date>'`). **Cascade rule:** any script that _mutates_ a checked field must null the matching stamp so the guard re-checks — e.g. `scripts/archive/regenerate-native-to.ts` nulls `native_checked_at` in the same write that rewrites `native_to`. The sibling `native_to` guard (`cross-check-native-to.ts`) carries its own `native_checked_at` stamp on the identical model; `check-bloom-colors.ts` has none by design (a free local validator with no Claude call, it always runs over the whole catalog).

---

## 21. Sun-tolerance widening: the cross-check's under-report findings, applied as a repeatable step

> **Superseded by §22 (two-field sun model), same day.** The widening step was the interim backstop under the single-list model; once sun is drafted as `sun_thrives` + `sun_tolerates`, first drafts capture the tolerated range at the source and the corrective sweep drops out of the standard round. The section is kept for the record; `apply-sun-widening.ts` remains as a fallback for a legacy flat-list report.

**Why:** the sun under-reporting from §20 is not a one-time cleanup — it recurs on every new batch. The `curate-plants.ts` prompt instruction to include the full tolerated range does not reliably stop a single draft from naming only the optimum (a lone pass anchors on the textbook answer). Hand-authoring a correction migration each round (as §20 did once) does not scale toward a 500–700 species catalog. `scripts/apply-sun-widening.ts` turns that correction into a routine pipeline step.

**Decision (July 9, 2026):** the widener consumes the latest `cross-check-*.json` report and, for each under-reported-tolerance sun flag, widens the stored range to the check's range. Because it acts only on strict-subset flags, "widen to the check" is exactly the union of the two independent reads — it only ever adds an exposure the blind second pass judged tolerable, never removes one. It writes directly to the DB (like `curate-plants.ts`), not as a migration, and logs each run to `apps/web/reports/sun-widening-*.json` (gitignored).

**Safety rules — each earns its place:**

- **Single-value ranges only** (e.g. `[full_sun] → [full_sun, partial_sun]`). A lone value is the under-report signal. Rows already listing 2+ exposures are left untouched: widening those to all three asserts a plant "grows anywhere" — the least trustworthy claim — and can silently undo a deliberate editorial narrowing. Learned the hard way: the first version widened `Ajuga` (a shade groundcover editorially cut to `[partial_sun, shade]`) back to include full sun because a fresh over-broad read over-claimed; reverted, and the rule tightened to single-value.
- **`is_curated = false` only** — a finalized plant's sun is frozen; the machine never touches it. This is the freeze boundary: uncurated = maintained toward the corroborated range, curated = human-owned.
- **Strict-subset (`under-reported tolerance`) flags only** — contradictions (`no overlap`) and lateral shifts (`partial overlap`) are left for editorial review. A machine can't tell "narrow but right" from "wrong direction". Example left for Ana: `Berberis aquifolium` stored `[full_sun]` vs checked `[partial_sun, shade]` (a shade shrub — likely a plain error, but a judgment call, not a widen).
- **Guarded + idempotent** — skips any row whose live value no longer equals the report's recorded stored value (drift protection), and re-guards `is_curated = false` at write time. A re-run is a no-op.

**Pipeline order:** `seed → curate-plants → cross-check-plants → apply-sun-widening → curate-combinations`. The widener depends on a fresh cross-check report reflecting current DB state.

**Not the root fix.** This is a corroborated backstop that keeps first-draft narrowing from reaching users, not a cure. The root fix is §22.

---

## 22. Sun modelled as best + tolerated (the root fix)

**Why:** §20/§21 treated the symptom (a single flat `sun_requirements` list drafts too narrow, so we detect and widen). The cause is the field itself: one list can't say where a plant _thrives_ versus where it merely _tolerates_ an exposure, so the drafter defaults to the optimum and every batch under-reports. Modelling the two ideas separately removes the ambiguity at the source. Chosen July 9, 2026, pulled ahead of the 500–700 species expansion so new plants are captured correctly the first time rather than re-curated later.

**Model (migration `20260709220000`):**

- `sun_thrives text[]` — exposures where the plant performs at its best (usually one, sometimes two; non-empty once curated).
- `sun_tolerates text[]` — additional exposures it accepts but isn't at its best in; disjoint from `sun_thrives`; may be empty.
- `sun_requirements` (unchanged, app-facing) — a **derived mirror**, kept as `canonical(sun_thrives ∪ sun_tolerates)` by a `BEFORE INSERT OR UPDATE` trigger whenever either source field is non-empty. Every existing read site (`good-for-your-garden.ts`, plant detail, garden tile, `format-plant.ts`) keeps reading `sun_requirements` untouched — the app is unchanged; only the source of the data moved underneath it.

**Integrity** is enforced in the DB, not by convention: CHECK constraints require both sets to be valid exposures, disjoint, and forbid "tolerates without a thrives" (a plant with any sun data must have a best). A bonus effect: because the trigger recomputes `sun_requirements` from the two source fields on every write, the Trefle seed path can no longer perturb a split plant's sun even if the fill-only upsert (§9) ever let a value through — the derived value is a pure function of the AI/editorial source fields.

**Curation** (`curate-plants.ts`) now drafts the two fields directly — `sun_thrives` (best) and `sun_tolerates` (additional, disjoint) — instead of the flat list. The two-field ask is what fixes the under-reporting: naming "where it also merely tolerates" explicitly is exactly the question the old single list elided. `sun_requirements` is no longer drafted or sent as known data; the trigger owns it.

**Backfill** (`scripts/archive/backfill-sun-split.ts`, one-time) split the existing catalog **set-preservingly**: for each plant it only partitioned the exposures the plant _already had_ into thrives vs tolerates, clamped to the current set in code, so `sun_thrives ∪ sun_tolerates` always equals the prior `sun_requirements`. Single-exposure plants took the value as the best with no API call; multi-exposure plants asked only which subset is primary. The app-visible `sun_requirements` was provably unchanged for all 152, so every prior editorial correction and widening survived intact.

**Editorial boundary unchanged:** all rows stay `is_curated = false`; the split is a data-model change, not an editorial sign-off. When Ana finalizes a plant she edits the two source fields, and the trigger keeps the mirror in sync.

**Standard round is now:** `seed → curate-plants → cross-check-plants → curate-combinations`. The cross-check still fact-checks (it reads the derived `sun_requirements`), but the corrective widening sweep (§21) is retired — first drafts no longer systematically narrow. **Superseded by §25** — the cadence has since grown (native_region regeneration, the bloom-color guard, `--new-only` scoping); §25 is the current end-to-end runbook.

**Still deferred to post-test:** surfacing the distinction in the UI ("thrives in full sun, tolerates part shade") and using it in matching (prefer thrive-matches, still surface tolerate-matches). The data is captured now; the presentation waits for the test to inform it.

---

## 23. `plant_type` is a functional label, not strict botany

**Decided July 10, 2026** (Ana delegated the ruling during the round-4 sweep). The round-4 cross-check flagged 10 `plant_type` disagreements where a blind second AI applied stricter botany than the product needs. `plant_type` is a **gardener-facing "what kind of plant is this"** label — how you buy, place, and care for it — not a botanical growth-form classification. The catalog's existing labels were already internally consistent, so 8 of the 10 flags were rejected as false positives. The convention, for future rounds:

- **Geophytes → `bulb`.** Anything sold and planted as a dormant storage organ — true bulbs, corms, tubers. Precedent already in the catalog: Crocus/Colchicum (corms), Iris reticulata, Cyclamen (tubers), Hesperantha (corm) are all `bulb`. Do **not** reclassify corms/tubers to `perennial`.
- **`succulent` only for fleshy mat/rosette succulents** (Sedum acre, Sempervivum). Border perennials with semi-succulent foliage that die back — Hylotelephium (border sedum), Euphorbia myrsinites — stay `perennial`. The deciding test is the storage/dieback habit, not xeric looks: `Yucca filamentosa` is xeric and rosette-forming but builds **persistent woody stems and never dies back**, so it is a `shrub`, not a perennial or succulent (corrected July 10, 2026 — the round-4 sweep had wrongly filed it as perennial).
- **Mediterranean subshrubs → `shrub`.** Woody-based evergreen subshrubs (lavender, rosemary, santolina, thyme, helichrysum, sage, wall germander, `Euphorbia characias`) are filed `shrub`; the descriptive `plant_type_label` may carry the nuance ("Evergreen subshrub"). Round-4 aligned the two outliers still at `perennial` — **Salvia officinalis** and **Teucrium chamaedrys** — to `shrub` / "Evergreen subshrub" so the group is uniform.
- **`shrub` vs `tree` by garden use, not ultimate size.** A large shrub / small tree grown as a garden shrub (e.g. `Pittosporum tenuifolium`) stays `shrub`; `tree` is reserved for plants grown as standalone specimens (Taxus, Ilex).
- **Life-cycle by how it's grown in a temperate ornamental garden.** Tender perennials grown as annuals keep `annual` (`Eschscholzia californica`); short-lived perennials keep `perennial` (`Rudbeckia hirta`).

Corrections that follow this convention are applied by the same guarded, reversible method as §20 (update by `scientific_name`/`id`, guarded on `is_curated = false` and an exact match on the prior value). They do **not** flip `is_curated` — a functional-classification fix is not Ana's editorial pass.

---

## 24. Auth + single-garden identity: the cutover from single-tenant shim to real accounts

**Decided July 10, 2026.** Auth is being pulled forward from post-test into the build. The reasoning: accounts are what make the product "real," and they define the account-settings surface that has to exist before any public launch. This section records the finalized shape. It supersedes the shims documented in §11 (`current-garden.ts`) and §12 (service-role palette writes) — those get _deleted_, not extended, by this work.

**Auth and onboarding are decoupled.** The original plan (§11, and the Notion spec) bundled auth with the 5-step onboarding wizard and deferred both together. They separate cleanly: auth is infrastructure; the wizard (sun/style/size, which feed palette _recommendations_) is product and stays deferred. What auth needs from onboarding is exactly one field — **location** — because location is the only profile input anything consumes today (it drives the Open-Meteo climate/hardiness/frost derivation in §17, which feeds the weather-derived dashboard copy shipped in PR #18). So we collect location and nothing else.

**Auth methods: magic link (default) + Google OAuth.** Passwordless email is the default — Supabase ships it out of the box, and it removes password friction at exactly the sign-up moment. Google OAuth sits alongside it (not instead), because European beginners skew toward "sign in with Google." Both are near-zero implementation cost on Supabase. Consequence: **there is no password anywhere**, so account settings has no password management to build.

**Garden provisioning: auto-created, never "set up."** v1 is one garden per user, so there is nothing to choose or configure. A Postgres trigger on `auth.users` insert creates the `users` row _and_ an empty `gardens` row. The user never "creates a garden" — it exists the moment they exist.

**The garden profile exists as data but has no UI.** All `gardens` profile columns (location, space type, sun, style, size) are present from day one, but only `location` is populated this phase (by the first-run step below). The rest stay null until the deferred onboarding wizard fills them. There is **no profile screen** — the profile is plumbing, not a surface.

**First-run: a single required location step. Null location _is_ the gate — no separate "onboarded" flag.** After auth, a user whose garden has a null `location` is routed to a one-field location capture; once set, they reach the app. The gate logic is a single condition (`garden.location IS NULL → location step`), so there is no `onboarding_complete` boolean to keep in sync. Location is **required** (not skippable) on purpose: guaranteeing it exists before the dashboard lets us delete all profile-less-fallback code — the app may always assume a location. This is the one "forced" input, a deliberate exception to the never-required ethos, justified because the entire climate layer depends on it.

**The whole app is gated; only the santolina.app landing stays public.** This reverses the earlier documented philosophy ("no account gate, value shown immediately, prompt only at first save") — a conscious change, not drift. Landing page sells the product; everything under it (dashboard, explore, my garden, diary) requires a session. Middleware redirects unauthenticated requests to the landing/login. Consequence: the "prompt at first save" logic never needs building.

**RLS cutover is the real work and the real risk.** Every user-scoped server action (`palette-actions.ts`, `diary-actions.ts`, `garden-actions.ts`) switches from the service-role client (which bypasses RLS) to a session client via `@supabase/ssr`, so the existing `auth.uid()` policies actually run. Service-role is retained _only_ for the plants catalog writes (Trefle sync, curation scripts — §5). The RLS policies in `20260706093045_initial_schema.sql` have never been exercised against a real session, so expect policy bugs on first login — this is the part to test hardest.

**Account settings: the basics only.** Email, sign out, delete account, **reset garden** (destructive-confirm dialog — doubles as the easy way to clear test data), and **edit location** (the one live profile field needs a home; settings is it). Nothing else.

**The seed garden is discarded.** `7055368c…` holds 5 palette rows and 1 diary entry — throwaway test data, not real plants. It is not migrated or claimed; it's dropped. The shared `plants`/`plant_combinations` catalog is garden-independent (public read) and wholly unaffected — every new user sees all catalog species immediately.

**Sidebar identity** is wired to the authenticated user / `users` table, replacing the hardcoded "PA / Paradoxich" in `AppSidebar.tsx`.

**Ordered work items:** (1) `@supabase/ssr` + three client flavors + `middleware.ts` session refresh; (2) `handle_new_user` trigger creating `users` + empty `gardens`; (3) magic-link + Google auth UI and callback route; (4) required first-run location step, gated on null `location`; (5) flip the three server actions to the session client, delete `current-garden.ts` and its hardcoded id; (6) full-app middleware gate, landing stays public; (7) sidebar identity from `users`; (8) account settings surface. Operational, not code: custom SMTP (Resend/Postmark) for magic-link deliverability before public launch — Supabase's built-in sender is rate-limited; and a Google Cloud OAuth app + redirect URLs configured in Google and Supabase.

---

## 25. The plant-expansion round: current end-to-end cadence (runbook)

**Operational history and known traps live in `docs/database-log.md`** — read it before running any of this, and append an entry after. This section is the design rationale; that file is the record of what has actually been done and what has already gone wrong.

**This is the authoritative pipeline for adding plants to the catalog.** It supersedes the shorter "standard round" line in §22, which has since grown. Every step is an offline script under `apps/web/scripts/`, run via `tsx --env-file=.env.local`, none in the request path (§6). The catalog reached **595 species / 1485 combinations** at round 8 (July 27 2026): 29 → 125 → 148 → 201 → 318 → 418 → 494 → 595 across rounds. Round 7 was the first **herbs + decorative-edibles** batch (breaking the earlier ornamental-only pattern); pure salad/veg stays deferred to a later round. Round 8 is the **shade & structure** batch — see the round-8 note at the end of this section.

Run the steps **in this order** after choosing a batch of species:

1. **Seed.** Add rows from Trefle. Use `seed-plants.ts` (a flat list) or a purpose-built round script (`seed-regional-natives.ts`, `seed-round6.ts`, `seed-round7.ts`) when the batch needs its own resolver or selection rationale. **Seed by verified Trefle ID or exact scientific-name match — never the top name-search hit.** Trefle name search silently resolves to sibling species; the round scripts resolve by exact genus+species (synonym-aware) and log any drift. Cultivars/hybrids rarely resolve — seed the species parent by numeric Trefle ID (see §4, and the round notes). Seeding is skip-by-default on already-cataloged species (§9).
2. **Curate.** `curate-plants.ts --round <label> --new-only` fills every AI field on rows where `ai_drafted_at IS NULL`, within the round. **A scope flag is mandatory with no default** (July 28 2026 — see the scope-flag note below). `--new-only` is now a filter _inside_ the scope rather than a substitute for one. A transient invalid-JSON failure just leaves that row `ai_drafted_at = NULL`; re-run to pick it up.
3. **Combinations.** `curate-combinations.ts --round <label>` adds companion pairings (§19). Idempotent, auto-skips plants already at the 5-companion cap. **Scope required.** The scope selects which plants get pairings drafted _for_ them; the candidate roster deliberately stays the whole catalog, because a round's plants should be pairable with everything already grown and the cap arithmetic counts both directions across the whole table. Because saturated (5-companion) plants drop out as candidates, a mature catalog leaves a fresh batch to pair mostly with each other and whatever older plants still have open slots — cap-saturation, not per-batch siloing (mechanism in §19).
4. **Regenerate native_region.** `regenerate-native-region.ts --round <label>` (generate, review, then `--apply`) — see §26. **Must run after every seed** or new plants stay untagged for the "native to my region" filter. **A scope is now required and there is no default:** `--round` for a seed, `--all` only when the region model itself changes. Full-catalog regeneration was a one-time migration that outlived itself — it kept re-deriving ~600 plants when only the new ones needed it, which both made the Trefle rate limit reachable (§26) and silently rewrote settled rows (round 8's full run changed 20 pre-existing plants alongside its own 101).
5. **Guards (flag only; fail loudly).** `cross-check-plants.ts --round <label>` blind-fact-checks the batch's botanical fields (§20). `cross-check-native-to.ts --round <label>` is a continent-level gross-error guard on the `native_to` phrases (GBIF + Claude, report-only by default; `--apply` patches only rows rated "gross"). **Its accuracy bar is deliberately ~90%, not 100%** — the guard exists to catch continent-level nonsense, and in-app user flagging is the intended real review; chasing the tail here is not a good use of a Claude pass. **Scope both by `--round`, not `--new-only`** — see the scoping note below; without a scope the guards re-check (and re-bill Claude for) the whole catalog. `check-bloom-colors.ts` fails if the batch invented a `bloom_color` or `foliage_color` shade not mapped in `lib/bloom-colors.ts` / `lib/foliage-colors.ts` — an unmapped value silently drops out of the Explore colour filter, so map each new shade into an existing bucket (or the matching ignore set) before shipping.

**Guard scoping: use `--round`, not `--new-only` (fixed July 27 2026, round 8).** Both guards also accept `--new-only`, which is state-based (`botanical_checked_at IS NULL` / `native_checked_at IS NULL`). That only narrows to a fresh batch **once every other row already carries a stamp**, and that baseline was never established: the stamp columns shipped mid-history and the rows seeded before them were never backfilled. At round 8, `botanical_checked_at` was set on 0 of 494 rows and `native_checked_at` on 0, so `cross-check-plants --new-only` selected **all 595 plants instead of the 101 new ones**. Nothing failed — the run simply re-checked and re-billed the whole catalog, which is the exact waste this step warns about, and it was invisible because the run looks identical apart from a count. Both guards now take `--round <label>`, scoping to the ids the seed run recorded in `rounds/<label>/manifest.json`; manifest scoping needs no baseline, which is what manifests were introduced for. **The baseline was backfilled July 28 2026, from evidence** (`scripts/backfill-guard-stamps.ts`). This paragraph previously said backfilling was "considered and rejected — there is no per-row evidence any of them was actually checked", citing a self-test that found older plants at `0/4`. **That test was circular:** `round-status.ts` detects a check by its stamp, so unstamped rows can only report `0/N`. The actual explanation is that the stamp columns arrived in migration `20260716120000` on July 16, so every earlier cross-check physically could not stamp. The archived reports are dated evidence and match the catalog exactly (a 201-row full-catalog run on July 9, then round 6's 100 and round 7's 76), so **451 rows were stamped — 375 botanical + 76 `native_to` — each dated to the report's own `ran_at` rather than to the day of the backfill.** **Deliberately still NULL:** the 116 plants seeded July 12 (no surviving botanical report) and every pre-round-7 row for `native_checked_at` (that guard wrote to a fixed filename and overwrote its own history — the very problem `archive-round.ts` now prevents). Null on those is correct: it leaves them for a future guard run instead of hiding them.

**Scope flags are mandatory, with no default (July 28 2026).** `curate-plants`, `curate-combinations` and `draft-hardiness` each take `--round <label> | --ids <a,b> | --all` and refuse to run without one; the shared parser and its refusal live in `apps/web/scripts/scope.ts`, alongside `seed-plants` (`--round` only), `regenerate-native-region` and both native cross-checks. The rule is that **a state predicate is not a scope**. `ai_drafted_at IS NULL` and `hardiness_rating IS NULL` describe the whole catalog and happen to overlap the fresh batch; when an earlier round leaves a gap they silently widen, which is exactly how round 8 drafted hardiness for 177 plants. A round's plants are the ids its seed run recorded, and nothing else. `--all` still exists and still works — it just has to be typed. Two related rules: an ambiguous pair (`--all --round 9`) is an error rather than a silent preference, and a `--round` whose manifest seeded nothing throws rather than running against an empty set, because a run that reports success having touched nothing is how several entries in `docs/database-log.md` begin.

5b. **Validate native_region against WCVP.** `cross-check-native-region.ts --round <label>` checks the Level 2 tags step 4 just wrote against Kew's World Checklist, read through GBIF (report-only; `--apply` to write). This is the guard §26 never had, and it matters more than it sounds — see the native-vs-introduced section at the end of §26. **It stamps `native_region_checked_at`** on every row that reached a decided verdict (migration `20260728193815`), so even a report-only run writes that one column. Rows GBIF returns no WCVP data for are deliberately left NULL — a failed lookup must not read as a completed check — and the handful of taxa upstream carries nothing for are named in `NO_WCVP_DISTRIBUTION` in `round-status.ts`, rather than the step being softened to a WARN to make them disappear.

6. **Hardiness.** `draft-hardiness.ts --round <label>` drafts an RHS rating for any unrated rows in the round — see §27. **Scope required**, and this is the step that proves why: its state predicate (`hardiness_rating IS NULL`) is catalog-wide, so round 8's unscoped run drafted 177 plants — its own 101 plus round 7's skipped 76 — while every line on screen said round 8.
7. **Seasonal care.** `curate-seasonal-care.ts --ids <manifest ids>` distils the batch's `seasonal_care` lines — see §28. **This step was missing from the runbook until round 8**, and its absence is not cosmetic: Care Tips v2 is live and reads `seasonal_care[currentStage]`, so a plant seeded without it shows **no care tip at all**. Prefer `--ids` from the round manifest over this script's own `--new-only`, which is still the fragile `created_at`-day heuristic. **Only the draft step is per-round.** `cross-check-seasonal-care.ts` and `apply-seasonal-care-fixes.ts` are optional editorial follow-ups (§28), not part of the round — a reader of §28 alone would reasonably assume all three run every time.

**Two steps that had silently not run.** Round 8 found round 7's batch unrated by `draft-hardiness` — that step targets `hardiness_rating IS NULL`, so round 8's run picked up **177 plants: its own 101 plus round 7's 76**, unrated since July 15 — and found `seasonal_care` null on every newly seeded row, because no step existed to fill it. Both were invisible for the same reason: **`verify-round` WARNs rather than FAILs on them**, deliberately, because both fields were parked or still in flight when that check was written. That is the right call for a parked field and the wrong one for a shipped one. When §27's hardiness work resumes, or if `seasonal_care` coverage becomes required, promote those warnings to failures — otherwise the next skipped step is equally invisible.

8. **Verify + log.** `verify-round.ts --round <label>` asserts both catalog validity AND that every step above actually ran for this round's plants (`scripts/round-status.ts`); it exits 1 on a gap. Then `check-round-scope.ts --round <label>` (below), `archive-round.ts --round <label>` and `log-db-session.ts --round <label>`. **Without `--round`, `verify-round` checks only that the data is valid, not that the pipeline ran** — which is how the two skipped steps above went unnoticed.

**Scope: did the round stay inside its batch?** `check-round-scope.ts --round <label>` is the mirror image of `round-status.ts`. That one asks whether every step ran for the round's plants; this asks whether any step ran on plants that were **not** the round's. It diffs the round's pre-seed backup (step 0) against the live catalog and FAILs on any data column changed on a row the manifest doesn't claim, any plant deleted or inserted without being in the manifest, and any companion pair added or removed between two plants that both predate the round. Bookkeeping stamps (`*_checked_at`, `updated_at`) WARN instead — a guard re-run legitimately re-stamps existing rows. It reads DB state rather than any script's own report, so **it covers every step of a round at once, including steps that write no report and steps not yet written**; a new script that quietly reaches past its batch is caught without the check knowing that script exists.

Run over round 8 retrospectively it returns 101 out-of-scope writes: the 20 `native_region` rewrites already recorded in step 4, plus **76 `hardiness_rating` fills on round 7's batch** — the same event §25 notes as "177 plants: its own 101 plus round 7's 76", but reframed as what it also was, a round writing to another round's rows. Also 3 `common_name` renames and 2 companion pairs between pre-existing plants, both awaiting an editorial ruling. **Not every out-of-scope write is a mistake** — fixing an older row's name mid-round is a real thing to do — so `rounds/<label>/scope-allow.json` waives named cases (`plant` / `column` / `check`, `*` wildcards, a required `why`). The waiver is the point: a legitimate exception gets written down instead of the check getting switched off.

**Its window is baseline → now, not baseline → end of round**, so a hand edit made after the round still shows up. Run it as the round's last step, while that distinction costs nothing. Rounds 1–7 have no manifest and cannot be scope-checked.

**Editorial vs. mechanical stays intact throughout.** None of these steps flips `is_curated` (§3): curation drafts, the guards only flag, and botanical/functional fixes (§20, §23) are guarded reversible corrections, not Ana's editorial pass. Cross-check disagreements on `plant_type` are usually the §23 functional-label convention (false positives), not errors.

**Working-tree discipline.** These scripts touch the live Supabase project directly (there is one project, no separate env), so a seed/curate run mutates production data — intended, but know it. When another session shares the git working tree, commit round code from a throwaway `git worktree` off `main` (or the round branch) and stage only your files by explicit path; never `git add -A` on a shared tree.

**Safety net + verification (added July 2026).** Two book-end steps wrap the run. **Before** seeding, `backup-catalog.ts` dumps `plants` + `plant_combinations` to a dated JSON under `backups/` (gitignored); `restore-catalog.ts <dir>` puts them back (dry-run by default, `--apply` to write, never deletes rows created after the backup). **That backup is local-only, so `archive-round.ts` also commits the catalog gzipped into `rounds/<label>/catalog/`** — `before-*` (the round's rollback point, copied from the backup) and `after-*` (read live). This is the project's only off-machine copy: Free-plan Supabase projects **cannot download or restore the platform's own daily backups**, and the catalog is not regenerable — curation is a stochastic model pass and the editorial corrections on top are one-of-a-kind. The July 27 session came within one `git worktree remove` of destroying the sole copy of the pre-round-8 catalog. Cost is ~2.3MB a round gzipped (5.9MB raw); `restore-catalog.ts` reads the archive directly and **requires `--phase before|after` with no default**, since the wrong choice silently reverts or re-applies a whole round. This does not reverse the decision to stop archiving reference data and fetch caches — that rule was working area vs. finding, and a cache is re-downloadable where the catalog is the one thing that is not. **After** the round, `verify-round.ts` is the invariant check — the canonical definition of "the round is done": it FAILs on undrafted rows, empty `native_region` (non-hybrids), unmapped `bloom_color`, duplicate `scientific_name`, empty required curation fields, sun thrives/tolerates overlap, and combination integrity (zero companions, self/duplicate pairs, over the 5-cap); it WARNs on the known parked gaps (`seasonal_care`, hardiness, placeholder images). Read-only, no AI calls. A bare Supabase `.select()` silently caps at 1000 rows, so every full-table read in these scripts goes through `lib/paginate.ts` `fetchAllRows()` — never add a bare `.select()` for a whole table (the truncation is what let `curate-combinations` create duplicate pairs and blow the cap before the fix).

**Round provenance.** Tag the seed run with `--round <label>` (`seed-plants.ts`; round scripts call `writeRoundManifest` from `scripts/round-manifest.ts`) so it records exactly what it inserted — ids + names + timestamps — in `rounds/<label>/manifest.json`. This is the explicit batch record, so nothing downstream has to infer "this round's plants" from a `created_at` heuristic. After the guards, `archive-round.ts --round <label>` snapshots the gitignored `reports/` working area into `rounds/<label>/reports/`, so a round's findings survive as history. Unlike `reports/` and `backups/`, `rounds/` is committed — see `apps/web/rounds/README.md`. **Round 8 is the first round with a manifest**, and the first whose guards were scoped by it.

**Round 8 — shade & structure (July 27 2026, 494 → 595).** The first round chosen from measured catalog gaps rather than a theme. Two holes: only **75 of 494 plants thrived in shade** (15%), and `style_tags` ran cottage 455 / classic 307 / wildflower 287 against **modern 59 and lush 64** — the catalog could dress a cottage border but not a courtyard. 101 species across woodland perennials, ferns, shade shrubs, shade bulbs and sedges, climbers, and an architectural succulent/subtropical block (agaves, yuccas, palms, bananas, tree ferns) as raw material for the modern and lush palettes. Result: shade-thriving 75 → 109, lush 64 → 105, modern 59 → 76, and the thin plant_types filled out (succulent 6 → 11, tree 24 → 37, bulb 33 → 48, climber 24 → 31, grass 28 → 31). `cottage` also grew to 533, so it remains closer to a default than a signal — a curation-prompt question, still open.

Two things this round established that outlive it:

- **The synonym table is load-bearing for shade batches.** Woodland genera have been widely segregated (Anemone → Anemonoides, Blechnum → Struthiopteris, Scilla → Othocallis, Ipheion → Tristagma, Sedum → Petrosedum, Meconopsis → Papaver). The exact-match guard caught two candidates that would otherwise have bound to `Anemone quinquefolia`, already in the catalog. A shade round needs its synonym groups written before the dry run, not after.
- **A seed batch needs a common-name pass, every time.** Trefle is a botanical source, so its names are drawn from floras: 18 of 101 rows had no English name at all and fell back to the scientific name, and several carried a name belonging to a different species. One was a true collision — `Cercis canadensis` arrived as "Judastree", which is `C. siliquastrum`, already in the catalog, so two species would have shared one name with no way for search to separate them (`Primula sieboldii` vs `P. japonica` and a bare "Poppy" against `Papaver rhoeas` were the same class). `scripts/fix-round8-names.ts` corrected 49 rows, guarded the same way as `apply-sun-widening` (each entry carries the value it expects to find, so a drifted row is skipped not overwritten) and **without flipping `is_curated`** — absent and ambiguous names are mechanical, the voice pass is still Ana's (§3).

## 26. `native_region`: WGSRPD Level-2, regenerated from Trefle (and the `tdwg_code` trap)

**Model (Option A, Ana signed off — Notion "Region Data Model — Decision").** `native_region text[]` is a controlled set of TDWG WGSRPD **Level-2** region names (52 regions, e.g. "Southeastern Europe", "Eastern Asia"), one consistent zoom level for the whole catalog. It powers the Explore "native to my region" lens (`lib/native-to-me.ts`, shipped PR #44). It replaced an earlier ad-hoc `mediterranean/balkans/croatia` tag set that was a prompt artifact — structurally unfit for a filter because a wrong/missing tag hides plants invisibly.

**How it's generated** — `regenerate-native-region.ts`, generate-then-`--apply` (default run writes `reports/native-region-regen.md` + JSON and never touches the DB; review, then `--apply`):

- **Primary:** Trefle `distributions.native[]` Level-3 codes, each rolled up to Level-2 via the authoritative `tdwg/wgsrpd` table. "YUG" (Croatia isn't exposed below Level-3) → "Southeastern Europe".
- **Fallback:** when Trefle returns an empty native list (a coverage hole on an otherwise-valid record), derive Level-2 tags from the clean `native_to` prose with the curation model.
- **Manual overrides:** a small in-script table for reviewed outliers; garden hybrids with no wild range stay correctly empty.

**Re-run after every seed** (step 4 above). The existing catalog is served from `reports/trefle-native-cache.json`, so only new species trigger fresh Trefle fetches — **but note that `reports/` is gitignored, so a fresh clone or `git worktree` has a COLD cache and refetches all ~600.** That is the condition both traps below need.

**The rate-limit trap (fixed July 27 2026, round 8) — the same silent shape as the `tdwg_code` trap, one layer down.** The fetch loop paced at 120ms, roughly 500 req/min against Trefle's documented 120 req/min (§1), so a cold cache began returning **HTTP 429 after about the first 120 species**. The `catch` stored the 429 as a cache entry, and downstream **an errored entry is indistinguishable from an empty native list**, so each one silently routed to the `native_to` prose fallback. The run reported success with a plausible-looking source mix — `trefle-l3=121, native_to-fallback=469` — that was really **466 rate-limit errors laundered into model-derived guesses**. Applying it would have overwritten most of the catalog's authoritative regions, including the 494 rows that had nothing to do with the round, with prose derivations. After the fix the same run reads `trefle-l3=571, native_to-fallback=19`, which is what Trefle's real coverage looks like.

Both halves matter: pacing (600ms + capped exponential backoff on 429) so the fetch succeeds, **and `loadTrefleNative` now throws if any fetch is still errored** rather than handing a degraded cache to the planner. The generalisable rule: **when a fallback exists, a failed fetch must never be allowed to look like a negative result** — the fallback converts an outage into confident-looking data, and the report gives no signal. Errored species stay cached as errors, so a re-run retries only those.

**The `tdwg_code` trap (fixed July 14 2026, round 6).** Trefle's native-zone objects carry the region code under **`tdwg_code`** and the level under **`tdwg_level`** — _not_ `code`/`level`. The script had been reading `z.code` (undefined), so every freshly-fetched plant produced `unmapped-L3:undefined` and ended up untagged. It stayed **dormant** because the existing catalog was cache hits; it only surfaced when 100 new plants forced fresh fetches (76 empty instead of 2). Fix: read `z.tdwg_code`/`z.tdwg_level`. Note that fixing the parse is not enough on its own — the stale name-only cache entries must be **purged so they refetch**; `loadTrefleNative` only fetches missing/errored keys. After the fix, empty dropped to 2 (the two genuine garden hybrids) and all new plants tagged.

**Trefle does not separate native range from introduced range (found July 28 2026).** The two traps above are about the pipeline failing to fetch. This one is about the fetch succeeding and the answer being wrong, which no amount of pipeline hardening was ever going to catch. `distributions.native[]` turns out to include naturalised occurrences, so the field it produces is closer to "where this plant now grows" than "where it comes from" — and the native filter is the one feature that depends on the difference.

`cross-check-native-region.ts` is the guard. It compares the stored tags against **WCVP** (Kew's World Checklist), read through GBIF's `species/{key}/distributions`. WCVP is the right authority for a mechanical comparison rather than a judgement call: it is the dataset POWO publishes, it stores **one row per WGSRPD Level 3 region** — the same geography our field rolls up from — and it marks introduced occurrences explicitly. So this check needs **no AI at all**, unlike §20 and §28; two sources speaking the same vocabulary need reconciling, not judging.

Run over the 20 rows the round-8 regeneration had rewritten: **13 already matched WCVP exactly, 7 did not.** The worst was `Imperata cylindrica`, tagged China / Eastern Asia / Indo-China — which is precisely the range it was _introduced_ into. Its native range is Africa, the Mediterranean and West Asia: **16 regions wrong, and inverted**, so a user filtering "native to my region" got the opposite of the truth. `Helianthus annuus` claimed most of North America against a real native range of Mexico plus the southwestern U.S.A. And `Citrus limon` turned out to have **no native range at all** — a cultigen (C. medica × C. aurantium) whose 94 WCVP rows are _every one_ introduced; Trefle's list was its cultivation footprint. It is now a `noWildRange` override here and a `KNOWN_HYBRID_EXEMPTIONS` entry in `verify-round.ts`, since an empty value is the correct answer for it, not a gap.

**How widespread is it? Measured, not assumed: about 2%.** A 60-plant sample across the rest of the catalog came back **56 exact matches, 1 real disagreement** (`Citrus reticulata`, two regions too many), 2 legitimately unlookupable, and 1 protected by a reviewed override. So the round-8 rows were not a window onto general rot — they scored far worse (7 of 20) because they are precisely the rows whose Trefle data had _changed_, which is what dragged them into the regeneration diff in the first place. The catalog is mostly fine; the tail is real but small. Run the check over the rest, review, and apply in batches — do not turn `--apply` loose on `--all`.

Four design rules the script holds, each guarding a way this could quietly go wrong:

- **"No WCVP rows" is not "no native range."** The first means the lookup taught us nothing and the row is skipped; the second is a real finding about a cultigen. Collapsing them would let an API outage empty the catalog's native tags — the same shape as the rate-limit trap above, and the same rule: a failed fetch must never look like a negative result. Clearing a row therefore needs `--allow-empty`, not just `--apply`.
- **An unmappable region name is an error, not an omission.** WCVP has modernised country names since the WGSRPD geojson was cut (Türkiye, Eswatini, DR Congo, "Central American Pacific Is."), so unrecognised names are aliased explicitly and anything unknown throws. Dropping them silently would shrink a species' range while looking confident. This fired for real on the first catalog-wide run.
- **A single Level 3 row can invent a whole Level 2 region.** `Galium verum` picked up "Australia" from one unmarked Tasmania row, while GBIF's GRIIS-Australia dataset lists the species as introduced there outright. Rather than have the script arbitrate between datasets, that contradiction is a `MANUAL_EXCLUSIONS` entry carrying its evidence, and every native region resting on a single Level 3 row is reported as `thin_evidence` for a reviewer's eye.

- **A name lookup that fails upward is worse than one that fails.** GBIF answers an unknown binomial by climbing the taxonomy: `Pennisetum alopecuroides` came back as the **genus `Cenchrus`** with `matchType: HIGHERRANK`, and the script cheerfully fetched the distribution of an entire genus — proposing to widen one grass from "Eastern Asia" to **41 regions including Brazil and New Zealand**. This is the §25 name-resolution trap in a new costume ("never the top name-search hit"), and it surfaced only because the first catalog-wide sample was run report-only. Only an `EXACT` match at species rank, on the name actually requested, is accepted now; `×` is normalised away first, or every hybrid in the catalog reads as unmatched.

**Review before applying, always.** Two of the failure modes above — the missing establishment marker and the higher-rank match — produce _confident, plausible, badly wrong_ answers rather than errors, and both were found by reading a report, not by anything failing. That is the standing reason this script defaults to report-only, and why `--apply` should follow a human read of the diff rather than replace it.

## 27. Hardiness: RHS rating is canonical, drafted then human-verified

**The problem.** Hardiness gates the real user question ("will it survive my winter"), but a July 2026 audit found **no free per-species hardiness source exists**: Trefle's `growth.minimum_temperature` is null for 100% of the catalog (so the old Trefle→USDA-zone mapping was dead code and was removed — see §4); RHS publishes ratings but offers no API or dataset and its content is copyrighted (bulk scraping barred); USDA's APIs map a _location_ to a zone, not a _species_; Wikidata's hardiness properties are effectively empty (23 taxa worldwide). Before this model, every plant's `hardiness_zone_min`/`max` was a single unanchored Claude estimate.

**Decision (Ana, July 14 2026).** The **RHS hardiness rating (H1a–H7) is the canonical field**, a good fit for the Euro/Med-skewed catalog. USDA zone, where shown, is **derived from the rating at render time** (`lib/hardiness.ts`) — never stored alongside. Two columns (migration `20260714164514`): `hardiness_rating text` (CHECK `H1a…H7`) and `hardiness_verified boolean default false`.

**Draft-then-verify flow:**

- **Draft baseline** — `scripts/draft-hardiness.ts` drafts a rating for every plant **blind** (species identity only, same discipline as the cross-check), writes `hardiness_rating`, leaves `hardiness_verified = false`. Ran across all 418 at round 6 (0 failures; distribution skews hardy — H5 174, H7 124 — as expected). Default targets `hardiness_rating IS NULL`; `--redraft-unverified` re-drafts unverified rows after a prompt change; **verified rows are never selected.**
- **Human verification** — a person confirms each rating against RHS public plant pages (reading pages by hand is fine; only bulk scraping is barred) and flips `hardiness_verified = true`, in **priority order: the six garden-style starter palettes first** (highest user exposure); the long tail can stay drafted-but-unverified.

**`hardiness_verified` gates assertion, it doesn't excuse it.** The UI must only present a hardiness claim confidently when `hardiness_verified = true`; unverified rows say nothing or carry a quiet "approximate" marker. This is the opposite of a confidence flag that would license showing unanchored numbers everywhere.

**Re-seed safe by construction.** `hardiness_rating` is **editorial-owned**, the same category as `style_tags` and Ana's editorial corrections. It is not referenced by `upsert_trefle_plant` (§9), so a Trefle re-seed physically cannot touch it; `curate-plants` doesn't write it; the draft skips rated/verified rows. Verification work survives re-seeds — the failure mode Ana flagged (like the pre-COALESCE editorial wipe, §9) is closed.

**Follow-ups (not built yet):** (1) the UI gating above; (2) then **drop the legacy `hardiness_zone_min`/`max` columns** — "don't store both" — but only _after_ the render path derives from the rating, or hardiness display breaks; (3) once verification is done, record in the build log **what fraction of AI drafts survived RHS verification unchanged vs. got corrected** — that ratio is the real measure of the draft's quality.

**Status: PARKED** (code merged via PR #58, July 15 2026). The rating feeds only the dormant survive-winter bullet, so verification stopped partway and the track waits on that feature plus location wiring being scheduled. Two consequences worth knowing before resuming:

- **The denominator moved.** Verification ran against a much smaller catalog than exists now, so the unverified share has grown with every seed round since — current counts are in [`catalog-state.md`](catalog-state.md), and the gap is larger than the raw verified figure suggests.
- **`round-status.ts` reports `draft-hardiness` at WARN, not FAIL,** precisely because the field is parked. That is correct for a parked field and wrong for a shipped one — it is the same configuration that let round 7's batch go unrated for twelve days. **Promote it to FAIL in the same change that un-parks this work**, not afterwards.

## 28. Care Tips v2 Tier 1: `seasonal_care`, a distilled prescriptive field (replaces `maintenance_notes` in the tips system)

**Supersedes §16's Tier 1.** §16 fed the card `maintenance_notes` verbatim. The shipped drawer exposed the flaw (Care Tips v2 spec, Notion, locked July 15 2026): `maintenance_notes` is the plant's _care manual_ — several actions, permanent truths, no timeframe — so at ~20 plants the drawer becomes the encyclopedia re-sorted, with near-duplicate paragraphs. Ruling: a tip is **one action, one plant (or garden), one timeframe — it must answer "why now?"**. `maintenance_notes` fails that and **leaves the tips system**, staying only on the plant detail drawer where it already lives.

**The field.** New `plants.seasonal_care jsonb` (migration `20260715120000`): same six keys as `seasonal_rhythm`, each an **imperative one-liner or `null`**. `null` = "nothing to do this stage" and is the expected value for most plants most stages. Where `seasonal_rhythm` _describes_ (what the plant is doing), `seasonal_care` _prescribes_ (what you do). Only the **current stage's** line surfaces, and only for **planted** plants — so volume self-limits to plants with a current-stage action. Editorial-owned, not in the `upsert_trefle_plant` path (§9), so re-seeds can't touch it.

**Distillation pass** — `scripts/curate-seasonal-care.ts`. Fill-only gate `seasonal_care IS NULL AND seasonal_rhythm IS NOT NULL` (the source must exist). Distills `maintenance_notes` + `seasonal_rhythm` + `bloom_months` into the six lines; no new botanical facts. Net-new **line validation** (a first for the curation scripts — the others enforce length by prompt only): ≤12 words / ~90 chars, imperative-verb allow-set (rejects descriptive `seasonal_rhythm`-style sentences that wander into the wrong field), exactly the six keys, no em/en dashes, "fertilize" never "feed", "autumn" never "fall", and "as needed"/"as required" rejected (an anytime action with a season attached is busywork — the retry nulls the stage; honest "if needed"/"if desired" conditionals pass). One strict retry naming the failures, then the plant is **flagged and not written** — copy is never silently truncated or rewritten. The prompt carries a stage→month legend (mirrors `lib/season.ts`: `late_summer` = September, `autumn` = Oct–Nov) plus timing norms so actions land in the right stage. `--sample [N]` (diverse `plant_type` spread + forced-in thinnest-`maintenance_notes` plants, no writes, JSON to `reports/` including both source fields), `--limit`, `--new-only`, `--ids a,b,c` (targeted re-sample). Review discipline: a ~20-plant sample goes to Ana in Notion before the full run, same as combinations.

**Blind season-sanity second pass** — `scripts/cross-check-seasonal-care.ts`. The distillation reliably kills the error _classes_ (frozen-ground division, as-needed busywork, feed/fall vocabulary), but the exact _season_ for a debatable action (divide spring vs autumn; bulbs early vs mid autumn) is model-stochastic. This pass catches those. Cross-check style (§20): **flags only, never writes.** It hands the checker each care action **with its assigned stage hidden**, gets back the stage(s) it believes are correct, and compares. Runs on the DB after the full run, or on a sample artifact before it (`--from-report`). Like §20 it is a queue for Ana's eye, not ground truth — some flags are genuine slips, some boundary quibbles.

**Upstream-correction rule (Ana, July 15 2026).** When a wrong-stage flag traces to the plant's own `seasonal_rhythm` — e.g. Scilla's `late_summer` bulb-planting line came straight from its `seasonal_rhythm` ("Late summer... a good time to plant new bulbs") — the fix belongs **upstream in `seasonal_rhythm`, not just on the `seasonal_care` line**, or the same error regenerates on any future re-distillation. The cross-check flags these with `upstream_candidate: true` (a content-word overlap heuristic between the action and the wrongly-assigned stage's `seasonal_rhythm`). This is the provenance principle (§9, §27): fix where the data lives. And it is why **no hard-pin override table** was added ("bulbs → autumn", "divide → early spring"): blanket rules over-claim at the margins (a summer-flowering bulb, bearded iris dividing in summer) — the same lesson as the retired sun-widening sweep (§21→§22). Source-faithful distillation + flags-only second pass + editorial correction beats a rule that silently rewrites correct lines.

**Work split.** Opus owns the data side (migration + both scripts + the catalog run). Sonnet swaps `getCareTips` Tier 1 source from `maintenance_notes` to `seasonal_care[currentStage]` with the planted-only filter, removes clip handling, regroups the drawer's "Good to know", and adds tests (out of scope here). Out of scope entirely: cross-plant dedup/grouping ("deadhead your astilbes and alumroot") — Agent territory later.

**Editorial pass, round 1 (Ana, July 15 2026).** Full catalog run: 418/418 filled (3 correctly all-null). Cross-check over all 415 non-null rows: 271 clean, 170 flagged across 144 plants — 19 real-error candidates, 120 one-stage boundary quibbles, 31 consider-null, 99 tracing upstream to `seasonal_rhythm` (logged, deferred to a separate sweep per the upstream rule above). Ana reviewed the 19 + 31 via a CSV queue and `apply-seasonal-care-fixes.ts` (guarded: verifies the CSV's line still matches the DB before writing — a changed row is stale and skipped; refuses to clobber an already-occupied target stage on a `move`; logs every before→after; never flips `is_curated`) — 39 of 50 applied, one (Golden chamomile) left open on a genuine collision between two similar-but-not-identical lines.

**Two systematic checker biases surfaced** (now documented at the top of `cross-check-seasonal-care.ts` for future reviewers): (1) it defaults division timing to autumn even for species that are true spring dividers (shallow-rooted woodland perennials that dislike autumn disturbance — Lamprocapnos, Brunnera); (2) it over-nulls bloom-season deadheading, reading "as needed while flowering" as anytime/no-season when deadheading has a sharp trigger (a spent bloom, now) and passes the "why now?" test. Neither invalidates the pass — both are directional tendencies for a human reviewer to weigh against, the reason this stays a flags-only queue rather than an auto-apply.

**Fertilize/replenish metaphor bug (found in the same review, fixed July 15 2026).** The fertilize-not-feed vocabulary rule over-applied to the "feed the bulb" idiom: 15 plants got "Allow foliage to die back naturally to **fertilize** the bulb" where the correct verb is "**replenish**" (foliage nourishing a storage organ is not applying fertilizer). Fixed at the source: the prompt now explicitly distinguishes the two, and the validator rejects `fertilize` co-occurring with bulb/corm/rhizome/tuber/root as a recurrence guard. The 15 live rows were corrected via the same apply script.

**Golden chamomile (Cota tinctoria) resolved.** Its early_spring line ("Cut back old stems to maintain tidy growth and shape") wasn't a real second action — the plant is short-lived and dies without the post-flowering hard cutback that forces the basal rosettes carrying it through winter; the spring line was residue of that autumn action not happening. `apply-seasonal-care-fixes.ts` gained a `replace` decision (value `"<stage>|<new text>"`): move + reword in one step, explicitly allowed to overwrite an occupied target — unlike `move`, which refuses. Applied: early_spring nulled, autumn now reads "Cut back hard after flowering to encourage fresh basal growth," stating the survival stakes plainly instead of the softer stock line it replaced.

**Editorial pass, round 2 — the 120 boundary quibbles (Ana, July 15 2026).** 104 kept, 16 flagged (14 moves, 2 nulls). The default (keep) was right for most, but the bucket wasn't purely quibbles:

- **"After flowering" lines sitting in or before the bloom stage itself** — 8 of the 14 moves shared this shape (e.g. "prune immediately after flowering" parked in the very stage the plant flowers in; two winter/early-spring-flowering shrubs, White-forsythia and Early stachyurus, pruned two months late on old-wood bloomers). Not a boundary quibble — the line instructs cutting off flowers the action is supposed to follow. Fixed at the source: the prompt now ties "after flowering" phrasing to `bloom_months` explicitly (see above).
- **Three one-off, consequential slips:** Caucasian boxwood's "fertilize" sat in summer, directly contradicting the app's own static seasonal tip ("avoid fertilizing during the hottest weeks") — moved to early_spring. Falling stars/Crocosmia's protective mulch sat in winter (protection has to precede the cold it protects against) — moved to autumn. Blue flax's "deadhead to encourage further blooming" sat in late_summer, after the plant had already finished blooming — moved to summer.
- **Two nulls exposed a validator gap:** Hollyhock's "Watch for rosettes... emerging" and Winter-aconite's "Watch for bright yellow flowers... emerging through snow" are `seasonal_rhythm` narrative wearing an imperative verb ("watch" passed the imperative check grammatically). Fixed (see above): watch/look/note/observe/expect are now a dedicated rejection, not a plain allow-set membership check. Catalog audit found 7 total instances, all descriptive — zero regression risk.
- **Collision check on the 14 moves** (round 1's lesson: a collision often means the flagged line duplicates a correct line already at the target): 3 were exact duplicates → `null` instead of `move` (Beardlip penstemon, Blue flax, Spanish artichoke each had the identical line already sitting at the target stage). One (Caucasian boxwood) collided with the newly-discovered "watch" bug — used the new `replace` decision. Two (Cowslip, Dahlia) are genuine competing actions wanting the same stage (divide-after-flowering vs. an unrelated deadhead; plant-tubers vs. stake) — sent back for Ana's call rather than guessed.
- **Mulch consistency ruling.** Round 1 nulled Camellia's and Star magnolia's mulch lines as weak "why now"; round 2 left ~15 other mulch lines untouched in the same file, which was inconsistent. Rule applied catalog-wide: a mulch line earns its stage only if it states a real trigger — protective ahead of cold (autumn/winter), a named seasonal ritual ("spring mulch"), or tied to an explicit bloom/heat window — generic "retain moisture"/"keep roots cool"/"maintain fertility" with no named trigger is anytime maintenance and gets nulled, same standard as round 1. Of 16 catalog-wide mulch lines: 5 kept (real trigger), 7 nulled outright (no prior review to conflict with), 4 conflict with an explicit "keep" Ana had already made in the round-2 CSV before this rule existed (Athyrium niponicum, Chinese rhubarb, Daphne bholua, Kirengeshoma palmata) — not silently overridden, sent back for her call.

**Lesson carried to the next pass: weight the queue by stakes, not checker confidence.** The 120-quibble bucket was triaged purely by stage-distance (1-off vs 2+-off), which is why "fertilize during a heatwave" — a line contradicting the app's own advice — landed in the low-priority pile alongside genuine one-stage boundary calls. A future queue should sort or flag by consequence (plant survival, a lost bloom season, direct contradiction with another card) ahead of or alongside checker-confidence distance.

**Editorial pass, round 3 — the two sent-back collisions + the mulch overrides (Ana, July 15 2026).** All resolved:

- **Cowslip: frequency breaks a tie between two real actions.** Deadheading keeps late_spring — it's annual, division is every 3-4 years and the app has no year-position signal, so a contested slot goes to the higher-frequency action. Division moved to summer (free stage; RHS gives a range spanning shortly-after-flowering through autumn for this species).
- **Dahlia: no loss, once staking is also correctly re-timed.** Planting moved into late_spring (last-frost timing is the sharper "why now" than early_spring's guess). That displaced staking, which moved to summer — more botanically correct anyway, since a dahlia needs support once it's tall, not as a tuber in the ground. Staking's move overwrote a "deadhead" line that was an exact duplicate of the one still standing in late_summer, so nothing was lost; this needed a two-step chained apply (vacate the target before filling it) since `apply-seasonal-care-fixes.ts` processes a plant's rows in file order against a shared in-progress state.
- **Mulch rule overrides Ana's own prior "keep" on 3 of the 4 conflicts** (Athyrium niponicum, Chinese rhubarb, Kirengeshoma palmata → nulled): "a consistent catalog-wide bar beats ad-hoc row-by-row judgment, and an earlier call shouldn't be protected once a better general rule lands." Daphne bholua's "keep roots cool" was confirmed to clear the rule's own heat-window clause and stays.
- **Chinese rhubarb also fails on a second count** — "retain moisture and add compost" packs two actions into one line — but a dedicated feed line for Rheum is explicitly out of scope for this queue (a new-line decision, not a correction to smuggle in); logged as a future idea, not built.

**Chinese rhubarb new-line follow-up (Ana, July 15 2026).** The future idea above was built: Rheum palmatum is a heavy feeder (standard RHS advice is a generous spring compost/manure application), so early_spring — left `null` by the mulch-rule nulling — earned a dedicated line rather than staying empty. Ana signed off on wording (offered three candidates, picked the material-naming one over a "heavy feeder" framing or a dormancy-break trigger) and it was applied via `apply-seasonal-care-fixes.ts` (`edit` decision against the null baseline): early_spring now reads "Fertilize with compost or manure to fuel spring growth."

**Status: COMPLETE** — the three editorial rounds below were merged as PR #63 (July 15 2026), and the field is filled catalog-wide (see [`catalog-state.md`](catalog-state.md)). Of the three scripts, only `curate-seasonal-care.ts` is a per-round step (§25 step 7); the blind check and apply-fixes scripts are optional editorial follow-ups.

## 29. Diary photos go private: signed URLs on a garden-owned bucket

**Decided July 15, 2026.** §18's public-bucket posture was explicitly temporary ("revisit once real auth/profiles exist"); auth shipped (§24), so this is that revisit. This section supersedes §18's storage paragraph.

**The exposure was worse than §18 documented.** Beyond the bucket being public, the three storage policies from `20260708121933` had no role or ownership restriction: anyone holding the `NEXT_PUBLIC` anon key could **list** the whole bucket via the storage API (so "unguessable UUID paths" protected nothing), **upload** arbitrary objects into it, and **delete** other users' photos. And Supabase doesn't strip EXIF, so public photos likely carried GPS coordinates of users' homes.

**The shape now** (migration `20260715100000` + `lib/diary-photos.ts`):

- **Bucket private, policies keyed on garden ownership.** All three operations (select/insert/delete) are restricted to `authenticated` and require the path's first folder — the `{gardenId}` of the unchanged `{gardenId}/{plantId}/{timestamp}-{filename}` convention — to be a garden the caller owns (`storage.foldername(name)[1]` joined to `gardens.user_id = auth.uid()`).
- **The DB stores storage paths, not URLs.** `addDiaryEntry` writes the bucket-relative path into `photo_urls` (filenames sanitized to safe storage-key characters). Reads sign on the way out: `withSignedPhotoUrls` in `server/diary-actions.ts` batches one `createSignedUrls` call (1h TTL) per read, so `DiaryEntry.photoUrls` is always renderable for callers and **no component or `lib/diary.ts` code changed at all** — signing lives entirely at the module boundary.
- **No data migration for old rows.** Pre-cutover rows stored full public URLs, percent-encoded — rewriting them to paths in SQL would need URL-decoding, which Postgres lacks natively. Instead `toDiaryPhotoPath` normalizes both formats (URL → decoded path; path → itself) at read time, permanently. Old public URLs die when the bucket flips — by design.
- **Deletes now remove photo objects.** `deleteDiaryEntry`, `deleteDiaryThread`, `resetGarden`, and `deleteAccount` all remove the entries' photos from storage, best-effort after the row deletes succeed (an orphaned object in a private bucket costs storage, not privacy — so a storage hiccup never fails a delete that already happened). This closes §18's orphaned-file gap and makes the delete-confirm copy ("permanently delete this note and N photos") true. `deleteAccount` does it via the session client _before_ signing out, since the DB cascade can't reach storage.

**Deploy order matters: code first, then migration.** New code on the still-public bucket works fine (signing works on public buckets; new uploads store paths, which old URLs' normalizer also handles). The migration on old code breaks photo rendering (old code renders stored public URLs raw, which 404 on a private bucket). So: merge + deploy, then apply `20260715100000`.

**Not solving now:** EXIF stripping on upload (the other half of the location-leak story — private bucket contains it, signed-URL recipients still see it); the shared plants catalog images stay public, which is correct for public catalog data.

**Post-ship fix (same day, migration `20260715110000`): qualify `objects.name` in the policies.** The original policies referenced the object path as bare `name` inside the `EXISTS (select … from gardens …)` subquery — where Postgres resolved it to `gardens.name` (gardens has its own `name` column), not `storage.objects.name`. Every ownership check compared the garden id against the foldername of the garden's _display name_, always false, so all uploads/reads/deletes were denied for everyone. The rule: in a storage policy whose subquery joins any table with a `name` column, always write `storage.foldername(objects.name)`. Found via prod storage logs (400s) + Postgres logs (`new row violates row-level security policy for table "objects"`), confirmed by impersonated-role inserts. The same incident surfaced a second, unrelated blocker: Next's default 1mb server-action body cap rejected multi-photo notes with an opaque "unexpected response" error — raised to 4mb in `next.config.ts` (just under Vercel's ~4.5mb request ceiling, which no config can raise).

**Client-side photo processing (same day, follow-up to the above).** Real files immediately broke both remaining assumptions: a 5.5mb PNG exceeded even the 4mb cap, and a HEIC uploaded fine (bytes are bytes) but rendered as an empty box forever — neither most browsers nor the Vercel image optimizer (`next/image`) can decode HEIC. Fix: `lib/photo-processing.ts` decodes, downscales (2000px long edge), and re-encodes every picked photo to JPEG in the browser before upload. One step solves three problems: size (a 2000px JPEG lands far under the cap), format (everything stored is renderable JPEG; files the browser can't decode — e.g. HEIC outside Safari — are rejected at pick time with a composer message instead of becoming permanently broken photos), and privacy (canvas re-encoding strips EXIF, closing the GPS-metadata follow-up above — browsers apply EXIF rotation during decode, so orientation survives). Trade-off accepted: animated GIFs flatten to a still frame.

## 30. Hero images: category-recovered shortlist, then an AI vision pick

**The problem.** `plants.image_url` was never a curation decision. `mapImages()` in `lib/trefle.ts` takes the first image of the highest-priority category Trefle returned, and ~89% of our candidate URLs are `bs.plantnet.org` — a public plant-identification database, i.e. user documentation photos. So the catalog's heroes include herbarium sheets, pressed specimens, hands holding a leaf, nursery pots with plastic labels, and out-of-focus phone shots. Once Explore went image-forward (§ Explore filter redesign, PR #72) this became the most visible quality gap in the catalog.

**The measurement that shaped the design.** The Notion backlog assumed a heuristic prefilter (resolution, sharpness, aspect) would cut each plant's `image_urls` "down to ~6". Actual catalog state, measured July 21 2026: **avg 27.7 candidates per plant, max 43, ~13.7k images total** — so the prefilter is the engineering problem, not the vision call. Two further facts changed the approach:

- **Trefle labels every image** `flower` / `habit` / `leaf` / `bark` / `fruit` (5 max per category), and `mapImages()` **flattens the map into a bare `text[]`, discarding the label**. That label is the strongest prefilter signal available and it maps directly onto the quality criteria: a `flower` image is a bloom shot by construction, a `habit` image is the whole plant in frame. Recovering it costs 494 Trefle calls and **zero image downloads**, where sharpness scoring would have cost 13.7k downloads to approximate something the vision model judges better anyway.
- **Resolution still has to be measured**, because the model cannot see it — it is shown a resized copy, so a well-composed 320px photo looks identical to a 2000px one and would win a pick it cannot deliver on a full-bleed card.

**The pipeline (two scripts, both offline, neither in the request path).**

1. `recover-image-categories.ts` — re-fetches each species by `source_species_id` and writes `plants.image_candidates` (`[{url, category}]`). Verified lossless: recovered counts match the stored `image_urls` length exactly. Resumable — only rows with `image_candidates IS NULL` are fetched, so an interrupted run costs nothing to restart; `--refresh` re-fetches everything (use after a seed batch).
2. `pick-plant-images.ts` — shortlist → probe → pick.
   - **Shortlist** (`lib/image-shortlist.ts`, pure and unit-tested): `flower` and `habit` round-robin so neither framing crowds the other out, topped up from detail categories only when a plant has too few primaries to compare (Actaea simplex has no `habit` shots at all). ~28 candidates → ~10.
   - **Probe** (`lib/image-probe.ts`): a **ranged GET of the first 64KB** validates the link and reads pixel dimensions straight out of the JPEG/PNG/WebP/GIF header — no full downloads, no image-decoding dependency. This also closes the dead-link gap the backlog flagged as a free win: broken URLs currently fall through to the placeholder with nothing reporting that they broke.
   - **Pick**: up to 6 survivors go to Claude (`VISION_MODEL`, Sonnet 5) via the **Batch API** (~50% cheaper; ~$5-10 one-off for the catalog), as URL image sources.

**Two traps worth keeping.** (a) **The header parse, not the content-type, decides whether a URL is an image.** Trefle's CloudFront-hosted images — the highest-resolution ones in the catalog, ~1600px vs PlantNet's ~800px — serve valid JPEGs as `application/octet-stream`, so gating on content-type would have silently rejected all 1,138 of them. The failure actually worth catching (an HTML error page returned with HTTP 200) can claim any content-type but never parses as an image header. (b) **The incumbent is pinned inside the 6-image cap.** It is included so the model judges the current pick against the alternatives; without pinning, a low-resolution incumbent sorts below six sharper options, gets sliced off, and the pass "upgrades" that plant without ever having compared the two — and could never confirm an already-good hero. Both are covered by tests in `lib/image-probe.test.ts` and `lib/image-shortlist.test.ts`.

**Index resolution is manifest-backed, not re-derived.** The batch response returns only a `chosen_index`, so the exact list each request was built from is persisted to `reports/image-pass/<batchId>.json` (gitignored). Re-probing at collection time would be wrong as well as wasteful: probing is a live network call, so a URL reachable at request time but 404ing an hour later would shorten the list and shift every index after it — writing a confidently-worded pick that points at **the wrong photograph**. The manifest also makes `--resume <batchId>` work from a cold start.

**Ownership and review.** Writes `image_url_curated`, never `image_url` — `upsert_trefle_plant` does not reference the new columns, so a Trefle re-seed and this pass cannot clobber each other (same arrangement as `hardiness_rating`, §27). Read paths go through `heroImageUrl()` in `lib/plant-detail.ts`, which prefers the curated pick and falls back through `image_url` to `image_urls[0]` — so the code is safe to ship ahead of the data, and every plant renders exactly as before until a pick lands. Every pick carries `image_pick_confidence` (high/medium/low) and a one-line `image_pick_reason`; low-confidence picks are the review queue, flag-only, same model as the `native_to` QA guard (§ native_to QA) — **nothing here is editorial sign-off**. `image_checked_at` is the state guard, so `--recheck` is opt-in and errored rows stay unstamped for a plain re-run to retry.

**Two Batch API traps, both of which fail silently or totally.** (a) **Sonnet 5 runs adaptive thinking when `thinking` is omitted** — Sonnet 4.6 did not — and `max_tokens` covers thinking _and_ the answer. At `max_tokens: 1024` roughly a sixth of requests spent the entire budget thinking and returned a `thinking` block with no JSON, `stop_reason: "max_tokens"`. That reads as a malformed reply rather than the truncation it is, so the collector now names `stop_reason` and the thinking-token count instead of reporting a bare "no text block". Settled on `max_tokens: 4096` with `effort: "medium"` — bound thinking rather than starve it, since this is a visual judgement call. (b) **A nullable enum must be written as `anyOf`**, not `type: ['string','null']` with `null` inside the `enum` — the latter is rejected with _"Enum value 'A' does not match declared type"_. Output-config schemas are validated **per request**, so an invalid schema fails 100% of a batch rather than degrading: this rejected all 487 requests of a full-catalog run in one go. The operational rule that follows: **after any schema, prompt-shape, or model change, re-run `--limit 3` before the full pass.** A green typecheck does not verify a runtime API contract, and the probing work ahead of a rejected batch is wasted wall-clock.

## 31. Wikimedia hero photos + image attribution

The image pass (§30) can only choose among the photos Trefle surfaced, which are ~89% PlantNet identification snapshots — so even a "high" pick is best-of-a-mediocre-pool. This adds Wikimedia Commons as a second source and the attribution such photos legally require.

**The pass is source-agnostic, so this is a feeder, not a new pipeline.** `scripts/feed-wikimedia-candidates.ts` resolves each plant's Wikidata **P18** image (`lib/wikimedia.ts`: scientific name → taxon by P225 → P18 → Commons imageinfo for the URL + attribution), appends it to `plants.image_candidates` tagged `source: 'wikimedia'`, and clears `image_checked_at` so `pick-plant-images.ts` re-picks that plant across the combined Trefle + Wikimedia pool. `lib/image-shortlist.ts` always force-includes Wikimedia candidates and `rankAndCap` pins them (like the incumbent), so a curated best-image reaches the vision call regardless of how many sharp Trefle snapshots a plant has. Result on the 56 review-flagged plants: **8 Wikimedia photos won**, each a clear upgrade (e.g. Absinthe went from a washed-out crop of stems in dry weeds to a full clump in a garden).

**Attribution is the real product work, not the fetching.** CC-BY and CC-BY-SA require a visible credit, so `plants.image_attribution` (jsonb: `{artist, license, license_url, source_url}`, migration `20260722120000`) is written whenever a credited photo wins, and cleared when a Trefle photo wins or a revert lands. It renders as a one-line credit in the **plant detail drawer** (`creditLine()` in `lib/image-attribution.ts`), not on browse cards — CC attribution "in any reasonable manner" is satisfied by a reachable credit, so the cards stay clean. The drawer also now leads its photo strip with the curated hero (previously it showed only raw `image_urls`, so a Wikimedia pick wouldn't have appeared at all). **Licence guard:** `isCommercialSafeLicense()` rejects NC, ND, and GFDL-only files before ingest — Santolina is a commercial product, and this kept a GFDL-1.2 photo (Yellow coneflower) out of the catalog.

**The Wikimedia reliability saga (three traps, all silent).** (a) `probeImage` sent no User-Agent, and Wikimedia's upload host **400s a UA-less request** — so every Wikimedia candidate was silently probe-rejected and 0 won on the first run; the probe now sends `IMAGE_FETCH_UA`. (b) Anthropic's own image fetcher **can't reach `upload.wikimedia.org`** either, so the pass sends Wikimedia images as **base64** (`fetchImageBlob`, capped at 4.5MB) rather than by URL — and the manifest stores the exact sent set, because a dropped over-cap image shifts the A–F labels. (c) Commons' **thumbnail service rate-limits aggressively** (400s under any volume) while originals stay reliable, so we store and serve the **original** URL; `next/image` resizes it for display (`upload.wikimedia.org/wikipedia/commons/**` allowlisted in `next.config.ts`). The feeder is idempotent — it replaces its own prior Wikimedia candidates rather than stacking — which is what let the URL-format fix be re-applied cleanly.

## 32. Diary retires as a destination; the plant's story moves onto a dedicated subpage

**Decided July 27, 2026.** The Diary page (`/diary`) duplicated My Plants — most rows sat empty ("Waiting for their first note"), and its drawer was 90% plant info wrapped around a notes timeline. `diary_entries` already keyed a thread by `(garden_id, plant_id)` (§18) — the data model already treated notes as belonging to the plant, not to a separate destination. Nav drops to Overview / My Plants / Explore / Reflections; the `/diary` route, its list page, and its drawer are deleted outright, not just unlinked.

**A second split fell out of the same move: species vs. owned instance.** `PlantDetailDrawer` had been serving two different things through one UI — a catalog species browsed from Explore, and a plant actually owned and growing. Splitting them completes the same principle the Diary retirement is built on: **every piece of the plant's story has one home, on the thing the user actually owns.**

- **The plant subpage (`PlantDetailPage`, reached at `/plants?tab=...&plant=<id>`) is "my plant."** It carries the same reference sections as the Explore drawer (About, Care, Seasonal Rhythm, etc.) plus the Story (`StorySection`/`StoryComposer`, extracted near-verbatim from the old `DiaryDetailDrawer`) and every owned-instance mutation: remove from garden (with its diary-aware confirmation — zero notes removes immediately, any notes ask first), and the planned→growing transition. Nothing else in the app embeds the Story; other surfaces only ever link to it.
- **`PlantDetailDrawer` stays catalog-only — the species.** It keeps the reference sections and the add-to-plan/add-to-garden actions for a plant with no relationship yet, but never mutates an owned instance and never shows Story. For a plant that's currently planted or was removed with history, its one "primary action" becomes a link to the subpage instead (`hasDiaryEntries` — a count-only check, no signed photo URLs — decides which of the two states applies).
- **Routing deliberately stays flat.** Nothing in this app used a `[id]` dynamic segment before this; every existing "detail" view was `?plant=` on a flat page (`/plants`, the old `/diary`, `/explore`). The subpage keeps that convention rather than introducing the app's first dynamic route — `/plants` branches server-side on `searchParams.plant`, rendering the list or the subpage, never both. `GardenClient` no longer renders a detail drawer at all.
- **No orphaned history.** A plant removed from the palette disappears from My Plants but stays in the catalog, so it's still reachable by searching Explore — which is how a removed-but-diaried plant's notes stay reachable without reviving a "removed plants" list.

**Garden-level entries: `plant_id` becomes nullable, no new discriminator column.** Weather, first frost, and general observations aren't about any one plant. Migration `20260727120000` drops `plant_id`'s `NOT NULL` and adds a check that `palette_plant_id` stays null whenever `plant_id` is — `plant_id IS NULL` is the only signal a garden-level entry needs; `event_types` stays the plant-care vocabulary it already was (planted/watered/fertilized/pruned) and garden-level entries simply never set it, rather than inventing a parallel chip set nobody asked for. RLS needed no change — the existing policy was already garden-scoped, not plant-scoped.

**Capture surface: a plain note on the Overview "Recent activity" card, not a new destination.** `getRecentActivity()` replaces `getPlantDiaries()` as the Overview data source — one direct `diary_entries` query ordered/limited at the DB, instead of pulling every plant's full history just to take the newest few. The card (renamed from `DiaryRecentCard`) shows entries across the whole garden, plant-attached and garden-level alike (`plantName: null` renders as "Your garden"), plus a single-line freeform input — text only, no photo attach, no chips — staying a small module rather than growing into the thing that was just retired.
