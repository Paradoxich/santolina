/**
 * The seed-time dedupe read, in one place.
 *
 * WHY THIS EXISTS. Every seeder needs the same thing before it starts: the
 * Trefle ids and scientific names already in the catalog, so it can skip
 * species it holds. Four scripts had grown their own copy of that read —
 * `seed-plants`, `seed-round6`, `seed-round7`, `seed-regional-natives` — and
 * all four were the identical bare `.select()`, which silently caps at 1000
 * rows (standing rule 5).
 *
 * A short dedupe set does not error. It makes the seeder believe the catalog is
 * smaller than it is and re-seed species already present. At 595 plants that is
 * roughly four rounds away, and it would arrive by copy-paste: a new
 * `seed-round9.ts` starts life as a copy of `seed-round7.ts`.
 *
 * So the read lives here, paginated once. Callers keep their own name
 * normalisation — the round scripts match on `genus species` while
 * `seed-plants` lowercases the whole string — because that part is a real
 * per-script decision, unlike the read.
 */

import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'

export interface CatalogIdentityRow {
  source_species_id: number | null
  scientific_name: string | null
}

/** Every row's Trefle id + scientific name, paginated. */
export async function fetchCatalogIdentity(): Promise<CatalogIdentityRow[]> {
  const db = getSupabaseAdmin()
  return fetchAllRows<CatalogIdentityRow>((from, to) =>
    db
      .from('plants')
      .select('source_species_id, scientific_name')
      .order('id')
      .range(from, to)
  )
}
