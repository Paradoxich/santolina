import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTERS,
  SEARCH_RANK,
  matchesSearchTerm,
  searchRank,
  visiblePlants,
} from './explore-filters'
import type { CatalogPlant } from '@/types/garden'

function plant(overrides: Partial<CatalogPlant> = {}): CatalogPlant {
  return {
    id: overrides.commonName ?? 'id',
    commonName: 'Common sage',
    botanicalName: 'Salvia officinalis',
    imageUrl: '',
    description: '',
    aliases: [],
    plantType: 'perennial',
    styleTags: [],
    sunThrives: [],
    bloomMonths: [],
    bloomColor: [],
    foliageColor: null,
    greenery: false,
    nativeRegion: [],
    ...overrides,
  }
}

describe('searchRank', () => {
  it('ranks an exact name above a prefix, a prefix above a substring', () => {
    const q = 'sage'
    expect(searchRank(plant({ commonName: 'Sage' }), q)).toBe(
      SEARCH_RANK.EXACT_COMMON_NAME
    )
    expect(searchRank(plant({ commonName: 'Sagebrush' }), q)).toBe(
      SEARCH_RANK.NAME_PREFIX
    )
    expect(searchRank(plant({ commonName: 'Russian sage' }), q)).toBe(
      SEARCH_RANK.NAME_SUBSTRING
    )
  })

  it('treats botanical name and aliases as names', () => {
    expect(
      searchRank(
        plant({ commonName: 'Lavender', botanicalName: 'Lavandula' }),
        'lavandula'
      )
    ).toBe(SEARCH_RANK.EXACT_OTHER_NAME)
    expect(
      searchRank(
        plant({ commonName: 'Lavender', aliases: ['Lavandin'] }),
        'lav'
      )
    ).toBe(SEARCH_RANK.NAME_PREFIX)
  })

  // The live case: Lantana camara carries the literal alias "sage", so on a
  // single exact tier it tied Salvia officinalis and won alphabetically.
  it("ranks a plant's own name above another plant's alias", () => {
    const salvia = plant({
      commonName: 'Sage',
      botanicalName: 'Salvia officinalis',
    })
    const lantana = plant({
      commonName: 'Common lantana',
      botanicalName: 'Lantana camara',
      aliases: ['wild sage', 'sage', 'yellow sage'],
    })
    expect(searchRank(salvia, 'sage')).toBe(SEARCH_RANK.EXACT_COMMON_NAME)
    expect(searchRank(lantana, 'sage')).toBe(SEARCH_RANK.EXACT_OTHER_NAME)
    expect(searchRank(salvia, 'sage')).toBeLessThan(searchRank(lantana, 'sage'))
  })

  it('is case and whitespace insensitive', () => {
    expect(searchRank(plant({ commonName: 'Sage' }), '  SAGE  ')).toBe(
      SEARCH_RANK.EXACT_COMMON_NAME
    )
  })

  // The whole point of the ladder: before it existed these two came back
  // alphabetically, so the season match could sit above the name match.
  it('ranks a name match above a facet-only match', () => {
    const named = plant({ commonName: 'Summer snowflake' })
    const seasonal = plant({ commonName: 'Achillea', bloomMonths: [7] })
    expect(searchRank(named, 'summer')).toBe(SEARCH_RANK.NAME_PREFIX)
    expect(searchRank(seasonal, 'summer')).toBe(SEARCH_RANK.FACET)
  })

  it('scores every facet axis at the facet tier', () => {
    expect(searchRank(plant({ styleTags: ['modern'] }), 'modern')).toBe(
      SEARCH_RANK.FACET
    )
    expect(searchRank(plant({ sunThrives: ['shade'] }), 'shade')).toBe(
      SEARCH_RANK.FACET
    )
    expect(searchRank(plant({ plantType: 'shrub' }), 'shrub')).toBe(
      SEARCH_RANK.FACET
    )
    expect(searchRank(plant({ bloomColor: ['yellow'] }), 'yellow')).toBe(
      SEARCH_RANK.FACET
    )
    expect(searchRank(plant({ greenery: true }), 'green')).toBe(
      SEARCH_RANK.FACET
    )
  })

  it('does not credit a facet label the plant is not tagged with', () => {
    expect(searchRank(plant({ styleTags: ['cottage'] }), 'modern')).toBe(
      SEARCH_RANK.NO_MATCH
    )
    expect(searchRank(plant({ bloomMonths: [1] }), 'summer')).toBe(
      SEARCH_RANK.NO_MATCH
    )
  })

  it('ranks everything equally on an empty query', () => {
    const a = searchRank(plant({ commonName: 'Achillea' }), '')
    const b = searchRank(plant({ commonName: 'Zinnia' }), '   ')
    expect(a).toBe(b)
    expect(a).not.toBe(SEARCH_RANK.NO_MATCH)
  })
})

describe('matchesSearchTerm', () => {
  it('agrees with searchRank about what counts as a hit', () => {
    const cases: [CatalogPlant, string][] = [
      [plant({ commonName: 'Sage' }), 'sage'],
      [plant({ styleTags: ['modern'] }), 'modern'],
      [plant({ styleTags: ['cottage'] }), 'modern'],
      [plant(), ''],
    ]
    for (const [p, q] of cases) {
      expect(matchesSearchTerm(p, q)).toBe(
        searchRank(p, q) !== SEARCH_RANK.NO_MATCH
      )
    }
  })
})

describe('visiblePlants', () => {
  // Alphabetical, as getExplorePlants returns them.
  const catalog = [
    plant({ commonName: 'Achillea', bloomMonths: [7] }),
    plant({ commonName: 'Common lantana', aliases: ['sage'] }),
    plant({ commonName: 'Russian sage' }),
    plant({ commonName: 'Sage' }),
    plant({ commonName: 'Sagebrush' }),
    plant({ commonName: 'Zinnia', bloomMonths: [7] }),
  ]
  const names = (ps: CatalogPlant[]) => ps.map((p) => p.commonName)

  it('orders results best match first', () => {
    expect(names(visiblePlants(catalog, 'sage', EMPTY_FILTERS, []))).toEqual([
      'Sage',
      'Common lantana',
      'Sagebrush',
      'Russian sage',
    ])
  })

  it('keeps a shared tier alphabetical', () => {
    expect(names(visiblePlants(catalog, 'summer', EMPTY_FILTERS, []))).toEqual([
      'Achillea',
      'Zinnia',
    ])
  })

  it('leaves the catalog order alone when nothing is typed', () => {
    expect(names(visiblePlants(catalog, '', EMPTY_FILTERS, []))).toEqual(
      names(catalog)
    )
  })

  it('drops non-matches and still applies the filter row', () => {
    const filtered = visiblePlants(
      catalog,
      'sage',
      { ...EMPTY_FILTERS, seasons: ['summer'] },
      []
    )
    expect(names(filtered)).toEqual([])
  })

  it('ranks within the filtered set, not the whole catalog', () => {
    const withStyle = [
      plant({ commonName: 'Russian sage', styleTags: ['modern'] }),
      plant({ commonName: 'Sage' }),
    ]
    expect(
      names(
        visiblePlants(
          withStyle,
          'sage',
          { ...EMPTY_FILTERS, styles: ['modern'] },
          []
        )
      )
    ).toEqual(['Russian sage'])
  })
})
