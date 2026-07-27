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

1. **Back up before any bulk write.** `scripts/backup-catalog.ts`. Non-negotiable.
2. **Scope every script to a round.** Use `--round <label>`, which reads `rounds/<label>/manifest.json`. Never rely on `created_at` heuristics, and see trap 2 before trusting `--new-only`.
3. **Generate, review, then apply.** Any script offering `--apply` writes nothing until you have read its report. This split is the single reason trap 1 did not corrupt the catalog.
4. **Never bare `.select()` on a full table.** It silently caps at 1000 rows. Use `fetchAllRows` from `lib/paginate.ts`. The catalog is at 595 and climbing.
5. **Never flip `is_curated`.** It means "Ana has editorially reviewed this row" and is hers alone. Scripts draft; they do not sign off.
6. **After any schema or request-shape change, run `--limit 3` first.** A green typecheck does not verify a runtime API contract.
7. **Finish with `verify-round.ts --round <label>`.** Without `--round` it checks that data is _valid_ but not that the pipeline actually _ran_.
8. **Append an entry here.** `scripts/log-db-session.ts --round <label>` writes the factual part for you.

**Rule 8 is enforced, not encouraged.** `.husky/check-db-log.sh` runs on every commit and blocks it if a round directory is committed without an entry naming that round, if a migration is committed without touching this file, or if this file still contains the `TODO —` placeholders the script writes. Git cannot see what you ran against Supabase — only what you commit — so the hook checks the artifacts database work leaves behind, and the honest reading of a green hook is "you recorded something", not "you recorded enough". `--no-verify` exists and is occasionally right (a revert, a docs fixup). It is not the normal path, and whatever you skip is inherited by whoever comes next.

---

## Known traps — do not rediscover these

### 1. A failed fetch must never look like a negative result — FIXED (round 8)

`regenerate-native-region.ts` paced Trefle at ~500 req/min against a documented 120 req/min limit, so a cold cache began returning HTTP 429 after ~120 species. The `catch` stored the 429 as a cache entry, and downstream **an errored entry was indistinguishable from "this plant has no native range"**, so each silently routed to the AI prose fallback.

The run **reported success** with a believable source mix — `trefle-l3=121, native_to-fallback=469` — that was really 466 rate-limit errors converted into model-derived guesses. `--apply` would have overwritten most of the catalog's authoritative regions, including rows unrelated to that round. Correct numbers after the fix: `trefle-l3=571, fallback=19`.

**Rule this generalises to:** wherever a fallback exists, a failed fetch must be structurally distinguishable from a legitimate empty answer, and the script must **throw** rather than degrade. Full write-up: `architecture.md` §26.

### 2. `--new-only` does not scope to a batch — WORKED AROUND (round 8)

Both cross-check guards accept `--new-only`, which keys off `botanical_checked_at` / `native_checked_at` being NULL. That only narrows to a fresh batch **once every other row carries a stamp**, and that baseline was never established — the stamp columns shipped mid-history and older rows were never backfilled.

At round 8: 0 of 494 rows stamped, so `cross-check-plants --new-only` selected **all 595 plants instead of the 101 new ones**. Every round since those columns shipped had been re-billing Claude for the entire catalog. Nothing errored; the only symptom was a count in a log line.

**Use `--round <label>` instead.** It needs no baseline.

**Still open for Ana:** whether to backfill stamps on the pre-round-8 rows. Deliberately not done — there is no per-row evidence they were ever checked, and stamping on that assumption would permanently hide a genuinely unchecked plant. A self-test in round 8 confirmed the concern is real: sampled older plants showed `0/4` for both cross-check steps.

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

---

## Sessions

<!-- Newest first. Append with: scripts/log-db-session.ts --round <label> -->

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
