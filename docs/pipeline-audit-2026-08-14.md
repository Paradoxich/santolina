# Pipeline audit, 2026-08-14

Scope: 66 scripts, 28 recorded traps, 61 existing test invariants, worktree `santolina-pipeline-audit` at main.

> **A DATED SNAPSHOT, NOT CURRENT STATE. Read this before believing any sentence
> below.** Everything here is written in the present tense as of 2026-08-14 and
> several of its central findings have since been fixed. It is kept unedited
> because it is the record of what was true then and what was decided from it —
> correcting findings in place would destroy the reasoning the fixes came from.
>
> Known-stale, verified 2026-08-16:
>
> - **"not one of the 28 traps has ever become a test"** (§1). Nine of thirty are
>   pinned now, and `invariants:check` prints the remaining count on every green
>   run.
> - **`seed-plants.ts` taking `results[0]` unverified, and having no `--dry-run`**
>   (§85). Both closed: every seeder resolves through `species-resolver.ts`, and
>   `README.md` shows `--round` and `--dry-run`.
> - **`docs/architecture.md:141` "claims behaviour it does not have"** (§85). That
>   paragraph was rewritten; it now describes the resolver.
> - **The archive candidates and line numbers** in §3 rows 3+ were already flagged
>   as pass-through and unverified by this document's own §101 and §154.
>
> For current state: `docs/database-log.md` (traps and sessions),
> `docs/write-provenance.md` (what a writing script must do), and
> `pnpm invariants:check`, which prints its own backlog rather than asserting one.

---

## 1. Verdict

The pipeline is structurally sound in shape and unsound in enforcement: the step registry, the scope module, `lib/paginate.ts`, manifests and the catalog backups are real machinery and mostly correct, but the guards that prove work happened are repeatedly written against the wrong witness, either a column value that the schema makes impossible, or a stamp written before the answer arrived. Nine confirmed defects reduce to three root causes: a predicate that cannot fire, a stamp that asserts more than the code proved, and one fact living in two to seven files. Nothing here needs a rewrite; what is missing is that not one of the 28 traps has ever become a test, which is exactly why each session's new script re-enters the same three shapes.

---

## 2. Confirmed findings

Ranked by realised harm first, latent second. Every claim below survived a skeptic pass; where the skeptic cut a claim back, the correction is stated.

### F1. The `style_tags` dead-predicate family (critical, real damage, unrepaired)

`style_tags` is `text[] not null default '{}'` (`supabase/migrations/20260706093045_initial_schema.sql:63`, never altered), so PostgREST returns `[]` and never `null`. Three live sites test it for null anyway. `curate-plants.ts` had the same bug and was fixed on 2026-08-14 (commit d939bb3, now `!plant.style_checked_at` at `:152` and `:334`); these three were left behind.

**1a. `apps/web/scripts/backfill-guard-stamps.ts:262` (the damage).** `noJudgment = inScope.filter(r => r.style_tags === null)` is always empty, so the only live condition on `writable` (`:266-268`) is `ai_drafted_at !== null`. It wrote `style_checked_at = ai_drafted_at` (`:303-311`) onto the 100 rows in the rounds 9 and 10 manifests whose `style_tags` are empty. Those stamps are still in the database. TypeScript missed the dead comparison because `PlantRow:122` hand-declares `style_tags: string[] | null`, wider than the schema.
_Corrected:_ blast radius is bounded to `unstamped ∩ (round 9 ∪ round 10 manifests)` via `STYLE_BACKFILL_ROUNDS:180`, not the whole catalog, and a re-run today writes zero rows (`.is('style_checked_at', null)` at `:309`), so the function is spent, not live-dangerous.
**Fix:** delete `backfillStyleStamps` and its call site at `:386`, then run `curate-styles --round 9` and `curate-styles --round 10` as two separate runs without `--new-only`.

**1b. `apps/web/scripts/verify-round.ts:171` (a documented guarantee that does not exist).** `if (p.style_tags === null)` is the file's only `style_tags` assertion and can never fire; the header contract at `:14-15` ("NULL fails, `[]` passes") and the `REQUIRED_DRAFTED_FIELDS` comment at `:85-86` both describe a check that is not there, and `:85-86` points at a `checkStyleTags` function that does not exist. `checkPlants` does not even select `style_checked_at` (`:117-121`), so it cannot substitute a stamp test.
_Corrected:_ round close is not unguarded. `round-status.ts:214-220` requires `ai_drafted_at && style_checked_at && greenery_checked_at` at level FAIL, and `checkRoundCompleteness` exits 1 on it, so `verify-round --round <label>` does fail an unstamped round. Do not add a catalog-wide `!style_checked_at` FAIL to `checkPlants`; it duplicates the `curate-styles` STEP_DEF and reds every legacy row.
**Fix:** delete the dead branch and the two comments describing it, correct the header to say style is proven by the `curate-plants` step's `style_checked_at` evidence, and add a FAIL for `style_checked_at NOT NULL AND style_tags.length === 0`, which is the state that actually exists.

**1c. `apps/web/scripts/catalog-state.ts:168` (the report asserted the opposite of the truth for three rounds).** `count(p => p.style_tags === null)` is unreachable-zero and has printed 0 in all 16 committed versions of `docs/catalog-state.md`. The adjacent row at `:165` reported the 100 empty rows as deliberate "style-neutral (`[]`, a valid judgment)" verdicts: 34, then 84, then 134 as rounds 9 and 10 landed.
_Corrected:_ this was not the only signal. The generated coverage row showed `curate-styles | style_checked_at` at 92.2% after round 9 and 85.6% after round 10; commit a2e3dac (2026-07-30) stamped the 100 rows and returned it to 100%, so one indicator was structurally dead and the other was actively falsified. `style_checked_at` is already in the Row interface at `:57` and the query is `select('*')`, so nothing needs adding there.
**Fix:** split the two rows on the stamp (`never judged = style_checked_at == null`, `style-neutral = stamp set && length === 0`), which only reports honestly once the rounds 9 and 10 stamps from 1a are cleared.

---

### F2. `cross-check-native-region` stamps disagreements it never applied (critical, fired again in round 11)

`apps/web/scripts/cross-check-native-region.ts:529` gates the write (`if (opts.apply) await applyCorrections(...)`) while `:531` stamps unconditionally; `stampChecked` at `:453-468` excludes only verdict `no-data`, so every `disagrees` row gets `native_region_checked_at`. `runbook.ts:109-113` invokes step 5b with no `args`, unlike 4a which carries `args: ['--apply']` at `:101`, so the automated path never applies anything. `round-status.ts:254-265` treats that same stamp as FAIL-level proof the step ran, and `verify-round.ts:391` enforces STEP*DEFS off it, while `verify-round.ts:183-188` only fails on an empty `native_region`, never a wrong one. The script warns at `:539-544` and exits 0, so `run-round` continues and the round closes green. Nothing reads `reports/native-region-crosscheck.json` (its only references are the script's own `:28`, `:81`, `:82`), and `regenerate-native-region` runs at steps 4 and 4a, before 5b, so it cannot pick the findings up either.
\_Corrected upward:* the consequence is not only exclusion from later `--new-only` sweeps, it is positive certification at round close. `docs/database-log.md:377` records this firing again on 2026-08-14 in round 11, leaving two corrections stamped-but-pending. The same unconditional-stamp shape exists at `cross-check-plants.ts:452` and `cross-check-native-to.ts:830`.
**Fix:** withhold the stamp from rows whose correction was not written (`disagrees` unless `--apply`, `no-native-range` unless `--apply --allow-empty`), or add `args: ['--apply']` to the 5b runbook entry, but not both.

---

### F3. `regenerate-native-region --apply` replays a scope-less, gitignored plan (critical, already spilled once)

`apps/web/scripts/regenerate-native-region.ts:588` short-circuits: `if (isApply) { await apply(); return }`, before the scope parse at `:594`. `apply()` at `:508` reads `reports/native-region-regen.json`, destructures only `{ plan }` at `:514`, and updates every entry by id at `:533` with no scope filter and no `scopeGuard`. The plan file records no scope and no time (`:447` writes `{ generatedAt: null, plan }` with a literal null), and `reports/` is gitignored (`.gitignore:17`), so a stale plan from an earlier `--all` is indistinguishable from the current round's. The round runner actually passes a label that is then discarded: `run-round.ts:52-57` prepends `--round <label>` and `runbook.ts:98-101` appends `['--apply']`. It is a per-round FAIL step (`round-status.ts:228`). The private `parseScope` at `:570` returns `{kind:'all'}` for `--all` without checking for a conflicting `--round`, and the file never imports `scripts/scope.ts`, so neither the ambiguity throw nor `requireReasonForAll` applies. A replay also nulls `native_region_checked_at` on every changed row (`:529-532`), destroying WCVP validation as well as tags. The in-file note at `:552-562` records this shape changing 20 pre-existing plants in round 8.
_Corrected:_ the generate path is loud, not silent (`:325-329` prints a FULL CATALOG banner); the silent path is `--apply`. `check-round-scope.ts` would catch such a spill after the fact (its header cites this incident), but it is post-hoc, needs a pre-round baseline, and `verify-round.ts` never consults it.
**Fix:** delete the private `parseScope`, import `requireScope`/`parseScope`/`scopeIds`/`scopeGuard` from `scripts/scope.ts`, and record `{scope, generatedAt, plan}` into the plan JSON so `--apply` can refuse a plan whose scope does not match the command line.

---

### F4. `ai_drafted_at` is stamped before any field is decided; 17 columns have no proof of write (critical, systemic)

`apps/web/scripts/curate-plants.ts:282` makes `ai_drafted_at` the first line of `buildPatch`, the patch is applied unconditionally at `:479`, and `:481-494` prints `✓ ()` and increments `succeeded` even when the substantive field list is empty (`buildPrompt` has no early return when nothing is missing). Columns written by `buildPatch` and proven by nothing anywhere: `garden_use_tags:341`, `bloom_months:365`, `water_needs:367`, `water_needs_summary:369`, `light_needs:371`, `soil_needs:373`, `maintenance_notes:375`, `common_issues:377`, `best_placement:379`, `environment_benefits:381`, `height_min_cm`/`height_max_cm:298,300`, `spread_min_cm`/`spread_max_cm:302,304`, `hardiness_zone_min`/`max:312,314`, `native_to:385`, plus `sun_tolerates:360` (`verify-round.ts:217-225` only checks disjointness, which `[]` satisfies). The backstop covers eight fields: `REQUIRED_DRAFTED_FIELDS` (`verify-round.ts:88-95`), the `style_tags` null test (dead, see F1b), and `sun_thrives` (`:210`); the bloom and foliage colour checks validate values that exist and pass vacuously on empty. All 17 are live in the app (`bloom_months` 36 references, `environment_benefits` 12, `height_max_cm` 11, `water_needs` 9, `native_to` 7).
_Corrected:_ the step's evidence is not purely vacuous, `style_checked_at:334-337` and `greenery_checked_at:350-353` are conditional on the response actually carrying those answers; only `ai_drafted_at` is unconditional. Two proposed value-checks are unsafe: `bloom_months` is `not null default '{}'` (migration `20260706093045:55`), so a non-empty assertion reproduces trap 26 and it needs a stamp column instead, and failing a row with an empty substantive patch would false-fail legitimate re-runs over populated rows.
**Fix:** skip the Claude call entirely when `missing` is empty, stamp `ai_drafted_at` only when the patch carries at least one field, and extend `REQUIRED_DRAFTED_FIELDS` with the always-required prose fields (`water_needs`, `water_needs_summary`, `light_needs`, `soil_needs`, `maintenance_notes`, `best_placement`, `garden_use_tags`, `native_to`) plus hardiness zones conditional on `plant_type != 'annual'`.

---

### F5. `native_to_reviewed_at` has 151 stamps, zero writers, and no registry entry (critical, decays monotonically)

The column (`supabase/migrations/20260813110500_native_to_reviewed_stamp.sql:31`) gates real behaviour: `cross-check-native-to.ts:556-560` drops stamped rows from the partial-gap queue. Its only write in repo history is the one-time backfill at migration `:74-231` (exactly 151 rows). Every other reference is a read (`cross-check-native-to.ts:134, 204, 560, 567, 775, 812`). Three code paths change `native_to` without re-asserting the stamp in the same statement, so the trigger `invalidate_native_to_review` (migration `:36-64`, clearing branch `:51-53`) withdraws it: `cross-check-native-to.ts:712`, `apply-native-to-fixes.ts:116`, `archive/regenerate-native-to.ts:169`. The registry cannot see the drain: `round-status.ts:498` filters `_checked_at || _verified_at`, so `unregisteredStampColumns()` never yields it and `verify-round.ts:417` can never report it. The sibling guard `check-round-scope.ts:87-90` added `_reviewed_at` to its pattern in commit 8aae847, the same commit that shipped the migration; that commit did not touch `round-status.ts`.
_Corrected:_ the trigger clearing on a phrase edit is deliberate and documented (migration header `:17-23`, mirroring `invalidate_editorial_verdict`); the defect is that no writer can ever re-assert one.
**Fix:** add `|| c.endsWith('_reviewed_at')` at `round-status.ts:498`, then give the column a real writer, a `--review-keep` path that sets `native_to_reviewed_at` in the same UPDATE as any `native_to` change, applied to all three writer sites.

---

### F6. `apply-sun-widening.ts` prints success for writes Postgres discards (critical, false signal)

`apps/web/scripts/apply-sun-widening.ts:273-280` writes only `sun_requirements`, which `trg_sync_sun_requirements` (`supabase/migrations/20260709220000_sun_thrives_tolerates.sql:47-67`) recomputes from `sun_thrives`/`sun_tolerates` on any UPDATE where either source is non-empty, true of all 720 rows. `:288` pushes to `applied` on any non-erroring update, so `:294` prints "Widened N plant(s)" and `:298` prints per-row `✓ from → to` with no read-back. Reachability is near zero anyway: `:195` and `:201` admit only single-value 'under-reported tolerance' flags, and the four committed cross-check reports contain exactly one such flag (round 8, Chinese rice-paper plant), which is multi-value and skipped. Separately `:47-48` prints a stale round order that contradicts both the file's own `:2-8` and `RUNBOOK`, breaking the rule stated at `runbook.ts:12-14`.
_Corrected:_ the neutralization is disclosed in the header at `:2-8`; the defect is that the runtime output contradicts it. The trigger is guarded and only recomputes when a source field is non-empty, so it is not "every UPDATE" in general, only for every row that currently exists. The proposed retarget must be `sun_tolerates = checked minus sun_thrives`, since a plain assignment violates `plants_sun_thrives_tolerates_disjoint`.
**Fix:** move it to `apps/web/scripts/archive/` with a README row saying it is neutralized by `trg_sync_sun_requirements`, and delete the stale round-order line at `:47-48`.

---

### F7. The species resolver is copy-pasted into seven seeders and its synonym table has lost entries (major)

The block from `genusSynonyms` to `main` is logic-identical in `seed-round6.ts:189`, `seed-round7.ts:191`, `seed-round8.ts:216`, `seed-round9.ts:249`, `seed-round10.ts:194`, `seed-round11.ts:200`, `seed-regional-natives.ts:207` (round8 == round9, round10 == round11 by hash; the rest differ only in comments and the regional variant's older `resolve(name: string)` signature). Only the `SYNONYM_GENERA` literal varies and it is carried forward by hand: round6 had 7 groups, round7 (`:185`) kept none of them, round8 (`:202`) kept one of round7's three, and round11 (`:161-197`, 34 groups) still lacks `corydalis/pseudofumaria`, `dorycnium/lotus`, `perovskia/salvia`, `citrus/fortunella`, `matricaria/chamomilla` and seven of `seed-regional-natives`'s eleven. `verify-round.ts:257-272` keys duplicate detection on `scientific_name` alone, so two synonyms of one species are two keys and it passes; the `common_name` check at `:274-293` might fire but Trefle often returns null there. No script reads Trefle's own `synonyms` array (`lib/trefle.ts:101`).
_Corrected:_ the Perovskia atriplicifolia / Salvia yangii example cannot work, `sciMatches` (`seed-round11.ts:220-225`) requires an identical species epithet before consulting the genus table, and `seed-round11.ts:65-71` says so. The real exposure is same-epithet pairs the round 11 snapshot already holds one side of: Hippocrepis emerus, Stachys officinalis, Silene coronaria, Allium siculum, Cota tinctoria, Asplenium scolopendrium, Citrus japonica, Pseudofumaria lutea. A missing group usually produces a visible "no exact Trefle match" miss; a silent duplicate needs Trefle to also hold a distinct record under the synonym spelling and return it first. Four of the regional eleven do survive inside round 11's wider sedum, persicaria, berberis and anemone groups.
**Fix:** move `SYNONYM_GENERA`, `genusSynonyms`, `normSci`, `sciMatches`, `resolve` and `fetchCatalog` into one shared module seeded with the union of all seven tables, the way `scripts/catalog-identity.ts` already consolidated the dedupe read.

---

### F8. The documented seed path is the weaker of the two (major, latent until someone follows the README)

`apps/web/scripts/seed-plants.ts:322-336` resolves a name by taking `results[0]` from `searchSpeciesByName` (`lib/trefle.ts:384`, a bare relevance-ordered passthrough) with no check that the species returned is the one asked for, which is the exact sibling drift all seven dedicated seeders were written to prevent (their headers say so at `seed-round6.ts:6`, `seed-round7.ts:34`, `seed-round8.ts:33`, `seed-round9.ts:72`). Yet `README.md:119` makes it step 1 of the round and `apps/web/package.json:12` wires `pnpm seed` to it, while no doc mentions `seed-round*.ts` at all. `docs/architecture.md:141` claims behaviour it does not have ("matched on scientific name, then on resolved Trefle ID to catch synonym remaps"): the ID check at `:412` only fires when the unverified top hit happens to be the record already held, so on a real remap it passes and the wrong species is seeded. It also has no `--dry-run`, which all seven round seeders do.
_Corrected:_ it seeded rounds 1 to 5; the accurate statement is that it has not seeded a round since round 5. It is currently harmless because the name skip at `:396-404` runs before `resolveId` and every shipped `SEED_LIST` entry is already in the catalog, so a default run writes nothing.
**Fix:** have `seed-plants.ts` import the shared resolver from F7 and delete `resolveId`, then correct or delete the synonym-remap sentence at `docs/architecture.md:141`.

---

### F9. `cross-check-native-to` stamps rows whose `native_to` is null (major, latent, 0 rows today)

`apps/web/scripts/cross-check-native-to.ts:331` sends `plant.native_to ?? '(none)'` to the judge and `:163` stamps `native_checked_at` after any judgment; the fetch at `:771-780` does not filter on the phrase being present and `--new-only` (`:777`) filters only on the stamp. `round-status.ts:241-247` accepts that stamp as the step's whole FAIL-level evidence, and `native_to` is absent from `verify-round.ts`'s `PlantRow` (`:47-68`), its select (`:124-128`) and `REQUIRED_DRAFTED_FIELDS` (`:88-95`), so it is never read there. `curate-plants.ts:384` is fill-only and `:405` scopes to `is_curated = false`, so a signed-off row missing the phrase can never be topped up.
_Corrected:_ this is not "no native range at all", the structured `native_region` is separately FAIL-checked and derivable from Trefle L3 without the phrase; what disappears is the "Native to" row on the plant page (`DetailsSection.tsx:28` filters falsy values). The row is also visible in the report's `no_data` bucket, it escapes the automated gate rather than a reader. Reachability is narrow (valid JSON that omits `native_to`), and it has never occurred: 0 empty-`native_to` rows across every archived snapshot in `apps/web/rounds/{8,9,10,11}/catalog`.
**Fix:** skip rows with a null `native_to` in the fetch at `:771` and report them as a gap instead of stamping them, mirroring `pick-plant-images.ts:1056`.

---

## 3. Traps that should become tests

Ranked by (probability of recurrence x cost of the failure) / cost of the test. Rows 1 and 2 are skeptic-checked. Rows 3 and below are proposals passed through unverified; treat their line numbers as unconfirmed.

| #   | Trap                                                    | Test file                                           | Checked |
| --- | ------------------------------------------------------- | --------------------------------------------------- | ------- |
| 1   | 24: report-only run stamps what it did not fix          | `scripts/cross-check-native-region.test.ts`         | yes     |
| 2   | 3: one-time migration script keeps whole-table scope    | `scripts/regenerate-native-region.test.ts`          | yes     |
| 3   | 26: `== null` guard on a NOT NULL DEFAULT column        | `scripts/curate-plants.test.ts`                     | no      |
| 4   | 2: `--new-only` used as a run's only scope              | `scripts/scope.test.ts` (new block)                 | no      |
| 5   | 7: seeding from the top Trefle search hit               | `lib/sci-name.test.ts`                              | no      |
| 6   | 19: `toContain(expect.stringMatching())` always passes  | `scripts/assertions.test.ts`                        | no      |
| 7   | 5 + 6: unmapped colour values, duplicate names          | `lib/plant-colors.test.ts` over the newest snapshot | no      |
| 8   | 1.1: re-asserting a verdict stamp in the same UPDATE    | `scripts/trigger-callers.test.ts`                   | no      |
| 9   | 11: GBIF `HIGHERRANK` accepted as a species match       | `scripts/wcvp-lookup.test.ts` (new block)           | no      |
| 10  | 23: free-text vs vocabulary false positives             | `scripts/cross-check-native-to.test.ts`             | no      |
| 11  | 9: Trefle `tdwg_code`/`tdwg_level` field names          | `scripts/regenerate-native-region.test.ts`          | no      |
| 12  | 22: correcting a field without nulling its stamp        | same file as row 2                                  | no      |
| 13  | 20: LLM judge citing a fault the filter ruled out       | `lib/editorial-standard.test.ts`                    | no      |
| 14  | 16: `cleared_at` demotion rule                          | `scripts/check-round-scope.test.ts`                 | no      |
| 15  | 15: callers reading the raw WCVP cache                  | `scripts/wcvp-lookup.test.ts`                       | no      |
| 16  | 21: `auth.admin.listUsers` 500s                         | `lib/purge-demo-users.test.ts`                      | no      |
| 17  | 12: manifest `common_name` goes stale after a name pass | `scripts/round-manifest.test.ts`                    | no      |

**Sketches for the top five.**

1. Extract `export function rowsToStamp(findings, apply, allowEmpty): string[]` from `cross-check-native-region.ts` and call it from `stampChecked` (`:453`). Cases: `no-data` never stamped; `disagrees` only when `apply`; `no-native-range` only when `apply && allowEmpty` (`applyCorrections:386-391` withholds it otherwise); `match` and `reviewed` always. The signature needs `allowEmpty` because the verdict union at `:152` has five members. One case stays outside a pure selector, `applyCorrections`'s stale-row skip at `:406-413` is still stamped, so either return applied/skipped ids from `applyCorrections` or record that gap in the test file. Name it "a report-only run does not stamp a disagreement it did not fix".

2. After the F3 fix, add `export function assertPlanScope(planScope, argvScope)` and test: plan from `--all` replayed under `--round 11` throws; plan from `--round 11` under `--round 11` passes; plan with no recorded scope (legacy file) throws rather than being trusted.

3. Extract `export function buildCuratePatch(plant, response)` and assert that a row with `style_tags: []` and `style_checked_at: null` plus a response carrying `style_tags: []` yields a patch containing both keys, which is the case the old guard could not reach; that an already-stamped row yields neither; and the same pair for `is_greenery`/`greenery_checked_at` with a `false` answer. Assert on the stamp, never on tag count: 134 of 720 rows in the round 11 snapshot legitimately carry a stamp with empty tags.

4. Source scan in `scope.test.ts`: for every `apps/web/scripts/*.ts` containing `'--new-only'`, assert it also contains `requireScope(`, quoting the rule at `cross-check-native-to.ts:751-757`. Second case: every column in `registeredStampColumns()` is named either in `backfill-guard-stamps.ts` or in an exported `NO_BACKFILL_NEEDED` record with a reason, so a new stamp column cannot ship with an unexplained NULL baseline (none of the six stamp migrations carries one).

5. After the F7 consolidation, unit-test the shared resolver: sibling rejection (`Acer palmatum` must not match `Acer japonicum`), synonym-genus acceptance with an identical epithet, hybrid-marker stripping, author-string tolerance. Add a source scan asserting every `seed-round*.ts` calls `sciMatches(` and that `results[0]` is only ever assigned to a drift-logging variable, never returned as the resolution.

---

## 4. Dead, duplicated and spent scripts

| Script                                                     | State                                                                                                                                                              | Action                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `backfill-guard-stamps.ts:231-315` (`backfillStyleStamps`) | Spent and harmful: wrote the 100 bad stamps, now inert (all targets stamped, write guarded at `:309`), still called unconditionally at `:386`                      | Delete function and call site (F1a)                                      |
| `apply-sun-widening.ts`                                    | Neutralized by `trg_sync_sun_requirements`, one reachable flag in four rounds and even that is skipped, still cited as a pattern by three live scripts             | Archive with a README row (F6)                                           |
| `seed-plants.ts` vs 7 dedicated seeders                    | Documented and package.json-wired path has not seeded a round since round 5; resolver duplicated 7 times with a lossy data table                                   | Shared resolver, then fix the docs (F7, F8)                              |
| `wikimedia-image-proof.ts:98`                              | Zero references repo-wide; its decision shipped; hand-rolls `resolveP18`/`fetchCommonsImage` that now live in `lib/wikimedia.ts` (unverified)                      | Archive with a README row                                                |
| `backfill-legacy-editorial.ts`, `repair-combinations.ts`   | Zero references anywhere including `docs/database-log.md`, unlike every other spent script here (unverified)                                                       | Archive or add one log line each; do not delete                          |
| `backup-catalog.ts:25`, `restore-catalog.ts:97`            | Third and fourth hand-rolled copies of the page loop `lib/paginate.ts` exists to be (unverified)                                                                   | Call `fetchAllRows`                                                      |
| `cross-check-plants.ts:282` sun audit                      | Produces 33 flags across four rounds against a derived mirror column no writer can set, and its only consumer is the neutralized `apply-sun-widening` (unverified) | Retarget at `sun_thrives`/`sun_tolerates` or declare it read-only signal |
| Nothing at all                                             | No guard notices a file in `scripts/` that nothing references; the column-side inverse check already exists (unverified)                                           | Add a source-only readdir check to the CI `check` job                    |

---

## 5. Unverified pass-through findings

Not skeptic-checked. Line numbers and counts here are as reported by the first pass and should be confirmed before acting. The trap-to-test proposals in section 3 rows 3 to 17 are also pass-through.

- **`apps/web/scripts/fix-round11-names.ts:188` (major).** The collision pre-check, the safety feature that distinguishes it from `fix-round8-names.ts`, reads the catalog with a bare `.select('scientific_name, common_name')`, no `.range()`, no `fetchAllRows`, while its comment claims whole-catalog coverage; it works at 720 rows and stops working the round the catalog passes 1000, at which point the refusal at `:204-212` stops firing and the pass writes the collision it exists to prevent. **Fix:** route both this and `fix-round8-names.ts` through `fetchAllRows` from `lib/paginate.ts`, ordered by id.
- **`apps/web/scripts/backfill-legacy-editorial.ts:96` (minor).** It derives `editorial_checked_at` from `is_curated` (`:53-54`, `:96-101`), the exact inference migration `20260728220852:23` says is invalid and `round-status.ts:366-370` insists against, and it carries no scope limiting it to the settled round 7 population. **Fix:** pin it to the round 7 manifest ids and have it exit clean when that set is already stamped, the way `backfill-guard-stamps.ts:354` refuses a group whose live count disagrees with its evidence.
- **`apps/web/scripts/draft-hardiness.ts:135` (minor).** `plants.hardiness_verified` (migration `20260714164514:12`) has three read sites and zero writers, so the confident-display gate in `lib/hardiness.ts` is permanently false, and being neither `_at` nor `_verified_at` it escapes `unregisteredStampColumns()`. **Fix:** while hardiness is parked, just record it; either add the script that flips the flag or drop the column and the gate.
- **`apps/web/scripts/round-status.ts:378` (minor).** `ai_drafted_at` is the `curate-plants` step's evidence but has no `stampColumn`, so it is absent from `registeredStampColumns()`, and `unregisteredStampColumns()` at `:498` matches only two of the three suffixes now in use on `plants`. **Fix:** make the suffix set one named constant covering `_checked_at`, `_verified_at`, `_reviewed_at` and `_drafted_at`, share it with `check-round-scope.ts:87`, and let a step declare more than one stamp column.
- **`apps/web/scripts/verify-round.ts:302` (minor).** `checkCombos` reads only `plant_id_a, plant_id_b` (`:137`), so a `plant_combinations` row with null `combination_type`, `strength` and `notes` passes every check while the companion card has nothing to show. **Fix:** add those three columns to the `ComboRow` select and FAIL on a null in any of them.

---

## 6. Refuted claims

One line each, so the next audit does not re-find them.

- "verify-round can never fail a round for unjudged style tags": false, `round-status.ts:214-220` has made `style_checked_at` FAIL-level evidence since 2026-08-14.
- "curate-plants still carries the `== null` style guard at `:326-333`": false, fixed in commit d939bb3, the live guards are `!plant.style_checked_at` at `:152` and `:334`.
- "the 100 rounds 9/10 rows are unreachable by every writer": false, `curate-styles --round 9` without `--new-only` reaches and overwrites them.
- "the rounds 9/10 repair needs `--all --why`" (as `docs/database-log.md` trap 26 states): false, a round scope reaches those rows and is cheaper; that doc line is itself wrong.
- "`curate-styles --round 9 --round 10`" as a single command: impossible, `scope.ts:65-68` permits exactly one scope flag, so it must be two runs.
- "re-running backfill-guard-stamps could damage more rows": false, its targets are the rounds 9/10 manifests, all already stamped, and the write is guarded `.is('style_checked_at', null)` at `:309`.
- "the catalog-state gap metric was the one number that would have surfaced the style gap": false, the coverage row showed 92.2% then 85.6% until commit a2e3dac stamped it back to 100%.
- "the `curate-plants` step evidence is entirely vacuous": false, `style_checked_at` and `greenery_checked_at` are conditional on the response content; only `ai_drafted_at` is unconditional.
- "add a catalog-wide `!style_checked_at` FAIL to `checkPlants`": rejected, it duplicates the `curate-styles` STEP_DEF and reds every pre-stamp legacy row.
- "`bloom_months` should get a required-value check": rejected, it is `not null default '{}'` so the check reproduces trap 26; it needs a stamp column.
- "apply-sun-widening's neutralization is undisclosed": false, its header says so at `:2-8`; the defect is that the runtime output contradicts the header.
- "the sun trigger recomputes on every UPDATE": false, it is guarded and only recomputes when a source field is non-empty, so an unsplit row would accept the write.
- "retarget apply-sun-widening at `sun_tolerates = checked`": rejected, it violates `plants_sun_thrives_tolerates_disjoint`; it must be `checked` minus `sun_thrives`.
- "`--all --round 11` silently resolves to the whole catalog in regenerate-native-region": half false, the generate path prints a FULL CATALOG banner at `:325-329`; only `--apply` is silent.
- "nothing catches an out-of-scope spill": false, `check-round-scope.ts` catches it post-hoc, though `verify-round.ts` never consults it.
- "`SYNONYM_GENERA` would have prevented the Perovskia atriplicifolia / Salvia yangii duplicate": false, `sciMatches` requires an identical epithet before consulting the genus table (`seed-round11.ts:220-225`).
- "none of seed-regional-natives' eleven synonym groups survive in round 11": false, four survive inside wider groups; seven are missing.
- "seed-plants.ts has never seeded a round": false, it seeded rounds 1 to 5; it has not seeded one since.
- "a stamped null `native_to` means a plant with no native range at all": false, `native_region` is separately FAIL-checked; only the user-facing prose phrase is missing, and 0 rows exhibit it today.
- "the null-`native_to` row is invisible in the guard's report": false, it lands in the `no_data` bucket and prints in the console line.
- "a two-argument `rowsToStamp(findings, apply)` is sufficient": false, the verdict union has five members and `no-native-range` also depends on `allowEmpty`.
- "trap 24 rows are merely skipped by later `--new-only` sweeps": understated rather than wrong, they are positively certified as done by `round-status.ts:254-265`.
