# Schema Design Review, Santolina Catalog Pipeline

**Date:** 2026-08-14 · **Base:** worktree `santolina-pipeline-audit`, branch `session/2026-08-14-pipeline-audit` (HEAD `a5bc9b2`) · **Live DB:** project `alanccjebmoyrcogvzcw`, read-only · **Companion:** `docs/pipeline-audit-2026-08-14.md`

> **A DATED SNAPSHOT, NOT CURRENT STATE. Read this before believing any sentence
> below** — including the verdict, which is the part most likely to be quoted.
> Kept unedited because it is the record of what was true on 2026-08-14 and what
> was decided from it.
>
> Known-stale, verified 2026-08-16:
>
> - **The verdict's central claim — stamp columns "written by 25 scripts with no
>   shared writer, no shared vocabulary and no mechanical check" — is false on all
>   three counts now.** `run-provenance.ts` is the shared writer path,
>   `stamp-columns.ts` is the shared vocabulary, `check-pipeline-invariants.ts` is
>   the mechanical check.
> - **The security defect in the verdict is closed.** `upsert_trefle_plant` was
>   locked down by migration `20260815230948`, and main's migration-drift job is
>   green, so it is applied to production rather than merely committed (trap 14).
> - **"today nothing reads [Trefle's] `synonyms[]`"** (§251). `species-resolver.ts`
>   reads it as a second matcher.
> - **Stamp coverage counts** (§336) and **suite size** (§408) are 2026-08-14
>   readings. Live catalog numbers belong in `docs/catalog-state.md`, which is
>   generated; the suite is larger now.
>
> Its §405 self-correction and §154 pass-through warning still apply to
> everything they name. For current state see `docs/database-log.md` and
> `docs/write-provenance.md`.
>
> **Where §3's sequencing stands, checked 2026-08-16.** Check the ratchet before
> acting on anything below: a ratchet entry fails the day its defect is fixed,
> and this page never will.
>
> - **"Must be true before the next data round", items 1-10: done.** The grant is
>   closed by migration `20260815230948`, the style stamps repaired, the resolver
>   consolidated, artifacts (a), (b) and (c) shipped, `REQUIRED_DRAFTED_FIELDS`
>   extended, and item 10's shared suffix constant is `scripts/stamp-columns.ts`.
> - **Item 11** (migration-drift content check) needs `applied_migrations()` to
>   return `statements`, so it is a deferred SCHEMA change and belongs on standing
>   rule 11's list, not here.
> - **Item 12** (`restore-catalog`'s diff excluding trigger-derived columns) and
>   the "can wait" code items — the `curate-editorial` withdrawal fix, the
>   `curate-styles` withdrawal counter, `purge-demo-users`' storage-failure record
>   — are **not routed**. Each is a real code defect that a witness could express;
>   none has been re-verified against today's code, and recording an unverified
>   finding as tracked is the failure this whole mechanism exists to prevent.
> - **The rest of "can wait" is design, not defect** — generated row types, a
>   generated data contract, the replay job, the `garden_use_tags` bucket map, the
>   `writePlant` RPC collapse, `NOT NULL` on `scientific_name`, the unordered-pair
>   index. Code cannot compute whether the product still wants these, so they
>   belong in the Notion **Build Backlog** or on rule 11's list, and moving them
>   there is Ana's call rather than a session's.
>
> That unrouted middle row is why this page is still here.

---

## 1. Verdict

The catalog schema is sound where it is load-bearing: the four `plants` triggers (`sync_sun_requirements`, `invalidate_editorial_verdict`, `invalidate_native_to_review`, `set_updated_at`) are all withdrawal-or-derive and never reject, which is what lets bulk passes and `restore-catalog` run at all; the per-row single-statement-plus-state-predicate write shape makes every pass crash-resumable without transactions PostgREST cannot provide; and a full replay of all 37 migrations onto the local stack is byte-identical to production on columns, constraints, indexes and policies (four md5 fingerprints, both sides). What is not sound is the layer above the schema: 13 timestamp stamp columns (plus the boolean `hardiness_verified`) are written by 25 scripts with no shared writer, no shared vocabulary and no mechanical check, so a stamp can and does certify work that was never done, and `docs/database-log.md` is the only registry of any of it. One outright security defect sits in the migrations rather than in production drift: `upsert_trefle_plant` is `SECURITY DEFINER`, owned by a `BYPASSRLS` role, with `EXECUTE` granted to `PUBLIC`, reachable by the anon key on both prod and a fresh replay.

---

## 2. Confirmed findings

Skeptic-checked. Each claim below is the corrected version; where a skeptic cut a claim back, the cut is stated inline.

### 2.0 Order, and one argued deviation

The brief asks for section 3 (stamps) first, then 8, then 9, then the rest. One finding argues for hoisting: **the `upsert_trefle_plant` grant (section 7) goes first**, because it is the only finding in the set that is (a) exploitable by an unauthenticated caller today, (b) sourced in the migrations so every restore and every replay reinstates it, and (c) cheap to close. Everything else is an integrity or process defect whose worst case is bad catalog data; this one lets a stranger insert catalog rows and flip `is_curated`. After it, the brief's order stands.

---

### F-0 (hoisted). `upsert_trefle_plant` is EXECUTE-to-PUBLIC, SECURITY DEFINER, BYPASSRLS owner, mutable search_path

**Severity: critical · Cost: cheap · Gate: before next round · Section 7**

Prod `pg_proc`: `prosecdef=true`, `proconfig=null`, owner `postgres` (`rolbypassrls=true`), `proacl = =X/postgres | postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres`. The leading `=X` is EXECUTE to PUBLIC. A freshly replayed local stack carrying all 37 migrations gives `=X/postgres | postgres=X/postgres | service_role=X/postgres`: PUBLIC EXECUTE from the migrations alone, no platform default privileges involved. `20260813120000_explicit_table_grants.sql` grants default privileges on TABLES only, so it is not the source. Contrast, both environments: `applied_migrations` and `expired_demo_users` are `postgres=X | service_role=X` with `proconfig search_path=""`, because `20260730082104:41-44` and `20260729164307:34-37` revoke from public/anon/authenticated first. `grep -rin revoke supabase/migrations/` hits only those two files; neither `20260706124653` nor `20260709210000` contains a revoke.

Reachability, re-run by the skeptic (GET is non-mutating by construction; PostgREST opens a read-only transaction, which is what raises the error): `GET /rest/v1/rpc/upsert_trefle_plant` with the full 19-argument query string returns **405 `{"code":"25006","message":"cannot execute INSERT in a read-only transaction"}`** on prod with the publishable key **and** on local with its anon key. Controls on both: 401 `42501` for the revoked `applied_migrations`, 404 `PGRST202` for a nonexistent function. On local the ACL has no anon entry, so anon arrives purely through the PUBLIC grant. The arguments are required; a bare GET returns 404 `PGRST202`.

Blast radius: unrestricted INSERT of catalog rows, and `is_curated = plants.is_curated OR EXCLUDED.is_curated` (`20260709210000:141`) lets a caller set the editorial sign-off flag true on an existing row. Nothing stops it: no CHECK on `is_curated`, and `invalidate_editorial_verdict` is BEFORE UPDATE and only clears; none of its five watched columns change on this upsert's conflict branch (`description` is `COALESCE(plants.description, EXCLUDED.description)`; the other four are not referenced), so `cleared` stays false and the flip survives. `docs/database-log.md:44` states `is_curated` is written by `curate-editorial.ts` and nothing else.

**Fix (one migration, the pattern the repo already uses twice):** `revoke execute on function public.upsert_trefle_plant(<19 args>) from public, anon, authenticated; grant execute ... to service_role;` plus `set search_path = ''`. **The SET clause alone breaks the function**: proven on the local stack in a rolled-back transaction, a `SECURITY DEFINER LANGUAGE sql` function with `set search_path = ''` and an unqualified `insert into plants` fails with `ERROR: relation "plants" does not exist`. The same migration must schema-qualify the insert target to `public.plants`. The `plants.` references inside `ON CONFLICT DO UPDATE` are conflict-target aliases and need no change. Replay locally first (rule 11), then verify `proacl` on **both** prod and a fresh replay; checking only prod would miss that the migration is the source.

**Still unverified (finder's own caveat, kept):** the POST that would perform the write was deliberately never sent, so the completed write is one inference step past a confirmed-reachable, confirmed-attempted INSERT.

**Adjacent, out of scope:** `public.handle_new_user` is also `prosecdef` with PUBLIC EXECUTE, but it returns `trigger` and PostgREST does not expose trigger functions.

---

### Section 3, the stamp columns

#### F-1. The stamps are two kinds, and "make the stamp a side effect of the write" is only definable for one kind

**Severity: critical · Cost: cheap · Gate: before next round**

**Count correction: 13, not 14.** Live `information_schema.columns` (suffixes `_checked_at|_verified_at|_reviewed_at|_drafted_at`) returns exactly 13, all on `plants`: `ai_drafted_at`, `botanical_checked_at`, `editorial_checked_at`, `editorial_description_at`, `editorial_image_at`, `editorial_tags_at`, `greenery_checked_at`, `image_checked_at`, `image_verified_at`, `native_checked_at`, `native_region_checked_at`, `native_to_reviewed_at`, `style_checked_at`. No other public table carries one. `hardiness_verified` is a 14th stamp-shaped column but is boolean, not `_at`; that is where the circulating "14" comes from, and both numbers should be stated together or neither.

**The split is per stamp, not per script.**

_Producer stamps_ (deciding pass writes the field in the same UPDATE, so the stamp can be coupled to the patch): `ai_drafted_at` (`curate-plants.ts:285`, single UPDATE at `:423`); `style_checked_at` (`curate-plants.ts:337-339`; `curate-styles.ts:248-251`); `greenery_checked_at` (`curate-plants.ts:353-355`; `curate-greenery.ts:283-284`); `image_checked_at` (`pick-plant-images.ts:1339-1360`, alongside `image_url_curated`); **`image_verified_at`** (`pick-plant-images.ts:805-809`: it does not rewrite the hero URL but it does rewrite `image_pick_confidence` and `image_pick_reason` in the same object, and conditionally nulls `editorial_checked_at` at `:815`, so a write exists to hang the stamp on; the original claim filed this as a verifier and was wrong by its own coupling test); `editorial_description_at` (`curate-editorial.ts:601`, alongside the rewrite at `:590`).

_Verifier stamps_ (pass reaches a verdict without writing the field it judged, so the correct coupling is to the **verdict**): `botanical_checked_at` (`cross-check-plants.ts:159-166`; the file's only `.update()` is the stamp, flags-only rule at `docs/curation.md:104`); `native_checked_at` (`cross-check-native-to.ts:159-166`); `native_region_checked_at` (`cross-check-native-region.ts:487-500`, separate from `applyCorrections` at `:375`); `editorial_image_at` and `editorial_tags_at` (`curate-editorial.ts:600,602`, pass/hold verdicts on an image and tags the script never rewrites); `editorial_checked_at` (`:589`, the row-level verdict).

Two caveats. Only `cross-check-plants` (and the stampless `cross-check-seasonal-care`, zero `.update()` calls) never writes: `cross-check-native-to:712` and `cross-check-native-region:427` each have an `--apply` path that writes the judged field, both nulling the stamp there rather than setting it. And `native_to_reviewed_at` fits neither bucket (see F-4). `curate-editorial` is therefore a single script emitting one producer stamp and two verifier stamps.

**Action:** adopt the producer/verifier split as the naming rule **before** writing any mechanism, applied per column. Producer stamps couple to the patch; verifier stamps couple to the verdict, which is what F2's fix already built (`rowsToStamp`, `cross-check-native-region.ts:461`).

#### F-2. The proposed "stamp set while field at default" CHECK is refuted by live data

**Severity: critical · Cost: cheap · Gate: before next round**

"Judged, and the answer is the default" is a frequent terminal verdict. Live, n=720:

| Column              | Stamped and at default           | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_greenery`       | **610 (85%)**                    | all 720 stamped, only 110 true. Migration `20260724120938`'s own header: "is*greenery's false default is indistinguishable from a judged 'not greenery'." A CHECK \_can* name `is_greenery = false`; the objection is that it rejects 85% of the catalog.                                                                                                                                                                                                                                                                                         |
| `style_tags`        | 134, of which **34 are genuine** | `select date(style_checked_at), count(*), count(*) filter (where style_checked_at = ai_drafted_at) from plants where cardinality(style_tags)=0 group by 1` gives 2026-07-28: 34 rows, 0 with stamp = `ai_drafted_at`; 2026-07-29: 100 rows, 100 equal. Joined to `rounds/9` + `rounds/10` `seeded_ids`: the 100 are 100/100 in-manifest, the 34 are 34/34 out. `curate-styles.ts:15` "An empty result is a valid judgment (style-neutral)", counter at `:232`, stamp written with tags at `:249-250`. The 100 are the F1a damage awaiting repair. |
| `native_region`     | 1                                | Citrus limon, `native_to='cultivated hybrid with no wild origin'`; correct, and `verify-round.ts:110` exempts it by name (`KNOWN_HYBRID_EXEMPTIONS`, reasoning `:104-109`: WCVP marks all 94 distribution rows INTRODUCED).                                                                                                                                                                                                                                                                                                                       |
| `image_url_curated` | 0 live                           | Refuted by code intent: `pick-plant-images.ts:1309-1323` writes stamp-without-URL deliberately ("we looked and found nothing is a real, resumable outcome").                                                                                                                                                                                                                                                                                                                                                                                      |

**Action:** do not propose this CHECK for `style_tags`, `native_region`, `is_greenery` or `image_url_curated`. Any version must be `stamp IS NULL OR field <> default OR an explicit empty-verdict marker`, and no such marker column exists on `plants` (searched `%neutral%`, `%verdict%`, `%empty%`, `%none%`, `%no_%`).

#### F-3. The durable fix already exists in this worktree; generalise it, but not as a verdict-only selector

**Severity: critical · Cost: moderate · Gate: before next round**

`rowsToStamp(findings, apply, allowEmpty)` at `cross-check-native-region.ts:461-480` (header `:50-58`) makes the stamp a function of the run's verdicts **and its flags**, unit-tested with no database (`cross-check-native-region.test.ts`, 6 tests, 3ms, no `--env-file`; module import is safe via the `require.main` guard at `:585-587`). It is not the whole decision: the caller at `:566-568` also subtracts `applyCorrections`' stale skips.

Two siblings still stamp unconditionally: `cross-check-native-to.ts:828-830` ("any verdict") and `cross-check-plants.ts:449-452` ("flagged or clean, both mean the guard ran").

**Skeptic correction, load-bearing.** The live defect at native-to is **not** `no_data`. That verdict (`:509`, Verdict union at `:169`, not `:171`) fires when the model returns no native or no phrase continents and is usually a settled cultigen answer; `:491-493` deliberately routes Citrus limon _around_ it, and `database-log:516` calls that row "by design". Native-region classifies the same row as `no-native-range`, which `rowsToStamp` **stamps** under `--apply --allow-empty` (`:473-474`, test `:42`); prod confirms both its stamps are set. The real defect is that native-to stamps `gross` and `contradicts` rows whose fix lives in `apply-native-to-fixes.ts`, **which appears in no runbook step** (`runbook.ts:105-107` lists only the guard), while `--new-only` (`:777`) and `round-status.ts:241-247` read that stamp as settled with no `applies` exemption.

**Action, corrected:** give `cross-check-native-to` a stamp rule keyed on whether the correction was written (stamp `ok`/`minor`/`no_data`; withhold `gross`/`contradicts` until applied). Do **not** build a shared `stampsFor(verdict)`: the three guards share no verdict vocabulary (`'match'|'disagrees'|'no-native-range'|'no-data'|'reviewed'` at native-region `:154`; `'ok'|'minor'|'gross'|'contradicts'|'no_data'` at native-to `:169`; `cross-check-plants` has no verdict type at all, only `flags` with `severity` at `:83`), and two of native-region's five cases depend on run flags, not the verdict. A blanket no_data refusal would leave cultigens permanently failing a FAIL-level step.

#### F-4. F2 and F4 are one bug; F5 is a missing writer, and the predicted decay has not started

**Severity: major · Cost: cheap · Gate: can wait**

F2/F4 shape: pre-fix `cross-check-native-region.ts` (`4d9dadd^`) gated the write behind `if (opts.apply)` and stamped unconditionally on the next line; `curate-plants.ts` makes `ai_drafted_at` the first line of `buildPatch` and applies the patch unconditionally (`:285`/`:482` now, `:282`/`:479` pre-`eeb5678`; the audit report cites the pre-fix pair).

F5 shape: `native_to_reviewed_at` = 151 of 720, **one distinct value** (`2026-07-30 12:00:00+00`, the backfill literal). Migration `20260813110500`'s VALUES list holds exactly 151 rows and is the only writer in repo history, so 151 is the ceiling and the live count equals it: full match, zero clearing, in the 1 day since it shipped (committed 2026-08-13 13:57 +0200, present in `supabase_migrations.schema_migrations`). Note "151/151 matched" is `docs/database-log.md:473`, **not** the migration header, which explicitly allows drifted rows to go unstamped. Independently supported: `count(*) where native_checked_at is null` = 0 catalog-wide, and all three clearing paths (`apply-native-to-fixes.ts:116`, `cross-check-native-to.ts:712`, `archive/regenerate-native-to.ts:169`) null that column.

**Action:** treat F5 as "give the column a writer" (`--review-keep`), not as stamp-coupling work. Caveat: `apply-native-to-fixes.ts` applies human-reviewed rewrites, so coupling a `native_to_reviewed_at` write into that UPDATE _would_ be a writer; coupling is insufficient there, not useless.

#### F-5. "A lib function every script must use" has been tried three times, with three outcomes, and nothing at source level detects non-adoption

**Severity: major · Cost: moderate · Gate: before next round**

| Helper                                   | Adoption                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Enforcement                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `upsertPlant` (`lib/plants-db.ts:143`)   | **8/8** seed scripts; the only raw `.insert(` into plants anywhere is `test-editorial-trigger.ts:192`                                                                                                                                                                                                                                                                                                                                                                               | none, and none needed: it wraps the `upsert_trefle_plant` RPC and is the only route to a fill-only upsert. Structural, not disciplinary. |
| `scopeGuard` (`scope.ts:184`)            | imported by 7 of ~25 update-path writers, **called by 6 (24%)**. `pick-plant-images.ts:99` imports and never calls. 13 writers parse no scope at all: `apply-native-to-fixes`, `apply-seasonal-care-fixes`, `apply-sun-widening`, `backfill-guard-stamps`, `backfill-legacy-editorial`, `feed-wikimedia-candidates`, `fix-round8-names`, `fix-round11-names`, `seed-regional-natives`, `set-plant-hero`, `apply-image-confirmations`, `apply-image-reverts`, `fix-oversized-heroes` | none                                                                                                                                     |
| `writePlant` (`lib/plants-write.ts:166`) | 4 callers. Against the writes it actually governs (the trigger's criterion columns per `20260729112046`: `image_url_curated`, `image_pick_confidence`, `description`, `style_tags`, `space_types`) that is **4 of 8**, not 4 of 25: `curate-plants.ts:296/337/341`, `curate-editorial.ts:591`, `curate-styles`, `pick-plant-images` write criterion columns raw                                                                                                                     | none                                                                                                                                     |

Detection today is downstream and manual: the editorial trigger silently clears a verdict when `writePlant` is bypassed; `check-round-scope.ts` finds spilled writes (its header records catching round 8's native_region on 20 settled rows and draft-hardiness on round 7's 76) but has **no package.json script and no CI job**. No vitest test reads source (19 files, zero `readFileSync`/`readdirSync`/glob hits); no lint rule (`no-restricted-imports/syntax` absent; `pnpm lint` is not in `ci.yml`).

**Action:** if a shared writer is chosen, land the source scan first, but as a **CI script** following the three that already work that way (`check-tokens.ts:44` via `pnpm tokens:check`, `pnpm runbook:check`, `pnpm docs:links`, all on every PR), asserting `from('plants')` + `.update(` appears only in `lib/`. And prefer the `upsertPlant` shape: a wrapper that is the only route to the operation needs no test.

#### F-6. `hardiness_verified` has 267 true rows, zero code writers, no gate, and escapes both registries

**Severity: major · Cost: cheap · Gate: can wait**

Live: 267 of 720 true, all carrying a rating (verified-with-null-rating = 0); 328 carry a draft rating with the flag false; 125 have no rating (matches `database-log:439`). `draft-hardiness.ts:159` updates only `hardiness_rating`; no migration or SQL function references the flag; migration `20260714164514:12` is `not null default false`. So the 267 were applied outside the codebase (hand SQL, 2026-07-15 per the project record).

The audit line `docs/pipeline-audit-2026-08-14.md:158` is wrong on both halves: not "permanently false" (267 are true), and there is **no gate** in `lib/hardiness.ts` (`:8`, `:71` are comments instructing a future caller to write one) and no caller either: `formatHardiness` and `usdaZoneForRating` have zero references anywhere in `apps/web` or `packages`. Its "three read sites" count is roughly right and is not the error. The only behavioural read is `draft-hardiness.ts:135` `.eq('hardiness_verified', false)`, reached **only** under `--redraft-unverified` (`:134`); the default path is protected by `.is('hardiness_rating', null)` (`:136`). Registry escape: `unregisteredStampColumns()` (`round-status.ts:475`) filters only `_checked_at`/`_verified_at` suffixes, and the draft-hardiness `STEP_DEF` (`:276-285`) tests `hardiness_rating NOT NULL` at WARN.

**Action:** record in `database-log` that 267 values have no code provenance and the column is outside both registries; correct the audit line; while hardiness is parked, do not build the writer. Note the audit line already sits under "5. Unverified pass-through findings".

---

### Section 8, traps and tests

#### F-7. Three traps are pinned by tests; the registry a closure rule would depend on does not exist

**Severity: critical · Cost: cheap · Gate: before next round**

Traps 24, 3 and 26 are pinned as of 2026-08-14: `cross-check-native-region.test.ts` (`4d9dadd`), `regenerate-native-region.test.ts` (`464c248`), `curate-plants.test.ts` (`eeb5678`); 14 tests, all passing; each header names its trap. Only trap 24's own entry cites its test (`docs/database-log.md:288`); trap 3 (`:305-307`) and trap 26 (`:234-275`, correction block `:269-275`) cite none. The links exist in exactly two places, neither a registry: the session bullet at `docs/database-log.md:400-401`, and the ranked proposal table at `docs/pipeline-audit-2026-08-14.md:105-107`, whose row 3 still reads "no" for a test written the same day. Trap count: `grep -c "^#### "` = 28 (1 through 27 plus 1b); the doc's own prose at `:62` is stale ("Twenty-seven traps", "all twenty-four descriptions").

Placement is clear: `CLAUDE.md:192` "Before you hand-roll a control" has two bold-lead paragraphs; `database-log`'s standing rules (`:25-54`, rules 1-11) contain nothing about traps becoming tests, so the artifact does not duplicate an existing home.

**Skeptic corrections folded into artifact (a) in section 4:** only `rowsToStamp` was _extracted_; `buildPatch` was a pre-existing private function merely exported (`eeb5678` diff is `-function buildPatch(` to `+export function buildPatch(`), and `assertPlanScope` was newly written (`464c248`, `regenerate-native-region.ts:541`). `scope.test.ts` is **not** a source-scan model (126 lines, imports from `./scope`, no fs import; that block is an unwritten proposal); `round-rehearsal.test.ts` is the only test file in the repo that reads the filesystem (`node:fs`, `:36`). Requirement four of the rule is currently unmet by two of the three exemplars it names, so traps 3 and 26 need their citations added in the same change.

_Nuance on "fails against the pre-fix code":_ true in substance only for trap 26 (pre-fix `curate-plants.ts:325` read `if (plant.style_tags == null && ...)`, and the test's `freshRow` has `style_tags: []`). For traps 24 and 3 the functions did not exist pre-fix, so those tests cannot compile against the old code rather than failing against it. **Unverified:** whether any of the three was actually executed against pre-fix code; no such run is recorded.

---

### Section 9, script sprawl and the forked resolver

#### F-8. Six of the seven resolver copies are identical; the only part that differs has lost 12 of 45 synonym groups

**Severity: critical · Cost: moderate · Gate: before next round**

`grep -rln "SYNONYM_GENERA|function sciMatches"` returns exactly seven files: `seed-round6/7/8/9/10/11.ts` and `seed-regional-natives.ts` (nothing in `scripts/archive/`). Extracting `function genusSynonyms` through `async function fetchCatalog` and deleting whole-line comments and blanks, `diff` of r6 against each of r7/r8/r9/r10/r11 is **empty**. (The published md5 `d0ec5b2…` does not reproduce; it is an artifact of the finder's stripping regex. The identity relation it stood for is confirmed by direct diff.) `seed-regional-natives.ts:207-276` differs in exactly three hunks, all from `resolve(name: string)` versus `resolve(entry: number | string)`.

Group counts: r6=7, r7=3, r8=11, r9=22, r10=23, r11=34, regional=11. Union-find across all seven: **45 connected components over 105 genus names**. Round 11 is missing 12 whole components, with **zero partially-carried components**: corydalis/pseudofumaria, dorycnium/lotus, perovskia/salvia, citrus/fortunella, chamomilla/matricaria, lychnis/silene, allium/nectaroscordum, anthemis/cota, coronilla/hippocrepis, alyssum/aurinia, betonica/stachys, asplenium/phyllitis/scolopendrium. Round 7 kept 0 of round 6's 7; round 8 kept 1 of round 7's 3.

Live corroboration: the catalog already holds a row on the far side of most lost groups (Silene coronaria, Cota tinctoria, Hippocrepis emerus, Pseudofumaria lutea, Aurinia saxatilis, Asplenium scolopendrium, Allium siculum, Matricaria chamomilla, Citrus japonica, Stachys officinalis, Perovskia atriplicifolia). `seed-round11.ts:86-89` documents the mechanism firing correctly in the other direction.

Trefle's own `synonyms[]` is declared at `lib/trefle.ts:101` and read by nothing (the finder's `grep '\.synonyms'` returns zero because the field has no leading dot; the correct receipt is `grep -rn 'synonyms' apps/web --include='*.ts'`, which returns that line plus prose).

`seed-plants.ts:322-336` returns `results[0]` (`:328`) with a null check but **no identity check**, has **no `--dry-run`**, and is the path `README.md:119` and `pnpm seed` (`apps/web/package.json:12`) point at. `SEED_LIST` holds 190 string entries against 4 numeric, so the path is live. `docs/architecture.md:141`'s synonym-remap sentence overstates what the `:412` ID check does. Additional finding: the pre-resolve dedupe at `seed-round11.ts:315-322` is a plain exact-name lookup despite a comment claiming synonym awareness.

Three qualifications now folded into artifact (c): `synonyms[]` lives on `TrefleDetail` (`:88`), not the `TrefleListItem` that `searchSpeciesByName` (`:384-398`) returns, so it costs one extra rate-limited detail fetch per candidate; seeding the union restores 45 groups but **at most 42 functional ones** (perovskia/salvia, dorycnium/lotus and alyssum/aurinia are gender-variant epithet pairs the exact-epithet rule can never match, per `seed-round6.ts:185` and `seed-round11.ts:62-70`); and drift logging does not convert a missing group into a printed warning (the usual outcome is `resolve` returning null, which already prints `miss`; the duplicate case is one where `results[0]` _passes_ `sciMatches`).

---

### The rest

#### F-9. The migration ledger's record of `20260721195021` is one statement short of its file, and prod holds the missing statement's result

**Severity: critical · Cost: moderate · Gate: before next round · Section 5**

File `supabase/migrations/20260721195021_correct_round7_seasonal_rhythm.sql`: `grep -c '^update'` = 16, with three `Myrrhis odorata` clauses (summer `:107`, late_summer `:112`, autumn `:120`). Ledger (prod, read-only): one array element of 7245 chars against a 10105-byte file, 15 `update public.plants` matches, 15 `scientific_name` WHERE matches, **2** Myrrhis matches, 0 matches for the `10b.` comment. Payload probes: summer `true`, late_summer `true`, autumn (`'%Any seed not cut earlier has already scattered%'`) **`false`**. Live: `seasonal_rhythm->>'autumn'` for Myrrhis odorata is byte-identical to the unrecorded statement's target.

**Three framing corrections.** (1) **Not silent**: the file discloses it at `:115-117` ("Spotted after the main batch; applied separately via execute_sql same day"), and `git log --follow` shows one commit (`627383e`) already containing 10b, so the push followed the out-of-band apply. (2) **No guard could see it**: `check-migration-drift.ts` reads `admin.rpc('applied_migrations')`, and `20260730082104:38-44` defines that function as `select m.version, m.name` only; `statements` is never fetched. (3) **Not a rule-11 violation**: `docs/database-log.md:50` dates rule 11 to 2026-07-30, nine days later, when migrations were applied by hand through the MCP.

**Action:** catalog data is correct and the file is idempotent (every UPDATE is guarded on the exact prior text), so nothing to repair in `plants`. Record the split apply in `database-log`, and extend the drift guard to compare statement text (design in section 6, pass-through §5).

#### F-10. A hand-written data contract cannot be the one source

**Severity: critical · Cost: moderate · Gate: can wait · Section 6**

The draft's own headline finding is a hand-written schema description that rotted: `COMMENT ON COLUMN plants.native_region`, written 2026-07-12 (`20260712201853:21`), still names the mediterranean/balkans/croatia vocabulary superseded on 2026-07-13 by the WGSRPD Level-2 regeneration, and is live today, **32 days later** (not 13 months, as the draft claimed), because no later migration re-issued it. Verified three ways: `grep -rin "comment on" supabase/migrations/` (40 hits, only one naming `native_region`); live `col_description` returns that exact string; `count(*) filter (where native_region && array['mediterranean','balkans','croatia'])` = **0 of 720**.

The repo already has the pattern that prevents this class of rot, used exactly three times: `tokens:check` (`package.json:15`), `runbook:check` (`:22`), `catalog:state:check` (`:19`), all listed in `.prettierignore:13-15`, the first two on every PR and every push to main, the third main-only (`ci.yml:58`, `:96`).

**Action:** make the contract the fourth generated document, `docs/data-contract.md`, generated by `apps/web/scripts/data-contract.ts` from three inputs: replayed local-stack schema (column, type, nullability, default, CHECK text, comment), live distinct-value/coverage counts (`catalog-state.ts` is the working precedent), and one committed sidecar keyed by column holding only provenance class, who may write it, and prose meaning. Gate with `git diff --exit-code` in the main-only job.

**Two skeptic corrections that change what the generator must do.** (1) Echoing `col_description` does **not** prevent a superseded vocabulary: a frozen stale string never diffs, so the gate stays green forever. The vocabulary line must be generated from live DISTINCT VALUES, printed next to the comment so a contradiction is visible. The existing precedent would not have caught this case: `docs/catalog-state.md` emits a full style-tag distribution but for `native_region` emits only `| native_region | empty | 3 |`. (2) The comment input covers under half the surface: **31 of 65** live `plants` columns carry any comment, so the sidecar carries most of the prose.

**Caveat:** the replayed schema equals prod only for what migrations wrote (trap 25, `database-log:222-226`), and `migrations:check` compares the ledger, not schema shape. Until the generator exists, land the draft as `docs/data-contract.md` marked "hand-written, 2026-08-14, superseded when the generator lands".

---

## 3. Sequencing

### Must be true before the next data round

1. **Close the `upsert_trefle_plant` grant** (F-0). One migration, replay locally, verify `proacl` on prod and on a fresh replay. Cheap, and it is reinstated by every restore until fixed.
2. **Repair the 100 fabricated style stamps** (F-2): `curate-styles --round 9` then `--round 10`. Verification predicate: `style_checked_at = ai_drafted_at` is the backfill's fingerprint and cleanly separates the 100 from the 34 genuine neutrals.
3. **Adopt the producer/verifier naming rule** (F-1) before any mechanism is written. Zero code; it is the vocabulary the rest depends on.
4. **Do not ship the "stamp set while field at default" CHECK** (F-2). Record the refutation so it is not re-proposed.
5. **Give `cross-check-native-to` a correction-aware stamp rule** (F-3), and either put `apply-native-to-fixes.ts` in the runbook or stop treating `native_checked_at` as FAIL-level settled evidence.
6. **Consolidate the species resolver** (F-8, artifact c/2) before any seeding. Round 12 seeded with round 11's table would repeat the 12 lost groups against a catalog that already holds the far side of most of them.
7. **Land the pre-merge mechanical check** (artifact b, part 3), green on day one with named escape-hatch records. It is what keeps 3, 4, 5 and the trap rule from decaying.
8. **Ship the CLAUDE.md trap-closure rule with trap 3 and 26 citations in the same change** (F-7, artifact a).
9. **Extend `REQUIRED_DRAFTED_FIELDS`** (`verify-round.ts:88-95`) with the prose fields while the violation count is 0. Cheapest F4 remedy, cannot false-fail.
10. **One shared `STAMP_SUFFIXES` constant** for `round-status.ts:498` and `check-round-scope.ts:86-89`, plus an explicit exclusion record for `hardiness_verified`.
11. **Add a content check to `check-migration-drift`** (md5 after stripping `--` comments, whitespace, semicolons; 31 of 34 versions already match byte for byte, so it is green day one) and a `statements IS NULL` finding kind.
12. **Fix `restore-catalog`'s diff** to exclude trigger-derived columns (`updated_at`, and for plants `sun_requirements`). Purely observability, but it is what makes the documented undo verifiable, and the undo is the safety net for everything else on this list.
13. **Record the `20260721195021` split apply** in `database-log` (F-9).
14. **Put `NOT NULL DEFAULT` in the contract as a first-class column** (F-10 and pass-through §6): it is the single property that decides whether a value-based guard can ever fire.

### Can wait

Everything else, specifically: the F5 `--review-keep` writer; the `is_curated = all-three-stamps` CHECK (rehearse on the local stack first); the `curate-editorial` withdrawal fix and the `curate-styles` withdrawal counter; `NOT NULL` on `plants.scientific_name`; the `plant_combinations` unordered-pair unique index; the trap-22 cascade trigger; the generated row types / `supabase gen types`; the generated `docs/data-contract.md`; the migration-replay-plus-trigger-contract job on main; the graveyard archival pass; the `garden_use_tags` bucket map; the `hardiness_verified` provenance note; `purge-demo-users`' storage-failure record; `draft-hardiness --dry-run`; `writePlant`'s two-statement collapse into an RPC.

---

## 4. The three artifacts, verbatim ready

### Artifact (a). CLAUDE.md trap-closure rule

Add as a new bold-lead paragraph in the existing "Before you hand-roll a control" section (`CLAUDE.md:192`). **One home only**: do not also copy it into `database-log`'s standing rules; that is the two-homes failure mode. Ship it in the same change that adds test citations to trap 3's and trap 26's entries, otherwise the rule's own exemplars fail its fourth requirement.

> **A trap is not closed until a test pins it.** Fixing the code closes the incident; the trap stays open until something executable names it. Pinned means four things: the test asserts the defect's own witness (the stamp, the scope, the plan, not a downstream symptom), it fails or fails to compile against the pre-fix code, its header names the trap number and the incident, and the trap's entry in `docs/database-log.md` cites the test file. Traps 3, 24 and 26 (2026-08-14) are the pattern: each fix first exported a callable seam, `assertPlanScope`, `rowsToStamp`, `buildPatch`, because a trap you cannot call is a trap you cannot pin. If the shape has no callable seam in it, write a source scan instead (`round-rehearsal.test.ts` is the model). Prose in the trap entry is a description, not a closure.

Enforcement half is the `TRAPS_NOT_PINNED` ratchet in artifact (b). Without it this rule decays exactly as the archive README's rule did (F-8 companion, section 6).

### Artifact (b). Pre-merge mechanical check

**1. Where.** `apps/web/scripts/pipeline-invariants.test.ts`, pure, no DB, picked up by the existing `pnpm test` on every PR (`ci.yml:4` is a bare `pull_request:`; the `check` job has no `if:` and touches no secrets). Milliseconds against a 1.29s / 223-test suite.

_Recorded dissent, resolve before writing:_ F-5 recommends CI scripts instead, following `check-tokens.ts` / `runbook:check` / `docs:links`, which are the three working in-repo source scans. Both homes run pre-merge. Vitest wins on "one home, already gated, no new workflow step"; the CI-script precedent wins on "this is how source scans are already done here." Pick one and write it down.

**2. What not to build.** A constraint-coverage test that parses SQL needs a parser that replays ALTERs in migration order (`20260728193759:7` is `alter column plant_id drop not null`, so column facts cannot be read off `CREATE TABLE`). That is hand-rolled machinery for a fact the toolchain generates: use `supabase gen types` against the local stack and let `pnpm typecheck` be the coverage test. A migration-replay job is worth having but is Docker plus ~2GB and must not sit on PRs given the secrets stance; add it later as a step in the existing main-only `migration drift` job, running `supabase db reset` then `pnpm trigger:contract`. That is the only way trigger and RLS semantics ever get checked.

**3. The standing check, by shape.** Every escape hatch is an **exported record with a reason string**, not a comment, so the ratchet is diffable and the reasons are reviewable.

| Shape                                         | Mechanism                                                                                                                                                                        | Violations today                                  | Escape hatch              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------- |
| Unreachable predicate vs DB default (trap 26) | becomes a compiler error once generated row types land; until then a scan asserting no `<not-null-column> === null` in non-test `.ts`                                            | 0 (only comments and `response.X != null`)        | none needed               |
| Stamp with 0 writers                          | parse `add column <x>_(checked\|verified\|reviewed\|drafted)_at` from `supabase/migrations/*.sql`; each must appear as an object key with a timestamp value in a non-test script | 1 (`native_to_reviewed_at`)                       | `STAMPS_WITHOUT_WRITERS`  |
| Stamp outruns the write (trap 24)             | scan `stampChecked(` callers; each must export a selector taking findings plus run flags                                                                                         | 2 (`cross-check-plants`, `cross-check-native-to`) | `REPORT_ONLY_STAMPS`      |
| Trap without a test                           | parse `#### <n>.` headings from `docs/database-log.md`; each must be named `Trap <n>` in some `*.test.ts` header                                                                 | 25 of 28                                          | `TRAPS_NOT_PINNED`        |
| Script nothing references                     | readdir `scripts/*.ts`; each reachable from RUNBOOK, `package.json`, another script's import, or a `docs/` mention, else `scripts/archive/`                                      | 3 (see artifact c/1)                              | archive with a README row |
| Seeder declares its own synonym table         | scan: no `seed-*.ts` may declare `SYNONYM_GENERA`                                                                                                                                | 7 until artifact c/2 lands                        | none                      |
| Runbook / registry drift                      | **already done** in `round-rehearsal.test.ts` (14 tests) plus `pnpm runbook:check`                                                                                               | 0                                                 | do not duplicate          |

**Important caution, from a refuted claim:** generating row types will **not** by itself catch trap 26. TypeScript deliberately exempts `null`/`undefined` from the TS2367 no-overlap check; the exact trap-26 shape against non-nullable generated types compiles clean under this repo's own tsc 5.9.3 with `--strict --noUncheckedIndexedAccess`. The rule that would catch it is `@typescript-eslint/no-unnecessary-condition`, which cannot be enabled today because neither `packages/eslint-config/base.js` nor `next.js` sets `parserOptions.project`. So the source scan is load-bearing, not a stopgap.

**Fix in the same PR:** hoist one `STAMP_SUFFIXES` constant shared by `round-status.ts:497` and `check-round-scope.ts:82`. That one-fact-two-homes split is what let `native_to_reviewed_at` drain unnoticed.

### Artifact (c). The canonical resolver spec

**Part 2 (the spec proper).** New `apps/web/scripts/species-resolver.ts`, plus the scan case above. It must do all six, because each is a fork-cause that has already fired:

1. **`SYNONYM_GENERA` seeded once with the union** (45 components / 105 names, not round 11's 34), then append-only. A seeder may not declare its own; the hand-carry is what lost round 6's 7 groups by round 7 (which kept none) and round 7's 3 by round 8 (which kept one). Realistic benefit: at most 42 of the 45 are functional under rule 2, since perovskia/salvia, dorycnium/lotus and alyssum/aurinia are gender-variant epithet pairs. Say so in the header so nobody "fixes" rule 2 to close the gap.
2. **Keep the epithet rule exactly as `seed-round11.ts:220-225` has it**: `sciMatches` requires an identical species epithet _before_ the genus table is consulted (`if (!ts || ts !== cs) return false`). This is what makes sibling rejection work (Acer palmatum must not match Acer japonicum). Do not "improve" it into a genus-first match.
3. **Consult Trefle's `synonyms[]` on the resolved species as a second matcher.** It is the only mechanism that can catch a synonym pair whose epithets differ, which is exactly the gap rule 2 leaves open, and today nothing reads it (`lib/trefle.ts:101`). Cost, stated up front: it lives on `TrefleDetail` (`:88`), not the `TrefleListItem` that `searchSpeciesByName` (`:384-398`) returns, so it needs one extra `getSpeciesBySlug` call per candidate at the seeders' existing 1500-1600ms pacing.
4. **`resolve(entry: number | string)`**: a number passes through; a string is paged-searched and filtered through `sciMatches`. `results[0]` may only ever be assigned to a drift-logging variable, never returned. `seed-plants.ts:322-336` returns it (`:328`) with a null check but no identity check, which is the exact drift all seven dedicated seeders were written to prevent.
5. **Mandatory `--dry-run`.** All seven round seeders have one; `seed-plants.ts`, the path `README.md:119` and `pnpm seed` point at, does not.
6. **Drift logging**: print `top hit rejected: <name> (#<id>)` whenever `results[0]` fails `sciMatches`. Honest scope: this does _not_ turn a missing synonym group into a warning (the usual outcome is a null resolve, already printed as `miss`, and the duplicate case is one where `results[0]` passes). It is worth having as a resolver-quality signal, not as the guard against lost groups; the scan in artifact (b) is that guard. Read the catalog through `catalog-identity.ts` + `fetchAllRows` (standing rule 5).

Then `seed-plants.ts` imports it and `resolveId` is deleted; `seed-round11.ts:315-322`'s pre-resolve dedupe is routed through the resolver so its comment becomes true; and `docs/architecture.md:141`'s synonym-remap sentence is corrected or removed in the same PR.

**Part 1 (the graveyard, with disposition).** House rule is archive-with-a-README-row; each row says what it did and why it is finished.

- `wikimedia-image-proof.ts` to `archive/` plus row: proved Wikimedia CC-BY/BY-SA sourcing before the July 22 image pass; decision shipped, and its `resolveP18`/`fetchCommonsImage` now live in `lib/wikimedia.ts`, copy from there.
- `repair-combinations.ts` to `archive/` plus row, **and one line in `docs/database-log.md`** naming what it repaired and when. It is the only archive candidate with no record anywhere, and archiving it without a log line files an empty record.
- `backfill-legacy-editorial.ts` to `archive/` plus a row filed as a **wrong-shape example, not a template**: it selects `is_curated = true AND editorial_checked_at IS NULL` (`:53-54`) and stamps all four editorial stamps (`:97-100`), which is what migration `20260728220852`'s own column comment forbids; and at `:101` it writes `is_curated: true` directly, the only production script writing that column outside `lib/plants-write.ts`, against standing rule 6. No row's verdict changes today, so this is archival, not repair.
- `apply-sun-widening.ts` to `archive/`, but the README needs an **edit**, not just a row: its "What deliberately stayed in `scripts/`" section names this file as the template later apply-scripts follow, and three live scripts cite it as that pattern. Move the carve-out's subject to `fix-round8-names.ts` in the same commit, and give the row the real reason: neutralized by `trg_sync_sun_requirements`.
- The 7 round seeders and `seed-plants.ts`: **keep**. Round seeders are per-round provenance like `rounds/<n>/`; the fix is part 2, not a move.

**Part 3 (standing new-script question).** Add to `CLAUDE.md` immediately after artifact (a):

> **Before adding a file to `apps/web/scripts/`, answer both in its header: which runbook step runs this, and what ends it?** A script with no step and no end condition is a one-off: write it, run it, and land it in `scripts/archive/` with its README row in the same PR, not later. If the honest answer is "it is like `<existing script>` but for this round", you are forking it; extract the shared part instead (`catalog-identity.ts` and the species resolver are what that looks like). Nothing in `scripts/` may be reachable only from someone's memory; `pipeline-invariants.test.ts` enforces the reachability half.

---

## 5. The data contract

Corrected from the draft. Scope: `plants` in full (720 live rows), the other six tables briefly. Schema read from `supabase/migrations/` (37 files) and confirmed live read-only; usage confirmed by grepping `apps/web`. **This document should not stay hand-written; see F-10.**

Provenance classes: **Trefle** (provider sync, fill-only), **AI-drafted** (curation pass, fill-only), **Editorial** (human-set, outside the Trefle upsert path), **Operational** (pipeline stamps), **User data**, **Derived** (trigger-computed).

### 5.1 Identity and bookkeeping

| Column                            | Meaning             | Validity                                                                                                   | Provenance  | Receipt                                                                                         |
| --------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `id`                              | PK                  | uuid                                                                                                       | Operational | `20260706093045`                                                                                |
| `created_at` / `updated_at`       | Bookkeeping         | not null; `updated_at` bumped by `set_updated_at()` **which overwrites any explicit value a caller sends** | Derived     | `20260706093045:121-140`                                                                        |
| `source_species_id`               | Provider species ID | nullable + unique; null on the 4 manual rows                                                               | Trefle      | `20260706105129`; live 716 trefle / 4 manual                                                    |
| `data_source`                     | Provider            | not null, default `'trefle'`, **no CHECK**                                                                 | Trefle      | live values `trefle`, `manual`                                                                  |
| `common_name` / `scientific_name` | Names               | `common_name` NOT NULL; **`scientific_name` nullable, live 0 null**                                        | Trefle      | a null silently _exits_ duplicate detection at `verify-round.ts:259`; NOT NULL is addable today |
| `common_name_aliases`             | Alternates          | `text[]` NOT NULL default `{}`                                                                             | Trefle      | `20260706121421`                                                                                |
| `family`                          | Family              | nullable                                                                                                   | Trefle      | live 3/720 null                                                                                 |

### 5.2 Trefle-sourced botanical facts (fill-only, `20260709210000`)

| Column                            | Validity                                                                           | Note                                                                                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description`                     | nullable, live 0 null                                                              | also an editorial criterion (`plants-write.ts:64`)                                                                                                                                                               |
| `care_level`                      | CHECK low/medium/high                                                              | only `low`(590) and `medium`(130) ever written                                                                                                                                                                   |
| `height_min_cm` / `height_max_cm` | nullable int                                                                       | `height_min_cm` is Trefle's _average_ height reused as a typical-minimum proxy; documented judgment call                                                                                                         |
| `hardiness_zone_min` / `_max`     | nullable text                                                                      | "legacy" per `curation.md#hardiness` but 684/720 populated and read by `lib/good-for-your-garden.ts:61-62`; that branch cannot fire today (0/13 gardens have `hardiness_zone`)                                   |
| `bloom_months`                    | `int[]` **NOT NULL default `{}`**; empty means no-bloom                            | 29 rows empty, 25 of them botanically checked, which is why a bloom_months value CHECK would repeat trap 26                                                                                                      |
| `peak_season`                     | CHECK spring/summer/autumn/winter, nullable, Derived from `bloom_months`           | live 589/720 null                                                                                                                                                                                                |
| `sun_requirements`                | `text[]` **NOT NULL default `{}`**, **Derived mirror**, not independently writable | `sync_sun_requirements` BEFORE INSERT/UPDATE recomputes it as `sun_thrives ∪ sun_tolerates` whenever either is non-empty; live all 720 rows qualify                                                              |
| `image_url`                       | nullable                                                                           | Trefle's own pick; superseded for display by `image_url_curated`                                                                                                                                                 |
| `image_urls`                      | `text[]` NOT NULL default `{}`                                                     | excluded from the Explore query for cost                                                                                                                                                                         |
| `native_to`                       | **prose** origin phrase, nullable, live 0 null, 311 distinct                       | **Three writer classes, not one**: the fill-only upsert (`20260709210000:103`), `curate-plants.ts:385`, and the editorial path (`apply-native-to-fixes.ts:116`, `cross-check-native-to.ts:712`). List all three. |

### 5.3 AI-drafted content (fill-only)

`plant_type` (CHECK, 9 values, a product label not strict botany), `plant_type_label` (free text, 86 distinct), `spread_min_cm`/`spread_max_cm`, `water_needs` (662 distinct prose), `water_needs_summary` (49 distinct, **semi-structured, no CHECK, no guard**), `light_needs`, `soil_needs`, `maintenance_notes` (**still rendered** at `CareSection.tsx:19`; only its role in the _tips_ feature ended), `common_issues` (21 null), `best_placement` (0 null), `environment_benefits` (4 null), `seasonal_rhythm` (jsonb, 6 descriptive keys, not DB-enforced).

| Column            | Validity                                                                    | Note                                                                                                                                                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bloom_color`     | `text[]` **NOT NULL default `{}`**, no CHECK, 78 distinct raw               | **Guarded**: `lib/bloom-colors.ts` maps to 12 swatch buckets, `check-bloom-colors.ts` fails on an unmapped value                                                                                                                                                                                                                  |
| `foliage_color`   | nullable text, 531/720 null (plain green), 66 distinct                      | same guarded-bucket pattern via `lib/foliage-colors.ts`                                                                                                                                                                                                                                                                           |
| `space_types`     | `text[]` **NOT NULL default `{}`**, **no CHECK**                            | exactly 4 distinct values live, matching `gardens.space_type`'s CHECK by convention only                                                                                                                                                                                                                                          |
| `style_tags`      | `text[]` **NOT NULL default `{}`**, **no CHECK**                            | exactly 6 distinct values live, matching the documented vocabulary; `[]` is a valid style-neutral verdict, 34 genuine rows                                                                                                                                                                                                        |
| `garden_use_tags` | `text[]` **NOT NULL default `{}`**, **no CHECK, no bucket layer, no guard** | **421 distinct raw tags / 720 rows**, with unreconciled near-duplicates ("shade gardens" 55 / "shaded borders" 33 / "shade borders" 23 / "shady borders" 31; "containers" 18 / "container gardens" 31 / "container planting" 39). Filtered in Explore as a taxonomy, architecturally free text. This is trap 5's fourth instance. |

### 5.4 Sun model

`sun_thrives` and `sun_tolerates`: `text[]` NOT NULL default `{}`, CHECK subset of `{full_sun,partial_sun,shade}`, CHECK disjoint from each other, CHECK forbidding non-empty tolerates with empty thrives. The missing third of the set (`sun_thrives` non-empty) is enforced only in `verify-round.ts:204-210`, live 0 violations.

### 5.5 Editorial fields (never referenced by `upsert_trefle_plant`)

| Column                                                                                                                             | Validity                                                                                                                                        | Live                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `is_curated`                                                                                                                       | boolean not null default false; **`upsert_trefle_plant` can set it true from an unauthenticated call, see F-0**                                 | 285/720                                                           |
| `hardiness_rating`                                                                                                                 | CHECK H1a-H7, nullable                                                                                                                          | 595/720                                                           |
| `hardiness_verified`                                                                                                               | boolean not null default false; **zero code writers, 267 true, applied out of band**                                                            | 267/720                                                           |
| `is_greenery`                                                                                                                      | boolean not null default false; **judged-false and never-judged are indistinguishable in the value**, which is why `greenery_checked_at` exists | 110 true / 610 judged-false                                       |
| `seasonal_care`                                                                                                                    | jsonb, 6 season keys, null value means nothing to do                                                                                            | 720/720 object present                                            |
| `image_url_curated`, `image_pick_confidence` (CHECK high/medium/low), `image_pick_reason`, `image_candidates`, `image_attribution` | nullable                                                                                                                                        | `20260721204551`, `20260721230049`                                |
| `native_to_reviewed_at`                                                                                                            | editorial verdict, cleared by `invalidate_native_to_review` on any `native_to` change unless the same statement re-stamps                       | **151, single distinct value, no writer since the backfill**      |
| `native_region`                                                                                                                    | `text[]` **NOT NULL default `{}`** (`20260712201853:19`)                                                                                        | WGSRPD Level-2, 50 distinct; **column comment is stale**, see 5.7 |

### 5.6 Operational stamps

13 timestamp stamps, all on `plants`. Coverage: `ai_drafted_at` 720, `botanical_checked_at` 604, `native_checked_at` 720, `native_region_checked_at` 692, `native_to_reviewed_at` 151, `editorial_checked_at` 301, `editorial_image_at` 285, `editorial_description_at` 298, `editorial_tags_at` 298, `image_checked_at` (all), `image_verified_at` 74, `greenery_checked_at` 720, `style_checked_at` 720. `editorial_checked_at` (301) minus `is_curated` (285) = at least 16 rows judged and deliberately held.

Each stamp's entry must carry its **class** (producer or verifier, per F-1) and **what NULL means**. Two triggers enforce that a stamp cannot outlive what it certified, both withdrawal-only: `invalidate_editorial_verdict` (`20260729112046`, per-criterion) and `invalidate_native_to_review` (`20260813110500`).

### 5.7 `native_region`, the worked example of why this document must be generated

Documented as WGSRPD Level-2 (52 regions) in `docs/curation.md`, generated by `regenerate-native-region.ts`, and the data agrees (50 distinct values). The live `COMMENT ON COLUMN`, on prod **and on a fresh replay**, still reads the July 12 mediterranean/balkans/croatia vocabulary that 0 of 720 rows use. This is comment-versus-data divergence, not migrations-versus-live drift. One `comment on column` in the next migration fixes it; only a generated contract keeps it fixed.

### 5.8 Other tables

- **`users`** (13): `experience_level` (CHECK beginner/intermediate/confident) is schema-present, write-path-absent, 0/13, waiting on the deferred wizard.
- **`gardens`** (13): only `city`/`lat`/`lon` populated (13/13, the location gate). `climate_zone`, `hardiness_zone`, `notes`, `style` all 0/13.
- **`palette_plants`** (82): `status` CHECK planned/planted (`considering` dropped `20260724101614`, never used); `source` CHECK generated/manual/existing but **live is 100% `manual`**, 0 `existing`; `notes` has a write path but no UI supplies it (0/82); **`position` is referenced nowhere** in `palette-actions.ts` (0/82). Uniqueness of `(garden_id, plant_id)` is app-level only (`palette-actions.ts:31-35`), live 0 dupes.
- **`plant_combinations`** (1795): no unique or exclusion constraint at all (`pg_constraint` returns only the PK); dedupe is in-memory (`curate-combinations.ts:97-99, 263`), live 0 duplicate unordered pairs. `combination_type` and `strength` are 0-null and fully exercised; `notes` null on 13 legacy rows from 2026-07-06. **The app reads only the two ids** (`lib/plant-detail.ts:104-106`); `combination_type` and `strength` are read nowhere in `app`, `lib`, `components` or `server`.
- **`agent_sessions`** (0): confirmed empty.
- **`diary_entries`** (33): identity is `(garden_id, plant_id)`; 24/33 already have `palette_plant_id IS NULL` with `plant_id` set, which is the design working. `plant_id` nullable since `20260728193759` (1/33 garden-level). `event_types` on 18/33. `photo_urls` 0/33.
- **Grants and RLS**: all 7 tables `rls_enabled`. Policy set fingerprint (public + storage) is **identical** between prod and a fresh replay: `664d72315908df035907139bd2ee4671`. Buckets: `diary-photos` and `db-backups` private (both return `NoSuchBucket` to an unauthenticated probe), `plant-images` public by design (returns `NoSuchKey`).

---

## 6. Unverified items

Two kinds, neither dropped.

### 6a. Explicit unverified caveats on confirmed work

| Item                                                                       | Blocker                                                                                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `upsert_trefle_plant` write completes                                      | The POST was deliberately never sent. Confirmed reachable and confirmed attempted (Postgres raised `25006` mid-INSERT); the completed write is one inference step beyond.                              |
| Trap tests fail against pre-fix code                                       | Not executed. Substantively true only for trap 26; for traps 3 and 24 the functions did not exist pre-fix, so those tests cannot compile against the old code rather than fail against it.             |
| The 34 genuine style-neutrals                                              | Attribution rests on three signals (stamp ≠ `ai_drafted_at`, out of both manifests, date matches the July 28 pass); no per-row run log exists. Worst case does not change the F-2 conclusion.          |
| Second `no_data` row from the 695-row native-to run                        | Verdict is not persisted and `reports/` is gitignored.                                                                                                                                                 |
| `image_verified_at` producer classification                                | Settled. `native_to_reviewed_at`'s class is **not**: with no writer it is unclassifiable by the write/verdict test.                                                                                    |
| `is_curated` CHECK against `writePlant`'s three-statement sequence         | Deduction from reading, not an executed test. Rehearse on the local stack.                                                                                                                             |
| `restore-catalog` trigger exposure against `backups/`                      | That directory is gitignored and absent from this worktree. Simulation against the only available archive pair (rounds/11 before onto after, 695 common rows) gives 0 rows cleared on all four stamps. |
| Seed-crash manifest gap ever occurring                                     | Requires SIGKILL/OOM, not a caught error; the 28 traps were not searched for a matching incident.                                                                                                      |
| Service-role key not client-reachable                                      | **Carried from the RLS pass, not re-run.** Re-run the two greps before any privacy text ships; it is the only item in the privacy set resting on another pass.                                         |
| Whether `curate-editorial`'s missing withdrawal has already fired          | Undetectable by query: the state it creates is indistinguishable from a genuine approval. Adjacent detectable incoherence is clean (0 rows both directions).                                           |
| Whether `curate-styles` has already clobbered an approval                  | 0 incoherent rows live and `max(style_checked_at)` < `max(editorial_tags_at)`, but that ordering cannot rule out an earlier clobber-then-reapprove.                                                    |
| Every `seasonal_care` object having all 6 keys populated                   | Only "non-null object" was queried (720/720).                                                                                                                                                          |
| `garden_use_tags` fragmentation trend                                      | Point-in-time count; no historical snapshot queried.                                                                                                                                                   |
| Writers of `garden_use_tags` outside `apps/web/scripts` and `apps/web/lib` | Not searched.                                                                                                                                                                                          |
| "Mechanism 3" source wording                                               | Could not be located in the repo; verified as restated, not against its source text.                                                                                                                   |

### 6b. Single-analyst findings, not skeptic-checked

Blocker for every item below: **one analyst's receipts, no adversarial second pass.** Each is real enough to act on but should be re-checked before it becomes a load-bearing claim to anyone.

**Stamps (§3), minor.** Suffix mismatch: `round-status.ts:498` matches `_checked_at|_verified_at`, `check-round-scope.ts:86-89` matches `updated_at|_checked_at|_reviewed_at`; `ai_drafted_at` and `hardiness_verified` escape both, `native_to_reviewed_at` escapes round-status, `image_verified_at` escapes check-round-scope (so an out-of-scope image re-verify FAILs instead of getting the WARN demotion at `:327-330`). · Trap 22's cross-field cascade is hand-written in four homes (`apply-native-to-fixes.ts:116`, `cross-check-native-to.ts:712`, `cross-check-native-region.ts:427`, `archive/regenerate-native-to.ts:169`) and is the one place a trigger is the right mechanism; precedent shipped twice, both withdrawal-only. · The inverse CHECK (field written implies stamp set) is 0-violation today but catches no realised defect; every one (F1a, F2, F4) was the other direction. · F4's `REQUIRED_DRAFTED_FIELDS` prose extension is 0-violation today; the bloom_months variant would false-fail 29 rows.

**Stamps (§3), major.** The botanical guard reproduces trap 24 unfixed: 54 flagged rows across rounds 8-11 (28/8/14/4), 15 of them `disagree` severity (9/2/4/0), all stamped, and **nothing reads the reports** (grep for `cross-check-` returns only the scripts, `runbook.ts:103-112` step names, and comments). Either give the flags an apply/waive path or make round close read the round's own report and FAIL on unresolved disagreements.

**Constraints (§1).** Eleven catalog invariants live only in checker scripts; nine are 0-violation and expressible, two are not (companion existence is cross-table; round scope is inexpressible because `plants` has no round column, which is exactly why `check-round-scope` reconstructs scope from manifests plus `updated_at`). · **21 of 28 traps describe a fact the database cannot see** (a model judgment, a property of a run, or a property of the repo), which is the argument that stops constraint proposals being re-litigated; if one representation change were worth making it is a `seed_round text` column, which would collapse trap 12's manifest-versus-snapshot duplication. · Trap 26 has **no CHECK form at all**, only a representation change (dropping `style_tags`' NOT NULL DEFAULT), which is the expensive wrong answer when the stamp already answers the question at 0 rows unstamped; do not change the column, finish the 100-row repair. · **`is_curated = all three criterion stamps` is the invariant most worth promoting**: 0 violations of 720, the trigger enforces only the clearing half, and the asserting half lives in a lib 21 of 25 writers do not import. · Five columns the code treats as required are nullable and 0-null today (`scientific_name`, `description`, `seasonal_care`, `palette_plants.status`, `.source`); `scientific_name` is the cheapest real win because a null silently exits the duplicate guard. · Trap 6's unique `lower(btrim(common_name))` is 0-violation but converts a post-seed FAIL a human resolves into a mid-run INSERT error the seeders have no handler for (it would throw at `fix-round11-names.ts:254` before reaching that round's own collision pre-check at `:188-212`); add it only with ON CONFLICT paths. · Trap 7's unique `lower(scientific_name)` is free but guards only half the trap, since a synonym duplicate has two different scientific names by construction. · Trap 5 (unmapped colour) should **not** become an FK: it would put the vocabulary in two homes and turn a post-seed mapping task into a mid-seed failure. · The round-6 duplicate-pairs rule is representable (`unique index on (least(a,b), greatest(a,b))`, 0 violations of 1795) and the table already carries the sibling `no_self_pair` CHECK; decide first whether the same pair under two `combination_type`s is legal.

**Triggers and writes (§2).** No trigger in the schema rejects anything: 10 instances, 5 functions, **zero `RAISE`** across all 37 migrations. Keep it that way; a RAISE in either clearing trigger would break `restore-catalog` and every bulk pass. · **`curate-editorial.ts` has no path that withdraws an approval**: `:603` `if (approved) patch.is_curated = true` is the file's only `is_curated` write, criterion stamps are set only `if (verdict === 'pass')` (`:600-602`), and the trigger cannot cover the gap because it clears only when the criterion's _field_ changes. A re-judgment flipping an approved row to hold on image or tags prints "hold" while the database still records approval. Two one-line fixes: null the stamp for each non-pass criterion, and write `patch.is_curated = approved` unconditionally. · **`curate-styles.ts` is the one criterion-field writer that is neither the stamp's owner nor routed through `writePlant`**, its row fetch carries no `is_curated` predicate, and its summary never mentions the approvals its writes withdraw (298 rows carry `editorial_tags_at`). Do not change the trigger; count and print withdrawn approvals. · **`apply-sun-widening.ts` is non-convergent**, not merely one false success: the trigger resets `sun_requirements` to exactly the value the drift guard expects, so every re-run re-applies and re-prints "Widened N" forever. Archive it.

**Transactions and idempotence (§4).** **`restore-catalog --apply` can never converge**: the change filter compares whole-row JSON while `set_updated_at` overwrites the restored `updated_at`, so after a successful restore every restored row still reports as differing. Compare a projection. · **`purge-demo-users` swallows a Storage deletion failure and then destroys the only pointer to the orphaned objects** in the next statement (`lib/purge-demo-users.ts:91-101`), reporting `{deleted: N, photosRemoved: 0, failures: []}`. This is the only finding in the set where the lost state cannot be reconstructed. · **`writePlant`'s `preserveVerdict` path** is the one place a missing transaction matters: UPDATE #1 lands, UPDATE #2 throws, the row is left changed and unapproved, and `reconcileIsCurated` has exactly one caller so there is no sweep. The restore patch is pure and computable before the write, so collapse both into one RPC. · `draft-hardiness --redraft-unverified` is the only Claude-billing pass with no `--dry-run`, an overwrite predicate, and no write-time scope guard; blast radius 328 rows. · `curate-combinations`' dedupe is in-memory only and a plain UNIQUE would not close it (the key is order-independent). · Seed runs write the round manifest only after the loop, so a hard kill leaves upserted rows with no round attribution (rows themselves are atomic). · **Everywhere else the absence of transactions is correct** and should be left alone; `curate-editorial.ts:586-605` is the model.

**Migrations and types (§5).** Three migrations are recorded with `statements IS NULL` (`20260709092512`, `20260715120000`, `20260716120000`); two are pure DDL confirmed by the schema fingerprint, but `20260709092512` is a **data** migration (3 UPDATEs) verifiable only against the round-3 catalog archive. · `20260714120000`'s `comment on column` was never applied and its CHECK was rewritten into `= ANY(ARRAY[...])`, a second independent witness that statement-level loss is a pattern. · **`DbPlant` omits 7 of the table's 65 columns and declares `| null` on 10 NOT NULL columns**, and its header claims it "mirrors the Supabase plants table"; `style_tags: string[] | null` sits three lines from a comment spelling out trap 26. Generate it. · `check-migration-drift` compares only version and name; design for the content check is in section 3, item 11. · **Replay verdict: PASS, confirmed against prod** on four md5 fingerprints (columns/types/nullability/defaults `6de39df5…`, constraints `abc788e0…`, policies `664d7231…`, indexes `e436b770…`), 37 ledger rows, 6 of 8 function bodies matching by `md5(prosrc)` and the other two differing only by stripped comments and reflow. Record the four queries as the standing replay-versus-prod check. · **Verified negative:** no script anywhere in `apps/web` performs DDL; the only raw-SQL surfaces are `pg_dump` and three `.rpc()` calls to committed functions. · `test-editorial-trigger.ts` inserts and deletes a real row in the **live production catalog**, and its own stated precondition for moving off prod (a local stack) has been met since 2026-08-13; prod is clean today (0 `ZZ TEST%` rows).

**Tests and scripts (§8, §9).** Cost is not the blocker: the whole PR-gated suite is 223 tests in 1.29s and today's three tests add ~21ms. · The zero-writer shape is caught by nothing, and a 20-line source scan finds today's single violation in one pass. · Trap 24 is pinned at one of three sites and the other two have no pure selector, so the existing test cannot generalise; use a source scan with a `REPORT_ONLY_STAMPS` record rather than trying to unit-test them as they stand. · Runbook/registry drift is **already covered** by `round-rehearsal.test.ts` plus `pnpm runbook:check`; building it again would be a third home. · **The archive convention has been used exactly once**: 4 files in `7af885c` on 2026-07-28, and zero times in the 24 non-test scripts added since (16 on 07-29, 6 on 07-30, 2 on 08-14). `scripts/` grows and never drains. · Three scripts have zero tracked inbound references (only today's audit doc and a gitignored `.tsbuildinfo`): `wikimedia-image-proof.ts`, `repair-combinations.ts`, `backfill-legacy-editorial.ts`.

**Contract (§6).** The draft is honest about receipt versus inference and every live number re-queried came back exactly as stated; keep the `[inference]` convention and the Unverified block. · **`garden_use_tags` is actionable today** because the repo already has the exact guard shape it lacks, running on two colour columns: a `lib/garden-use-tags.ts` bucket map plus a case in `check-bloom-colors.ts`. Treat it as trap 5's fourth instance, not a new problem.

---

## 7. Corrections to the brief

1. "The 33 deliberate style-neutrals" is **34** (the 100 fabricated ones are separable by `style_checked_at = ai_drafted_at`, which is the backfill's fingerprint and the repair's verification predicate).
2. "F2/F4/F5 are one bug wearing three hats" is two-thirds right. F5 is a column with no writer; coupling a stamp to a write cannot fix a stamp nothing writes.
3. "Making the stamp a side effect of the write is the durable fix" is **undefined for the verifier stamps**. The generalisable form is "stamp from the verdict", which is what `rowsToStamp` implemented.
4. "The 14 stamp columns": 13 timestamp stamps plus the boolean `hardiness_verified`. State both or neither.
5. The brief says to read "the 8 existing script test files". There are **9** in `apps/web/scripts/` and only **6** pre-date this session; those six hold exactly 61 tests, which is where the audit's "61 existing test invariants" comes from. The full suite is 19 files / 223 tests. Neither count is 8.
6. The brief states the repo "archives with README rows, never deletes provenance". Narrower: `35029ff` deleted `backfillStyleStamps` outright today. `scripts/archive/README.md` says why: whole **files** that could be copy-pasted get archived; **code** whose provenance is in git and `database-log` may be deleted.
7. `docs/pipeline-audit-2026-08-14.md:158` on `hardiness_verified` is wrong in both halves (267 rows are true; there is no gate, and `lib/hardiness.ts` has no callers at all).
8. The audit's `verify-round.ts:302` finding is real as "a curated field nothing validates", **not** as a user-facing defect: the app reads only `plant_id_a`/`plant_id_b`, and `combination_type`/`strength` are never null.
9. The stamp census's caveat that hand-writes "cannot be ruled out" is settled for `hardiness_verified`: 267 true rows prove a non-code write path occurred. `native_to_reviewed_at` sits at exactly its backfilled 151, consistent with none.
10. The trigger brief's "curate-styles has no `is_curated` filter **and** runs unscoped" is half wrong: `curate-styles.ts:94` calls `requireScope`, which exits 1 without `--round`/`--ids`/`--all`. The header's `# Full run:` example at `:25-26` documents a command the script now refuses; delete that line.
11. The trigger brief's "no caller sets a specific `updated_at` expecting it to persist" is wrong twice: `apply-sun-widening.ts:277` (harmless) and `restore-catalog.ts:164` (load-bearing, see §4).
12. The transaction brief has `apply-sun-widening` backwards: it is non-convergent, not self-idempotent.
13. The transaction brief calls `curate-editorial` "safe". Atomic on the way up, one-way on the way down.
14. The transaction brief calls `restore-catalog` "fully idempotent". It converges in data and diverges in its own report, which for an undo tool is the half that matters.
15. The constraints pass listed function bodies as "assumed to match": now verified, all 8. Its verdict is now mechanical (four md5 fingerprints), not read-through.
16. The constraints pass filed the stale `native_region` comment as migrations-versus-live divergence. It is comment-versus-data; prod and the replay are identical. Its distinct-tag count is 50, not 49.
17. The constraints pass treated `applied_migrations()` returning all 37 in order as the ledger coming back clean. Version coverage is complete; statement-level it is not, and that function returns only version and name, so no query through it can see either condition.
18. The replay pass's "did not compare against production" caveat is closed; its 4-default spot-check is superseded by the full column fingerprint; its trap-25 conclusion is independently confirmed on prod.
19. The RLS pass's "db-backups object fetch not attempted" is closed: unauthenticated GET returns `NoSuchBucket`, same as diary-photos.
20. The RLS pass reported the `upsert_trefle_plant` exposure from prod only and framed the fix as prod-verifiable. It reproduces from the migrations alone, so the fix must be verified against a fresh replay too.
21. The brief calls `supabase/migrations` "the schema", and rule 11 says `db push` is the only thing touching prod schema. True of the **current** schema (fingerprints match). Not true of the historical record: applied SQL differs from the committed file for 3 of 34 versions after normalisation (`20260712201853`, `20260714120000`, `20260721195021`), three more have no recorded SQL, and comment text is dropped across the board.

---

## 8. Refuted claims

One line each, so the next review does not re-find them.

1. **"Mechanism 2 (a trigger that stamps on write) is refuted by this table's data and two realised incidents."** Refuted: 22 of the 34 style-neutral rows _did_ change value at judgment time (round-8 archives show non-empty tags before, `[]` after), so a change-keyed trigger would have stamped them; the `pick-plant-images` receipt is factually wrong (that update writes `image_pick_confidence` and `image_pick_reason`, one of which the editorial trigger watches); the `apply-sun-widening` incident is latent, not realised; and `sync_sun_requirements` is not the repo's only derive-on-write trigger (`set_updated_at` is the other). The abstract point that a change-keyed stamp cannot express "judged, unchanged" is still sound, and the recommendation (keep triggers withdrawal-only) may still be right.
2. **"The type widening that hid trap 26 is intact at 58 sites, so TypeScript still cannot reject `row.style_tags === null`."** Refuted at the mechanism: TypeScript deliberately exempts null from the TS2367 no-overlap check, proven by compiling the exact trap-26 shape against non-nullable generated types under this repo's own tsc (exit 0, while `=== 5` errors TS2367). Generating the types would not have caught trap 26. Also: 18 files, not 20; at least one of the 58 sites is a genuine API-response type; and `pnpm typecheck` does run on every PR.
3. **"Nine of the 14 stamp columns have more than one writer."** Refuted on the headline number: it is 11, because `editorial_description_at` and `editorial_tags_at` each have two writers, and the missed second writer is in the same five-key UPDATE (`backfill-legacy-editorial.ts:96-101`) the census already cited twice. Also: the "five written apart from their field" list enumerates six; `image_checked_at`'s no-photo branch belongs on it; `restore-catalog.ts:164` and `test-editorial-trigger.ts` are unlisted live write paths that touch all 14; and "hardiness_verified has no code writer" reads as if the column were all-false when 267 rows are true. The recommendation's ordering survives.

---

## 9. Next audit

**Recommended trigger, whichever comes first:**

1. **Round 12 close**, as a gate rather than a review: re-run the section 3 "must be true" list and confirm each item's receipt still holds. This is the natural trigger because a round is the only event that writes at scale.
2. **2026-09-14** (30 days), if no round has run. Basis: the `native_region` comment took 32 days to be noticed by an audit, and today's three highest-cost findings (F-0, F-2's 100 fabricated stamps, F-8's 12 lost synonym groups) were each introduced between 15 and 39 days before discovery. A 30-day cadence puts the audit inside that window.
3. **Condition, ahead of both:** the first PR that adds a stamp column, adds a script to `apps/web/scripts/`, or touches `upsert_trefle_plant`. Those are the three surfaces every critical finding above came from.

**Standing preference (from `feedback_big_audits_fresh_session`):** start it in a clean session, not at the tail of a working one, and open by stating which claims are verified against the live database versus only typechecked.

**Success criterion for the next audit:** it should be shorter than this one. If it is not, the pre-merge check in artifact (b) did not ship, or shipped without its escape-hatch records, and that is the finding.
