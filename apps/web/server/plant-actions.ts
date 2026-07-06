'use server'

import { fetchAndMapSpecies, searchSpeciesByName } from '@/lib/trefle'
import {
  upsertPlant,
  findPlantBySourceId,
  findPlantByName,
  type DbPlant,
} from '@/lib/plants-db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LookupQuery =
  | { sourceId: number; name?: never }
  | { name: string; sourceId?: never }

type LookupResult =
  | { plant: DbPlant; source: 'cache' | 'trefle' }
  | { plant: null; error: string }

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

/**
 * Look up a plant by Trefle species ID or common name.
 *
 * 1. Check the local plants table first (fast, free).
 * 2. On a miss, fetch from Trefle, upsert into the table, and return it.
 *
 * Returns { plant, source } on success or { plant: null, error } on failure.
 */
export async function lookupPlant(query: LookupQuery): Promise<LookupResult> {
  try {
    // ── 1. Cache check ────────────────────────────────────────────────────
    const cached =
      query.sourceId != null
        ? await findPlantBySourceId(query.sourceId)
        : await findPlantByName(query.name)

    if (cached) return { plant: cached, source: 'cache' }

    // ── 2. Resolve Trefle ID from name if needed ──────────────────────────
    let sourceId: number

    if (query.sourceId != null) {
      sourceId = query.sourceId
    } else {
      const results = await searchSpeciesByName(query.name)
      if (!results.length) {
        return {
          plant: null,
          error: `No Trefle results found for "${query.name}"`,
        }
      }
      const match = results[0]
      if (!match) {
        return {
          plant: null,
          error: `No Trefle results found for "${query.name}"`,
        }
      }
      sourceId = match.id
    }

    // ── 3. Fetch detail + upsert ──────────────────────────────────────────
    const mapped = await fetchAndMapSpecies(sourceId)
    const plant = await upsertPlant(mapped)

    return { plant, source: 'trefle' }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { plant: null, error }
  }
}
