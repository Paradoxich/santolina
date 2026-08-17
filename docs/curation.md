# Santolina — The plant curation pipeline

This is the design rationale for the plant catalog: where species data comes
from, what each pass is allowed to write, and why the guards are shaped the way
they are. It is split out of [architecture.md](architecture.md) because it is
the deepest part of the system and is usually read on its own.

**Read these two first if you are about to run anything.**
[`database-log.md`](database-log.md) is the operational record — its standing
rules and numbered traps are the accumulated cost of every mistake made here,
and several were live for multiple rounds before anyone noticed.
[`round-runbook.md`](round-runbook.md) is the generated step order, taken
straight from the array the runner executes. Neither is duplicated below.

**The rules this file is written under.** It describes the pipeline as it is
today, not the history of how it got here. What one round found belongs in
`database-log.md`; current counts are generated into
[`catalog-state.md`](catalog-state.md) and linked, never retyped. Cite a
section by its anchor (`docs/curation.md#safe-upsert`-style), never by
position — `pnpm docs:links` fails on a reference that resolves to nothing.

**Three things that are true of every pass here**, and are the fastest way to
be wrong if you forget them:

1. **A scope is mandatory and a state predicate is not a scope.** Every script
   takes `--round` / `--ids` / `--all` and refuses to run without one.
2. **Guards flag; they never fix.** A cross-check writes nothing but its own
   `*_checked_at` stamp.
3. **A failed fetch must never look like a negative result.** Where a fallback
   exists, an error that degrades into plausible data is the failure mode this
   pipeline has hit most often.

---

<a id="curation-model"></a>

## AI curation model: claude-sonnet-4-5

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

## Every pass is resumable, and none of them aborts a batch

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

## Plant combinations: AI companion pass, capped and idempotent

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

## Botanical cross-check: blind second pass, flags only, never edits data

**Why (see [the curation layer](architecture.md#curation-layer)):** `is_curated = true` is an editorial pass, not botanical verification — the reviewer isn't a botanist. Botanical facts drafted by the first AI pass need an independent check.

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

**Checked-at stamp — guard scoping (July 2026, migration `20260716120000`).** The guard stamps `plants.botanical_checked_at` on each row the moment it finishes checking it (flagged or clean — the stamp records that the check _ran_, not its verdict). This is operational metadata, not catalog content, so the flags-only rule holds — it never touches a botanical or editorial field. The stamp makes `--new-only` state-based (`WHERE botanical_checked_at IS NULL`): exact (no UTC-midnight batch split), and resumable — a killed run leaves the rest unstamped for the next pass, replacing the earlier newest-calendar-day heuristic. It's a timestamp, not a boolean, so a prompt revision can re-scope by date (`... OR botanical_checked_at < '<date>'`). **Cascade rule:** any script that _mutates_ a checked field must null the matching stamp so the guard re-checks — e.g. `scripts/archive/regenerate-native-to.ts` nulls `native_checked_at` in the same write that rewrites `native_to`. The sibling `native_to` guard (`cross-check-native-to.ts`) carries its own `native_checked_at` stamp, but **since 2026-08-16 not on the identical model**: there the stamp means the row was SETTLED, not that the check ran, so a `gross` or `contradicts` verdict whose rewrite is still pending is left unstamped and stays in the queue (`shouldStamp`, trap 24). The two guards' rules differ in three places and deliberately share no code — the reasoning is in that function's header. `check-bloom-colors.ts` has none by design (a free local validator with no Claude call, it always runs over the whole catalog).

<a id="sun-model"></a>

## Sun modelled as best + tolerated (the root fix)

**Why:** one flat `sun_requirements` list cannot say where a plant _thrives_
versus where it merely _tolerates_ an exposure, so the drafter names the
textbook optimum and every batch under-reports. That was first treated as a
detect-and-widen problem — a corrective sweep applied the blind check's wider
range — but a backstop that keeps bad drafts off the page is not the same as
drafting well. Modelling the two ideas separately removes the ambiguity at the
source, and was pulled ahead of the 500–700 species expansion so new plants are
captured correctly the first time rather than re-curated later.

**Two rules the retired sweep left behind**, both of which outlive it and are
not specific to sun. **A machine may widen toward a corroborated second read; it
may never narrow** — widening on a strict-subset disagreement is exactly the
union of two independent reads, so it can add a value but never remove one,
while a contradiction needs a person, because nothing automatic tells "narrow
but right" from "wrong direction". And **`is_curated = true` is a freeze line**:
an uncurated row is machine-maintained toward the corroborated range, a curated
one is human-owned and untouchable. The sweep's first version ignored that and
widened a shade groundcover a human had deliberately narrowed.

**Model (migration `20260709220000`):**

- `sun_thrives text[]` — exposures where the plant performs at its best (usually one, sometimes two; non-empty once curated).
- `sun_tolerates text[]` — additional exposures it accepts but isn't at its best in; disjoint from `sun_thrives`; may be empty.
- `sun_requirements` (unchanged, app-facing) — a **derived mirror**, kept as `canonical(sun_thrives ∪ sun_tolerates)` by a `BEFORE INSERT OR UPDATE` trigger whenever either source field is non-empty. Every existing read site (`good-for-your-garden.ts`, plant detail, garden tile, `format-plant.ts`) keeps reading `sun_requirements` untouched — the app is unchanged; only the source of the data moved underneath it.

**Integrity** is enforced in the DB, not by convention: CHECK constraints require both sets to be valid exposures, disjoint, and forbid "tolerates without a thrives" (a plant with any sun data must have a best). A bonus effect: because the trigger recomputes `sun_requirements` from the two source fields on every write, the Trefle seed path can no longer perturb a split plant's sun even if the fill-only upsert ([the safe Trefle upsert](architecture.md#safe-upsert)) ever let a value through — the derived value is a pure function of the AI/editorial source fields.

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

## `native_region`: WGSRPD Level-2, and why the source needed a second opinion

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

<a id="native-to"></a>

## `native_to` and `native_region`: one origin, two fields, one authority

Two columns answer "where is this plant from". `native_to` is the prose phrase
on the plant page ("the western Mediterranean"); `native_region` is the Level-2
array behind the Explore filter. They are not redundant — one is copy, one is a
controlled vocabulary — but they must not disagree, and until July 30 2026
nothing made them agree.

**The division of authority is deliberate and asymmetric.** WCVP feeds
`native_region` mechanically. `native_to` is hand-owned, voice-passed copy, and
is only ever _checked_ against the regions, never generated from them. Deriving
the phrase is the cheap thing not to do: it is the sentence a beginner reads.

**What went wrong is what the split invites.** The July 30 WCVP tail corrected
53 `native_region` rows and left all 53 phrases saying the old thing, because
nothing connected them. `Imperata cylindrica`'s tags moved to Africa and the
Mediterranean while its phrase went on naming the range it was introduced into.
The fix is the cascade rule applied _across_ fields instead of within one:
`cross-check-native-region --apply` nulls `native_checked_at` on every row it
corrects, so the prose guard sees that row again.

**The prose guard had to get sharper to use it.** A continent test cannot see
that error — phrase and truth both say "Asia". `cross-check-native-to` now takes
the tags as a third signal and reports verdict `contradicts`: right continent,
wrong range.

**Three rules keep it honest.** The tags count as evidence **only once
`native_region_checked_at` is set** — unvalidated, they are still Trefle's
naturalised-inclusive range, so believing them would be checking the phrase
against its own source. `contradicts` rows are **never auto-applied**: a wrong
continent is a bug, a contradicted range is a copy rewrite, and the drafts the
run produces are for a voice pass.

And **the verdict fires only where fuzziness cannot explain the gap.** Two
sharper designs were built first and both flooded the report, for the same
underlying reason: prose is fuzzy and Level 2 is exact.

- **Asking the model to judge** produced a queue roughly half false positives.
  It flagged phrases for _omitting_ regions the tags list, which is a phrase
  being less specific. `Styrax japonicus` — "Japan, Korea, and China" against
  tags including China and Eastern Asia — was called a contradiction, when Japan
  and Korea **are** Eastern Asia in this vocabulary.
- **Translating the phrase and flagging any unsupported region** looks rigorous
  and is not. An umbrella word manufactures contradictions at its edges: "the
  Mediterranean" expands to include Western Asia, which `Rosmarinus officinalis`
  deliberately excludes by reviewed override, so the catalog's most obviously
  correct phrase came back flagged. `Lavandula` and `Cistus` went the same way.

So the model **translates only** — wording into Level-2 names — and code makes
every severity call. `contradicts` requires the phrase and the tags to share
**nothing**, or the tags to be validated-empty while the phrase claims a range.
Partial gaps are not a verdict: they are a ranked list at the end of the report,
widest gap first, for a person to read. On a fourteen-plant calibration set that
leaves two contradictions, both real (`Imperata` and the `Citrus limon`
cultigen), no false alarms, and every genuine over-claim still visible in the
list. **A guard that cries wolf on Rosemary is worth less than a short list
somebody actually reads.**

**Working the queue: judge against countries, not against the tags.** The
markdown ranks rows by Level-2 gap, which is the right way to _sort_ a queue and
the wrong way to _decide_ one — every row in it claims something the tags lack,
by construction. The run's JSON carries WCVP's botanical-country list per row
(`Albania, Algeria, Baleares…`), and that is what the decision is made against.
The 2026-07-30 pass took 30 of 179 rows that way with no new Claude spend.

Two rules do most of the work. **Omission is not a defect** — a phrase less
specific than the tags is a phrase, not an error, and flagging it is how the
first design flooded. **Only an over-claim is**, and even then only where the
named place has no native occurrence at all: an umbrella word overshooting its
edges is not one. And the sharp test for the class that matters:
**silence is not contradiction.** `Humulus lupulus` claimed North America and
WCVP carries 30 North American localities, all `INTRODUCED` — a real defect, the
`Imperata` shape. `Osmunda regalis` claimed it too and WCVP carries no North
American row at all, because it splits those plants off at variety rank — not a
defect, and left alone. Read `establishmentMeans` before rewriting a continent
out of a phrase.

Decisions are applied by `scripts/apply-native-to-fixes.ts` from a committed
decision file, never by the guard: it asserts the stored phrase still matches
what was reviewed, refuses a replacement carrying a dash or semicolon, and nulls
`native_checked_at` so the rewritten phrase is re-read rather than inheriting a
stamp earned by different words.

**Hand-authored descriptions use the same shape.**
`scripts/apply-description-fixes.ts` (added 2026-08-17) applies `description`
rewrites a person wrote, from a committed decision file, with the same staleness
assertion and the same copy guard. It exists because neither drafting pass could
express the case: `curate-plants` writes a description only when there isn't one
and refuses `--only description` outright, while `curate-editorial` writes what a
model produces and has no way to accept "say THIS, for this reason". The worked
example is _Hydrangea hydrangeoides_, one of three near-identical white-lacecap
climbers whose old text described all three equally well.

Unlike the `native_to` applier it does **not** protect the editorial verdict. It
lets `invalidate_editorial_verdict` clear `is_curated`, because "the description
reads well" is one of the three criteria the sign-off is made of ([the curation
layer](architecture.md#curation-layer)), and new prose is exactly what a reviewer
would judge again. It prints the rows whose verdict it retired so
`curate-editorial` can be re-run on them.

<a id="removing-a-plant"></a>

### Removing a plant

`scripts/remove-plant.ts` (added 2026-08-17) is the only path that deletes a
catalog row. Before it existed the catalog could only grow, which is why the
_Hydrangea anomala_ / _H. petiolaris_ duplicate stayed known and unfixed from
round 11 onward.

**The foreign keys do not make a delete safe, and one makes it dangerous.**
`palette_plants.plant_id` is `ON DELETE CASCADE`, so a plain
`delete from plants` removes the plant from every user's garden without a word;
`diary_entries.plant_id` is `NO ACTION` and blocks, but arrives as a raw FK
error. So the refusals live in the script: **user-owned rows block, derived rows
do not.** Combinations cascade and are regenerable, so they never block — the
report says how many went and to re-run `curate-combinations`. There is no
`--force`; the answer to "a user has this plant" is to move those rows first.

**The removal record is the restore point.** Each removal appends the complete
deleted rows to `reference/removals.json`, committed, with the reason and the
round manifests that named the id. A whole-catalog snapshot to drop one row is
an artifact nobody diffs, and it does not answer the question you have
afterwards — what exactly went, and why.

**Round manifests are reported, never rewritten.** A manifest records what
entered the catalog in that round and stays true once the row is gone. But
`roundStatus` counts against the rows it can still fetch, so a vanished id
shrinks the denominator and every step reads more complete than it is —
`verify-round` FAILs on a manifest id with no live row and points at the
removal record.

<a id="hardiness"></a>

## Hardiness: RHS rating is canonical, drafted then human-verified

**The problem.** Hardiness gates the real user question ("will it survive my winter"), but a July 2026 audit found **no free per-species hardiness source exists**: Trefle's `growth.minimum_temperature` is null for 100% of the catalog (so the old Trefle→USDA-zone mapping was dead code and was removed — see [the Trefle field mapping](architecture.md#trefle-field-mapping)); RHS publishes ratings but offers no API or dataset and its content is copyrighted (bulk scraping barred); USDA's APIs map a _location_ to a zone, not a _species_; Wikidata's hardiness properties are effectively empty (23 taxa worldwide). Before this model, every plant's `hardiness_zone_min`/`max` was a single unanchored Claude estimate.

**Decision (Ana, July 14 2026).** The **RHS hardiness rating (H1a–H7) is the canonical field**, a good fit for the Euro/Med-skewed catalog. USDA zone, where shown, is **derived from the rating at render time** (`lib/hardiness.ts`) — never stored alongside. Two columns (migration `20260714164514`): `hardiness_rating text` (CHECK `H1a…H7`) and `hardiness_verified boolean default false`.

**Draft-then-verify flow:**

- **Draft baseline** — `draft-hardiness.ts` rates every plant **blind**, on species identity alone, the same discipline as the cross-check, and leaves `hardiness_verified = false`. Verified rows are never re-selected.
- **Human verification** — a person confirms each rating against RHS public plant pages (reading pages by hand is fine; only bulk scraping is barred) and flips `hardiness_verified = true`, in **priority order: the six garden-style starter palettes first** (highest user exposure); the long tail can stay drafted-but-unverified.

**`hardiness_verified` gates assertion, it doesn't excuse it.** The UI must only present a hardiness claim confidently when `hardiness_verified = true`; unverified rows say nothing or carry a quiet "approximate" marker. This is the opposite of a confidence flag that would license showing unanchored numbers everywhere.

**Re-seed safe by construction.** `hardiness_rating` is **editorial-owned**, the same category as `style_tags` and Ana's editorial corrections. It is not referenced by `upsert_trefle_plant` ([the safe Trefle upsert](architecture.md#safe-upsert)), so a Trefle re-seed physically cannot touch it; `curate-plants` doesn't write it; the draft skips rated/verified rows. Verification work survives re-seeds — the failure mode Ana flagged (like the pre-COALESCE editorial wipe, [the safe Trefle upsert](architecture.md#safe-upsert)) is closed.

**Follow-ups (not built yet):** (1) the UI gating above; (2) then **drop the legacy `hardiness_zone_min`/`max` columns** — "don't store both" — but only _after_ the render path derives from the rating, or hardiness display breaks; (3) once verification is done, record in the build log **what fraction of AI drafts survived RHS verification unchanged vs. got corrected** — that ratio is the real measure of the draft's quality.

**Status: PARKED** (code merged via PR #58, July 15 2026). The rating feeds only the dormant survive-winter bullet, so verification stopped partway and the track waits on that feature plus location wiring being scheduled. Two consequences worth knowing before resuming:

- **The denominator moved.** Verification ran against a much smaller catalog than exists now, so the unverified share has grown with every seed round since — current counts are in [`catalog-state.md`](catalog-state.md), and the gap is larger than the raw verified figure suggests.
- **`round-status.ts` reports `draft-hardiness` at WARN, not FAIL,** precisely because the field is parked. That is correct for a parked field and wrong for a shipped one — it is the same configuration that let round 7's batch go unrated for twelve days. **Promote it to FAIL in the same change that un-parks this work**, not afterwards.

<a id="seasonal-care"></a>

## Care Tips v2: `seasonal_care`, a field built to answer "why now?"

**Supersedes Care Tips v1.** The shipped v1 drawer exposed the
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
Trefle upsert path ([the safe Trefle upsert](architecture.md#safe-upsert)).

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
silently rewrites correct lines. The retired sun-widening sweep taught the same
lesson ([the two-field sun model](#sun-model)).

**Status: COMPLETE**, merged as PR #63 (July 15 2026); coverage is in
[`catalog-state.md`](catalog-state.md). **Weight a review queue by stakes, not
by checker confidence** — triaging those rounds purely by stage distance put
"fertilize during a heatwave", a line contradicting the app's own advice, in the
low-priority pile beside genuine boundary calls. Three editorial rounds over the flags,
including the per-plant decisions and the two systematic checker biases they
exposed, are recorded in [`database-log.md`](database-log.md).

<a id="copy-rules"></a>

## The copy rules, and why they only ever covered one field

Three rulings govern the catalog's prose: no em or en dashes, _autumn_ and never
the US _fall_, and _fertilize_ rather than _feed_ in an instruction. They live in
`lib/copy-rules.ts` and are checked by `pnpm copy:check --round <label>`, which
reads every reader-facing prose field and writes nothing.

Until 2026-08-18 all three were enforced inside `curate-seasonal-care`'s own line
validator, so they were rules about `seasonal_care` and nothing else. Every other
prose field is written by `curate-plants`, which validated none of it. The
measurement is the argument: **88 violations across 780 rows, and 6 of them
introduced by round 13** — this is a live leak, not a legacy one. The same shape
as trap 36: the rule exists, the enforcement covers one field, and nobody asked
about the others.

**A vocabulary ruling is not automatically portable, and that is the reusable
part.** Lifting the fertilize-not-feed rule onto descriptive prose flags about 50
correct sentences — "berries feed birds in autumn", "Japanese beetles may feed on
foliage" — because the ruling is about the gardener's ACTION, not about the word.
So each field is classified `prescriptive` or `descriptive`, and the rule binds
only the first. `fall` needed the same care in miniature: a bare word match flags
"as leaves fall", so the season is identified by its company (a preposition in
front, a season noun behind) and an unaccompanied `fall` is deliberately left
alone rather than guessed at.

**Prevention and enforcement are separate, on purpose.** `COPY_RULES_PROMPT` is
in the drafting prompt so the pass asks for correct copy; the guard is what
fails. The prompt lowers the rate and cannot be relied on — round 13 was drafted
with no copy rule at all and produced the same "Minimal pruning required — ..."
sentence five times.

<a id="hero-images"></a>

## Hero images: a category-recovered shortlist, then an AI vision pick

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
sign-off** ([the curation layer](architecture.md#curation-layer)).

**The review queue is worked in a browser, not in markdown.**
`review-image-picks.ts` writes `reports/image-picks.html`, because reviewing a
photo means looking at it and remote `<img>` tags do not render in a markdown
viewer. Verdicts sit in localStorage so one queue can be worked across several
sittings, and it writes nothing to the database: `apply-image-confirmations.ts`
and `apply-image-reverts.ts` are the separate, deliberate steps that act on the
exported list. Named here because until 2026-08-16 the only pointers to it were
comments inside those two scripts.

<a id="wikimedia-attribution"></a>

## Wikimedia heroes, and the attribution they oblige

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

**It runs in the round now, between the Trefle candidate fetch and the vision
pass** ([the round runbook](round-runbook.md)), and the placement is the design:
widening the pool before the pick means one paid call sees both sources, where
feeding afterwards clears the stamp and buys the same judgement twice. Until
2026-08-18 it fired only from a hand-written "needs a new photo" list, so
"Trefle gave us nothing" never triggered it — round 13 had 3 such plants, and
the only thing that said so was the placeholder on the page.

**Its gate is what makes it safe to run every round**, because the step CLEARS
`image_checked_at` and a book-end runs on every invocation: it selects a plant
only when `shortlist()` — the vision pass's own selector, asked rather than
reimplemented — returns nothing AND the plant carries no Wikimedia candidate
yet, so a second run selects nothing. Pinned in
`scripts/feed-wikimedia-candidates.test.ts`.

**It shrinks the placeholder class rather than ending it**, for two reasons
worth knowing before trusting it. P18 is Wikidata's designated _identification_
image, not a garden hero — round 13's `Malus spectabilis` got a trunk and canopy
with a person in shot, correctly rejected — and nothing takes a second look at
wider Commons when P18 is poor. And the gate is free and deterministic by
choice, so a plant whose candidates are all too small passes it and is rejected
later at probe time.

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

## Why a plant round is shaped the way it is

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

**Theme selection is step 0, and it is a measurement.** `pnpm probe:gap`
(`scripts/probe-gap.ts`) tests a theme's signature palette against the catalog
and kills it at >=70% already held — round 9's rule, because a low tag count is
not a gap until you have checked it is not the data. Rounds 9 to 12 ran this by
hand and recorded only the verdict in a seeder's header, which made the one
measurement that chooses what a round buys the one part of a round nobody could
reproduce; round 12's header is why that matters, since its leading hypothesis
was wrong at 84% held. The probe costs nothing — one paginated catalog read, no
Trefle or Anthropic calls — and writes to `reports/`, which `archive-round.ts`
commits into `rounds/<label>/reports/` at close.

It reports a third thing the percentage cannot: whether a style is
**cultivar-bound**. `gothic` is the emptiest style in the vocabulary and cannot
be filled by any species-level round, because the dark garden is selections of
species already held. A style like that is a cultivar-tier schema question
(standing rule 11's list), not a seed, and the probe says so rather than letting
a low count imply a round.

**Seeding sits outside the runner** because it is where a round's judgment
lives — which species, chosen against which measured gap — and it is a different
script each time. The one rule that never varies is **seed by verified Trefle ID
or exact scientific-name match, never the top name-search hit** (trap 7); name
search resolves to sibling species silently, and woodland genera in particular
have been widely re-segregated, so synonym groups belong in the dry run.

**A plant is cut for being a poor citizen HERE, never for being one somewhere
else** (Ana, 2026-08-18, delegated and decided). Invasiveness is a property of a
plant in a place, not of the plant. This catalog is Euro/Med first, so the test
is whether a species is a bad recommendation for the reader we actually have: an
uneradicable runner in their garden, dangerous, out of scope, too big. Those
reasons are region-neutral and did all the work in round 13, including cutting
`Citrus trifoliata` on thorns and size rather than on its North American status.

**Cutting on non-European invasive status amputates the local flora**, which is
why the rule points the other way: `Lythrum salicaria` and `Iris pseudacorus`
are Balkan natives, and round 5 seeded regional natives on purpose. A rule that
drops them to protect American wetlands is serving the wrong reader. Round 12
cut both on exactly that ground, and its own header predicted the overrule; they
need one re-judgement against the local criterion, which they may well survive,
since both self-seed hard in Europe too.

**The durable answer is a field, not a cut.** "Poor citizen in region X" belongs
beside `native_region` so the app can warn the reader who needs warning, instead
of a seeding decision silently deciding for everyone. That is a schema ask and
lives on standing rule 11's deferred list, not here.

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

**A held tag finding is a live defect, not a parked warning.** A held image
waits on a photograph nobody has; a held tag means the catalog is wrong right
now. Scan a round's `editorial-<n>.md` for `tags:` blockers before calling it
done.

**Editorial sign-off is genuinely last**, not merely numbered last: it judges
the output of every step above, so it cannot run until they have. Nothing else
in the pipeline touches `is_curated` ([the curation layer](architecture.md#curation-layer)) —
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
