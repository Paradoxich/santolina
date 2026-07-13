/**
 * DRY RUN — native_region regeneration preview. WRITES NOTHING TO THE DB.
 *
 * Decision context: Notion "Region Data Model — Decision." The current 117
 * native_region tags (mediterranean / balkans / croatia) are an unreliable
 * prompt artifact and will be discarded. This script previews what a clean
 * regeneration from Trefle's native distribution would produce for all 318
 * plants, at two candidate zoom levels, so Ana can choose A vs A'. It does not
 * pick, and it does not touch the database.
 *
 * Source of truth: Trefle `distributions.native[]` (TDWG WGSRPD Level 3 codes),
 * already establishment-filtered by Trefle — native only, introduced excluded.
 * GBIF is NOT used here (it is a continent-level gross-error check elsewhere).
 * Trefle floors at TDWG Level 3, where "Yugoslavia" (YUG) is the atomic unit
 * and Croatia is not exposed — so country-level tagging for the Balkans is off
 * the table; that is the whole reason A rolls up to Level 2.
 *
 *   Option A  — TDWG Level 2 region per native L3 unit (YUG -> Southeastern Europe).
 *   Option A' — country rollup: sub-country units -> their country, and the YUG
 *               container renamed "western Balkans"; a few irreducible
 *               multi-country WGSRPD units are kept as-is and flagged.
 *
 * Inputs (cached under reports/, regenerated if absent):
 *   - Plant list: pulled live from Supabase (id, source_species_id, native_to,
 *     native_region).
 *   - reports/trefle-native-cache.json  — sid -> { sci, native:[{code,name,level}] }
 *   - reports/wgsrpd-l3-map.json        — L3 code -> { l2cod, l2name, l1cod }
 *     derived from tdwg/wgsrpd level3.geojson (downloaded once if missing).
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/dry-run-native-region.ts
 *
 * Output: reports/native-region-dryrun.md (+ .json). No DB writes, ever.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getSpeciesBySlug } from '../lib/trefle'

const REPORTS_DIR = join(process.cwd(), 'reports')
const TREFLE_CACHE = join(REPORTS_DIR, 'trefle-native-cache.json')
const WGSRPD_MAP = join(REPORTS_DIR, 'wgsrpd-l3-map.json')
const GEOJSON = join(REPORTS_DIR, 'level3.geojson')
const MD_OUT = join(REPORTS_DIR, 'native-region-dryrun.md')
const JSON_OUT = join(REPORTS_DIR, 'native-region-dryrun.json')

// The user's location we score the "native to my region" filter for.
const USER_CITY = 'Rijeka, Croatia'

// ---------------------------------------------------------------------------
// WGSRPD Level 2 region names (canonical, stable — 52 regions).
// ---------------------------------------------------------------------------
const L2_NAMES: Record<number, string> = {
  10: 'Northern Europe',
  11: 'Middle Europe',
  12: 'Southwestern Europe',
  13: 'Southeastern Europe',
  14: 'Eastern Europe',
  20: 'Northern Africa',
  21: 'Macaronesia',
  22: 'West Tropical Africa',
  23: 'West-Central Tropical Africa',
  24: 'Northeast Tropical Africa',
  25: 'East Tropical Africa',
  26: 'South Tropical Africa',
  27: 'Southern Africa',
  28: 'Middle Atlantic Ocean',
  29: 'Western Indian Ocean',
  30: 'Siberia',
  31: 'Russian Far East',
  32: 'Middle Asia',
  33: 'Caucasus',
  34: 'Western Asia',
  35: 'Arabian Peninsula',
  36: 'China',
  37: 'Mongolia',
  38: 'Eastern Asia',
  40: 'Indian Subcontinent',
  41: 'Indo-China',
  42: 'Malesia',
  43: 'Papuasia',
  50: 'Australia',
  51: 'New Zealand',
  60: 'Southwestern Pacific',
  61: 'South-Central Pacific',
  62: 'Northwestern Pacific',
  63: 'North-Central Pacific',
  70: 'Subarctic America',
  71: 'Western Canada',
  72: 'Eastern Canada',
  73: 'Northwestern U.S.A.',
  74: 'North-Central U.S.A.',
  75: 'Northeastern U.S.A.',
  76: 'Southwestern U.S.A.',
  77: 'South-Central U.S.A.',
  78: 'Southeastern U.S.A.',
  79: 'Mexico',
  80: 'Central America',
  81: 'Caribbean',
  82: 'Northern South America',
  83: 'Western South America',
  84: 'Brazil',
  85: 'Southern South America',
  90: 'Subantarctic Islands',
  91: 'Antarctic Continent',
}

// The Level-2 region a Rijeka user maps to under Option A.
const USER_L2_REGION = 'Southeastern Europe' // WGSRPD 13, contains YUG
// The Option A' label a Rijeka user maps to (Croatia lives in the YUG container).
const USER_APRIME_REGION = 'western Balkans'

// ---------------------------------------------------------------------------
// Option A' — country rollup helpers.
// Sub-country units fold to their country; the YUG container becomes
// "western Balkans"; a handful of genuinely multi-country WGSRPD units cannot
// fold to one country and are kept verbatim (flagged in the report).
// ---------------------------------------------------------------------------
const APRIME_OVERRIDE: Record<string, string> = {
  YUG: 'western Balkans',
  // sub-country -> country
  SIC: 'Italy',
  SAR: 'Italy',
  COR: 'France',
  BAL: 'Spain',
  KRI: 'Greece',
  EAI: 'Greece',
  AZO: 'Portugal',
  MDR: 'Portugal',
  SEL: 'Portugal',
  CNY: 'Spain',
  FOR: 'Denmark',
  SVA: 'Norway',
  KRY: 'Ukraine',
  NCS: 'Russia',
  TUE: 'Turkey',
  SIN: 'Egypt',
  // European Russia oblasts -> Russia
  RUC: 'Russia',
  RUE: 'Russia',
  RUN: 'Russia',
  RUS: 'Russia',
  RUW: 'Russia',
}
// Multi-country units that cannot be reduced to a single country under A'.
const APRIME_IRREDUCIBLE: Record<string, string> = {
  TCS: 'Caucasus',
  LBS: 'Lebanon and Syria',
  BLT: 'Baltic states',
  GST: 'Gulf states',
  YUG: 'western Balkans',
}

interface L3Info {
  l2cod: number
  l2name: string
  l1cod: number
  l3name: string
}

function aprimeLabel(code: string, info: L3Info): string {
  if (APRIME_OVERRIDE[code]) return APRIME_OVERRIDE[code]!
  if (APRIME_IRREDUCIBLE[code]) return APRIME_IRREDUCIBLE[code]!
  const l2 = info.l2cod
  // bulk country rollups by L2 region
  if ([73, 74, 75, 76, 77, 78].includes(l2)) return 'United States'
  if (l2 === 79) return 'Mexico'
  if (l2 === 71 || l2 === 72) return 'Canada'
  if (l2 === 30 || l2 === 31) return 'Russia'
  if (l2 === 36) return 'China'
  if (l2 === 50) return 'Australia'
  if (l2 === 84) return 'Brazil'
  if (l2 === 70) {
    // Subarctic America is politically mixed — resolve per unit.
    const map: Record<string, string> = {
      ASK: 'United States',
      ALU: 'United States',
      GNL: 'Greenland',
      YUK: 'Canada',
      NWT: 'Canada',
      NUN: 'Canada',
      LAB: 'Canada',
    }
    return map[code] ?? info.l3name
  }
  // Argentina sub-regions
  if (['AGE', 'AGW', 'AGS', 'AGC'].includes(code)) return 'Argentina'
  // everything else: the L3 unit is already a country (Albania, Greece, Iran…)
  return info.l3name
}

// ---------------------------------------------------------------------------
// Load / build the WGSRPD L3 -> L2 map from the authoritative tdwg geojson.
// ---------------------------------------------------------------------------
async function loadWgsrpdMap(): Promise<Record<string, L3Info>> {
  if (existsSync(WGSRPD_MAP)) {
    return JSON.parse(readFileSync(WGSRPD_MAP, 'utf8'))
  }
  let geojsonText: string
  if (existsSync(GEOJSON)) {
    geojsonText = readFileSync(GEOJSON, 'utf8')
  } else {
    console.log('Downloading tdwg/wgsrpd level3.geojson (once)…')
    const res = await fetch(
      'https://raw.githubusercontent.com/tdwg/wgsrpd/master/geojson/level3.geojson'
    )
    if (!res.ok) throw new Error(`geojson download failed: ${res.status}`)
    geojsonText = await res.text()
    writeFileSync(GEOJSON, geojsonText)
  }
  const gj = JSON.parse(geojsonText)
  const map: Record<string, L3Info> = {}
  for (const f of gj.features) {
    const p = f.properties
    const l2cod = p.LEVEL2_COD as number
    map[p.LEVEL3_COD] = {
      l2cod,
      l2name: L2_NAMES[l2cod] ?? `?L2-${l2cod}`,
      l1cod: p.LEVEL1_COD as number,
      l3name: p.LEVEL3_NAM as string,
    }
  }
  writeFileSync(WGSRPD_MAP, JSON.stringify(map))
  return map
}

// ---------------------------------------------------------------------------
// Trefle native codes, cached by source_species_id.
// ---------------------------------------------------------------------------
interface NativeZone {
  name: string
  code: string
  level: number
}
type TrefleCache = Record<
  string,
  { sci?: string; native?: NativeZone[]; error?: unknown }
>

async function loadTrefleNative(sids: number[]): Promise<TrefleCache> {
  const cache: TrefleCache = existsSync(TREFLE_CACHE)
    ? JSON.parse(readFileSync(TREFLE_CACHE, 'utf8'))
    : {}
  const missing = sids.filter(
    (s) => !cache[String(s)] || cache[String(s)]!.error
  )
  if (missing.length) {
    console.log(
      `Fetching Trefle native distribution for ${missing.length} species…`
    )
    for (let i = 0; i < missing.length; i++) {
      const sid = missing[i]!
      try {
        const detail = (await getSpeciesBySlug(sid)) as unknown as {
          scientific_name?: string
          distributions?: { native?: NativeZone[] | null } | null
        }
        const native = (detail.distributions?.native ?? []).map((z) => ({
          name: z.name,
          code: z.code,
          level: z.level,
        }))
        cache[String(sid)] = { sci: detail.scientific_name, native }
      } catch (e) {
        cache[String(sid)] = { error: String(e) }
      }
      if ((i + 1) % 20 === 0) {
        writeFileSync(TREFLE_CACHE, JSON.stringify(cache))
        console.log(`  ${i + 1}/${missing.length}`)
      }
      await new Promise((r) => setTimeout(r, 120))
    }
    writeFileSync(TREFLE_CACHE, JSON.stringify(cache))
  }
  return cache
}

// ---------------------------------------------------------------------------
// Types + helpers
// ---------------------------------------------------------------------------
interface PlantRow {
  id: string
  source_species_id: number | null
  common_name: string
  scientific_name: string | null
  native_to: string | null
  native_region: string[] | null
}

interface PlantResult {
  common_name: string
  scientific_name: string | null
  source_species_id: number | null
  native_to: string | null
  old_tags: string[]
  status: 'ok' | 'unresolved-no-trefle-id' | 'trefle-empty-native'
  native_codes: string[]
  a_tags: string[]
  aprime_tags: string[]
}

const uniqSorted = (xs: string[]) => [...new Set(xs)].sort()

// Garden hybrids / cultigens with no wild native range: empty is CORRECT.
const NO_WILD_RANGE = /×|hybrid|cultivar|'/i // × sign, "hybrid", cultivar quotes

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('plants')
    .select(
      'id, source_species_id, common_name, scientific_name, native_to, native_region'
    )
    .order('common_name')
  if (error) throw error
  const plants = (data ?? []) as PlantRow[]

  const wgsrpd = await loadWgsrpdMap()
  const sids = plants
    .map((p) => p.source_species_id)
    .filter((s): s is number => s != null)
  const trefle = await loadTrefleNative(sids)

  const unknownCodes = new Set<string>()
  const results: PlantResult[] = plants.map((p) => {
    const old_tags = p.native_region ?? []
    if (p.source_species_id == null) {
      return {
        common_name: p.common_name,
        scientific_name: p.scientific_name,
        source_species_id: null,
        native_to: p.native_to,
        old_tags,
        status: 'unresolved-no-trefle-id',
        native_codes: [],
        a_tags: [],
        aprime_tags: [],
      }
    }
    const entry = trefle[String(p.source_species_id)]
    const native = entry?.native ?? []
    const codes = native.map((z) => z.code)
    const aSet: string[] = []
    const apSet: string[] = []
    for (const z of native) {
      const info = wgsrpd[z.code]
      if (!info) {
        unknownCodes.add(z.code)
        continue
      }
      aSet.push(info.l2name)
      apSet.push(aprimeLabel(z.code, info))
    }
    return {
      common_name: p.common_name,
      scientific_name: p.scientific_name,
      source_species_id: p.source_species_id,
      native_to: p.native_to,
      old_tags,
      status: codes.length === 0 ? 'trefle-empty-native' : 'ok',
      native_codes: codes,
      a_tags: uniqSorted(aSet),
      aprime_tags: uniqSorted(apSet),
    }
  })

  // ---- Aggregate numbers -------------------------------------------------
  const total = results.length
  const unresolved = results.filter(
    (r) => r.status === 'unresolved-no-trefle-id'
  )
  const emptyNative = results.filter((r) => r.status === 'trefle-empty-native')
  const emptyButHybrid = emptyNative
    .filter((r) => NO_WILD_RANGE.test(r.scientific_name ?? ''))
    .concat(
      unresolved.filter((r) => NO_WILD_RANGE.test(r.scientific_name ?? ''))
    )
  const emptyDataGap = [...unresolved, ...emptyNative].filter(
    (r) => !NO_WILD_RANGE.test(r.scientific_name ?? '')
  )

  // Deciding number: Rijeka user, how many plants the filter returns.
  const aReturns = results.filter((r) => r.a_tags.includes(USER_L2_REGION))
  const apReturns = results.filter((r) =>
    r.aprime_tags.includes(USER_APRIME_REGION)
  )

  // Tag-set distribution — per-region plant counts.
  const aRegionCount: Record<string, number> = {}
  const apRegionCount: Record<string, number> = {}
  for (const r of results) {
    for (const t of r.a_tags) aRegionCount[t] = (aRegionCount[t] ?? 0) + 1
    for (const t of r.aprime_tags)
      apRegionCount[t] = (apRegionCount[t] ?? 0) + 1
  }

  // Identical tag-set collapse — how many DISTINCT tag sets, and the top ones.
  const aSetKey = (r: PlantResult) => r.a_tags.join(' + ') || '(none)'
  const apSetKey = (r: PlantResult) => r.aprime_tags.join(' + ') || '(none)'
  const aSetGroups: Record<string, number> = {}
  const apSetGroups: Record<string, number> = {}
  for (const r of results) {
    aSetGroups[aSetKey(r)] = (aSetGroups[aSetKey(r)] ?? 0) + 1
    apSetGroups[apSetKey(r)] = (apSetGroups[apSetKey(r)] ?? 0) + 1
  }

  const tagCountHist: Record<number, number> = {}
  for (const r of results) {
    const n = r.a_tags.length
    tagCountHist[n] = (tagCountHist[n] ?? 0) + 1
  }

  // ---- Emit --------------------------------------------------------------
  const sortDesc = (obj: Record<string, number>) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1])

  const L: string[] = []
  L.push('# native_region regeneration — DRY RUN (no DB writes)')
  L.push('')
  L.push(
    `Plants: **${total}**. Source: Trefle \`distributions.native[]\` (TDWG L3, native-only).`
  )
  L.push(
    `User location scored: **${USER_CITY}** → Option A region **${USER_L2_REGION}**, Option A' label **${USER_APRIME_REGION}**.`
  )
  L.push('')
  L.push('## Resolution status')
  L.push(
    `- Resolved with tags: **${results.filter((r) => r.status === 'ok').length}**`
  )
  L.push(
    `- Unresolved (no Trefle ID — reported, not guessed): **${unresolved.length}** — ${unresolved.map((r) => r.scientific_name).join(', ')}`
  )
  L.push(
    `- Trefle ID present but native list EMPTY: **${emptyNative.length}** — ${emptyNative.map((r) => r.scientific_name).join(', ')}`
  )
  L.push(
    `- Of all empty results, correctly-empty (garden hybrid / no wild range): **${emptyButHybrid.length}** — ${emptyButHybrid.map((r) => r.scientific_name).join(', ') || '(none)'}`
  )
  L.push(
    `- Of all empty results, DATA GAP (real plant, would fall out of every region filter): **${emptyDataGap.length}** — ${emptyDataGap.map((r) => r.scientific_name).join(', ')}`
  )
  L.push('')
  L.push('## THE DECIDING NUMBER — filter yield for a Rijeka user')
  L.push(
    `- **Option A** (Level 2 → "${USER_L2_REGION}"): **${aReturns.length} / ${total}** plants returned (${((aReturns.length / total) * 100).toFixed(0)}%).`
  )
  L.push(
    `- **Option A'** (country → "${USER_APRIME_REGION}"): **${apReturns.length} / ${total}** plants returned (${((apReturns.length / total) * 100).toFixed(0)}%).`
  )
  L.push('')
  L.push('## Tag-set shape (is this a real filter or a pass-through?)')
  L.push(
    `- Distinct Option A tag sets across ${total} plants: **${Object.keys(aSetGroups).length}**`
  )
  L.push(
    `- Distinct Option A' tag sets: **${Object.keys(apSetGroups).length}**`
  )
  L.push(
    `- Option A tags-per-plant histogram (n tags → plants): ${Object.entries(
      tagCountHist
    )
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => `${k}:${v}`)
      .join(', ')}`
  )
  L.push('')
  L.push('### Most common Option A tag sets')
  L.push('| plants | tag set |')
  L.push('|---:|---|')
  for (const [k, v] of sortDesc(aSetGroups).slice(0, 12))
    L.push(`| ${v} | ${k} |`)
  L.push('')
  L.push("### Most common Option A' tag sets")
  L.push('| plants | tag set |')
  L.push('|---:|---|')
  for (const [k, v] of sortDesc(apSetGroups).slice(0, 12))
    L.push(`| ${v} | ${k} |`)
  L.push('')
  L.push('## Option A — plants per Level-2 region')
  L.push('| plants | region |')
  L.push('|---:|---|')
  for (const [k, v] of sortDesc(aRegionCount)) L.push(`| ${v} | ${k} |`)
  L.push('')
  L.push("## Option A' — plants per country/label (top 30)")
  L.push('| plants | label |')
  L.push('|---:|---|')
  for (const [k, v] of sortDesc(apRegionCount).slice(0, 30))
    L.push(`| ${v} | ${k} |`)
  L.push('')
  L.push('## Uncovered L3 units (gaps in the mapping)')
  L.push(
    unknownCodes.size === 0
      ? '- **None.** Every native L3 code in the catalog maps to a WGSRPD Level 2 region.'
      : `- ${[...unknownCodes].sort().join(', ')}`
  )
  L.push('')
  L.push(
    "## A' irreducible multi-country units (kept, not folded to one country)"
  )
  L.push(
    `- ${Object.entries(APRIME_IRREDUCIBLE)
      .map(([c, l]) => `${c} → "${l}"`)
      .join(', ')}`
  )
  L.push('')
  L.push(
    "## Sample: every plant, old tags → A → A' (first 40, full set in JSON)"
  )
  L.push("| plant | native_to | old | Option A | Option A' |")
  L.push('|---|---|---|---|---|')
  for (const r of results.slice(0, 40)) {
    L.push(
      `| ${r.common_name} | ${r.native_to ?? ''} | ${r.old_tags.join(',') || '—'} | ${r.a_tags.join(', ') || '—'} | ${r.aprime_tags.join(', ') || '—'} |`
    )
  }

  writeFileSync(MD_OUT, L.join('\n'))
  writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        total,
        deciding: {
          user: USER_CITY,
          a_region: USER_L2_REGION,
          a_returns: aReturns.length,
          aprime_region: USER_APRIME_REGION,
          aprime_returns: apReturns.length,
        },
        distinct_a_sets: Object.keys(aSetGroups).length,
        distinct_aprime_sets: Object.keys(apSetGroups).length,
        a_region_count: aRegionCount,
        aprime_region_count: apRegionCount,
        a_set_groups: aSetGroups,
        unresolved: unresolved.map((r) => r.scientific_name),
        empty_native: emptyNative.map((r) => r.scientific_name),
        empty_data_gap: emptyDataGap.map((r) => r.scientific_name),
        unknown_codes: [...unknownCodes],
        results,
      },
      null,
      2
    )
  )

  // Console summary
  console.log('\n=== DRY RUN COMPLETE (no DB writes) ===')
  console.log(`plants: ${total}`)
  console.log(
    `resolved: ${results.filter((r) => r.status === 'ok').length} | unresolved(no id): ${unresolved.length} | trefle-empty: ${emptyNative.length}`
  )
  console.log(
    `empty = data gap: ${emptyDataGap.length} | correctly-empty(hybrid): ${emptyButHybrid.length}`
  )
  console.log(
    `DECIDING — Rijeka user: A "${USER_L2_REGION}" -> ${aReturns.length}/${total} | A' "${USER_APRIME_REGION}" -> ${apReturns.length}/${total}`
  )
  console.log(
    `distinct tag sets: A=${Object.keys(aSetGroups).length}, A'=${Object.keys(apSetGroups).length}`
  )
  console.log(`uncovered L3 codes: ${unknownCodes.size}`)
  console.log(`report -> ${MD_OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
