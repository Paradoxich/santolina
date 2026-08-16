# Write provenance — the contract

What produced the value that is in this row, and is that production context still
considered current?

The pipeline could not answer that before 2026-08-16. It had execution
provenance — round, step, stamp, scope, before/after snapshot, archive — and no
data provenance. This is the missing primitive, and it is deliberately small: no
new row state, no lifecycle field, no table.

## Six layers, and what each one answers

| Layer                   | Answers                                                                      | Lives in                                       |
| ----------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| **Round**               | Where did this plant enter the catalog?                                      | `apps/web/rounds/<label>/manifest.json`        |
| **Run**                 | What operation ran, when, with what recipe, against what declared write-set? | `apps/web/runs/<YYYY-MM>.jsonl`                |
| **Stamp**               | Which of this row's outputs are currently certified?                         | `plants.*_checked_at` / `_verified_at` columns |
| **Recipe**              | Which exact production recipe was used?                                      | `recipe_hash` in the run record                |
| **Evidence**            | How could this invocation's mutation be observed?                            | `evidence` in the run record                   |
| **Verification**        | Does the runner's claim agree with that evidence?                            | `verification` in the run record               |
| **Supersession policy** | Which recipes or runs do we no longer consider current?                      | a committed file, when first needed            |

Only the last is human-maintained. Staleness is **not** a layer: it is a query
over the others, which is why there is no `stale_at` column and should never be
one. A `stale` flag would turn a derived conclusion into mutable state and add
another thing the pipeline has to keep correct.

## Declared mutation is not verification evidence

The two were one list in the first draft, and it broke on the second script it
would have touched. `finish()` verified every write-set member by comparing that
column to the run's window, which is only meaningful for a timestamp — but the
write-set legitimately names value columns (`seasonal_care`, `native_region`,
`image_candidates`), and `curate-combinations` writes a different table entirely.

Measured rather than assumed: that query against `seasonal_care` returns
`count = null` with an **empty** error message. So verification would not have
cried wolf. It would have degraded to `checked: false` with a note reading like a
transient database failure, on every non-stamp script, permanently — a check that
stops working and looks like bad luck, which is the same shape as trap 1.

So they are separate fields with separate jobs:

- **`write_set`** — what this invocation is allowed to mutate. An assertion,
  reviewable in the record, never inferred.
- **`evidence`** — how that mutation can be independently observed at
  finalisation. A witness per write-set member, because the answer differs by
  column and by table.

A witness is a `stamp` (a timestamp column on `plants`, window-queried), a
`row-touched` (the table's own mutation timestamp — `plants.updated_at`,
`plant_combinations.created_at`), or `none` with a stated reason. Each names what
it `covers`, because a write-set member is _what was mutated_ and that is not
always a column: `curate-combinations` mutates a table.

### Witness strength, and why the result is not a boolean

A witness carries a strength, and `verification.substantiation` reports what the
evidence actually supports rather than a yes/no:

| Strength         | Witness       | Can confirm? | Can contradict? |
| ---------------- | ------------- | ------------ | --------------- |
| **confirming**   | `stamp`       | yes          | yes             |
| **bounding**     | `row-touched` | no           | no              |
| **unobservable** | `none`        | no           | no              |

`substantiation` is then one of `confirmed`, `bounded`, `unverified` or
`contradicted`.

**A bounding witness can do neither, and that is not pedantry.** `updated_at`
establishes that rows were touched in the interval; it cannot attribute those
touches to this invocation. If a run claims 20 rows while another process touches
50 unrelated ones in the same window, `observed >= claimed` holds and means
nothing. An earlier version reported that as agreement, which in a log explicitly
described as non-authoritative would have invited a future reader to read
"the database confirmed this run" out of "some rows were modified around then".

Nor can a bounding witness contradict: it reports rows, not writes, so seeing
fewer than claimed is normal.

**Row counts are distinct row ids, which removes the ambiguity at its source.**
`run.wrote(rowId)` records a set. A run that writes the same row twice counts it
once, because that is all any witness can ever observe — a timestamp column holds
one value per row however many times it was set. Counting calls instead would have
made `row_count` incomparable with its own evidence and produced a false
"claim larger than evidence" on any double write, this time from a _confirming_
witness.

**"I cannot verify this" is an acceptable answer. "I verified this" when the query
is meaningless is not.** A write-set member with no witness throws at `beginRun`,
not at finalisation, because it is a programming error and must not present itself
later as an unlucky read.

## Rounds and runs are different axes, on purpose

Round provenance is **membership**. Run provenance is **mutation**. Collapsing
them would give confidently wrong answers, because the interesting writes do not
happen in the round that seeded the row:

- `curate-styles --round 9` re-judged 100 rows on 2026-08-15, months outside
  round 9's manifest window.
- A full-catalog region sweep once rewrote 20 settled rows alongside round 8's
  own 101.
- `apply-native-to-fixes` rewrites prose from a committed decision file at any
  time, across any rounds.

A seeder is the one case where the two coincide, and there the round manifest is
the better record: it names every inserted row by id, and seed values come from
Trefle rather than from a recipe. So seeders are excluded from run provenance by
category, not by oversight.

## The resolver goes through the run id, never through the column

```
value → its stamp → candidate runs → run id → declared write-set → recipe
```

**Not** `stamp → step`. Column-to-writer is many-to-many by design:
`style_checked_at` is written by both `curate-plants` and `curate-styles`;
`native_checked_at` has four writers, and three of them _clear_ it as a cascade.
So a run declares its write-set explicitly and the step is never inferred from
the column.

The run id carries a random component. It is the **identity of the provenance
event**, not a label derived from step plus instant plus recipe — nothing
serialises runs here (no lock, and the worktree workflow encourages parallel
sessions against one database), so two invocations can legitimately start in the
same millisecond. The first version of this code derived the id and its own test
collided on the first run.

## What the recipe is, and what it is not

The recipe is everything **constant across rows within one invocation**: the
model, the assembled prompt template, the shared vocabularies and standards the
template embeds, and the decoding parameters.

The per-row subject and its evidence are excluded. They are what the recipe was
applied _to_. Including them would produce one hash per plant and destroy the
cohort identity that makes the hash worth having.

Three consequences worth stating:

- **It is a hash, not a version number.** A `prompt_version = 7` kept by hand is
  another piece of state whose correctness depends on someone remembering to
  increment it, and every hand-maintained fact in this repo has rotted at least
  once. A hash of the assembled input cannot disagree with the thing it
  describes. It says _that_ the recipe changed, not what changed — and it does
  not need to, because the ingredients are constants in tracked files, so git
  holds the text and the hash points into it.
- **The template is hashed as assembled, not as a constant.** Five scripts embed
  shared vocabulary into their prompts. In July the region vocabulary was
  replaced wholesale while the template held still; a hash over the constant
  alone would have been blind to exactly the change that should invalidate a
  cohort. Where a template branches on row content, render it against an empty
  probe row so every optional instruction is present.
- **Decoding parameters are part of the recipe, and they are already set.** Every
  calling script sets `max_tokens`, and they all set it differently — 16 for a
  hardiness rating, 2048 for a full draft. Nothing sets `temperature` today, and
  "nothing is configured today" is not a stable contract: the day someone sets
  it, the recipe must change on its own.

## Why the stamp is current certification and not an audit trail

Three writers express "this value is no longer certified" by nulling the stamp.
That is intentional, and intentionally lossy. A cleared stamp is
indistinguishable from never-checked, so:

> Run provenance answers **what produced the currently certified value**. It does
> not answer **what has ever happened to this value**.

The run log answers the second question at run granularity, and nothing
associates a cleared row with the run that once certified it. That is a boundary
of the design rather than a defect in it — closing it would make the stamp mean
two things at once, and the stamp's single meaning is what every guard depends
on.

## Every invocation produces a record, including the ugly ones

The record is written at **finalisation**, never optimistically at startup — a
record written on the way in would recreate the exact "the timestamp proves the
work happened" ambiguity this exists to remove.

But an invocation that dies must still be recorded, because steps here are
resumable by design and one guard has actually been killed at row 279 of 494. So
a record carries an `outcome` of `completed`, `interrupted` or `failed`, and its
`row_count` is what the run **verified it wrote**, never the intended scope. An
interrupted run records 279, not 494. A resumed run is a separate run with its
own id: it may have had a different recipe, and one id spanning both halves would
be a lie.

**Honest limit:** a process that dies without running its handler — `SIGKILL`,
power loss — leaves stamps and no record. Those are detectable afterwards as
stamps falling inside no recorded window, which is the log-versus-evidence check
run in the other direction.

## Verification happens at finalisation, because the evidence decays

The log is append-only. Its database witnesses are not.

Stamps and `updated_at` are overwritten in place, so
`declared write-set ↔ observed changes ↔ row count` is checkable only while this
invocation's evidence is still the most recent thing to have touched those
columns. A provenance log verified when someone thinks to ask is verified after
its evidence is gone, so verification is part of the run and not a later
reconciliation job.

A disagreement is **recorded, not thrown**. Overlapping invocations are a normal
operating condition, so a column showing more movement than this run claims is
not evidence against the claim. A claim _larger_ than its evidence is.

## Non-goals

- No per-row provenance column.
- No `stale` flag or `needs_recuration` state.
- No database table — the log is committed, diffable, immutable by convention,
  needs no RLS, and has no backup semantics of its own.
- No human-maintained prompt version.
- No inference of the writing step from the column name.

## Enforcement, and what it does not prove

`pnpm invariants:check` holds the participation half, and prints what is left on
every green run. Shapes 8 to 11:

- a script that mutates the catalog opens a run;
- every write-set member names a real column and carries an evidence witness;
- a script that opens a run uses `withRunRecord` unless it is recorded as owning
  its own terminal paths;
- a row count is never hand-authored.

**The third one is worded carefully on purpose.** A source scan can see that a
file contains a finalisation call. It cannot prove that finalisation happens on
every control-flow path — that needs real analysis. So the guarantee is not in the
checker: `withRunRecord` makes it structural by owning the terminal paths, and the
scan's job is only to keep scripts on that pattern. An earlier draft of this
document said "a run that opens is finalised", which claimed something neither the
scan nor the language could deliver.

Raw `beginRun` stays available for a script that genuinely needs to own its
terminal paths — resume logic, its own signal handling — and needs a recorded
reason in `RAW_BEGIN_RUN_ALLOWED`. `curate-plants` was written with raw
`beginRun` first and converted; the recipe hash is identical across that change,
which is the right answer, since control flow is not part of the recipe.

This is the part that decides whether the pattern generalises. Three good
abstractions were invented here in response to individual failures — the
stamp-tied-to-verdict selector, per-column data provenance in
`image_attribution`, and paginated reads. Only paginated reads spread, and the
difference was not that pagination is more obvious: it is that "never bare
`.select()` on a full table" became a rule with a scan behind it. The other two
are still sitting in one file each.
