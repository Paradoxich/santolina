# Santolina — Architecture Decisions

This document describes **the architecture as it is today**, and why it is
shaped that way. Sections are grouped by the part of the product they govern.

**It is not a history of what we decided along the way.** A decision that no
longer describes anything in the codebase does not earn a section, however hard
it was to make at the time. When something is replaced, rewrite the section to
describe what is true now; do not keep the old version alongside it and do not
bolt an amendment on the end. The superseded thing is worth a sentence only when
it stops someone retaking the same wrong turn — and if what it left behind is a
trap rather than a design, it belongs in [`database-log.md`](database-log.md).

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
- [The curation pipeline](curation.md) — its own document
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

**Two copies of a fact is what rots**, whichever direction the duplication runs:
one gets updated and both keep reading as true. That applies to a superseded
section left standing beside its replacement, to a table copied out of a
migration, and to a paragraph restating a script header.

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

- Trefle has patchy `growth` data for well-known ornamentals (Lavandula angustifolia, Hydrangea macrophylla, Echinacea purpurea all had entirely null growth objects). This is addressed by the AI curation pass (see [the curation model](curation.md#curation-model)).
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

- **Every mapping was confirmed against live API responses before any code was written.** Trefle's docs and its payloads disagree in places, which is also how the `tdwg_code` trap ([native_region](curation.md#native-region)) was possible.
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

**Revised July 9, 2026 — the original rules were fill-only in the wrong direction.** The table above protected fields only when Trefle sends _nothing_: `COALESCE(EXCLUDED.x, plants.x)` lets an incoming non-null Trefle value overwrite the stored one, and the array `CASE` rules pointed the same way. That was fine against Trefle's nulls (the original bug) but destructive wherever Trefle _has_ data and the stored value had since been editorially corrected — the round-3 full re-seed reverted 49 of the 62 editorial `sun_requirements` corrections ([the botanical cross-check](curation.md#botanical-cross-check)) this way. `supabase/migrations/20260709210000_fill_only_trefle_upsert.sql` replaces the function with uniform **fill-only** semantics: on UPDATE the stored value always wins and Trefle can only fill gaps (null scalars, empty arrays); `common_name`/`scientific_name`/`data_source` are no longer rewritten either. INSERTs are unchanged. Trade-off: a re-seed can no longer refresh names/images/bloom data on existing rows — refreshing from Trefle now requires explicit tooling that declares which fields it overwrites. Alongside this, `seed-plants.ts` now skips already-cataloged species by default (matched on scientific name, then on the resolved Trefle ID); `--include-existing` restores full-list behavior. Synonym remaps are caught by the resolver, not by that ID check: since 2026-08-16 every seeder resolves names through `apps/web/scripts/species-resolver.ts`, which holds the one synonym-genus table and never returns an unverified top search hit. Verified live: a hostile upsert against a corrected row left every field intact, and a full default seed run made zero writes (145 skipped).

<a id="curation-layer"></a>

### Plants table is a cache with a manual curation layer

**Decision:** The `plants` table caches external data but has a separate curation layer that is never overwritten by the provider integration.

**Two distinct write paths:**

1. **Trefle sync** (`lib/trefle.ts` → `lib/plants-db.ts`): Populates botanical facts. Never touches `style_tags`, `space_types`, `bloom_color`, `foliage_color`, `plant_type`, care instructions, or any AI-drafted fields.
2. **AI curation** (`scripts/curate-plants.ts` → Claude): Fills gaps and generates garden-specific metadata. Never overwrites fields that already have data.

**`is_curated` flag:** Set to `false` on all automated writes. Flipping it to `true` is a deliberate manual step after human review. This means the plants table always has a clear distinction between "machine-drafted" and "human-verified" rows.

**What "human review" means (redefined July 2026):** the reviewer isn't a botanist, so `is_curated = true` asserts an _editorial_ pass, not botanical verification: the image shows the right plant, the description reads well and on-brand, and the style/space tags make product sense. Botanical facts (hardiness, sun, bloom months) are verified by a separate AI cross-check pass — a second, independent model run prompted to fact-check the curation output and flag disagreements for human spot-checking (built; see [the botanical cross-check](curation.md#botanical-cross-check)).

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

Corrections that follow this convention are applied by the same guarded, reversible method as [the botanical cross-check](curation.md#botanical-cross-check) (update by `scientific_name`/`id`, guarded on `is_curated = false` and an exact match on the prior value). They do **not** flip `is_curated` — a functional-classification fix is not Ana's editorial pass.

---

<a id="group-curation"></a>

## The curation pipeline

The plant catalog's data layer — how species are seeded, drafted, fact-checked
and signed off — is complex enough to be read on its own, and is usually read
by someone doing only that. It lives in **[curation.md](curation.md)**.

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

<a id="auth"></a>

### Accounts: passwordless, one garden, provisioned on signup

**There is no password anywhere.** Magic link is the default and Google OAuth
sits alongside it, both near-zero on Supabase. The consequence is the useful
part: account settings has no password management to build, no reset flow, no
credential storage, and the "forgot password" surface that usually follows
signup does not exist.

**A demo visitor is a real user, not a special case.** `POST /auth/demo` signs
them in anonymously, which creates an ordinary `auth.users` row, so the same
trigger provisions them a profile and garden and every RLS policy, server action
and page works unchanged. **The demo flag is `auth.users.is_anonymous` and
nothing else** — no `is_demo` column, no marker row, so there is no second copy
of the fact to drift, and converting a visitor stops them being anonymous by the
same act that converts them. Conversion is `updateUser({ email })`, which
upgrades the account in place: same user id, same garden, palette and diary
carried over. Unconverted demo accounts are purged after 7 days.

**Provisioning is a trigger, so a garden always exists.** `handle_new_user` on
`auth.users` insert creates the `users` row and an empty `gardens` row. Nobody
ever "creates a garden" — v1 is one per user, so there is nothing to choose. The
schema allows more; the app does not.

**The whole app requires a session.** Only the landing page, `/login`,
`/auth/*` and `/design-system` are public; middleware refreshes the session and
redirects everything else. With the demo path in place this costs a visitor
nothing — "look around first" is a click, not an exemption in the auth layer.

**Location is the one required input, and a null location is the gate.** A user
whose garden has no location is routed to a one-field capture before they reach
the app. There is no `onboarding_complete` flag to keep in sync, because the
condition is the data itself. It is required — the one deliberate exception to
never forcing input — because the entire climate layer depends on it, and
guaranteeing it lets every downstream surface assume a location instead of
carrying a fallback path.

**The garden profile is data with no screen.** All the profile columns exist
(space type, sun, style, size), and only location is populated; the rest wait
for the deferred onboarding wizard. The profile is plumbing, not a surface.

**RLS is load-bearing, not decorative.** Every user-scoped server action runs on
a session client via `@supabase/ssr`, so the `auth.uid()` policies actually
execute. Service role is retained **only** for catalog writes — the Trefle sync
and the curation scripts ([the server-only clients](#server-only-clients)) —
which are garden-independent and public-read.

**Account settings holds the basics only:** email, sign out, delete account,
reset garden, and edit location, which is the one live profile field and needs
a home.

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

### Diary photos: a private bucket, signed URLs, garden-owned

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

### The plant's story lives on the plant, not in a Diary

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

The window is circular — a December→March bloomer is one window, so winter
bloomers get the right pre-bloom/done months and the right next-bloom
lookahead. The algorithm and its remaining assumption (one contiguous window
per year) are documented on the function itself, which is the only place they
can be checked against the code. An earlier version broke on December-wrapping
windows behind a comment claiming no catalog plant had one; twelve did by
round 10, which is why the comment no longer states catalog counts.

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
a number, and `pnpm docs:links` fails if anything does. Rows carry the anchor rather than a copied title, so nothing here goes
stale when a heading is reworded.

| Cited as | Section                                                        |
| -------- | -------------------------------------------------------------- |
| §1       | [plant-data-provider](#plant-data-provider)                    |
| §2       | [provider-agnostic-columns](#provider-agnostic-columns)        |
| §3       | [curation-layer](#curation-layer)                              |
| §4       | [trefle-field-mapping](#trefle-field-mapping)                  |
| §5       | [server-only-clients](#server-only-clients)                    |
| §6       | [curation-model](curation.md#curation-model)                   |
| §7       | [seeding-scripts](curation.md#seeding-scripts)                 |
| §8       | [plants-schema](#plants-schema)                                |
| §9       | [safe-upsert](#safe-upsert)                                    |
| §10      | [bloom-status](#bloom-status)                                  |
| §11      | removed — the shim is gone; see [Accounts](#auth)              |
| §12      | [palette-write-path](#palette-write-path)                      |
| §13      | [toasts](#toasts)                                              |
| §14      | [transition-labels](#transition-labels)                        |
| §15      | [growing-vs-planned](#growing-vs-planned)                      |
| §16      | removed — see [Care Tips v2](curation.md#seasonal-care)        |
| §17      | [weather](#weather)                                            |
| §18      | [diary-identity](#diary-identity)                              |
| §19      | [plant-combinations](curation.md#plant-combinations)           |
| §20      | [botanical-cross-check](curation.md#botanical-cross-check)     |
| §21      | removed — see [the two-field sun model](curation.md#sun-model) |
| §22      | [sun-model](curation.md#sun-model)                             |
| §23      | [plant-type-label](#plant-type-label)                          |
| §24      | [auth](#auth)                                                  |
| §25      | [round-runbook](curation.md#round-runbook)                     |
| §26      | [native-region](curation.md#native-region)                     |
| §27      | [hardiness](curation.md#hardiness)                             |
| §28      | [seasonal-care](curation.md#seasonal-care)                     |
| §29      | [diary-photos-private](#diary-photos-private)                  |
| §30      | [hero-images](curation.md#hero-images)                         |
| §31      | [wikimedia-attribution](curation.md#wikimedia-attribution)     |
| §32      | [plant-story-subpage](#plant-story-subpage)                    |
| §33      | [content-width](#content-width)                                |
| §34      | [plant-dashboard](#plant-dashboard)                            |
| §35      | [explore-ranking](#explore-ranking)                            |
