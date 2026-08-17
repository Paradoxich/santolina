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

## 2026-08-17 — Two branches open: the obligation policy, and the style vocabulary

**Nothing is merged. Two sessions ran in parallel and both branches are live.**

| branch                                 | worktree                         | state                            |
| -------------------------------------- | -------------------------------- | -------------------------------- |
| `session/2026-08-17-obligation-policy` | `../santolina-obligation-policy` | plan steps A and B done, PR open |
| `session/2026-08-17-style-vocabulary`  | `../santolina-style-vocabulary`  | style definitions in progress    |

They share exactly one file, `apps/web/scripts/catalog-state.ts` — different
functions, mergeable. **Land the obligation branch first**; the style branch has
more work left and rebasing onto a merged main is cheaper than merging two
branches that both edited it.

**What this session did** is the `2026-08-17 — Who owes an old row` entry in
`docs/database-log.md`, and the rule it established is standing rule 16. Neither
is repeated here.

---

**Next steps, in order. Everything gates round 13** — Ana's ruling 2026-08-17,
and the reason is not tidiness. A round chooses its theme by measuring the
catalog, so mis-tagged rows make the gap test lie; the `modern` item is the proof
case, where a seed round was nearly run against what was a tagging gap. Steps 1
to 5 are the plan Ana approved; 6 to 9 are carried forward from the previous
entry and are not in that plan.

Three of the arrows below are load-bearing and the rest is preference. **A before
B** — B's whole output is a classification A defines, so run first it produces a
confident number that means nothing. **C before D** — D withdraws hundreds of
verdicts and, without C, says nothing, which is trap 31 at ten times the scale.
**D before D2** — the editorial pass judging rows whose tags are about to change
pays for the same verdicts twice. The first two are enforced in code; the third
is not, deliberately, because it costs money rather than correctness.

1. **DONE — the obligation policy (A) and the catalog-wide check (B).** On the
   branch above. `pnpm catalog:status` now answers, for all 748 plants, which
   steps have run — the 494 that predate manifests included.
2. **The reviewed-mutation primitive (C).** Six scripts hand-roll the same drift
   guard: `from: string // expected current value — drift guard` appears verbatim
   in `fix-round8-names.ts:59`, `fix-round11-names.ts:75`,
   `fix-round12-names.ts:64`, `fix-round12-tags.ts:79`, with `expect` in
   `apply-native-to-fixes.ts:50` and `apply-sun-widening.ts`. Extract it once,
   **standalone rather than wrapping `lib/plants-write.ts`** — the two operate on
   disjoint column sets today, which is why none of the six imports it. Fold in
   collateral reporting as a returned fact, not a log line:
   `matched` / `written` / `skipped_drift` / `verdict_retired`, the last true only
   when `is_curated` was true BEFORE the write. Ratchet as a scan plus a named
   excusal list, modelled on `HAND_ROLLED_PAGINATION`, so the six migrate one at
   a time. This is the structural fix for trap 31's class.
3. **The style vocabulary and the catalog-wide re-tag (D).** The other branch
   holds the definitions. `curate-styles.ts --all --why "…"` — `--new-only` would
   select nothing, since `style_checked_at IS NULL` is 0 rows. Pilot at
   `--limit 50` against the ten confusable pairs the draft lists before spending
   748 calls. Do not verify that `modern` rose: `prairie` is defined to take the
   grasses-and-late-perennials look away from it, so a correct run may lower it.
   Verify instead that mean tags per plant stays near the 1.39 baseline.
4. **The editorial pass, catalog-wide (D2).** `curate-editorial.ts --all
--new-only --why "…"`. Absorbs three populations at once: the 418 never
   judged, the 86 withdrawn (trap 31), and whatever D's re-tag withdraws. Up to
   ~1500 calls, two per row; `pnpm catalog:status` prints the current split.
   **The rounds 1-6 pass DOES gate round 13** — see the correction below.
5. **Round 13** (G), on tags fixed in 3 and a measurement from the committed gap
   probe (F). `run-round` still has no `--baseline` passthrough, so the rule-1
   backup is taken in the shared checkout and copied into the worktree by hand;
   that step belongs in `runbook.ts` so it renders into the generated runbook
   instead of living in muscle memory. `cross-check-plants` will flag
   `plant_type` on every sedge and rush, the round-4 false-positive class, left
   naive on purpose.
6. **Finish the out-of-round 15.** Carried forward. The three easy repair passes
   are wired; what remains is mostly apply-scripts that CLEAR a stamp, so each
   needs a witness that is not the column it nulls. Two worked examples exist in
   the tree: `curate-greenery`'s `foliage_color` and `apply-description-fixes`.
   `backfill-guard-stamps` matters most, its state-derived half having been
   deleted after it fabricated 100 stamps.
7. **Build a removal path for a catalog row.** Carried forward. _Hydrangea
   anomala_ and _H. petiolaris_ are the same plant to a reader and one should go,
   keeping `petiolaris`. No palette or diary row depends on either and only 5
   regenerable combination rows do — **the missing piece is that nothing can
   remove a plant at all.** `apply-description-fixes.ts` is the shape to copy.
8. **Per-column exclusivity, which is what earns `confirming` back.** Carried
   forward, still forced after step 6, and trap 29 holds the reasoning: five of
   the seven witnessed columns have more than one writing step, so the key has to
   be the COLUMN across every writer. Do not design it early — the census it must
   be designed against is the one step 6 changes.
9. **The hygiene items**, any order. Carried forward, plus one new. The
   flag-documentation scan: every `--flag` a script parses must appear in its own
   usage header, about twenty lines in `check-pipeline-invariants.ts`, and it
   covers the class every existing shape misses — a defect in code the session
   just wrote. The migration-drift content check needs `applied_migrations()` to
   return `statements`, so it needs a migration and Ana's push (rule 11). The
   graveyard pass moves the three in `SCRIPTS_PENDING_ARCHIVE` to `archive/` with
   README rows, and `repair-combinations.ts` needs a `database-log` line in the
   same change. Trap ratchet is at 22 of 31 (`pnpm invariants:check` prints it).

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days, so this list cannot become a paragraph again. Read that shape's header
before adding a line: the paragraph it replaced ran for six handoffs and half
its items were misfiled.

_Empty._ Every question this session raised was answered the same day.

**CORRECTION to the entry this replaces.** It said, of the rounds 1-6 editorial
pass: "does NOT gate round 13, checked rather than assumed 2026-08-17: nothing in
`app/`, `components/` or `hooks/` reads `is_curated`, so it changes no behaviour
today." The column claim is true and the conclusion does not follow. The pass
rewrites descriptions on about 60% of the rows it touches and holds rows whose
photograph is not the species — so the flag changes nothing and the pass changes
the two things a reader looks at hardest. Standing rule 16 carries the test that
gets this right. It was written and superseded inside a day, which is the point of
recording it rather than editing it away.

**Build Backlog rows still owed:** the `curate-styles` withdrawal counter (step 2
above is its implementation), the orphaned-photo reconciliation sweep, **the
plant-removal path** (step 7 — it is an absence, and a ratchet witness for "we
never built X" stays true forever, so the Backlog is its durable home), and **50
of 748 rows still showing a Latin binomial where a garden name belongs** (round
12's own six are fixed; the rest predate it).

**Standing:** the next audit is round 13's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.
