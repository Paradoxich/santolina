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

## 2026-08-17 — Steps A, B and the style vocabulary landed. Nothing in flight.

**Both of the day's branches are merged and neither worktree holds anything.**

| PR                                                                 | branch                                 | what landed                                                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [#170](https://github.com/Paradoxich/santolina/pull/170) `839eaf8` | `session/2026-08-17-obligation-policy` | plan steps A and B: `StepDef.obligation`, `invariants:check` shape 16, `pnpm catalog:status`                                  |
| [#171](https://github.com/Paradoxich/santolina/pull/171) `aac993d` | `session/2026-08-17-style-vocabulary`  | plan step D's inputs: `STYLE_TAGS` 6 → 20, definitions tuned against a 50-row pilot, `STYLE_OPTIONS` derived from live counts |

The obligation half is the `2026-08-17 — Who owes an old row` entry in
`docs/database-log.md` and standing rule 16. **The vocabulary half has no entry
there** — see the correction at the foot of this file.

---

**Next steps, in order. Everything gates round 13** — Ana's ruling 2026-08-17.
A round chooses its theme by measuring the catalog, so mis-tagged rows make the
gap test lie; the `modern` item is the proof case, where a seed round was nearly
run against what was a tagging gap.

Steps 1 to 4 are the rest of the approved plan; 5 to 8 are carried forward and
are not in it. **Two arrows are load-bearing.** C before D: the re-tag withdraws
editorial approval on every row whose tags change, and nothing counts them until
C. D before D2: the editorial pass judging rows whose tags are about to change
pays for the same verdicts twice.

1. **The reviewed-mutation primitive (C). Next, and it gates the two paid
   passes.** Six scripts hand-roll the same drift guard: `from: string //
expected current value — drift guard` appears verbatim in
   `fix-round8-names.ts:59`, `fix-round11-names.ts:75`,
   `fix-round12-names.ts:64`, `fix-round12-tags.ts:79`, with `expect` in
   `apply-native-to-fixes.ts:50` and `apply-sun-widening.ts`. Extract it once,
   **standalone rather than wrapping `lib/plants-write.ts`** — the two operate on
   disjoint column sets today, which is why none of the six imports it. Fold in
   collateral reporting as a returned fact, not a log line:
   `matched` / `written` / `skipped_drift` / `verdict_retired`, the last true only
   when `is_curated` was true BEFORE the write. Ratchet as a scan plus a named
   excusal list modelled on `HAND_ROLLED_PAGINATION`, so the six migrate one at a
   time.
   **The gate is already in place** — `curate-styles` refuses every writing run,
   not only `--all`, behind `STYLE_WRITES_BLOCKED_UNTIL_STEP_C`. Scoped runs are
   blocked too because the trap-31 incident WAS a scoped run, `--round 9` and
   `--round 10`; the size was never the problem, the silence was. `--dry-run` is
   unaffected. C's job is to make the check conditional on the capability rather
   than absolute: **delete the flag, not the check.**
   **SCOPE DECISION, already taken — do not re-litigate it.** Every script C
   touches is also listed in `RUNS_WITHOUT_PROVENANCE`, so folding provenance
   wiring in will look efficient around the third file. Don't. C is the piece where a silent
   bug is most expensive and nothing can check safety machinery that does not
   exist yet, so it stays one reviewable change. **Instead make the primitive
   provenance-SHAPED**: have it take the run record as a parameter, so wiring
   provenance later is a call-site change and not a second refactor. That buys the
   don't-touch-them-twice benefit without doubling the PR.
2. **The catalog-wide re-tag (D), once C has landed.**
   `curate-styles.ts --all --why "…"`. **`curate-styles --all` does not run until
   C lands, because it withdraws editorial approval on every row whose tags
   change and nothing counts them until C** — that is trap 31 at roughly ten
   times the scale of its 86 rows. `--new-only` would select nothing: 0 rows have
   a null `style_checked_at`. 748 calls. Do not verify that `modern` rose —
   `prairie` is defined to take the grasses-and-late-perennials look away from
   it, so a correct run may lower it.
   **Nor verify against the 1.39 mean.** That instrument was right for six styles
   that all describe a LOOK and therefore partition, and PR #171 showed it stopped
   meaning what it meant: eleven of the fourteen added styles are purpose or mood
   and cut ACROSS aesthetics, so a culinary sage is honestly `mediterranean` and
   `herb` where under six styles it had one place to go. Tuning to 1.39 would be
   tuning to a stale number — the same error as writing a direction into the
   `modern` criterion, on a different quantity. **The growth-invariant bar is now
   within-axis doubling**, which `curate-styles` prints and warns on: two
   aesthetic tags or two place tags is a judgment error, two tags from different
   axes is not. The random-50 pilot read 3 of 50 and 0 of 50. Read that, and the
   confusable-pair co-occurrence beside it.
3. **The editorial pass, catalog-wide (D2).** `curate-editorial.ts --all
--new-only --why "…"`. Absorbs three populations at once, and
   `pnpm catalog:status` prints the current split: 418 never judged, 86 whose
   verdict was withdrawn, plus whatever D's re-tag withdraws. Up to ~1500 calls,
   two per row. The rounds 1-6 pass DOES gate round 13; the flag is unread but
   the pass rewrites about 60% of descriptions (standing rule 16).
4. **Round 13 (G)**, on tags fixed in 2 and a measurement from a committed gap
   probe, which does not exist yet — round 12's probes were hand-run and recorded
   only in `seed-round12.ts`'s header, so the measurement that picks a theme is
   the one part of a round that is not reproducible. Write it to `reports/`, which
   `archive-round.ts` already commits. `run-round` still has no `--baseline`
   passthrough, so the rule-1 backup is taken in the shared checkout and copied
   into the worktree by hand — that step belongs in `runbook.ts` so it renders
   into the generated runbook instead of living in muscle memory.
   `cross-check-plants` will flag `plant_type` on every sedge and rush, the
   round-4 false-positive class, left naive on purpose.
5. **Finish the out-of-round 15.** Carried forward. What remains is mostly
   apply-scripts that CLEAR a stamp, so each needs a witness that is not the
   column it nulls. Two worked examples are in the tree: `curate-greenery`'s
   `foliage_color` and `apply-description-fixes`. `backfill-guard-stamps` matters
   most, its state-derived half having been deleted after it fabricated 100
   stamps.
6. **Build a removal path for a catalog row.** Carried forward. _Hydrangea
   anomala_ and _H. petiolaris_ are the same plant to a reader and one should go,
   keeping `petiolaris`. Only 5 regenerable combination rows depend on either —
   **the missing piece is that nothing can remove a plant at all.**
7. **Per-column exclusivity, which is what earns `confirming` back.** Carried
   forward, still forced after step 5, and trap 29 holds the reasoning. Do not
   design it early: the census it must be designed against is the one step 5
   changes.
8. **The hygiene items**, any order. Carried forward, plus one new. The
   flag-documentation scan — every `--flag` a script parses must appear in its own
   usage header, about twenty lines in `check-pipeline-invariants.ts` — covers the
   class every existing shape misses: a defect in code the session just wrote. The
   migration-drift content check needs `applied_migrations()` to return
   `statements`, so it needs a migration and Ana's push (rule 11). The graveyard
   pass moves the three in `SCRIPTS_PENDING_ARCHIVE` to `archive/` with README
   rows, and `repair-combinations.ts` needs a `database-log` line in the same
   change. Trap ratchet is at 22 of 31 (`pnpm invariants:check` prints it).

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days, so this list cannot become a paragraph again. Read that shape's header
before adding a line: the paragraph it replaced ran for six handoffs and half
its items were misfiled.

_Empty._ Every question either session raised was answered the same day.

**A rule-9 gap, now closed, and worth knowing how.** PR #171 shipped without a
`docs/database-log.md` entry. One was written afterwards from `561f6b1..3c4a2ba`
by a different session and says so in its own first paragraph, because an entry
reconstructed from a diff and one written by the people who did the work are not
the same evidence and should not read alike. It cost nothing here only because
those five commit messages carried the reasoning, the numbers and the discarded
options. **That is the thing to keep doing** — if the commits had said "expand
vocabulary" and "tune definitions", the entry would have been unwritable and the
three pilot findings would have been gone.

**Build Backlog rows still owed:** the `curate-styles` withdrawal counter (step 1
is its implementation), the orphaned-photo reconciliation sweep, **the
plant-removal path** (step 6 — it is an absence, and a ratchet witness for "we
never built X" stays true forever, so the Backlog is its durable home), and **50
of 748 rows still showing a Latin binomial where a garden name belongs** (round
12's own six are fixed; the rest predate it).

**Standing:** the next audit is round 13's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.
