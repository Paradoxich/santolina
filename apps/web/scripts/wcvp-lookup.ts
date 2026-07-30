/**
 * The GBIF/WCVP species lookup and its committed cache — one home for both.
 *
 * TWO GUARDS ASK THE SAME EXTERNAL QUESTION. `cross-check-native-region`
 * validates the structured `native_region` tags; `cross-check-native-to` guards
 * the user-facing `native_to` prose. Both need the same fact — what does Kew's
 * checklist say this species is native to? — and until 2026-07-30 each had its
 * own answer:
 *
 *   · native-region: `strict=true`, species-rank guard, paginated, cached to
 *     the committed `reference/` file.
 *   · native-to:     no `strict`, no rank guard, no cache, and it read ANY row
 *     GBIF returned rather than only WCVP's.
 *
 * So every round paid GBIF twice per species, and the half that ALSO bills
 * Claude was the half running with none of the guards. Both of the traps it was
 * exposed to are already on the record in `docs/database-log.md`:
 *
 *   trap 11 — `species/match` fails UPWARD into a genus rather than failing.
 *     `Pennisetum alopecuroides` comes back as the genus `Cenchrus`, and
 *     accepting it fetches a whole genus's distribution: one grass read as
 *     native to 41 regions including Brazil and New Zealand.
 *   trap 15 — the distributions payload aggregates MANY checklists, so a raw
 *     `NATIVE` marker is not a WCVP marker. `Rudbeckia fulgida` carries
 *     "Texas — NATIVE" from the World Register of Marine Species. Filtering on
 *     `source === WCVP_SOURCE` is the whole difference between an authority and
 *     a pile of lists that happen to agree with each other.
 *
 * One lookup, guarded once, cached once. This is the one-home-per-fact rule
 * applied to an external authority rather than to our own data — and the reason
 * it is a module rather than one script importing from the other is that
 * neither guard should own the other's evidence.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

/**
 * The one source string that makes a distribution row an authority.
 *
 * GBIF returns rows from every checklist it aggregates. Anything not stamped
 * with this is a different dataset answering a different question — see trap 15.
 */
export const WCVP_SOURCE = 'The World Checklist of Vascular Plants (WCVP)'

/**
 * The GBIF lookup cache is COMMITTED, gzipped, and is not a report.
 *
 * It used to live in gitignored `reports/`, which made it a 14MB file on one
 * laptop that `git worktree remove` deletes without asking — the same shape as
 * the July 28 trap where a backup died with its throwaway worktree. Losing it
 * is not a small thing: it is ~500 species of rate-limited GBIF lookups at
 * GBIF_DELAY_MS apiece, and re-earning it is exactly the kind of long
 * rate-limited fetch loop that produced trap 1 in the first place.
 *
 * It is also not per-round provenance, so `rounds/<n>/` is the wrong home: it
 * is reference data every later round reads and appends to. Gzipped because
 * 14MB of pretty-printed JSON is 1MB compressed, the same trade the catalog
 * archives already make.
 */
const CACHE_PATH = join(process.cwd(), 'reference', 'wcvp-native-cache.json.gz')

/** Be polite to the free GBIF API between lookups that actually hit it. */
export const GBIF_DELAY_MS = 400

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface DistRow {
  locality: string | null
  source: string | null
  establishmentMeans: string | null
}

export interface CachedSpecies {
  lookupKey: number | null
  matchType: string | null
  rows: DistRow[]
}

async function gbifJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'santolina-catalog-check/1.0' },
      })
      if (res.status === 429 || res.status >= 500)
        throw new Error(`HTTP ${res.status}`)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return (await res.json()) as T
    } catch (err) {
      // Retry transient failures, then give up loudly. A species that cannot be
      // fetched must surface as no-data, never as an empty native range.
      if (attempt >= 4) throw err
      await sleep(1000 * (attempt + 1))
    }
  }
}

const SPECIES_RANKS = new Set(['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM'])

/** Uncached lookup. Prefer `lookupSpecies` — this is what it calls on a miss. */
export async function fetchSpecies(
  scientificName: string
): Promise<CachedSpecies> {
  const match = await gbifJson<{
    usageKey?: number
    acceptedUsageKey?: number
    matchType?: string
    rank?: string
    canonicalName?: string
  }>(
    `https://api.gbif.org/v1/species/match?strict=true&name=${encodeURIComponent(scientificName)}`
  )

  // GBIF answers an unknown binomial by walking UP the taxonomy rather than
  // failing: "Pennisetum alopecuroides" comes back as the genus Cenchrus with
  // matchType HIGHERRANK. Accepting that fetches the distribution of an entire
  // genus and reads as a species native to forty regions. Same trap the seed
  // scripts already guard (docs/architecture.md#round-runbook: never the top name-search hit) — so only an
  // EXACT match at species rank, on the name we actually asked for, counts.
  // GBIF drops the hybrid marker from canonicalName ("Mentha × piperita" comes
  // back as "Mentha piperita"), so compare with it normalised away rather than
  // rejecting every hybrid in the catalog as unmatched.
  const normalise = (name: string) =>
    name
      .toLowerCase()
      .replace(/\s*[×x]\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const exact =
    match.matchType === 'EXACT' &&
    SPECIES_RANKS.has(match.rank ?? '') &&
    normalise(match.canonicalName ?? '') === normalise(scientificName)
  if (!exact)
    return {
      lookupKey: null,
      matchType: `${match.matchType ?? 'NONE'} → ${match.canonicalName ?? '?'} (${match.rank ?? '?'})`,
      rows: [],
    }

  // A synonym's distribution hangs off the accepted taxon, not the synonym.
  const key = match.acceptedUsageKey ?? match.usageKey ?? null
  if (!key)
    return { lookupKey: null, matchType: match.matchType ?? null, rows: [] }

  const rows: DistRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const page = await gbifJson<{ results: DistRow[]; endOfRecords: boolean }>(
      `https://api.gbif.org/v1/species/${key}/distributions?limit=1000&offset=${offset}`
    )
    rows.push(...page.results)
    if (page.endOfRecords) break
  }
  return { lookupKey: key, matchType: match.matchType ?? null, rows }
}

export function loadCache(): Record<string, CachedSpecies> {
  if (!existsSync(CACHE_PATH)) return {}
  const json = gunzipSync(readFileSync(CACHE_PATH)).toString('utf8')
  return JSON.parse(json) as Record<string, CachedSpecies>
}

/**
 * Written after every fetch rather than once at the end, which is the existing
 * behaviour and worth keeping: an interrupted run costs nothing, and the whole
 * value of the file is that a lookup is paid for once. Gzipping ~14MB on each
 * write is cheap next to the GBIF_DELAY_MS pause that follows it anyway.
 */
export function saveCache(cache: Record<string, CachedSpecies>): void {
  mkdirSync(dirname(CACHE_PATH), { recursive: true })
  writeFileSync(CACHE_PATH, gzipSync(JSON.stringify(cache, null, 2)))
}

/**
 * Cache-aware lookup: the call every guard should make.
 *
 * Mutates and persists `cache` on a miss, and only paces when it actually hit
 * the network — a cache hit costs nothing and should not pretend to. Two guards
 * over the same round therefore pay GBIF once between them, which was the point
 * of putting them on the same cache.
 */
export async function lookupSpecies(
  scientificName: string,
  cache: Record<string, CachedSpecies>,
  delayMs = GBIF_DELAY_MS
): Promise<CachedSpecies> {
  const hit = cache[scientificName]
  if (hit) return hit
  const species = await fetchSpecies(scientificName)
  cache[scientificName] = species
  saveCache(cache)
  await sleep(delayMs)
  return species
}

/** WCVP's rows only. See trap 15 — never read the payload unfiltered. */
export function wcvpRows(species: CachedSpecies): DistRow[] {
  return species.rows.filter((r) => r.source === WCVP_SOURCE)
}

/**
 * WCVP's native and introduced-only localities, as the Level 3 names WCVP
 * itself uses. Callers that need Level 2 roll these up themselves.
 *
 * Anything not explicitly INTRODUCED counts as native, which is WCVP's own
 * convention — it marks the exception, not the rule.
 */
export function wcvpNativeLocalities(species: CachedSpecies): {
  native: string[]
  introducedOnly: string[]
} {
  const native = new Set<string>()
  const introduced = new Set<string>()
  for (const row of wcvpRows(species)) {
    const locality = (row.locality ?? '').trim()
    if (!locality) continue
    if (row.establishmentMeans === 'INTRODUCED') introduced.add(locality)
    else native.add(locality)
  }
  return {
    native: [...native].sort(),
    introducedOnly: [...introduced].filter((l) => !native.has(l)).sort(),
  }
}

/**
 * Why a species yielded no WCVP evidence — the distinction trap 1 exists for.
 *
 * "GBIF has the taxon but Kew carries no distribution for it" and "we never
 * matched the name" are different facts, and neither is "this plant is native
 * nowhere". Returns null when there IS evidence.
 */
export function noEvidenceReason(species: CachedSpecies): string | null {
  if (wcvpRows(species).length) return null
  return species.lookupKey
    ? 'GBIF has the taxon but carries no WCVP distribution for it'
    : `no exact species-rank GBIF match (${species.matchType ?? 'none'})`
}
