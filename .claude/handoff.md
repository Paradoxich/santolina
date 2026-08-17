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

## 2026-08-17 — Standing rule 15, and the first three out-of-round passes wired

**IN FLIGHT.** Branch `session/2026-08-17-provenance`, worktree
`../santolina-provenance`. Not pushed, no PR. Two commits so far; the session's
own story is the `2026-08-17` entry in `docs/database-log.md` and is not
repeated here.

**Done this session**

1. **Standing rule 15 — an open question is asked, not parked**, with
   `invariants:check` shape 15 behind it. All three failure modes verified by
   injection. The rule exists because the "Waiting on Ana" paragraph ran for six
   handoffs and three of its six items were never hers.
2. **`RUNS_WITHOUT_PROVENANCE` 18 → 15.** `curate-styles`, `curate-greenery`
   and `draft-hardiness` open runs, each smoke-tested against the live database.

**Next steps, in order. 3 through 6 are carried forward unconsumed.**

1. **Finish the out-of-round 15.** The three easy repair passes are done; what
   is left is mostly apply-scripts that CLEAR a stamp, so each needs a witness
   that is not the column it nulls. `curate-greenery`'s `foliage_color` is that
   pattern in the small and is now in the tree. `backfill-guard-stamps` still
   matters most: its state-derived half was deleted after it fabricated 100
   stamps.
2. **Fill `common_issues` on the 27 rows, then gate it.** Ana ruled 2026-08-17
   that the two prose fields split: `common_issues` becomes required because the
   drafter demonstrably writes "generally pest and disease free" when that is
   the answer (460 of 721 populated rows do), so a blank is a miss;
   `environment_benefits` stays optional because its 4 blanks are three
   houseplants and a noxious invasive, and requiring it would buy four fabricated
   sentences. **Order is forced:** adding `common_issues` to
   `REQUIRED_DRAFTED_FIELDS` before the 27 are filled fails closed rounds 7, 11
   and 12 retroactively in `verify-round`. Do NOT write a `fix-common-issues.ts`
   one-off — that adds a 16th entry to the list step 1 is clearing. Teach
   `curate-plants` a field-scoped mode, or wire it from the first commit. The
   editorial trigger does not watch this column, so the 14 curated rows among
   the 27 keep their sign-off.
3. **Then per-column exclusivity, which is what earns `confirming` back.**
   The order is still forced and trap 29 still has the reasoning: five of the
   seven witnessed columns have more than one writing step
   (`native_checked_at` three, `image_verified_at` four), so the key has to be
   the COLUMN across every writer — and most of those writers are in step 1.
   **Do not DESIGN it early either.** The census it must be designed against is
   the complete one, and step 1 changes that census.
4. **Then the three hygiene items**, any order. The migration-drift content
   check needs `applied_migrations()` to return `statements`, so it needs a
   migration and Ana's push (rule 11); 31 of 34 versions already match byte for
   byte. The graveyard pass moves the three in `SCRIPTS_PENDING_ARCHIVE` to
   `archive/` with README rows, and `repair-combinations.ts` needs a
   `database-log` line in the same change. And 21 of 30 traps are unpinned —
   trap 1 is still the cheapest and highest-consequence.
5. **The climbing hydrangeas, once Ana answers below.** _H. anomala_ and
   _H. petiolaris_ are the same plant to a reader — near-identical descriptions,
   same flower, same placement — and _petiolaris_ is the keeper: curated, hero
   verified, the one actually sold. Neither has any palette or diary row, so only
   5 regenerable combination rows depend on either. **There is no established
   removal path for a catalog row**; that is the real work in this item.
6. **Round 13 has no theme and needs a gap test before it has one.** Round 12's
   probes killed small-space (84% held), dry shade (73%) and left late-season
   surviving but thin at 62%. Those numbers are in `seed-round12.ts`'s header
   and are the starting point, not a result to reuse — the catalog moved.
   **Two frictions will recur and neither is fixed:** `run-round` still has no
   `--baseline` passthrough, so the rule-1 backup must be taken in the shared
   checkout and copied into the worktree by hand; and `cross-check-plants` will
   flag `plant_type` on every sedge and rush seeded, the round-4 false-positive
   class, left naive on purpose.

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days, so this list cannot become a paragraph again. Read that shape's header
before adding a line: the paragraph this replaced ran for six handoffs and
half its items were misfiled.

- (raised 2026-08-17, Ana) Keep _Hydrangea hydrangeoides_ with a description
  that names its single-bract florets, or cut it as a third near-identical
  climber? The catalog holds three, not the two previously recorded.

**Re-owned 2026-08-17, and no longer anyone's decision.** Each was parked on
Ana and none was hers. The `Cenolophium` region correction is a fact question
answerable against WCVP. The rounds 1-6 editorial pass and the `modern` re-tag
are both agent work under standing rule 6, her own 2026-07-28 ruling. The two
round-12 photo holds (`Rodgersia pinnata`, `Acorus gramineus`) describe rows
that already have photographs — the hold is that the vision pass could not
confirm the species from them, so what is needed is a better candidate, the
same job the Commons fallback did for _Filipendula purpurea_ in that round.
All four are mechanical work; none goes back on a list of questions.

**Build Backlog rows still owed:** the `curate-styles` withdrawal counter, the
orphaned-photo reconciliation sweep, and **50 of 748 rows still showing a Latin
binomial where a garden name belongs** (round 12's own six are fixed; the rest
predate it).

**Standing:** the next audit is round 13's close or 2026-09-14, whichever
first, early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.

**What this session adds to the same lesson.** Shape 15's own parser was caught
twice reporting **zero parked items while looking at one** — the lead-in
paragraph wraps across lines, and so does an item — so it would have passed
green while seeing nothing. Same family as round 12's two: a tool answering a
narrower question than the one being asked, and the answer promoted. The
difference is that this one was caught by printing the count on a green run
rather than only on failure, which is the argument for the backlog line in
every ratchet.
