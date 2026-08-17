# Run log — write provenance

One JSON object per line, one file per month, **append-only and committed**.

Each line records one invocation of one step: its identity, when it ran, the
recipe that produced its output (model, assembled prompt, embedded vocabularies,
decoding parameters), the columns it declared it would write, how it ended, how
many rows it verified it wrote, whether that claim agreed with the database
evidence at the moment it finished, and what it was billed in tokens.

`usage` is the one field with no witness behind it — the run's own report of
what the API said it spent, recorded so a round's cost is answerable at all.
Tokens, not dollars: price it at read time from the model and the mode, and keep
the two modes apart, because the Batch API bills at half rate.

**This log is deliberately not authoritative.** The database stamps are the
evidence; this is the runner's recorded interpretation of them. That is the whole
point — it lets verification ask whether the two agree, which a self-reported log
could never do.

Read `apps/web/scripts/run-provenance.ts` for the contract, and
`docs/write-provenance.md` for why it is shaped this way.

Do not hand-edit these files. A line nobody generated is a claim nobody checked.
