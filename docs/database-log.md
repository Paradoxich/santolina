# Database session log

**Read this before any work that touches the Supabase catalog. Append to it after.**

Every entry below was written because someone lost time, money, or data to something that was not obvious. The point of this file is that the next session does not have to rediscover any of it.

## What this file is, and what it is not

|                        | Answers                                                    |
| ---------------------- | ---------------------------------------------------------- |
| **This file**          | What has been DONE to the database, and what BIT us        |
| `docs/architecture.md` | WHY the system is shaped the way it is (design rationale)  |
| `apps/web/rounds/<n>/` | WHAT a specific round seeded (machine-readable provenance) |
| Notion Session Log     | Narrative of a work session, incl. non-database work       |

If a fact belongs in two places, it goes here as the short operational version and there as the full reasoning, with a pointer. Do not duplicate whole explanations.

---

## Standing rules

1. **Back up before any bulk write.** `scripts/backup-catalog.ts`. Non-negotiable. `backups/` is gitignored and local-only, and **Free-plan projects cannot download or restore Supabase's own daily backups** — so the durable copy is `archive-round.ts`, which commits the catalog gzipped into `rounds/<n>/catalog/` (`before-*` = the round's rollback point, `after-*` = what it left behind, ~2.3MB a round). Restore from either with `restore-catalog.ts <dir> [--phase before|after]`.
2. **Storage is in NO database backup, on any plan.** The database holds only metadata about bucket objects, so `backup-catalog.ts`, the committed round archives and Supabase's own daily backups all leave the buckets uncovered. Run `scripts/backup-storage.ts`. **`diary-photos` is private user data and must never be committed** — git history is forever; sync it somewhere private instead. `plant-images` is public product data (`image_url_curated` points at it, so a lost object 404s a plant page).
3. **Scope every script to a round.** Use `--round <label>`, which reads `rounds/<label>/manifest.json`. Never rely on `created_at` heuristics, and see trap 2 before trusting `--new-only`.
4. **Generate, review, then apply.** Any script offering `--apply` writes nothing until you have read its report. This split is the single reason trap 1 did not corrupt the catalog.
5. **Never bare `.select()` on a full table.** It silently caps at 1000 rows. Use `fetchAllRows` from `lib/paginate.ts`. The catalog is at 595 and climbing.
6. **Never flip `is_curated`.** It means "Ana has editorially reviewed this row" and is hers alone. Scripts draft; they do not sign off.
7. **After any schema or request-shape change, run `--limit 3` first.** A green typecheck does not verify a runtime API contract.
8. **Finish with `verify-round.ts --round <label>`.** Without `--round` it checks that data is _valid_ but not that the pipeline actually _ran_.
9. **Append an entry here.** `scripts/log-db-session.ts --round <label>` writes the factual part for you.

**Rule 9 is enforced, not encouraged.** `.husky/check-db-log.sh` runs on every commit and blocks it if a round directory is committed without an entry naming that round, if a migration is committed without touching this file, or if this file still contains the `TODO —` placeholders the script writes. Git cannot see what you ran against Supabase — only what you commit — so the hook checks the artifacts database work leaves behind, and the honest reading of a green hook is "you recorded something", not "you recorded enough". `--no-verify` exists and is occasionally right (a revert, a docs fixup). It is not the normal path, and whatever you skip is inherited by whoever comes next.

---

## Known traps — do not rediscover these

### 1. A failed fetch must never look like a negative result — FIXED (round 8)

`regenerate-native-region.ts` paced Trefle at ~500 req/min against a documented 120 req/min limit, so a cold cache began returning HTTP 429 after ~120 species. The `catch` stored the 429 as a cache entry, and downstream **an errored entry was indistinguishable from "this plant has no native range"**, so each silently routed to the AI prose fallback.

The run **reported success** with a believable source mix — `trefle-l3=121, native_to-fallback=469` — that was really 466 rate-limit errors converted into model-derived guesses. `--apply` would have overwritten most of the catalog's authoritative regions, including rows unrelated to that round. Correct numbers after the fix: `trefle-l3=571, fallback=19`.

**Rule this generalises to:** wherever a fallback exists, a failed fetch must be structurally distinguishable from a legitimate empty answer, and the script must **throw** rather than degrade. Full write-up: `architecture.md` §26.

### 2. `--new-only` does not scope to a batch — WORKED AROUND (round 8), baseline backfilled (July 28)

Both cross-check guards accept `--new-only`, which keys off `botanical_checked_at` / `native_checked_at` being NULL. That only narrows to a fresh batch **once every other row carries a stamp**, and that baseline was never established — the stamp columns shipped mid-history and older rows were never backfilled.

At round 8: 0 of 494 rows stamped, so `cross-check-plants --new-only` selected **all 595 plants instead of the 101 new ones**. Every round since those columns shipped had been re-billing Claude for the entire catalog. Nothing errored; the only symptom was a count in a log line.

**Use `--round <label>` instead.** It needs no baseline.

**Backfilled July 28 2026 — and the reasoning that had blocked it was wrong.** This entry previously said "there is no per-row evidence they were ever checked", citing a round-8 self-test that found sampled older plants at `0/4`. **That was circular:** `round-status.ts` detects a check _by its stamp_, so unstamped rows can only ever report `0/N`. It proved the stamps were missing, not the checks.

The real explanation is simpler: **the stamp columns arrived in migration `20260716120000`, on July 16.** Every cross-check before that date physically could not stamp anything. A null stamp on an older row means the column did not exist yet.

The archived reports are dated evidence, and they line up exactly with the catalog:

| report                                 | checked | covers                                     |
| -------------------------------------- | ------: | ------------------------------------------ |
| `cross-check-2026-07-09-22-32-26.json` |     201 | the whole catalog that day (29 + 96 + 76)  |
| `cross-check-2026-07-14-15-36-52.json` |     100 | round 6's batch                            |
| `cross-check-2026-07-15-19-19-21.json` |      76 | round 7's batch                            |
| `native-to-crosscheck.json`            |      76 | round 7's batch, **every row named by id** |

`scripts/backfill-guard-stamps.ts` stamped 451 rows — **375 botanical + 76 `native_to`** — each **dated to the report's own `ran_at`**, not to the day of the backfill. A stamp claiming a July 9 check happened on July 28 would be its own small lie. It refuses to write any group whose live row count disagrees with the report's `checked` figure.

**What stays NULL, deliberately, and matters more than what got stamped:**

- **the 116 plants seeded 2026-07-12** (the regional-natives round) — no surviving botanical report covers them
- **every pre-round-7 row for `native_checked_at`** (418) — `cross-check-native-to.ts` wrote to a **fixed filename** and overwrote its own history every run. We know earlier runs happened; the evidence is gone. This is exactly what `archive-round.ts` was later built to prevent.

Null on those rows is the correct answer: it means a future guard run picks them up. **Strength of evidence, stated plainly:** the botanical reports name only the _flagged_ plants, so the clean rows are inferred from "checked count == catalog size on that date". Strong, but an inference. The `native_to` report names every row it covered, so that one is per-row proof.

### 3. Full-catalog regeneration outlived its migration — FIXED (round 8)

`regenerate-native-region.ts` started as a one-time migration and kept its full-catalog scope long after that migration finished, so every round re-derived all ~600 plants when only the new ones needed it. Two consequences: it is the reason the Trefle rate limit in trap 1 was reachable at all, and it **silently rewrites settled data** — round 8's full run changed 20 pre-existing plants alongside its own 101.

The `MANUAL_OVERRIDES` table in that script exists because hand-corrections were being clobbered by re-generation. It patches the symptom one plant at a time.

**The script now refuses to run without `--round <label>` or `--all`.** There is no default.

### 4. Steps can silently not run at all — FIXED (round 8)

Every guard in this repo checks whether a value is _wrong_. Until round 8, nothing checked whether work _happened_. Three separate steps had silently not run:

- `--new-only` never scoping (trap 2)
- **no `seasonal_care` step existed in the runbook**, so every plant seeded after Care Tips v2 shipped had no care tip at all — the feature is live and reads `seasonal_care[currentStage]`
- **round 7's 76 plants were never hardiness-drafted**, found only because round 8's draft picked up 177 plants instead of 101

All three were invisible because `verify-round` WARNs rather than FAILs on those fields — correct while a field is parked, wrong once the feature ships.

**`verify-round.ts --round <label>` now asserts per-step completeness** and exits 1 on a gap (`scripts/round-status.ts`). When §27 hardiness work resumes, promote its WARN to FAIL there.

### 5. Unmapped colour values vanish from the filter — recurring, guarded

A `bloom_color` or `foliage_color` value not present in `lib/bloom-colors.ts` / `lib/foliage-colors.ts` does not error. It **silently drops the plant out of the Explore colour filter**. Every seed invents new shades: round 8 produced 12.

Run `check-bloom-colors.ts` after every seed and map each new value into an existing bucket or the matching ignore set. The map's own rule decides: distinctive standing colour gets a bucket; seasonal turns, new growth, plain-green-plus-a-detail, underside-only, and cultivar-dependent values are ignored.

### 6. Trefle common names are botanical, not horticultural — recurring, expect it

Trefle's names come from floras and USDA lists. Every batch lands three defects:

- **no English name at all**, so the mapper falls back to the scientific name (18 of 101 in round 8)
- **a name belonging to a different species** ("Alpine woodfern" is not _Dryopteris wallichiana_)
- **the food-crop name for an ornamental** (_Colocasia esculenta_ as "Coco-yam")

Worst case is a **collision with a species already in the catalog**: round 8 received _Cercis canadensis_ as "Judastree", which is _C. siliquastrum_, already held. Two species then share one display name and search cannot separate them.

`verify-round` now FAILs on duplicate `common_name`. Pattern a fix pass on `scripts/fix-round8-names.ts` — each entry carries the value it expects to find, so a drifted row is skipped rather than overwritten. **A name pass can create the very collision it exists to remove** (round 8 did: renaming _Anemonoides nemorosa_ to "Wood anemone" collided with _Anemone quinquefolia_), so always re-check duplicates afterwards.

### 7. Seed by ID, never by name search — recurring

Trefle's name search silently resolves to sibling species. Seed by verified Trefle ID or exact synonym-aware genus+species match, and log any drift.

**Shade and woodland batches need their synonym groups written before the dry run** — those genera have been widely segregated (Anemone→Anemonoides, Blechnum→Struthiopteris, Scilla→Othocallis, Ipheion→Tristagma, Sedum→Petrosedum, Meconopsis→Papaver). Round 8's exact-match guard caught two candidates that would otherwise have bound to a species already in the catalog.

### 8. `reports/` is gitignored, so a fresh worktree has a cold cache

Rounds are run in `git worktree` checkouts to avoid clashing with other sessions. A new worktree has no `reports/`, so every cache is cold and scripts refetch everything. **This is the condition that surfaces rate-limit and pagination bugs** — trap 1 lay dormant for rounds precisely because existing checkouts had warm caches.

### 9. Trefle field names: `tdwg_code` / `tdwg_level`, not `code` / `level`

Reading the wrong field names leaves the code undefined, every zone falls through as unmapped, and the plant ends up untagged. See `architecture.md` §26.

### 10. Trefle's `distributions.native[]` includes INTRODUCED range — MOSTLY OPEN

Traps 1 and 9 are the pipeline failing to fetch. This one is the fetch succeeding and the answer being wrong, which no amount of pipeline hardening finds. Trefle does not reliably separate where a plant is _from_ from where it now _grows_, so `native_region` has been answering the wrong question — and that field is the entire basis of the "native to my region" filter.

`Imperata cylindrica` was tagged China / Eastern Asia / Indo-China, which is exactly the range it was **introduced** into; it is native to Africa, the Mediterranean and West Asia. Sixteen regions wrong, and inverted.

**Validate with `cross-check-native-region.ts` against WCVP** (Kew's checklist, read through GBIF). Report-only by default. Two refusals are deliberate: "no WCVP rows" is treated as no-data rather than as an empty native range (trap 1's lesson), and a region name it cannot map is an error, never a silent omission. Clearing a row needs `--allow-empty` on top of `--apply`.

Two WCVP quirks worth knowing. It occasionally **omits the establishment marker**, so a single unmarked Level 3 row invents a whole Level 2 region — `Galium verum` read as native to Australia off one Tasmania row, while GBIF's own GRIIS-Australia dataset lists it as introduced. And a reviewed decision must outrank it: `Rosmarinus officinalis` has Western Asia deliberately cut and WCVP disagrees, which is why `MANUAL_OVERRIDES` now lives in `lib/native-region-overrides.ts` and is read by both the generator and the checker.

**Status: 20 rows validated (7 corrected), ~575 not.** A 60-plant sample scored 56 clean against 1 genuinely wrong, so the tail is real but small. Do not point `--apply` at `--all`.

### 11. GBIF's `species/match` fails UPWARD, into a genus

Hand it a binomial it does not know and it climbs the taxonomy rather than returning nothing: `Pennisetum alopecuroides` comes back as the **genus `Cenchrus`**, `matchType: HIGHERRANK`. Accepting that fetches an entire genus's distribution — it was about to widen one grass from "Eastern Asia" to 41 regions including Brazil and New Zealand.

This is trap 7 in different clothes: **an external name lookup that guesses is more dangerous than one that fails.** Require `EXACT` at species rank _and_ that the canonical name returned is the one you asked for. Normalise the `×` away first, or every hybrid in the catalog reads as unmatched.

### 13. Applying a migration through the API stamps its OWN version — FIXED July 28 2026

`apply_migration` (the Supabase MCP tool / Management API) records the migration under a version it generates, **not** under your local filename. Four migrations had been applied that way, so the remote ledger and `supabase/migrations/` held the same 26 migrations under four different version stamps:

| local file       | remote version   | migration               |
| ---------------- | ---------------- | ----------------------- |
| `20260721210000` | `20260721204551` | add_curated_plant_image |
| `20260722120000` | `20260721230049` | add_image_attribution   |
| `20260724120000` | `20260724120842` | add_is_greenery         |
| `20260724120500` | `20260724120938` | add_greenery_checked_at |

**The schema was never wrong — this is ledger drift, not data drift.** The danger is `supabase db push`: it would not recognise those four local filenames as applied and would try to re-run them against production.

**Fixed by renaming the local files to the remote versions**, not by repairing the remote ledger. The remote versions record when the migrations actually ran, so they are the truthful record, and renaming touches **no production state at all**. Relative apply order was preserved (checked explicitly — `add_is_greenery` still precedes `add_greenery_checked_at`), and local now matches the remote ledger exactly, 26 for 26.

**The durable rule:** if you apply a migration through the API or MCP rather than `supabase db push`, reconcile the filename to the version the remote recorded in the same session. `supabase migration repair --status applied <version>` is the other direction and is the right tool when the local filename is the truthful one.

### 12. A round manifest records names as SEEDED, before the name pass

`rounds/<n>/manifest.json` is written by the seed run, so its `common_name` values predate `fix-round8-names.ts`. Per trap 6, Trefle gave no English name to 18 of round 8's 101 rows, and those sit in the manifest under their bare scientific name. Grepping a manifest by common name therefore returns a confidently wrong answer: it is how a review concluded round 8 had seeded nothing that could collide, when it had seeded `Anemonoides nemorosa` — the direct cause of a rename. **Search a manifest by `scientific_name`**, and cross-read the round's name-fix script.

---

## Sessions

<!-- Newest first. Append with: scripts/log-db-session.ts --round <label> -->

### 2026-07-28 — Style re-tag pass: cottage 89.6% → discriminating tags

**Branch** `session/2026-07-28-cottage-tags` (worktree `santolina-cottage-tags`, off `main`). No new species. Catalog unchanged at **595 / 1485**; only `style_tags` rewritten. Written by hand: not a round.

Closes the open question from the round-8 entry: `cottage` tagged 533 of 595 rows (89.6%; classic 63%, wildflower 55%) because the curate-plants prompt listed the six tag names with no definitions and no selectivity bar, making the style filter's most-used option a no-op.

**Schema:** migration `20260728150000_add_style_checked_at` — nullable `style_checked_at timestamptz` stamp on `plants`, guard-stamp convention. **Applied to remote via `apply_migration`** before the pass ran.

**Data written:** `style_tags` overwritten + `style_checked_at` stamped on every judged row by the new `scripts/curate-styles.ts` — a blind re-judgment (the model never sees the old tags) against shared definitions in `lib/style-tags.ts`. Backed up first per rule 1 (`backups/2026-07-28T11-48-09-479Z`). Smoke-tested `--limit 3 --dry-run`, then `--limit 3` live, then two passes:

- **Pass 1 (all 595, 0 failures):** cottage 89.6% → 53.5%, classic 63.4% → 13.9%, wildflower 55.1% → 17.1%; 25 style-neutral.
- **Pass 2 (the 318 still-cottage rows, stricter cottage bar):** the definition now demands primary identity with exclusions (woodland/shade, groundcovers, grasses, ferns, structural shrubs), and `garden_use_tags` was dropped from the prompt as an anchor — it dates from the loose era and all 57 rows saying "cottage gardens" carried the tag. Result: **cottage 294 of 595 (49.4%)**, mediterranean 26.9%, lush 17.0%, wildflower 16.6%, modern 16.0%, classic 15.8%, 30 style-neutral. The model genuinely reads ~half this catalog as cottage — consistent with its ornamental-perennial lean (round 8 measured cottage 455/494 pre-balance). Further tightening is an editorial call, not a prompt bug; the in-script >40% warning stays on so the next full run resurfaces it.

**Cut short by billing:** pass 2 failed its last 14 plants on `credit balance is too low` — the Anthropic account ran dry mid-run. The script failed loud per trap 1 (no fallback, names + request ids in the run log); those 14 keep their valid pass-1 tags and stamps. **No AI curation of any kind can run until credits are topped up.** Pending re-run once they are (from `apps/web`):

```
./node_modules/.bin/tsx --env-file=.env.local scripts/curate-styles.ts --ids f2276f3a-a2f4-498c-9598-81768ccc6544,319a76f9-1829-4fd5-9158-8429c173aab0,c7a83cda-f46b-48f5-bbff-4adbe5e5c350,ffba2dd5-8d0e-4368-8b9b-d4feed9a8337,62a5994c-420e-441d-80bd-b61e488cfd4b,69778467-89e5-4dd8-b108-d3cb00761109,377cfcff-785d-4484-ac3c-267537222c89,d92c9418-7472-4cdc-b9e6-18e74df95d6d,b68c1cd0-afe3-48a0-88a6-1606fbef1197,ca69cd58-0cc7-4f87-8a70-59ef5b8baf9f,e7205ed5-2e07-4707-ac6e-94c5e0cc60d9,709da564-a5e9-4fff-82d5-d93c77a282a8,1aefdeef-0015-4f06-a2a6-496f2f476767,d61119c1-bc9e-4cce-b1a9-7f3c868b2c64
```

(The 14: Winter jasmine, Winter-aconite, Wood anemone, Wood spurge, Woodbine, Woodland sage, Woodland tobacco, Woodruff, Woolly digitalis, Yellow archangel, Yellow azalea, Yellow corydalis, Yellow oxeye, Yellow wood anemone.)

**Semantics change:** `[]` is now a valid style-neutral judgment. `curate-plants.ts` treats only NULL `style_tags` as missing (an empty array no longer triggers a re-ask through the loose path), and both curation entry points share `lib/style-tags.ts` so the definitions cannot drift.

### 2026-07-28 — Round 8 follow-up: scope guard, and native_region validated against WCVP

**Branch** `chore/round-scope-check` (worktree `santolina-round-scope`, off `origin/main`). No new species. Catalog unchanged at **595 / 1485**. Written by hand: `log-db-session.ts` refuses a second entry for an already-logged round, correctly — this is a follow-up session, not a round.

**Why this session happened.** The round-8 entry below records that `native_region` was rewritten catalog-wide, "121 changed — 101 new plus 20 pre-existing". Nobody had looked at those 20. Looking at them turned up something larger than the overreach itself.

**Built: `check-round-scope.ts`.** The mirror of `round-status.ts` — that asks whether every step ran for the round's plants, this asks whether any step ran on plants that were _not_ the round's. Diffs the round's pre-seed backup against the live catalog; FAILs on a data column changed on an unmanifested row, on an unmanifested insert or delete, and on a companion pair added or removed between two plants that both predate the round. Bookkeeping stamps WARN. Works off DB state, not any script's report, so it covers steps that write no report and steps not yet written.

Over round 8 it found **101 out-of-scope writes**, every one since traced:

| what               | count | cause                                                                                           |
| ------------------ | ----: | ----------------------------------------------------------------------------------------------- |
| `hardiness_rating` |    76 | `draft-hardiness` backfilling round 7's never-drafted batch (trap 4) — remediation, not a stray |
| `native_region`    |    20 | the known regeneration overreach (trap 3), now validated — see below                            |
| `common_name`      |     3 | `fix-round8-names.ts`; 1 self-inflicted collision, 2 pre-existing (trap 12 bit the review here) |
| pairings           |     2 | `curate-combinations` topping up under-cap plants from the whole roster, by design (§19)        |

All waived in `rounds/8/scope-allow.json`, each entry carrying its cause, so round 8 exits clean and the next round starts from a green baseline instead of a permanently red check. **Exactly one of the 101 was a genuine mistake** — the `native_region` overreach that started this.

**Built: `cross-check-native-region.ts`, and trap 10 with it.** Validating those 20 against WCVP showed Trefle conflates native with introduced range (details in trap 10; `Imperata cylindrica` was 16 regions wrong and inverted). **13 of the 20 already matched WCVP; 7 did not and were corrected.**

**Data written:** `native_region` on 7 rows — Solomon's-seal (+Indo-China), Snowy mespilus (5→2 regions), Lady's bedstraw (−Australia), American wood anemone (−South-Central U.S.A., +Western Canada), Summer savory (rebuilt), Biquinho pepper (Western→Northern South America), and **Lemon cleared to empty**: `Citrus limon` is a cultigen whose 94 WCVP rows are every one introduced, so it is now a `noWildRange` override plus a `verify-round` hybrid exemption rather than a permanent gap. `verify-round`: **0 failures**, 44 image warnings.

**Also found:** traps 11 and 12, both caught by _reading a report_ rather than by anything failing — which is the standing argument for report-then-apply. `MANUAL_OVERRIDES` moved to `lib/native-region-overrides.ts` so the generator and the checker cannot drift apart.

**Deliberately not done:**

- **Migration ledger drift reconciled** (trap 13): four local migration filenames renamed to the versions the remote actually recorded, after `apply_migration` had stamped its own. No production state touched; local and remote now match 26 for 26. `supabase db push` is safe again.
- **Round 8's committed catalog snapshot refreshed** after the backfill, via the new `archive-round.ts --catalog-only`. A snapshot is a picture of one moment, and the `after-*` copy had already gone stale within hours — restoring it would have silently reverted 376 rows. `restore-catalog.ts` now warns when live rows changed after the snapshot was taken.
- **Guard-stamp baseline backfilled** (trap 2): 451 rows stamped from the archived reports — 375 botanical, 76 `native_to` — each dated to when the check actually ran. 116 July-12 rows and 418 pre-round-7 `native_to` rows left NULL on purpose, because no evidence covers them. The reasoning that had blocked this for a round was circular and is corrected in trap 2.
- **Storage buckets now backed up** — `scripts/backup-storage.ts` pulls every bucket to the gitignored `backups/storage/<stamp>/`. First run: 3 objects, 305 KB (`plant-images` 1 real hero; `diary-photos` 2 leftover 68-byte test PNGs from July 8). **This gets the objects off Supabase, not off the laptop** — `diary-photos` is private user data and cannot be committed, so syncing it somewhere private stays manual.
- **~575 plants still unvalidated against WCVP.** Sample says ~2% are wrong. Run in reviewed batches; do not point `--apply` at `--all`
- the 405 `updated_at` / `*_checked_at` stamps on unseeded rows left as WARN — guards re-stamp by design
- nothing pushed, no PR opened, `is_curated` untouched throughout

### 2026-07-27 — Round 8 (shade & structure), 494 → 595 species

**Branch** `feat/plant-round-8` (worktree `santolina-round8`, off `origin/main`).

Catalog **494 → 595 species, 1230 → 1485 combinations**. 101 species seeded; first round chosen from measured gaps rather than a theme (shade was 75/494; modern/lush were 59/64 against cottage 455). Shade-thriving → 109, lush → 105, modern → 76.

All seven pipeline steps confirmed complete for the round's 101 plants via `verify-round --round 8`; **0 failures**.

**Found and fixed here:** traps 1, 2, 3, 4 and 6 above — all of them pre-existing, none introduced by this round.

**Data written:** 101 new plants (curated, paired, region-tagged, hardiness-drafted, seasonal-care distilled); 255 new combinations; 49 corrected common names; 4 display-name collision fixes (3 pre-existing pairs, 1 self-inflicted); `native_region` rewritten catalog-wide (595 rows, 121 changed — 101 new plus 20 pre-existing, see trap 3).

**Deliberately not done:**

- `is_curated` left `false` on all 101 — the name work is mechanical, the voice pass is Ana's
- guard stamps on the older 494 not backfilled (trap 2)
- image pass not run — 13 plants have no image, 44 rows on placeholder; §30/§31 is a separate Batch API flow
- `cottage` now tags 533 of 595 rows, behaving as a default rather than a signal — curation-prompt question, open

---
