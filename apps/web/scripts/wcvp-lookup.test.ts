import { describe, expect, it } from 'vitest'

import {
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
