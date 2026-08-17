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

## 2026-08-17 — Standing rule 15, provenance wiring, `common_issues` closed

**PR [#169](https://github.com/Paradoxich/santolina/pull/169) is MERGED** as
`2c5cc02`, CI green before the merge. **Nothing from this session is in
flight.** What the session did and what it found is the `2026-08-17` entry in
`docs/database-log.md` and is not repeated here.

**Next steps, in order. 4 through 6 are carried forward unconsumed.**

1. **Finish the out-of-round 15.** The three easy repair passes are wired; what
   remains is mostly apply-scripts that CLEAR a stamp, so each needs a witness
   that is not the column it nulls. Two worked examples now exist in the tree
   rather than in a comment: `curate-greenery`'s `foliage_color` (a conditional
   write, bounded not confirmed) and `apply-description-fixes` (a value column
   with no stamp at all). `backfill-guard-stamps` still matters most, its
   state-derived half having been deleted after it fabricated 100 stamps.
2. **Build a removal path for a catalog row.** _Hydrangea anomala_ and
   _H. petiolaris_ are the same plant to a reader and one should go, keeping
   `petiolaris` (curated, hero verified, the one actually sold). No palette or
   diary row depends on either and only 5 regenerable combination rows do, so
   the data is trivial; **the missing piece is that nothing can remove a plant
   at all.** `apply-description-fixes.ts` is the shape to copy: a committed
   decision file carrying `why`, a staleness assertion, and a run record.
3. **Re-judge the 86 rows a repair pass silently un-curated (trap 31, new).**
   Found 2026-08-17 while checking the Build Backlog against the live DB. The
   2026-08-15 trap-26 repair re-tagged 86 of 100 rows across rounds 9 and 10,
   and `style_tags` is watched by `invalidate_editorial_verdict`, so **all 86
   lost their editorial sign-off**. Rounds 9 and 10 read 8/50 and 6/50; judged
   catalog-wide went 277 → 244 while rounds 11 and 12 were adding 53. **The
   trigger was right and the reporting was absent** — the repair said "86
   tagged" and could not say "86 un-curated", because the clear happens in the
   database. These 86 are the cheap half of the editorial backlog: descriptions
   and heroes already passed once, only the tags changed. Trap 31 carries the
   remedy and its verification predicate; the Build Backlog editorial row now
   says 504, not 418.
4. **Then per-column exclusivity, which is what earns `confirming` back.**
   Still forced after step 1, and trap 29 still holds the reasoning: five of
   the seven witnessed columns have more than one writing step
   (`native_checked_at` three, `image_verified_at` four), so the key has to be
   the COLUMN across every writer, and most of those writers are in step 1.
   **Do not DESIGN it early either** — the census it must be designed against
   is the complete one, and step 1 changes that census.
5. **Then the three hygiene items**, any order. The migration-drift content
   check needs `applied_migrations()` to return `statements`, so it needs a
   migration and Ana's push (rule 11); 31 of 34 versions already match byte for
   byte. The graveyard pass moves the three in `SCRIPTS_PENDING_ARCHIVE` to
   `archive/` with README rows, and `repair-combinations.ts` needs a
   `database-log` line in the same change. And the trap ratchet is at 22 of 31
   (`pnpm invariants:check` prints it) — trap 1 is still the cheapest and
   highest-consequence, and trap 31 is new from this session.
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
before adding a line: the paragraph it replaced ran for six handoffs and half
its items were misfiled.

_Empty._ Both questions this session raised were answered the same day.

**Re-owned 2026-08-17, and no longer anyone's decision.** Each was parked on
Ana and none was hers. The `Cenolophium` region correction is a fact question
answerable against WCVP. The rounds 1-6 editorial pass and the `modern` re-tag
are agent work under standing rule 6, her own 2026-07-28 ruling. The two
round-12 photo holds (`Rodgersia pinnata`, `Acorus gramineus`) describe rows
that already have photographs — the vision pass could not confirm the SPECIES
from them, so what is needed is a better candidate, the job the Commons
fallback did for _Filipendula purpurea_. All four are mechanical work.

**Build Backlog rows still owed:** the `curate-styles` withdrawal counter, the
orphaned-photo reconciliation sweep, **the plant-removal path** (next step 2 —
it is an absence, and a ratchet witness for "we never built X" stays true
forever, so the Backlog is its durable home), and **50 of 748 rows still
showing a Latin binomial where a garden name belongs** (round 12's own six are
fixed; the rest predate it).

**Standing:** the next audit is round 13's close or 2026-09-14, whichever
first, early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.
