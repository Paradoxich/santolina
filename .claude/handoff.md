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
cd apps/web && pnpm ci:check            # every CI job, database ones included
cd apps/web && pnpm backlog             # the ratchets, recomputed
cd apps/web && pnpm runs:cost --round N # what a round was billed
supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,inbucket,vector,logflare  # the light local stack (rule 11)
```

---

## 2026-08-18 — Round 13 closed, and a round now has a price

**Nothing in flight. Nothing uncommitted.** Round 13 (East Asian traditions)
seeded 33 plants, 747 → 780. Every pipeline step green, scope check clean at 0
out-of-scope changes, archived to `rounds/13/`. `pnpm backlog` is the list of
what is left; this file is not a second copy of it.

**A round costs about $0.078 a plant, $2.57 for 33.** That replaces the standing
"roughly $3-6 for 28 plants" estimate and is what round 14 should budget
against. **Read it as a floor**, and know why the reported figure is lower:
`runs:cost --round 13` says $2.25, because the vision pass wrote its scope as
the batch id and round attribution is a string match (trap 37). Fixed forward —
`pick-plant-images` now carries a `scopeLabel` on its batch manifest — so round
14's number will be right where round 13's was not. Round 13's archived report
stays wrong on purpose; it is a record.

**The theme was measured, not guessed, and that is the reusable part.**
`pnpm probe:gap` is runbook step 0 now: it tests a theme's signature palette
against the catalog and kills it at ≥70% already held (round 9's rule, which had
lived as a sentence in four separate script headers). It also reports something
a tag count cannot — **cultivar-bound**. `gothic` is the emptiest style in the
vocabulary at 10 plants and no species-level round can move it, because the dark
garden is selections of species already held. `moon` is half the same story.
Both are on standing rule 11's deferred list as a cultivar tier now, not on a
seed.

⚠ **Three defects, all found by running the pipeline rather than reading it.**
Traps 35 and 36 are fixed and pinned; **trap 37 is recorded and NOT pinned**,
and its entry says what a pin needs. A source scan for it was written and thrown
away: it false-positives on four scripts that meter correctly, because the call
sits in a helper defined early and invoked from inside the run record. **Textual
order is not runtime order** — do not retry that shape.

---

**Next steps, in order.**

1. **Wire the Wikimedia fallback into the runbook.** Highest value here, because
   it removes a whole class of plants that reach the placeholder with nobody
   noticing. `feed-wikimedia-candidates.ts` works — round 13 had 3 of 33 with no
   usable Trefle image, and it found all three via Wikidata P18 under safe
   licences, two of which became heroes. But it only fires from a manual "needs
   a new photo" list, so **"Trefle gave us nothing" never triggers it**. Wants a
   step between `recover-image-categories` (6) and `pick-plant-images` (7a),
   gated on "no usable candidate", plus a `round-rehearsal.test.ts` case.

   ⚠ Know the limit before wiring it: P18 is the designated _identification_
   image, not a garden hero. Round 13's third plant, `Malus spectabilis`, got a
   P18 photo of a trunk and canopy with a person in shot, and the vision pass
   correctly rejected it. Nothing takes a second look at wider Commons when P18
   is poor, so this shrinks the placeholder class, it does not eliminate it.

2. **Extend the copy-rule check to every prose field.** Best value-per-effort on
   this list: free, deterministic, no model call, no judgement. The vocabulary
   ruling is _autumn, never the US "fall"_, and it is enforced **only in
   `seasonal_care`**, by that pass's own validator. Measured 2026-08-18 across
   780 rows, in fields nothing watches:

   | field               | "fall" instead of "autumn" |
   | ------------------- | -------------------------- |
   | `description`       | 15                         |
   | `seasonal_rhythm`   | 16                         |
   | `maintenance_notes` | 6                          |

   Plus **2 em/en dashes in `seasonal_rhythm`**, which the UI copy rule bans
   outright. That is ~37 reader-facing violations of rules this repo already
   decided. Same shape as trap 36: the rule exists, the enforcement covers one
   field, and nobody noticed the others were unguarded.

3. **Make `curate-plants` skip its finished rows by default.** It is the ONLY
   pass that re-drafts rows it has already done — `cross-check-plants`,
   `cross-check-native-to`, `curate-seasonal-care` and `curate-editorial` all
   skip on their own stamp unasked. Round 13 paid for it: one bad row out of 33
   failed the step, and the retry re-billed all 33.

   **This is the corrected version of the `--new-only` idea, and the runbook was
   never the right place.** Wiring the flag into the step fixes the pipeline path
   and leaves the default wrong for anyone running the script by hand, which is
   exactly how it bit us — `run-round` invokes it the same way a person would.
   Answer the open question first: the re-draft default exists for "a field added
   or re-specified after rows were drafted", and `--only <field>` now appears to
   cover that case completely. If it does, the default is vestigial and safe to
   invert.

4. **Close trap 37.** Two halves, done together: move `curate-common-names`'
   judging inside `withRunRecord` so it stops recording `usage: null` on a pass
   that spent real money, and pin the metering seam — a fake client, one call
   before the record opens and one inside, asserting only the second is counted.
   Add the scope half as an assertion that every run a round's steps write names
   that round.

5. **Fill `sun_tolerates` where it is empty: 171 rows, 22% of the catalog.**
   Measured 2026-08-18. "Thrives in full sun, tolerates nothing" is almost never
   true of a real plant, and an empty tolerance makes one read as fussier than it
   is, which is the expensive direction to be wrong in for a beginner.

   **This replaced a granularity question, and the measurement is why.** The
   catalog holds 12 distinct thrives/tolerates pairs across 780 plants, one
   covering 53.6%. That looked like a drafting default and is not: with a
   three-value vocabulary across two fields only about 12 combinations can exist,
   so five shade shrubs sharing a pair is expected rather than suspicious.
   **Ruling (delegated to me and decided, 2026-08-18): keep three levels, keep
   thrives/tolerates, add no schema.** Sun is genuinely coarse, and three levels
   answers a beginner's real question.

6. **One hero and one re-judgement, both agent editorial work, not Ana's.**
   `Malus spectabilis` still has no usable photo. And `Lythrum salicaria` and
   `Iris pseudacorus` were cut in round 12 on North American invasive status,
   which the 2026-08-18 ruling rejects as a ground — they may still deserve the
   cut for self-seeding hard in Europe, which is the criterion to judge them
   against. Reasoning in
   [why a round is shaped the way it is](../docs/curation.md#round-runbook).

7. **Two `bloom_months` values are narrower than their own prose, and the
   detector that found them is worth keeping.** Measured 2026-08-18: prose
   contradicting a checked scalar runs at **2 rows in 741**, and in BOTH the
   prose is the more accurate half. `Cornus mas` blooms `[3]` while its
   description says late winter (Cornelian cherry is February into March, so
   `[2,3]`); `Dicentra eximia` ends at 9 while its autumn stage records a real
   rebloom in cool weather.

   **Do not buy a prose fact-check on the strength of the Rohdea case.** 0.3% is
   not a spend. What IS worth ~40 lines is the contradiction detector as a guard
   run after any scalar correction, because that is when propagation happens —
   Rohdea's description, rhythm and care tips all rested on one wrong
   `bloom_months` and nothing would have flagged them once it was fixed.

   ⚠ Its false positives are known and cost two iterations to find: a naive
   "flower word near a season word" flags **71%** of the catalog. "The blooms
   are FOLLOWED BY seedheads that persist into autumn", "flowers FADE and seed
   heads develop", and `Winter savory`, where the season is part of the plant's
   name. Require an assertion of flowering (`flowers appear/open`, `produces
flowers`, `in full bloom`), exclude aftermath and anticipation markers, and
   skip season words occurring in the plant's own common name. "Flower stalks
   begin to rise" is still a false positive at that setting.

**Parked decisions.** Dated when FIRST raised, with who owes the answer.
`invariants:check` shape 15 fails on an undated item and on one older than 14
days, so this list cannot become a paragraph again.

_Empty._ Both decisions this session raised were delegated back and **decided**,
not parked — invasive-status scope and sun granularity. Each is recorded where it
binds, the first in `docs/curation.md` and the second in step 5 above, because a
ruling that lives only in the handoff dies with it.

**Standing:** the next audit is round 14's close or 2026-09-14, whichever first,
early if a PR adds a stamp column, adds a script, or touches
`upsert_trefle_plant`. It should come back **shorter**. Fresh session.
