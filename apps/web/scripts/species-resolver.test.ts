/**
 * Traps 7 and 27, pinned: the species resolver, at the seams the seven forks
 * had between them.
 *
 * Trap 7 — Trefle name search silently resolves to a sibling species, so seed
 * by verified id or by an exact synonym-aware genus+species match, and log the
 * drift. Trap 27 — a Latin epithet agrees in gender with its genus, so one
 * species is spelled two ways and exact matching misses the other spelling.
 *
 * The failure this guards is not a missed match. A lost synonym group resolves
 * a candidate to a new Trefle id for a species the catalog already holds under
 * the other genus, so the run inserts a DUPLICATE species — both rows real,
 * both sourced, indistinguishable to every downstream guard, and unfixable by
 * any later pass. Round 11's table had lost 12 of the 45 groups.
 *
 * The assertions are on identity: what `resolve` returns, and what it refuses
 * to return. `results[0]` is the witness — it is the value the old
 * `seed-plants.ts:328` returned, and the one thing this resolver must never
 * hand back unverified.
 */
import { describe, expect, it, vi } from 'vitest'

import type { TrefleDetail, TrefleListItem } from '../lib/trefle'
import {
  SYNONYM_GENERA,
  genusSynonyms,
  holdsIn,
  normKey,
  resolve,
  sciMatches,
  synonymNameMatches,
} from './species-resolver'

const hit = (id: number, scientific_name: string): TrefleListItem =>
  ({ id, scientific_name, common_name: null }) as TrefleListItem

const detail = (
  id: number,
  scientific_name: string,
  synonyms: string[]
): TrefleDetail =>
  ({
    id,
    scientific_name,
    synonyms: synonyms.map((name, i) => ({ id: 900 + i, name, author: null })),
  }) as TrefleDetail

/** No network, no pacing delay, silent. */
const harness = (
  pages: TrefleListItem[][],
  details: Record<number, TrefleDetail> = {}
) => {
  const lines: string[] = []
  const search = vi.fn(
    async (_name: string, page: number) => pages[page - 1] ?? []
  )
  const fetchDetail = vi.fn(async (id: number) => {
    const d = details[id]
    if (!d) throw new Error(`no detail stubbed for ${id}`)
    return d
  })
  return {
    lines,
    search,
    fetchDetail,
    opts: {
      search,
      fetchDetail,
      sleep: async () => {},
      log: (l: string) => lines.push(l),
    },
  }
}

describe('the table', () => {
  it('holds the union of all seven forks: 45 groups over 105 names', () => {
    const names = SYNONYM_GENERA.flat()
    expect(SYNONYM_GENERA).toHaveLength(45)
    expect(new Set(names).size).toBe(105)
  })

  it('carries the 12 groups round 11 had lost', () => {
    // Every one of these has the far side already in the catalog, so seeding
    // round 12 from round 11's table would have inserted duplicates.
    const lost = [
      ['corydalis', 'pseudofumaria'],
      ['dorycnium', 'lotus'],
      ['perovskia', 'salvia'],
      ['citrus', 'fortunella'],
      ['chamomilla', 'matricaria'],
      ['lychnis', 'silene'],
      ['allium', 'nectaroscordum'],
      ['anthemis', 'cota'],
      ['coronilla', 'hippocrepis'],
      ['alyssum', 'aurinia'],
      ['betonica', 'stachys'],
      ['asplenium', 'scolopendrium'],
    ]
    for (const [a, b] of lost) {
      expect(genusSynonyms(a!), `${a} → ${b}`).toContain(b)
      expect(genusSynonyms(b!), `${b} → ${a}`).toContain(a)
    }
  })

  it('keeps every fork-era group reachable from either end', () => {
    for (const group of SYNONYM_GENERA) {
      for (const g of group) {
        for (const other of group) expect(genusSynonyms(g)).toContain(other)
      }
    }
  })
})

describe('sciMatches: epithet first, genus table second', () => {
  it('rejects a sibling species in the same genus', () => {
    expect(sciMatches('Acer palmatum', 'Acer japonicum')).toBe(false)
  })

  it('accepts a moved genus with an identical epithet', () => {
    expect(sciMatches('Aster novi-belgii', 'Symphyotrichum novi-belgii')).toBe(
      true
    )
  })

  it('rejects a shared epithet across unrelated genera', () => {
    expect(sciMatches('Salvia officinalis', 'Betonica officinalis')).toBe(false)
  })

  it('cannot see a gender-variant epithet pair, by design', () => {
    // The documented rule-2 limit: 3 of the 45 groups can never fire. Rule 3
    // and hand-verified ids are the escape hatches, NOT a genus-first match.
    expect(sciMatches('Alyssum saxatile', 'Aurinia saxatilis')).toBe(false)
    expect(sciMatches('Dorycnium hirsutum', 'Lotus hirsutus')).toBe(false)
    expect(sciMatches('Perovskia atriplicifolia', 'Salvia yangii')).toBe(false)
  })

  it('ignores hybrid markers, case and author noise in the epithet pair', () => {
    expect(sciMatches('Sedum spurium', 'PHEDIMUS  spurium')).toBe(true)
    expect(normKey('Osmanthus × burkwoodii')).toBe('osmanthus burkwoodii')
  })
})

describe('resolve: never returns the top hit unverified', () => {
  it('refuses a top hit that fails the epithet rule and logs the rejection', async () => {
    const h = harness([[hit(1, 'Acer japonicum'), hit(2, 'Acer buergerianum')]])
    const out = await resolve('Acer palmatum', {
      ...h.opts,
      synonymProbes: 0,
    })
    expect(out).toBeNull()
    expect(h.lines.join('\n')).toContain(
      'top hit rejected: Acer japonicum (#1)'
    )
  })

  it('returns the verified match, not results[0], when both are present', async () => {
    const h = harness([
      [hit(1, 'Aster amellus'), hit(2, 'Symphyotrichum novi-belgii')],
    ])
    const out = await resolve('Aster novi-belgii', h.opts)
    expect(out?.id).toBe(2)
    expect(out?.matchedBy).toBe('epithet')
    expect(out?.topId).toBe(1) // carried for drift logging only
    expect(h.lines.join('\n')).toContain('top hit rejected: Aster amellus (#1)')
  })

  it('passes a numeric entry straight through without searching', async () => {
    const h = harness([])
    const out = await resolve(122372, h.opts)
    expect(out).toEqual({
      id: 122372,
      scientific_name: 'id:122372',
      matchedBy: 'id',
      topName: null,
      topId: null,
    })
    expect(h.search).not.toHaveBeenCalled()
  })

  it('walks to page 2 only when page 1 was full', async () => {
    const full = Array.from({ length: 20 }, (_, i) =>
      hit(i + 10, 'Rosa canina')
    )
    const h = harness([full, [hit(99, 'Rosa rugosa')]])
    const out = await resolve('Rosa rugosa', h.opts)
    expect(out?.id).toBe(99)
    expect(h.search).toHaveBeenCalledTimes(2)
  })

  it('stops after a short page rather than paging on', async () => {
    const h = harness([[hit(1, 'Rosa canina')], [hit(99, 'Rosa rugosa')]])
    const out = await resolve('Rosa rugosa', { ...h.opts, synonymProbes: 0 })
    expect(out).toBeNull()
    expect(h.search).toHaveBeenCalledTimes(1)
  })
})

describe("resolve rule 3: Trefle's own synonyms[] close the epithet gap", () => {
  it('matches a gender-variant epithet through the synonym list', async () => {
    // The round 11 case: Selinum wallichianum is held as Ligusticopsis
    // wallichiana, whose synonym list names what was asked for. Before this,
    // the only escape hatch was a hand-verified id.
    const h = harness([[hit(96932, 'Ligusticopsis wallichiana')]], {
      96932: detail(96932, 'Ligusticopsis wallichiana', [
        'Selinum wallichianum',
      ]),
    })
    const out = await resolve('Selinum wallichianum', h.opts)
    expect(out?.id).toBe(96932)
    expect(out?.matchedBy).toBe('synonym')
    expect(out?.viaSynonym).toBe('Selinum wallichianum')
  })

  it('matches when genus AND epithet both moved', async () => {
    // Schizophragma hydrangeoides has been sunk into Hydrangea.
    const h = harness([[hit(359005, 'Hydrangea hydrangeoides')]], {
      359005: detail(359005, 'Hydrangea hydrangeoides', [
        'Schizophragma hydrangeoides',
      ]),
    })
    const out = await resolve('Schizophragma hydrangeoides', h.opts)
    expect(out?.id).toBe(359005)
    expect(out?.matchedBy).toBe('synonym')
  })

  it('costs nothing on the happy path', async () => {
    const h = harness([[hit(2, 'Symphyotrichum novi-belgii')]])
    await resolve('Aster novi-belgii', h.opts)
    expect(h.fetchDetail).not.toHaveBeenCalled()
  })

  it('is bounded by synonymProbes and never probes a sibling into a match', async () => {
    const h = harness(
      [[hit(1, 'Acer japonicum'), hit(2, 'Acer buergerianum')]],
      {
        1: detail(1, 'Acer japonicum', ['Acer sieboldianum']),
        2: detail(2, 'Acer buergerianum', ['Acer trifidum']),
      }
    )
    const out = await resolve('Acer palmatum', { ...h.opts, synonymProbes: 1 })
    expect(out).toBeNull()
    expect(h.fetchDetail).toHaveBeenCalledTimes(1)
  })

  it('lets a failed detail fetch throw instead of reading as "no synonym"', async () => {
    // Trap 1: a 429 folded into an absence is how 466 rate-limit errors became
    // confident-looking data. The caller decides, not the resolver.
    const h = harness([[hit(1, 'Acer japonicum')]]) // no detail stubbed
    await expect(resolve('Acer palmatum', h.opts)).rejects.toThrow(
      'no detail stubbed for 1'
    )
  })

  it('accepts an infraspecific synonym as its binomial, deliberately', () => {
    // What actually matched in the live smoke run: normKey keeps two tokens, so
    // a variety-rank synonym normalises to the species. Correct here (a
    // variety's accepted species is the species asked for) and pinned so it
    // stays a decision rather than a side effect of normalisation.
    expect(
      synonymNameMatches('Selinum wallichianum', [
        { id: 1, name: 'Selinum wallichianum var. elata', author: null },
      ])
    ).toBe('Selinum wallichianum var. elata')
  })

  it('ignores an empty or absent synonym list', () => {
    expect(synonymNameMatches('Selinum wallichianum', null)).toBeNull()
    expect(synonymNameMatches('Selinum wallichianum', [])).toBeNull()
  })
})

describe('holdsIn: the pre-resolve skip is synonym-aware', () => {
  const catalog = new Set(['bistorta amplexicaulis', 'silene coronaria'])

  it('sees a species the catalog holds under the other genus', () => {
    // seed-round11.ts:315-322 claimed this in a comment and did an exact
    // lookup, so these candidates spent Trefle calls before being caught.
    expect(holdsIn(catalog, 'Persicaria amplexicaulis')).toBe(true)
    expect(holdsIn(catalog, 'Lychnis coronaria')).toBe(true)
  })

  it('does not confuse a sibling for a held species', () => {
    expect(holdsIn(catalog, 'Persicaria affinis')).toBe(false)
    expect(holdsIn(catalog, 'Silene dioica')).toBe(false)
  })

  it('needs an epithet to say anything', () => {
    expect(holdsIn(catalog, 'Persicaria')).toBe(false)
  })
})
