# Session handoff

**Current session only.** Rewritten each session, never appended to. Two things
belong here — what is in flight, and what to do next with the reasoning for its
order. Everything else is a command below or a pointer above.

| Looking for                          | Read                       |
| ------------------------------------ | -------------------------- |
| What is left, mechanically           | `pnpm backlog`             |
| Catalog, pipeline, migrations, traps | `docs/database-log.md`     |
| Product and structural decisions     | `docs/architecture.md`     |
| Tokens, colour, visual rules         | `DESIGN_SYSTEM.md`         |
| What changed and when                | `git log`                  |
| What to build next                   | Notion **Build Backlog**   |
| A dated audit or review              | history, not current state |

**Write the command, not the claim; the test is tense, not topic.**
`docs/database-log.md` standing rule 14, which governs every doc in the repo and
is enforced by `pnpm docs:claims`. It governs this file hardest: a dated heading
makes it look like a record, and it is not one — it describes what is in flight
right now, so every number in it is a state claim. Every line below is a record
or a command.

**If two sessions run at once, the last to finish rewrites this file.** Nothing is
lost: the durable half of a session belongs in the docs above before it belongs
here. Fold any still-open next step from the entry you replace into your own.

```bash
gh pr list --state open                 # what is open
git worktree list                       # who else is working, and where
git branch --list 'session/*'           # session branches alive
gh run list --branch main --limit 5     # did CI pass on main
cd apps/web && pnpm migrations:check            # is the live schema what the repo says
cd apps/web && pnpm catalog:state:check         # is the catalog doc stale
supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,inbucket,vector,logflare  # the light local stack (rule 11)
```

---

## 2026-08-16 — Round 12 ran, and closed 28/28

**PR [#168](https://github.com/Paradoxich/santolina/pull/168) is MERGED** as
`88b3815`; branch and worktree are gone, CI green before the merge.
**Nothing from this session is in flight.** The round's own story — the gap
test, what bit us, what is deliberately left — is the `2026-08-16 — Round 12`
entry in `docs/database-log.md` and is not repeated here.

**The catalog is at 748 species / 1864 pairs** and every current number is in
[`catalog-state.md`](../docs/catalog-state.md), generated.

**Next steps, in order. 1 through 4 are carried forward unconsumed from the
previous entry; round 12 consumed only its own step.**

1. **The out-of-round 16 — now 18, and the two additions are mine.**
   `fix-round12-names.ts` and `fix-round12-tags.ts` went onto
   `RUNS_WITHOUT_PROVENANCE` as one-off passes, matching how rounds 8 and 11's
   name passes are recorded. That list is the queue.
   `backfill-guard-stamps` still matters most: its state-derived half was
   deleted after it fabricated 100 stamps. `apply-native-to-fixes`,
   `apply-image-reverts` and `feed-wikimedia-candidates` all CLEAR a stamp, so
   shape 12 refuses them until they pass evidence — which is the guard working.
   **Round 12 corrected a claim worth carrying:** shape 12 refuses to WIRE such
   a script without evidence; it never prevented running one. That
   misreading is why `Filipendula purpurea` nearly shipped with a placeholder.
2. **Then per-column exclusivity, which is what earns `confirming` back.**
   The order is still forced and trap 29 still has the reasoning: five of the
   seven witnessed columns have more than one writing step
   (`native_checked_at` three, `image_verified_at` four), so the key has to be
   the COLUMN across every writer — and most of those writers are in step 1.
   **Do not DESIGN it early either.** The census it must be designed against is
   the complete one, and step 1 changes that census.
   Round 12 supplied the first real evidence that the mechanism behaves:
   `apps/web/runs/2026-08.jsonl` is no longer empty, strengths came out
   `bounded` and `corroborated` exactly as predicted, and nothing recorded
   `confirmed`.
3. **Then the three hygiene items**, any order. The migration-drift content
   check needs `applied_migrations()` to return `statements`, so it needs a
   migration and Ana's push (rule 11); 31 of 34 versions already match byte for
   byte. The graveyard pass moves the three in `SCRIPTS_PENDING_ARCHIVE` to
   `archive/` with README rows, and `repair-combinations.ts` needs a
   `database-log` line in the same change. And 21 of 30 traps are unpinned —
   trap 1 is still the cheapest and highest-consequence.
4. **Round 13 has no theme and needs a gap test before it has one.** Round 12's
   probes killed small-space (84% held), dry shade (73%) and left late-season
   surviving but thin at 62%. Those numbers are in `seed-round12.ts`'s header
   and are the starting point, not a result to reuse — the catalog moved.
   **Two frictions will recur and neither is fixed:** `run-round` still has no
   `--baseline` passthrough, so the rule-1 backup must be taken in the shared
   checkout and copied into the worktree by hand; and `cross-check-plants` will
   flag `plant_type` on every sedge and rush seeded, the round-4 false-positive
   class, left naive on purpose.

**Waiting on Ana:** the two climbing hydrangeas, the `Cenolophium` region
correction, the rounds 1-6 editorial pass, the `modern` re-tag, and whether an
empty `common_issues` / `environment_benefits` is legitimate (21 and 4 drafted
rows) — that last one decides whether they join `REQUIRED_DRAFTED_FIELDS`.
Round 12 added two photo holds to the pile (`Rodgersia pinnata` and
`Acorus gramineus`, both "species unsure"), and they need a photograph rather
than a decision. Build Backlog rows still owed: the `curate-styles` withdrawal
counter, the orphaned-photo reconciliation sweep, and **50 of 748 rows still
showing a Latin binomial where a garden name belongs** (round 12's own six are
fixed; the rest predate it).

**Standing:** the next audit is round 13's close or 2026-09-14, whichever
first, early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.

**What this session adds to the same lesson.** Twice, a tool answered a
narrower question than the one being asked and the answer was promoted.
`pick-plant-images` printed "errored" for seven rows, which covers both a
transient timeout and a dead URL — opposite responses — and the reason had to
be read out of the Batch API by hand. Then the Wikimedia feeder reported "no
usable P18 photo" and that was read as "no photo exists" while Commons held ten
files. Both are trap family A from the REPORTING side rather than the fetching
side, and both were invisible until someone went and asked the source directly.
**The third instance is the one worth pinning: a witness that matches the shape
instead of the defect cannot expire.**
`OPEN_FINDINGS['round11-names-unpaginated']` keyed on
`.select('scientific_name, common_name')`, a string the fixed version still
contains, so it had to be closed by hand rather than failing on its own.

**Open questions:** none.
