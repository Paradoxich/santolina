/**
 * Paginated fetch for full-table Supabase reads (data scripts and app code).
 *
 * A bare Supabase `.select()` silently caps at 1000 rows. plant_combinations
 * passed that in round 6, so any script that read the whole table in one call
 * was working off a truncated set — that's the bug that let curate-combinations
 * create duplicate pairs and blow the per-plant cap. Route every full-table
 * read through this instead.
 *
 * `buildQuery` must return a fresh query builder each call (so `.range()` can
 * be applied to a clean chain); include any `.select()`, `.not()`, `.eq()`,
 * and `.order()` you need inside it. An explicit order is required for stable
 * paging — callers should `.order('id')` (or another unique column).
 */

// The Supabase query builder is awaited to `{ data, error }`; typing it
// precisely across arbitrary filter chains isn't worth the noise here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AwaitableQuery = PromiseLike<{ data: any[] | null; error: any }>

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => AwaitableQuery
): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) throw new Error(`Paginated fetch failed: ${error.message}`)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < pageSize) return rows
  }
}
