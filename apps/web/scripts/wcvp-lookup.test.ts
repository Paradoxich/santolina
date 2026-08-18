/**
 * The shared WCVP lookup, and the two traps that live in it.
 *
 * Trap 11, pinned by `isExactSpeciesMatch` below: GBIF's `species/match` fails
 * UPWARD, into a genus. Hand it a
 * binomial it does not know and it climbs the taxonomy rather than returning
 * nothing, so accepting the answer fetches an entire genus's distribution:
 * `Pennisetum alopecuroides` came back as `Cenchrus` and was about to widen one
 * grass from "Eastern Asia" to 41 regions. The seam is the decision itself:
 * before 2026-08-18 it was three expressions inside a network call, and the
 * only thing a test could reach was the message printed afterwards.
 *
 * Trap 15, pinned here for the half that is code: the cache stores GBIF's whole
 * `distributions` payload, which aggregates many checklists, so a raw `NATIVE`
 * marker is not Kew's opinion, and `wcvpRows` keeps only rows WCVP itself
 * published. That is the whole of the code half. The trap stays OPEN by design
 * for its other half — a person reading the raw cache to audit a finding, which
 * no test can reach, and which nearly reversed three correct drops.
 *
 * A case below cites the rate-limit trap in passing. It does not close it: the
 * assertion there is about naming an absence honestly, not about a throttled
 * fetch refusing to degrade into confident-looking data.
 */

import { describe, expect, it } from 'vitest'

import {
  GBIF_NAME_ALIASES,
  isExactSpeciesMatch,
  WCVP_SOURCE,
  noEvidenceReason,
  wcvpNativeLocalities,
  wcvpRows,
  type CachedSpecies,
} from './wcvp-lookup'

const OTHER_SOURCE = 'World Register of Marine Species'

function species(rows: CachedSpecies['rows'], key: number | null = 123) {
  return { lookupKey: key, matchType: key ? 'EXACT' : 'HIGHERRANK', rows }
}

function row(
  locality: string | null,
  source: string | null,
  establishmentMeans: string | null = null
) {
  return { locality, source, establishmentMeans }
}

describe('isExactSpeciesMatch', () => {
  const exact = {
    matchType: 'EXACT',
    rank: 'SPECIES',
    canonicalName: 'Pennisetum alopecuroides',
  }

  it('accepts the species it was asked for', () => {
    expect(isExactSpeciesMatch(exact, 'Pennisetum alopecuroides')).toBe(true)
  })

  it('refuses the genus GBIF climbed to', () => {
    expect(
      isExactSpeciesMatch(
        { matchType: 'HIGHERRANK', rank: 'GENUS', canonicalName: 'Cenchrus' },
        'Pennisetum alopecuroides'
      )
    ).toBe(false)
  })

  it('refuses a genus-rank answer even when GBIF calls it EXACT', () => {
    expect(
      isExactSpeciesMatch(
        { matchType: 'EXACT', rank: 'GENUS', canonicalName: 'Cenchrus' },
        'Cenchrus'
      )
    ).toBe(false)
  })

  it('refuses a species-rank answer for a DIFFERENT species', () => {
    expect(
      isExactSpeciesMatch(
        { ...exact, canonicalName: 'Cenchrus americanus' },
        'Pennisetum alopecuroides'
      )
    ).toBe(false)
  })

  it('refuses a fuzzy match on the right name', () => {
    expect(
      isExactSpeciesMatch(
        { ...exact, matchType: 'FUZZY' },
        'Pennisetum alopecuroides'
      )
    ).toBe(false)
  })

  it('still accepts a hybrid, whose × GBIF drops from canonicalName', () => {
    expect(
      isExactSpeciesMatch(
        {
          matchType: 'EXACT',
          rank: 'SPECIES',
          canonicalName: 'Mentha piperita',
        },
        'Mentha × piperita'
      )
    ).toBe(true)
  })

  it('refuses an answer with no rank at all', () => {
    expect(
      isExactSpeciesMatch(
        { matchType: 'EXACT', canonicalName: 'Pennisetum alopecuroides' },
        'Pennisetum alopecuroides'
      )
    ).toBe(false)
  })
})

describe('wcvpRows', () => {
  it('keeps only rows WCVP itself published', () => {
    const s = species([
      row('Greece', WCVP_SOURCE),
      row('Texas', OTHER_SOURCE, 'NATIVE'),
    ])
    expect(wcvpRows(s).map((r) => r.locality)).toEqual(['Greece'])
  })

  // Trap 15: the payload aggregates many checklists, so a raw NATIVE marker is
  // not Kew's opinion. Rudbeckia fulgida really does carry "Florida — NATIVE"
  // from the World Register of Marine Species.
  it('discards a NATIVE marker from a non-WCVP checklist', () => {
    const s = species([row('Florida', OTHER_SOURCE, 'NATIVE')])
    expect(wcvpRows(s)).toEqual([])
    expect(noEvidenceReason(s)).toMatch(/no WCVP distribution/)
  })
})

describe('wcvpNativeLocalities', () => {
  it('splits native from introduced, and sorts both', () => {
    const s = species([
      row('Spain', WCVP_SOURCE),
      row('Algeria', WCVP_SOURCE),
      row('Texas', WCVP_SOURCE, 'INTRODUCED'),
    ])
    expect(wcvpNativeLocalities(s)).toEqual({
      native: ['Algeria', 'Spain'],
      introducedOnly: ['Texas'],
    })
  })

  it('treats an absent establishment marker as native, WCVP-style', () => {
    const s = species([row('Corse', WCVP_SOURCE, null)])
    expect(wcvpNativeLocalities(s).native).toEqual(['Corse'])
  })

  it('does not report a locality as introduced-only when it is also native', () => {
    const s = species([
      row('Greece', WCVP_SOURCE),
      row('Greece', WCVP_SOURCE, 'INTRODUCED'),
    ])
    const { native, introducedOnly } = wcvpNativeLocalities(s)
    expect(native).toEqual(['Greece'])
    expect(introducedOnly).toEqual([])
  })

  it('ignores blank localities rather than emitting an empty region', () => {
    const s = species([row('', WCVP_SOURCE), row(null, WCVP_SOURCE)])
    expect(wcvpNativeLocalities(s).native).toEqual([])
  })
})

describe('noEvidenceReason', () => {
  it('returns null when WCVP evidence exists', () => {
    expect(noEvidenceReason(species([row('Greece', WCVP_SOURCE)]))).toBeNull()
  })

  // Trap 1: a failed or unmatched lookup must never read as a negative result.
  // These two are different facts and neither means "native nowhere".
  it('distinguishes an unmatched name from a taxon Kew does not cover', () => {
    const unmatched = {
      lookupKey: null,
      matchType: 'HIGHERRANK → Cenchrus (GENUS)',
      rows: [],
    }
    expect(noEvidenceReason(unmatched)).toBe(
      'no exact species-rank GBIF match (HIGHERRANK → Cenchrus (GENUS))'
    )
    expect(noEvidenceReason(species([]))).toBe(
      'GBIF has the taxon but carries no WCVP distribution for it'
    )
  })
})

// Levenshtein, small and local — only used to bound how far apart a spelling
// variant may be below.
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
  return d[a.length]![b.length]!
}

describe('GBIF_NAME_ALIASES', () => {
  // The mistake this guards against is easy to make and silent: putting a
  // genuine SYNONYM here (Schizophragma hydrangeoides → Hydrangea
  // hydrangeoides, from this very round) instead of an orthographic variant.
  // GBIF already resolves synonyms itself through acceptedUsageKey, so an
  // alias that crosses taxa would fetch a DIFFERENT plant's distribution and
  // report it as this one's — trap 11's damage arriving through the front door.
  it('holds only same-genus spelling variants, never cross-taxon synonyms', () => {
    for (const [from, to] of Object.entries(GBIF_NAME_ALIASES)) {
      const [fromGenus, fromEpithet = ''] = from.toLowerCase().split(' ')
      const [toGenus, toEpithet = ''] = to.toLowerCase().split(' ')

      expect(fromGenus, `${from} → ${to} changes genus`).toBe(toGenus)
      expect(fromEpithet, `${from} → ${to} is a no-op`).not.toBe(toEpithet)
      expect(
        editDistance(fromEpithet, toEpithet),
        `${from} → ${to} is too far apart to be a spelling variant`
      ).toBeLessThanOrEqual(2)
    }
  })
})
