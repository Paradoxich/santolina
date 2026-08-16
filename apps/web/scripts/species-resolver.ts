/**
 * The species resolver, in one place.
 *
 * WHY THIS EXISTS. Seven scripts had grown their own copy of the same
 * resolver — `seed-round6` through `seed-round11` and `seed-regional-natives`.
 * Six of the seven were byte-identical once comments were stripped; the only
 * part that ever diverged was the one part that matters, the synonym table,
 * because it was hand-carried from the previous round's file. Round 7 kept 0 of
 * round 6's 7 groups, round 8 kept 1 of round 7's 3, and by round 11 the table
 * had lost 12 whole groups. Not one group was partially carried, which is the
 * signature of copy-paste rather than judgement.
 *
 * The cost is not a missed match. A missed synonym group resolves the entry to
 * a NEW Trefle id whose species the catalog already holds under the other
 * genus, so the run inserts a duplicate species — and a duplicate species is
 * the one failure a later pass cannot undo, because both rows are real, sourced
 * and indistinguishable to every downstream guard. The catalog already holds
 * the far side of most of the 12 lost groups (Silene coronaria, Cota tinctoria,
 * Hippocrepis emerus, Pseudofumaria lutea, Aurinia saxatilis, Asplenium
 * scolopendrium, Allium siculum, Matricaria chamomilla, Citrus japonica,
 * Stachys officinalis, Perovskia atriplicifolia), so round 12 seeded from round
 * 11's table would have inserted duplicates, not merely missed skips.
 *
 * So: one table, one matcher, append-only, and no `seed-*.ts` may declare its
 * own `SYNONYM_GENERA` — `check-pipeline-invariants.ts` enforces that half.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. The genus table is consulted only after
 * the species epithet has already matched exactly (rule 2 below). That is what
 * makes sibling rejection work, and it is why three of the 45 groups can never
 * fire: `perovskia`/`salvia`, `dorycnium`/`lotus` and `alyssum`/`aurinia` are
 * gender-variant epithet pairs (Perovskia atriplicifolia → Salvia
 * yangii, Dorycnium hirsutum → Lotus hirsutus, Alyssum saxatile → Aurinia
 * saxatilis). At most 42 of the 45 groups are functional under rule 2. Do not
 * "fix" the matcher to close that gap by matching genus-first — that
 * reintroduces the sibling drift the whole resolver exists to prevent (Acer
 * palmatum must not bind to Acer japonicum). The gap is closed instead by rule
 * 3, the synonym-list matcher, and failing that by seeding a verified id.
 *
 * Usage: see `resolve` and `fetchCatalogIndex` below. Both are injectable so
 * the matcher can be tested without network (`species-resolver.test.ts`).
 */

import {
  getSpeciesBySlug,
  searchSpeciesByName,
  type TrefleDetail,
  type TrefleListItem,
} from '../lib/trefle'
import { fetchCatalogIdentity } from './catalog-identity'

// ---------------------------------------------------------------------------
// The table. APPEND-ONLY — never re-derive it from a round file.
//
// Seeded 2026-08-16 with the union of all seven forked copies: 45 connected
// components over 105 genus names, computed by union-find across
// seed-round6/7/8/9/10/11 and seed-regional-natives before those tables were
// deleted. Round 11's live table held 34 of the 45.
//
// Adding a group: put the genera in one array, alphabetical within the array,
// and keep the array list alphabetical by first element. A group is cheap and
// harmless when unused — the epithet must match before it is consulted — so
// prefer adding a guard group to leaving one out.
// ---------------------------------------------------------------------------
export const SYNONYM_GENERA: readonly (readonly string[])[] = [
  ['abelia', 'linnaea'],
  ['achnatherum', 'anemanthele', 'nassella', 'stipa'],
  ['acis', 'leucojum'],
  ['aconogonon', 'bistorta', 'persicaria', 'polygonum'],
  ['actaea', 'cimicifuga'],
  ['alkekengi', 'physalis'],
  ['allium', 'nectaroscordum'],
  ['aloe', 'aloiampelos'],
  ['alyssum', 'aurinia'], // gender-variant epithets: cannot fire under rule 2
  ['ampelopsis', 'parthenocissus', 'psedera'],
  ['anemone', 'anemonoides', 'eriocapitella'],
  ['anthemis', 'cota'],
  ['asplenium', 'phyllitis', 'scolopendrium'],
  ['aster', 'eurybia', 'symphyotrichum'],
  ['berberis', 'mahonia'],
  ['betonica', 'stachys'],
  ['bignonia', 'campsis', 'tecoma'],
  ['blechnum', 'struthiopteris'],
  ['brauneria', 'echinacea', 'rudbeckia'],
  ['calacinum', 'muehlenbeckia'],
  ['calamintha', 'clinopodium', 'satureja'],
  ['calibrachoa', 'petunia'],
  ['chamomilla', 'matricaria'],
  ['chasmanthium', 'uniola'],
  ['cheiranthus', 'erysimum'],
  ['chionodoxa', 'othocallis', 'scilla'],
  ['chrysanthemum', 'dendranthema'],
  ['citrus', 'fortunella'],
  ['cornus', 'swida'],
  ['coronilla', 'hippocrepis'],
  ['corydalis', 'pseudofumaria'],
  ['disporum', 'polygonatum'],
  ['dorycnium', 'lotus'], // gender-variant epithets: cannot fire under rule 2
  ['eupatoriadelphus', 'eupatorium', 'eutrochium'],
  ['hesperantha', 'schizostylis'],
  ['hylotelephium', 'petrosedum', 'phedimus', 'sedum'],
  ['ipheion', 'tristagma'],
  ['ipomoea', 'pharbitis'],
  ['jovibarba', 'sempervivum'],
  ['lamiastrum', 'lamium'],
  ['lychnis', 'silene'],
  ['maianthemum', 'smilacina'],
  ['perovskia', 'salvia'], // gender-variant epithets: cannot fire under rule 2
  ['rhynchospermum', 'trachelospermum'],
  ['vernonanthura', 'vernonia'],
]

/** Every genus that shares a component with `genus`, including itself. */
export function genusSynonyms(genus: string): Set<string> {
  const set = new Set<string>([genus])
  for (const group of SYNONYM_GENERA) {
    if (group.includes(genus)) for (const g of group) set.add(g)
  }
  return set
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** → [genus, epithet] lowercased, hybrid marker and author stripped. */
export function normSci(s: string): [string, string] {
  const parts = s
    .toLowerCase()
    .replace(/×/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  return [parts[0] ?? '', parts[1] ?? '']
}

/** Normalised `"genus epithet"`, the form used as a catalog dedupe key. */
export function normKey(s: string): string {
  return normSci(s).join(' ')
}

/**
 * Rule 2, kept exactly as `seed-round11.ts:220-225` had it: the epithet must be
 * identical BEFORE the genus table is consulted. Do not relax this.
 */
export function sciMatches(target: string, candidate: string): boolean {
  const [tg, ts] = normSci(target)
  const [cg, cs] = normSci(candidate)
  if (!ts || ts !== cs) return false
  return genusSynonyms(tg).has(cg)
}

/**
 * Rule 3, the second matcher. Trefle records the names a species used to be
 * held under in `synonyms[]`, and until now nothing in the repo read it
 * (declared at `lib/trefle.ts:101`, zero readers).
 *
 * This is the only mechanism that can catch a synonym pair whose EPITHETS
 * differ, which is exactly the gap rule 2 leaves open. Round 11 hit it twice in
 * one round and both times the escape hatch was a hand-verified id.
 *
 * Match is exact on the normalised pair, genus AND epithet, with the genus
 * table allowed as a fallback. Exactness is what makes this safe: an entry in
 * `synonyms[]` is Trefle's own assertion that the two names denote one species,
 * so there is no sibling-drift risk to guard against here.
 *
 * SMOKE-TESTED against live Trefle 2026-08-16, on round 11's three
 * hand-resolved misses. Two of the three now resolve without a hand id, and the
 * run turned up two things worth knowing:
 *
 *   · `normKey` keeps only the first two tokens, so an INFRASPECIFIC synonym
 *     normalises to its binomial: `Selinum wallichianum var. elata` is what
 *     actually matched a request for `Selinum wallichianum` (#96932
 *     Ligusticopsis wallichiana, 15 synonyms). That widening is deliberate and
 *     correct here — a variety's accepted species is the species asked for —
 *     but it means the match can be to the accepted species OF A VARIETY, so
 *     the matched string is logged, never swallowed.
 *   · Rule 3 does not close the gender-variant gap in general. Rhodochiton
 *     atrosanguineus is held as R. atrosanguineum (#122372) whose only synonym
 *     is `Rhodochiton volubile`, so `resolve` correctly returns null and prints
 *     `top hit rejected: Rhodochiton atrosanguineum (#122372)`. That line IS
 *     the workflow: verify the id by hand, then seed it as a number.
 */
export function synonymNameMatches(
  target: string,
  synonyms: TrefleDetail['synonyms']
): string | null {
  if (!synonyms?.length) return null
  const key = normKey(target)
  for (const syn of synonyms) {
    if (!syn?.name) continue
    if (normKey(syn.name) === key) return syn.name
    if (sciMatches(target, syn.name)) return syn.name
  }
  return null
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

export interface Resolved {
  id: number
  scientific_name: string
  /** How the identity was established. Never `results[0]`. */
  matchedBy: 'id' | 'epithet' | 'synonym'
  /** The synonym string that matched, when `matchedBy === 'synonym'`. */
  viaSynonym?: string
  /** Top search hit, carried for DRIFT LOGGING ONLY — never returned as the id. */
  topName: string | null
  topId: number | null
}

export interface ResolveOptions {
  /** Search pages to walk before giving up. Default 2, as every round seeder used. */
  pages?: number
  /**
   * How many candidates to probe for `synonyms[]` after the epithet pass fails.
   * Each probe is one extra rate-limited detail fetch, so this is bounded and
   * off the happy path. 0 disables rule 3. Default 3.
   */
  synonymProbes?: number
  /**
   * Pause before each extra detail fetch. Trefle's documented limit is 120
   * req/min (trap 1, `docs/database-log.md`); 1600ms is the pacing every round
   * seeder already uses and is ~37 req/min.
   */
  paceMs?: number
  /** Line printer. Default `console.log`. */
  log?: (line: string) => void
  /** Injected for tests. */
  search?: (name: string, page: number) => Promise<TrefleListItem[]>
  /** Injected for tests. */
  fetchDetail?: (id: number) => Promise<TrefleDetail>
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Resolve one seed entry to a VERIFIED Trefle id.
 *
 * A number passes straight through — a numeric entry is an id someone checked
 * by hand, which is the documented escape hatch for everything the matchers
 * cannot reach. A string is paged-searched and filtered through `sciMatches`,
 * then (rule 3) through the candidates' own synonym lists.
 *
 * `results[0]` is NEVER returned. It is assigned only to the drift-logging
 * variable. `seed-plants.ts` used to return it with a null check but no
 * identity check, which is the exact drift all seven dedicated seeders were
 * written to prevent.
 *
 * A failing fetch THROWS. It must not be caught here and folded into "no
 * match": a 429 that reads as an absence is how 466 rate-limit errors once
 * became confident-looking native-range guesses (trap 1). The caller decides
 * whether a failure ends the run or is recorded and skipped.
 */
export async function resolve(
  entry: number | string,
  opts: ResolveOptions = {}
): Promise<Resolved | null> {
  const {
    pages = 2,
    synonymProbes = 3,
    paceMs = 1600,
    log = console.log,
    search = searchSpeciesByName,
    fetchDetail = getSpeciesBySlug,
    sleep = defaultSleep,
  } = opts

  if (typeof entry === 'number') {
    return {
      id: entry,
      scientific_name: `id:${entry}`,
      matchedBy: 'id',
      topName: null,
      topId: null,
    }
  }

  let top: { scientific_name: string; id: number } | null = null
  const probeQueue: TrefleListItem[] = []

  for (let page = 1; page <= pages; page++) {
    const results = await search(entry, page)
    if (!results.length) break
    if (page === 1 && results[0]) {
      top = { scientific_name: results[0].scientific_name, id: results[0].id }
    }

    const exact = results.find((r) => sciMatches(entry, r.scientific_name))
    if (exact) {
      if (
        top &&
        normKey(top.scientific_name) !== normKey(exact.scientific_name)
      ) {
        log(`  top hit rejected: ${top.scientific_name} (#${top.id})`)
      }
      return {
        id: exact.id,
        scientific_name: exact.scientific_name,
        matchedBy: 'epithet',
        topName: top?.scientific_name ?? null,
        topId: top?.id ?? null,
      }
    }

    for (const r of results) probeQueue.push(r)
    if (results.length < 20) break // no more pages
  }

  // Rule 3. Only reached when no candidate's epithet matched, so this costs
  // nothing on the happy path.
  const probes = probeQueue.slice(0, Math.max(0, synonymProbes))
  for (const cand of probes) {
    await sleep(paceMs)
    const detail = await fetchDetail(cand.id)
    const via = synonymNameMatches(entry, detail.synonyms)
    if (via) {
      log(
        `  synonym match: ${entry} → ${detail.scientific_name} (#${detail.id}), Trefle lists "${via}"`
      )
      return {
        id: detail.id,
        scientific_name: detail.scientific_name ?? cand.scientific_name,
        matchedBy: 'synonym',
        viaSynonym: via,
        topName: top?.scientific_name ?? null,
        topId: top?.id ?? null,
      }
    }
  }

  if (top) log(`  top hit rejected: ${top.scientific_name} (#${top.id})`)
  return null
}

// ---------------------------------------------------------------------------
// The catalog side
// ---------------------------------------------------------------------------

export interface CatalogIndex {
  /** Trefle ids held. */
  ids: Set<number>
  /** Normalised `"genus epithet"` keys held. */
  names: Set<string>
  /** Raw lowercased scientific names, for callers that matched that way. */
  rawNames: Set<string>
  /**
   * Synonym-AWARE membership: true when the catalog holds this species under
   * any genus in its component. `seed-round11.ts:315-322` claimed this in a
   * comment and did a plain exact lookup, so a candidate held under the other
   * genus spent Trefle calls before being caught after resolution.
   *
   * Still cannot see a gender-variant epithet pair — same rule-2 limit as
   * `sciMatches`. Resolution catches those; this only saves the calls.
   */
  holds: (name: string) => boolean
}

/** Catalog identity, paginated via `catalog-identity.ts` (standing rule 5). */
export async function fetchCatalogIndex(): Promise<CatalogIndex> {
  const rows = await fetchCatalogIdentity()

  const ids = new Set<number>()
  const names = new Set<string>()
  const rawNames = new Set<string>()
  for (const row of rows) {
    if (row.source_species_id !== null) ids.add(row.source_species_id)
    if (row.scientific_name) {
      names.add(normKey(row.scientific_name))
      rawNames.add(row.scientific_name.toLowerCase())
    }
  }
  return { ids, names, rawNames, holds: (name) => holdsIn(names, name) }
}

/** The membership rule, separated so it is callable without a DB. */
export function holdsIn(names: Set<string>, name: string): boolean {
  const [genus, epithet] = normSci(name)
  if (!epithet) return false
  for (const g of genusSynonyms(genus)) {
    if (names.has(`${g} ${epithet}`)) return true
  }
  return false
}
