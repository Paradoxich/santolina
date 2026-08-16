import { describe, expect, it } from 'vitest'
import { isStraightSpeciesFile, rankSpeciesFileTitles } from './wikimedia'

/**
 * The Commons search fallback is the only place this codebase accepts a photo
 * it was not handed by name, so the taxon guard is the whole safety story.
 *
 * The fixtures are the REAL ten results Commons returned for
 * "Filipendula purpurea" on 2026-08-16 — the round-12 plant that shipped with
 * a placeholder because Wikidata had no designated image. Four of the ten are
 * a different plant while still containing the binomial, which is exactly why
 * a substring test is not enough.
 */
const COMMONS_HITS = [
  'File:Filipendula purpurea.JPG',
  'File:Filipendula purpurea Elegans 1zz.jpg',
  'File:Filipendula purpurea Elegans 2zz.jpg',
  'File:Filipendula × purpurea.jpg',
  "File:Filipendula purpurea 'Alba' 6 2021 Meadowsweet- (51269364082).jpg",
  "File:Filipendula purpurea 'Alba' 6 2021 Meadowsweet- (51269363717).jpg",
  "File:Filipendula purpurea 'Alba' 6 2021 Meadowsweet- (51271137790).jpg",
  "File:Filipendula purpurea 'Alba' 6 2021 Meadowsweet- (51270290108).jpg",
  'File:コシジシモツケソウ Filipendula purpurea var. auriculata.JPG',
  'File:(Filipendula purpurea close-up in Nikkō, Japan) - DPLA - 8bfe71be.jpg',
]

describe('isStraightSpeciesFile', () => {
  const keep = (t: string) => isStraightSpeciesFile(t, 'Filipendula purpurea')

  it('rejects a hybrid that contains the binomial', () => {
    expect(keep('File:Filipendula × purpurea.jpg')).toBe(false)
  })

  it('rejects a quoted cultivar', () => {
    expect(
      keep("File:Filipendula purpurea 'Alba' 6 2021 Meadowsweet-.jpg")
    ).toBe(false)
  })

  it('rejects an infraspecific rank', () => {
    expect(keep('File:Filipendula purpurea var. auriculata.JPG')).toBe(false)
    expect(keep('File:Filipendula purpurea subsp. something.jpg')).toBe(false)
  })

  it('keeps the bare species and the species inside a descriptive title', () => {
    expect(keep('File:Filipendula purpurea.JPG')).toBe(true)
    expect(
      keep(
        'File:(Filipendula purpurea close-up in Nikkō, Japan) - DPLA - 8b.jpg'
      )
    ).toBe(true)
  })

  it('rejects a different species in the same genus', () => {
    expect(keep('File:Filipendula ulmaria.jpg')).toBe(false)
    expect(keep('File:Filipendula rubra flowers.jpg')).toBe(false)
  })

  it('leaves exactly the straight-species files from the real search', () => {
    const kept = COMMONS_HITS.filter(keep)
    // The bare file, the two unquoted "Elegans" ones (the documented known
    // limit), and the DPLA description. The hybrid, the four 'Alba' cultivars
    // and the variety are all gone.
    expect(kept).toHaveLength(4)
    expect(kept).toContain('File:Filipendula purpurea.JPG')
    expect(kept.some((t) => t.includes('×'))).toBe(false)
    expect(kept.some((t) => t.includes("'Alba'"))).toBe(false)
    expect(kept.some((t) => t.includes('var.'))).toBe(false)
  })
})

describe('rankSpeciesFileTitles', () => {
  it('puts the bare binomial first, so the known cultivar limit only ever loses', () => {
    const ranked = rankSpeciesFileTitles(
      COMMONS_HITS.filter((t) =>
        isStraightSpeciesFile(t, 'Filipendula purpurea')
      ),
      'Filipendula purpurea'
    )
    expect(ranked[0]).toBe('File:Filipendula purpurea.JPG')
  })
})
