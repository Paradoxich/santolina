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

## 2026-08-17 — Step C, step D, and two style rulings. Nothing in flight.

**Four PRs, all merged, main green including the two database-only CI jobs.**

| PR                                                       | what landed                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [#175](https://github.com/Paradoxich/santolina/pull/175) | plan step C: `scripts/reviewed-mutation.ts`, `curate-styles` migrated, shape 17, **trap 32 + `pnpm ci:check`** |
| [#176](https://github.com/Paradoxich/santolina/pull/176) | plan step D: the catalog-wide re-tag, 748 rows                                                                 |
| [#177](https://github.com/Paradoxich/santolina/pull/177) | Ana's two style rulings: the same-axis bar 1 → 2, `provence` retired into `mediterranean`                      |
| [#178](https://github.com/Paradoxich/santolina/pull/178) | the step-D rollback point, off this laptop                                                                     |

**Another session was live in `../santolina-type-color`** doing the type-colour
pass, with a dev server up. It has its own branch and its own database-log entry
to write. Nothing here touched its files.

**`pnpm ci:check` is the thing to adopt from today.** It derives every job in
`.github/workflows/ci.yml` and runs it — including `catalog-state` and
`migration drift`, which CI skips on every pull request by design, so a local run
is the ONLY place those two happen before a merge. `--no-db` skips them and says
so. That is trap 32: five green local commands, none of which read the file that
went red on main.

**Read the commit messages, not this file, for step C's reasoning.** The
after-read-as-witness argument, the `alsoWrite` and `stamped` shapes, and the
false-alarm fix are all in `6edcc7b`, `869b105` and `5f67516`.

---

**Next steps, in order. Round 13 is unblocked but not chosen** — Ana, 2026-08-17.
Its two prerequisites both landed today, which made it possible, not next. The
cheap mechanical items come first because they cost no API spend and continue
what today built.

**The plan letters are gone from this file, deliberately.** Every next step used
to carry one — C, D, D2, G — from a plan at
`~/.claude/plans/ok-the-other-session-elegant-stream.md`: outside the repo,
outside git, on one laptop, under an auto-generated name, superseded twice on the
day it was written. Two of its seven steps (the flag-documentation scan, and
committing the gap probe) never got a letter here at all, so anyone reading from
the plan hit what looked like missing work and was in fact a missing label. **One
fact, two homes, one updated** — the shape of most of today. The letters are
struck rather than completed because nothing is mid-flight on that vocabulary any
more: C and D landed, D2 and round 13 are deferred by ruling. This file is the
carrier now; do not cite the plan file again.

1. **Migrate the six in `HAND_ROLLED_REVIEWED_MUTATION`, one at a time.** Each is
   also in `RUNS_WITHOUT_PROVENANCE`, so each migration is the natural moment to
   wire its run record. `fix-round12-tags.ts` is the best first: it already
   normalises through `JSON.stringify` and writes two columns, so it exercises the
   multi-column guard. `apply-native-to-fixes.ts` hand-rolls the same guard but is
   **not** in the list and cannot be — `native_to` is not a column any verdict is
   about, so it never branches on `is_curated` and the scan cannot see it. It
   should still migrate; nothing forces it.
2. **The hygiene items**, any order. Carried forward. The flag-documentation scan
   — every `--flag` a script parses must appear in its own usage header, about
   twenty lines in `check-pipeline-invariants.ts` — covers the class every
   existing shape misses: a defect in code the session just wrote. The
   migration-drift content check needs `applied_migrations()` to return
   `statements`, so it needs a migration and Ana's push (rule 11). The graveyard
   pass moves the three in `SCRIPTS_PENDING_ARCHIVE` to `archive/` with README
   rows, and `repair-combinations.ts` needs a `database-log` line in the same
   change. `pnpm invariants:check` prints every ratchet's current count.
3. **Build a removal path for a catalog row.** Carried forward. _Hydrangea
   anomala_ and _H. petiolaris_ are the same plant to a reader and one should go,
   keeping `petiolaris`. Only 5 regenerable combination rows depend on either —
   **the missing piece is that nothing can remove a plant at all.**
4. **Finish the out-of-round 15.** Carried forward. What remains is mostly
   apply-scripts that CLEAR a stamp, so each needs a witness that is not the
   column it nulls. Two worked examples are in the tree: `curate-greenery`'s
   `foliage_color` and `apply-description-fixes`. `backfill-guard-stamps` matters
   most, its state-derived half having been deleted after it fabricated 100
   stamps.
5. **Per-column exclusivity, which is what earns `confirming` back.** Carried
   forward, still forced after the out-of-round 15 above, and trap 29 holds the
   reasoning. Do not design it early: the census it must be designed against is
   the one that step changes.
6. **Round 13.** The tags it will measure against are now correct. It needs a
   **committed gap probe**, which still does not exist: round 12's probes were
   hand-run and recorded only in `seed-round12.ts`'s header, so the measurement
   that picks a theme is the one part of a round that is not reproducible. Write
   it to `reports/`, which `archive-round.ts` already commits. `run-round` still
   has no `--baseline` passthrough, so the rule-1 backup is taken in the shared
   checkout and copied into the worktree by hand — that step belongs in
   `runbook.ts` so it renders into the generated runbook instead of living in
   muscle memory. `cross-check-plants` will flag `plant_type` on every sedge and
   rush, the round-4 false-positive class, left naive on purpose.
7. **The editorial pass over the legacy catalog. NOT A BLOCKER — Ana, 2026-08-17. Do not treat it as
   one.** The previous handoff said the rounds 1-6 pass gates round 13; that was
   an overstatement and is withdrawn. `verify-round` checks a round against its
   own rows, and `curate-editorial` is **step 7b of the runbook**, so every new
   round judges its own plants — this backlog is a fixed historical set that does
   not grow. Nothing in the product reads `is_curated` (verified across `app/`,
   `components/`, `hooks/`, `lib/`, `server/`).
   **Scope it to the 422 never-judged, not the 720.** The other 298 are
   verdict-withdrawn rows whose descriptions and images already passed; only the
   tags claim fell, so re-judging them restores a flag nobody displays. **The
   images are already bought** — `curate-editorial` reads the stored
   `image_pick_confidence` with no vision call, and 364 of the 422 clear at `high`
   for free; 58 sit at `medium` and are held, which is the only population a
   targeted `pick-plant-images --verify` would cost anything for.
   ~675 calls, ~$15-30 unbatched. **Cheaper, none applied yet:** the Batch API is
   50% off with a working precedent in `pick-plant-images.ts`, and prompt caching
   on the shared system prompt would cut the repeated input — together roughly
   $4-8. ⚠ It rewrites ~60% of the descriptions it judges. **Run ~100 rows from
   rounds 1-6 and read the rewrites before buying the rest.**
   **Parked decisions.** Dated when FIRST raised, with who owes the answer.
   `invariants:check` shape 15 fails on an undated item and on one older than 14
   days, so this list cannot become a paragraph again. Read that shape's header
   before adding a line: the paragraph it replaced ran for six handoffs and half
   its items were misfiled.

_Empty._ Both questions this session raised — the primary-style representation
and the provence/mediterranean overlap — were put to Ana and answered the same
hour, which is standing rule 15 working rather than a coincidence.

**Two corrections landed today, and both were doc claims nobody had checked.**
Trap 31 named `curate-greenery` as a second offender; the trigger does not watch
`is_greenery` or `foliage_color`, so it retires no verdict — the claim had been
written from the shape of the script rather than from the migration. And step C's
own survival warning fired on 26 rows the first time it ran at scale, every one
of which was fine. **A warning that cries wolf is trap 31 inverted**, and it is
worth remembering that the fix for a silent report can overshoot into a noisy one.

**Build Backlog rows still owed:** the orphaned-photo reconciliation sweep, **the
plant-removal path** (step 3 — it is an absence, and a ratchet witness for "we
never built X" stays true forever, so the Backlog is its durable home), and **50
of 748 rows still showing a Latin binomial where a garden name belongs** (round
12's own six are fixed; the rest predate it). The `curate-styles` withdrawal
counter is no longer owed — step C built it.

**One thing Ana owes, and it is not a decision:** a look at the `/login` error
state in her own Firefox. Everything about it was verified on localhost through
the Browser pane — computed colours, the ring surviving focus, the live region —
but the pane is Electron and has misreported layout and clipping before, and the
pill's error ring is exactly the kind of accelerated-layer detail that has
differed there. Nothing depends on it; it is a confirmation, not a gate.

**Standing:** the next audit is round 13's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.
