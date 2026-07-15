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
| `hardiness_zone_min`  | `data.growth.minimum_temperature.deg_c`    | No native zone field in Trefle — derived via USDA zone threshold table                                                                                                                                                                                                                                                                                                                                                                                                                         |
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

Full column list as of the current schema version:

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

**The bug:** `getPlantDetail()` always fell back to a hardcoded `DEFAULT_GARDEN` mock object, with a comment claiming this was "while onboarding/auth don't exist yet." That was the wrong diagnosis. The real cause: `gardens`' and `palette_plants`' RLS policies both require `auth.uid()` to match the garden's `user_id` (directly on `gardens`, via a join on `palette_plants`). Since the app has no real auth session, the anon client's `auth.uid()` is always null, so every query against these two tables silently returned zero rows — not because the data didn't exist (a real garden row was seeded and present the whole time), but because RLS was quietly blocking it. The `.maybeSingle()` fallback masked this as "no row yet" instead of surfacing it as a permissions problem.

**Decision:** Reads/writes to `gardens` and `palette_plants` go through the service-role client (`lib/supabase-admin.ts`, same client already used for the Trefle sync) scoped to one hardcoded, known-good garden id, via a new `lib/current-garden.ts` helper (`getCurrentGardenId()`, `getCurrentGarden()`). RLS policies themselves are untouched.

**Why this over a temporary permissive RLS policy:** A permissive policy (e.g. `USING (true)` or an anon-role carve-out) would need to be written now and correctly reverted later — an easy thing to forget, and a real risk if it ships to production. The existing `auth.uid() = user_id` policies are already correct for when real auth exists; bypassing them at the client layer for this one single-tenant test phase keeps the policies untouched and the eventual auth cutover simpler — swap `getCurrentGarden()`'s hardcoded id for a real session lookup, delete `lib/current-garden.ts`, done. It also mirrors a pattern already established in this codebase (§5): service-role access for privileged, script-like operations, kept out of the client bundle.

**Explicitly temporary:** `lib/current-garden.ts` hardcodes the single seeded garden's id (`7055368c-6158-46b9-a592-223974c7a319`) and is commented as such. It assumes single-tenant, single-garden usage — do not build multi-user or multi-garden features on top of it. It gets deleted, not extended, once onboarding creates real garden rows tied to real auth sessions.

---

## 12. Palette write path: application-level upsert, reversible button state machine

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
| Add to plan                                    | "Added to your plan"       | See planned (→ `/garden?tab=planned`) | `removeFromPalette` (delete the row just created)                                                      |
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

**Selection and prioritization:** for each palette plant with status `planted` or `planned` (not `considering`), `getCareTips()` reads `plant.maintenance_notes`; plants where it's null are skipped rather than erroring (shouldn't happen given full curation, but defended against). Capped at 5 tips. When there are more than 5 candidates, plants currently `blooming` or `pre-bloom` (via the existing `getBloomStatus()`, §10, itself derived from `bloom_months`, independent of `seasonal_rhythm`) are prioritized to the front of the list — a plant actively flowering right now is more actionable than one just sitting dormant — with the remaining slots filled in `listPalette()`'s existing order (most recently added first).

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

**Two sources feed the list:** `lib/diary.ts`'s `getPlantDiaries()` returns one `PlantDiary` per `planted` (growing) row in the _current_ `palette_plants` for the garden (so a freshly-planted plant shows up with an empty thread, ready for its first note) — `planned`/`considering` plants don't get one yet, since a diary is for tracking something you're actually tending, not a plan. It then adds a second bucket: any plant with `diary_entries` in this garden that's no longer in `palette_plants` at all. Those get `paletteId: null`, and `DiaryListRow` renders a small "Removed from garden" tag next to the plant name instead of hiding the thread — removal is destructive to the palette row, not to the plant's history. Still writable: the composer works the same for a removed plant's diary (e.g. a closing note), since `addDiaryEntry`'s `paletteId` is optional and the schema never required a live palette row.

**Storage — public bucket, temporary:** `diary-photos` is a public Supabase Storage bucket (`storage/v1/object/public/diary-photos/...`), so uploaded photos are viewable via their public URL immediately, no signed URLs. Same posture as the public plants catalog images — there's no real per-user privacy boundary yet (single hardcoded dev garden, §11), so "public" costs nothing today. Revisit once real auth/profiles exist. Upload path convention: `{gardenId}/{plantId}/{timestamp}-{filename}`, set in `addDiaryEntry` (`server/diary-actions.ts`).

**Not solving now:** `deleteDiaryEntry` removes the `diary_entries` row but leaves its uploaded photos in the bucket — an accepted orphaned-file gap for v1. `deleteDiaryEntry` is also not wired to any UI affordance yet (`NoteCard` has no delete button); it exists in `server/diary-actions.ts` for completeness and future use.

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

---

## 20. Botanical cross-check: blind second pass, flags only, never writes

**Why (see §3):** `is_curated = true` is an editorial pass, not botanical verification — the reviewer isn't a botanist. Botanical facts drafted by the first AI pass need an independent check.

**Decision:** `scripts/cross-check-plants.ts` re-derives the four load-bearing botanical fields — `plant_type`, `hardiness_zone_min`/`max`, `sun_requirements`, `bloom_months` — for every plant with `ai_drafted_at` set, and flags disagreements. It **never writes to the plants table**; resolving a flag is a human decision.

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

**Backfill** (`scripts/backfill-sun-split.ts`, one-time) split the existing catalog **set-preservingly**: for each plant it only partitioned the exposures the plant _already had_ into thrives vs tolerates, clamped to the current set in code, so `sun_thrives ∪ sun_tolerates` always equals the prior `sun_requirements`. Single-exposure plants took the value as the best with no API call; multi-exposure plants asked only which subset is primary. The app-visible `sun_requirements` was provably unchanged for all 152, so every prior editorial correction and widening survived intact.

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

**This is the authoritative pipeline for adding plants to the catalog.** It supersedes the shorter "standard round" line in §22, which has since grown. Every step is an offline script under `apps/web/scripts/`, run via `tsx --env-file=.env.local`, none in the request path (§6). The catalog reached **418 species / 1042 combinations** at round 6 (July 14 2026): 29 → 125 → 148 → 201 → 318 → 418 across rounds.

Run the steps **in this order** after choosing a batch of species:

1. **Seed.** Add rows from Trefle. Use `seed-plants.ts` (a flat list) or a purpose-built round script (`seed-regional-natives.ts`, `seed-round6.ts`) when the batch needs its own resolver or selection rationale. **Seed by verified Trefle ID or exact scientific-name match — never the top name-search hit.** Trefle name search silently resolves to sibling species; the round scripts resolve by exact genus+species (synonym-aware) and log any drift. Cultivars/hybrids rarely resolve — seed the species parent by numeric Trefle ID (see §4, and the round notes). Seeding is skip-by-default on already-cataloged species (§9).
2. **Curate.** `curate-plants.ts --new-only` fills every AI field on rows where `ai_drafted_at IS NULL` (the fresh batch only). `--new-only` keeps the pass off the already-drafted catalog. A transient invalid-JSON failure just leaves that row `ai_drafted_at = NULL`; re-run to pick it up.
3. **Combinations.** `curate-combinations.ts` adds companion pairings (§19). Idempotent, auto-skips plants already at the 5-companion cap, so new plants mostly pair among themselves once the catalog is mature.
4. **Regenerate native_region.** `regenerate-native-region.ts` (generate, review, then `--apply`) — see §26. **Must run after every seed** or new plants stay untagged for the "native to my region" filter.
5. **Guards (never write; fail loudly).** `cross-check-plants.ts --new-only` blind-fact-checks the batch's botanical fields (§20); `--new-only` scopes it to the newest calendar-day batch instead of re-checking the whole `is_curated = false` catalog (mirrors curate-plants). `check-bloom-colors.ts` fails if the batch invented a `bloom_color` shade not mapped in `lib/bloom-colors.ts` — an unmapped value silently drops out of the Explore color filter, so map each new shade into an existing bucket before shipping.
6. **Hardiness.** `draft-hardiness.ts` drafts an RHS rating for any unrated new rows — see §27.

**Editorial vs. mechanical stays intact throughout.** None of these steps flips `is_curated` (§3): curation drafts, the guards only flag, and botanical/functional fixes (§20, §23) are guarded reversible corrections, not Ana's editorial pass. Cross-check disagreements on `plant_type` are usually the §23 functional-label convention (false positives), not errors.

**Working-tree discipline.** These scripts touch the live Supabase project directly (there is one project, no separate env), so a seed/curate run mutates production data — intended, but know it. When another session shares the git working tree, commit round code from a throwaway `git worktree` off `main` (or the round branch) and stage only your files by explicit path; never `git add -A` on a shared tree.

## 26. `native_region`: WGSRPD Level-2, regenerated from Trefle (and the `tdwg_code` trap)

**Model (Option A, Ana signed off — Notion "Region Data Model — Decision").** `native_region text[]` is a controlled set of TDWG WGSRPD **Level-2** region names (52 regions, e.g. "Southeastern Europe", "Eastern Asia"), one consistent zoom level for the whole catalog. It powers the Explore "native to my region" lens (`lib/native-to-me.ts`, shipped PR #44). It replaced an earlier ad-hoc `mediterranean/balkans/croatia` tag set that was a prompt artifact — structurally unfit for a filter because a wrong/missing tag hides plants invisibly.

**How it's generated** — `regenerate-native-region.ts`, generate-then-`--apply` (default run writes `reports/native-region-regen.md` + JSON and never touches the DB; review, then `--apply`):

- **Primary:** Trefle `distributions.native[]` Level-3 codes, each rolled up to Level-2 via the authoritative `tdwg/wgsrpd` table. "YUG" (Croatia isn't exposed below Level-3) → "Southeastern Europe".
- **Fallback:** when Trefle returns an empty native list (a coverage hole on an otherwise-valid record), derive Level-2 tags from the clean `native_to` prose with the curation model.
- **Manual overrides:** a small in-script table for reviewed outliers; garden hybrids with no wild range stay correctly empty.

**Re-run after every seed** (step 4 above). The existing catalog is served from `reports/trefle-native-cache.json`, so only new species trigger fresh Trefle fetches.

**The `tdwg_code` trap (fixed July 14 2026, round 6).** Trefle's native-zone objects carry the region code under **`tdwg_code`** and the level under **`tdwg_level`** — _not_ `code`/`level`. The script had been reading `z.code` (undefined), so every freshly-fetched plant produced `unmapped-L3:undefined` and ended up untagged. It stayed **dormant** because the existing catalog was cache hits; it only surfaced when 100 new plants forced fresh fetches (76 empty instead of 2). Fix: read `z.tdwg_code`/`z.tdwg_level`. Note that fixing the parse is not enough on its own — the stale name-only cache entries must be **purged so they refetch**; `loadTrefleNative` only fetches missing/errored keys. After the fix, empty dropped to 2 (the two genuine garden hybrids) and all new plants tagged.

## 27. Hardiness: RHS rating is canonical, drafted then human-verified

**The problem.** Hardiness gates the real user question ("will it survive my winter"), but a July 2026 audit found **no free per-species hardiness source exists**: Trefle's `growth.minimum_temperature` is null for 100% of the catalog (so the old Trefle→USDA-zone mapping was dead code and was removed — see §4); RHS publishes ratings but offers no API or dataset and its content is copyrighted (bulk scraping barred); USDA's APIs map a _location_ to a zone, not a _species_; Wikidata's hardiness properties are effectively empty (23 taxa worldwide). Before this model, every plant's `hardiness_zone_min`/`max` was a single unanchored Claude estimate.

**Decision (Ana, July 14 2026).** The **RHS hardiness rating (H1a–H7) is the canonical field**, a good fit for the Euro/Med-skewed catalog. USDA zone, where shown, is **derived from the rating at render time** (`lib/hardiness.ts`) — never stored alongside. Two columns (migration `20260714164514`): `hardiness_rating text` (CHECK `H1a…H7`) and `hardiness_verified boolean default false`.

**Draft-then-verify flow:**

- **Draft baseline** — `scripts/draft-hardiness.ts` drafts a rating for every plant **blind** (species identity only, same discipline as the cross-check), writes `hardiness_rating`, leaves `hardiness_verified = false`. Ran across all 418 at round 6 (0 failures; distribution skews hardy — H5 174, H7 124 — as expected). Default targets `hardiness_rating IS NULL`; `--redraft-unverified` re-drafts unverified rows after a prompt change; **verified rows are never selected.**
- **Human verification** — a person confirms each rating against RHS public plant pages (reading pages by hand is fine; only bulk scraping is barred) and flips `hardiness_verified = true`, in **priority order: the six garden-style starter palettes first** (highest user exposure); the long tail can stay drafted-but-unverified.

**`hardiness_verified` gates assertion, it doesn't excuse it.** The UI must only present a hardiness claim confidently when `hardiness_verified = true`; unverified rows say nothing or carry a quiet "approximate" marker. This is the opposite of a confidence flag that would license showing unanchored numbers everywhere.

**Re-seed safe by construction.** `hardiness_rating` is **editorial-owned**, the same category as `style_tags` and Ana's editorial corrections. It is not referenced by `upsert_trefle_plant` (§9), so a Trefle re-seed physically cannot touch it; `curate-plants` doesn't write it; the draft skips rated/verified rows. Verification work survives re-seeds — the failure mode Ana flagged (like the pre-COALESCE editorial wipe, §9) is closed.

**Follow-ups (not built yet):** (1) the UI gating above; (2) then **drop the legacy `hardiness_zone_min`/`max` columns** — "don't store both" — but only _after_ the render path derives from the rating, or hardiness display breaks; (3) once verification is done, record in the build log **what fraction of AI drafts survived RHS verification unchanged vs. got corrected** — that ratio is the real measure of the draft's quality.

## 28. Care Tips v2 Tier 1: `seasonal_care`, a distilled prescriptive field (replaces `maintenance_notes` in the tips system)

**Supersedes §16's Tier 1.** §16 fed the card `maintenance_notes` verbatim. The shipped drawer exposed the flaw (Care Tips v2 spec, Notion, locked July 15 2026): `maintenance_notes` is the plant's _care manual_ — several actions, permanent truths, no timeframe — so at ~20 plants the drawer becomes the encyclopedia re-sorted, with near-duplicate paragraphs. Ruling: a tip is **one action, one plant (or garden), one timeframe — it must answer "why now?"**. `maintenance_notes` fails that and **leaves the tips system**, staying only on the plant detail drawer where it already lives.

**The field.** New `plants.seasonal_care jsonb` (migration `20260715120000`): same six keys as `seasonal_rhythm`, each an **imperative one-liner or `null`**. `null` = "nothing to do this stage" and is the expected value for most plants most stages. Where `seasonal_rhythm` _describes_ (what the plant is doing), `seasonal_care` _prescribes_ (what you do). Only the **current stage's** line surfaces, and only for **planted** plants — so volume self-limits to plants with a current-stage action. Editorial-owned, not in the `upsert_trefle_plant` path (§9), so re-seeds can't touch it.

**Distillation pass** — `scripts/curate-seasonal-care.ts`. Fill-only gate `seasonal_care IS NULL AND seasonal_rhythm IS NOT NULL` (the source must exist). Distills `maintenance_notes` + `seasonal_rhythm` + `bloom_months` into the six lines; no new botanical facts. Net-new **line validation** (a first for the curation scripts — the others enforce length by prompt only): ≤12 words / ~90 chars, imperative-verb allow-set (rejects descriptive `seasonal_rhythm`-style sentences that wander into the wrong field), exactly the six keys, no em/en dashes, "fertilize" never "feed", "autumn" never "fall", and "as needed"/"as required" rejected (an anytime action with a season attached is busywork — the retry nulls the stage; honest "if needed"/"if desired" conditionals pass). One strict retry naming the failures, then the plant is **flagged and not written** — copy is never silently truncated or rewritten. The prompt carries a stage→month legend (mirrors `lib/season.ts`: `late_summer` = September, `autumn` = Oct–Nov) plus timing norms so actions land in the right stage. `--sample [N]` (diverse `plant_type` spread + forced-in thinnest-`maintenance_notes` plants, no writes, JSON to `reports/` including both source fields), `--limit`, `--new-only`, `--ids a,b,c` (targeted re-sample). Review discipline: a ~20-plant sample goes to Ana in Notion before the full run, same as combinations.

**Blind season-sanity second pass** — `scripts/cross-check-seasonal-care.ts`. The distillation reliably kills the error _classes_ (frozen-ground division, as-needed busywork, feed/fall vocabulary), but the exact _season_ for a debatable action (divide spring vs autumn; bulbs early vs mid autumn) is model-stochastic. This pass catches those. Cross-check style (§20): **flags only, never writes.** It hands the checker each care action **with its assigned stage hidden**, gets back the stage(s) it believes are correct, and compares. Runs on the DB after the full run, or on a sample artifact before it (`--from-report`). Like §20 it is a queue for Ana's eye, not ground truth — some flags are genuine slips, some boundary quibbles.

**Upstream-correction rule (Ana, July 15 2026).** When a wrong-stage flag traces to the plant's own `seasonal_rhythm` — e.g. Scilla's `late_summer` bulb-planting line came straight from its `seasonal_rhythm` ("Late summer... a good time to plant new bulbs") — the fix belongs **upstream in `seasonal_rhythm`, not just on the `seasonal_care` line**, or the same error regenerates on any future re-distillation. The cross-check flags these with `upstream_candidate: true` (a content-word overlap heuristic between the action and the wrongly-assigned stage's `seasonal_rhythm`). This is the provenance principle (§9, §27): fix where the data lives. And it is why **no hard-pin override table** was added ("bulbs → autumn", "divide → early spring"): blanket rules over-claim at the margins (a summer-flowering bulb, bearded iris dividing in summer) — the same lesson as the retired sun-widening sweep (§21→§22). Source-faithful distillation + flags-only second pass + editorial correction beats a rule that silently rewrites correct lines.

**Work split.** Opus owns the data side (migration + both scripts + the catalog run). Sonnet swaps `getCareTips` Tier 1 source from `maintenance_notes` to `seasonal_care[currentStage]` with the planted-only filter, removes clip handling, regroups the drawer's "Good to know", and adds tests (out of scope here). Out of scope entirely: cross-plant dedup/grouping ("deadhead your astilbes and alumroot") — Agent territory later.
