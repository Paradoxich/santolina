/**
 * The imperative-verb resolver, pinned.
 *
 * ROUND 13, `Pinus densiflora`. Both its autumn and winter care lines began
 * "Cloud-prune ...", and the validator threw them away as "not imperative —
 * starts with cloud-prune". `prune` is in ACTION_VERBS; `cloud-prune` is not,
 * and the resolver took the whole first token. The plant finished the round
 * with no `seasonal_care` at all, and the pass reported it as a flag rather
 * than an error, so it read as a data problem when it was a validator problem.
 *
 * Cloud-pruning is the signature care action of the Japanese-tradition pines
 * this round seeded, which is why round 13 is the first to hit it: the
 * vocabulary did not exist in the catalog before.
 *
 * The witness is the resolver itself. Against the pre-fix code the first case
 * below returns "cloud-prune" instead of "prune", which is exactly what the
 * rejection message printed.
 */

import { describe, expect, it } from 'vitest'
import { headVerb, imperativeVerb } from './curate-seasonal-care'

describe('imperativeVerb resolves a hyphenated compound (round 13)', () => {
  it('reads the head verb of a compound', () => {
    expect(imperativeVerb('Cloud-prune the candles in late autumn.')).toBe(
      'prune'
    )
  })

  it('reads it through a leading adverb too', () => {
    // Both allowances have to compose: the adverb is skipped, then the
    // compound behind it is resolved.
    expect(imperativeVerb('Lightly cloud-prune the new candles.')).toBe('prune')
  })

  it('leaves an ordinary verb untouched', () => {
    expect(imperativeVerb('Prune after flowering.')).toBe('prune')
    expect(imperativeVerb('Lightly prune after flowering.')).toBe('prune')
  })

  it('still reports a genuinely descriptive opener', () => {
    // The rule the validator is actually for, kept intact: a hyphen must not
    // become a way to smuggle narrative past the check.
    expect(imperativeVerb('Watch for new growth.')).toBe('watch')
    expect(imperativeVerb('Expect bronze winter colour.')).toBe('expect')
  })

  it('handles a bare word and a leading quote unchanged', () => {
    expect(headVerb('prune')).toBe('prune')
    expect(imperativeVerb('"Mulch deeply in autumn.')).toBe('mulch')
  })
})
