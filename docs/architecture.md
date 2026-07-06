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
