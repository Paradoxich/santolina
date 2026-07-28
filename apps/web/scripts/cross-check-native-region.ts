/**
 * native_region cross-check — validates the WGSRPD Level 2 tags against an
 * external authority instead of against the source that produced them.
 *
 * §26 generates native_region from Trefle's distribution list. Nothing checked
 * it afterwards, and Trefle turns out to be wrong in a specific, invisible way:
 * it does not reliably separate NATIVE range from INTRODUCED range. Imperata
 * cylindrica was tagged China / Eastern Asia / Indo-China, which is precisely
 * the range it was introduced into — its native range is Africa, the
 * Mediterranean and West Asia. A user filtering "native to my region" got the
 * exact opposite answer, and no guard could see it.
 *
 * The authority here is WCVP (Kew's World Checklist of Vascular Plants), read
 * through GBIF's species/{key}/distributions endpoint. WCVP is the right source
 * for three reasons: it is the dataset POWO itself publishes, it records one
 * row per WGSRPD Level 3 region — the same geography our field rolls up from —
 * and it marks introduced occurrences explicitly. So the comparison is
 * like-for-like rather than a prose-to-tags guess.
 *
 * NO AI. Unlike the other cross-checks this one is pure data: an authority
 * with the same vocabulary needs reconciling, not judging.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-region.ts --round 8
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-region.ts --ids <uuid,uuid>
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-region.ts --all --limit 3
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-region.ts --ids <uuid> --apply
 *
 * Report-only by default (writes reports/native-region-crosscheck.{json,md}).
 * `--apply` writes only rows where WCVP disagrees, and is guarded the same way
 * as apply-sun-widening.ts: each write asserts the value it expects to find, so
 * a row that changed since the report is skipped rather than clobbered. Never
 * flips is_curated — this is a mechanical correction, not an editorial pass.
 *
 * TWO DISTINCTIONS THIS SCRIPT REFUSES TO BLUR (see §26's rate-limit trap):
 *
 *   · "no WCVP rows at all" is NOT "no native range". The first means we
 *     learned nothing and the row is skipped; the second is a real finding
 *     about a cultigen. Collapsing them would let an API outage silently empty
 *     the catalog's native tags — a failed fetch must never look like a
 *     negative result.
 *   · a region name we cannot map to Level 2 is an ERROR, not an omission.
 *     Silently dropping unmapped names would quietly shrink a species' range
 *     and read as a confident answer.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { MANUAL_OVERRIDES } from '../lib/native-region-overrides'
import { fetchAllRows } from '../lib/paginate'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { requireScope, scopeIds, describeScope } from './scope'

const REPORTS_DIR = join(process.cwd(), 'reports')
const WGSRPD_GEOJSON = join(REPORTS_DIR, 'level3.geojson')
const CACHE_PATH = join(REPORTS_DIR, 'wcvp-native-cache.json')
const JSON_OUT = join(REPORTS_DIR, 'native-region-crosscheck.json')
const MD_OUT = join(REPORTS_DIR, 'native-region-crosscheck.md')

const GBIF_DELAY_MS = 400
const WCVP_SOURCE = 'The World Checklist of Vascular Plants (WCVP)'

// Same table as regenerate-native-region.ts — the 52 WGSRPD Level 2 regions.
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

// WCVP has modernised some country names since the WGSRPD geojson was cut
// (Türkiye, Eswatini, DR Congo). These are naming drift, not new regions —
// each maps onto the same Level 3 unit. Anything NOT listed here and not in the
// geojson is a hard error, so a genuinely new code can never slip through as a
// silent omission.
const WCVP_NAME_ALIASES: Record<string, string> = {
  'Czechia-Slovakia': 'Czechoslovakia',
  'NW. Balkan Pen.': 'Yugoslavia',
  Türkiye: 'Turkey',
  'Türkiye-in-Europe': 'Turkey-in-Europe',
  Kirgizstan: 'Kirgizistan',
  Yakutiya: 'Yakutskiya',
  Panamá: 'Panama',
  Gambia: 'Gambia, The',
  'Leeward Is.': 'Leeward Is. AB Ant',
  Eswatini: 'Swaziland',
  Suriname: 'Surinam',
  'Cocos (Keeling) Is.': 'Cocos (Keeling) I.',
  'DR Congo': 'Zaïre',
  'Sudan-South Sudan': 'Sudan',
  'Central American Pacific Is.': 'C. American Pacific Is.',
}

// WCVP's establishment marker is occasionally missing on a single Level 3 row,
// which promotes an introduced occurrence into a whole native Level 2 region.
// Galium verum is the worked example: its only Australian row is Tasmania, it
// carries no marker, and GBIF's GRIIS-Australia dataset lists the species as
// INTRODUCED there outright. Rather than teach the script to arbitrate between
// datasets, the contradiction is recorded here with its evidence — the same
// pattern as regenerate-native-region.ts's manual override table.
const MANUAL_EXCLUSIONS: Record<string, { drop: string[]; why: string }> = {
  'Galium verum': {
    drop: ['Australia'],
    why: 'only backing row is Tasmania with no establishment marker; GBIF GRIIS-Australia lists the species as INTRODUCED',
  },
}

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  native_region: string[] | null
}

interface DistRow {
  locality: string | null
  source: string | null
  establishmentMeans: string | null
}

interface CachedSpecies {
  lookupKey: number | null
  matchType: string | null
  rows: DistRow[]
}

interface Finding {
  id: string
  common_name: string
  scientific_name: string
  stored: string[]
  wcvp_native: string[]
  wcvp_introduced_only: string[]
  native_l3_count: number
  missing: string[]
  extra: string[]
  extra_are_introduced: string[]
  /** Native regions resting on a single Level 3 row — the shape a missing
   *  establishment marker takes. Reported so a reviewer can sanity-check the
   *  edges of a range instead of trusting the rollup blindly. */
  thin_evidence: string[]
  excluded?: { regions: string[]; why: string }
  verdict: 'match' | 'disagrees' | 'no-native-range' | 'no-data' | 'reviewed'
  note?: string
}

function parseArgs() {
  const args = process.argv.slice(2)
  const at = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const limitRaw = at('--limit')
  // --round / --ids / --all are parsed by scripts/scope.ts, not here.
  return {
    apply: args.includes('--apply'),
    allowEmpty: args.includes('--allow-empty'),
    limit: limitRaw ? Number(limitRaw) : undefined,
  }
}

// ---------------------------------------------------------------------------
// WGSRPD Level 3 name -> Level 2 region
// ---------------------------------------------------------------------------

function loadL3NameMap(): Map<string, number> {
  if (!existsSync(WGSRPD_GEOJSON))
    throw new Error(
      `Missing ${WGSRPD_GEOJSON}. regenerate-native-region.ts downloads it; ` +
        `run that first (reports/ is gitignored, so a fresh worktree has none).`
    )
  const geo = JSON.parse(readFileSync(WGSRPD_GEOJSON, 'utf8')) as {
    features: { properties: { LEVEL3_NAM: string; LEVEL2_COD: number } }[]
  }
  const map = new Map<string, number>()
  for (const f of geo.features)
    map.set(f.properties.LEVEL3_NAM, f.properties.LEVEL2_COD)
  return map
}

// ---------------------------------------------------------------------------
// GBIF
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

async function fetchSpecies(scientificName: string): Promise<CachedSpecies> {
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
  // scripts already guard (§25: never the top name-search hit) — so only an
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

function loadCache(): Record<string, CachedSpecies> {
  if (!existsSync(CACHE_PATH)) return {}
  return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Record<
    string,
    CachedSpecies
  >
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function uniqSorted(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function compare(
  plant: PlantRow,
  species: CachedSpecies,
  l3ToL2: Map<string, number>
): Finding {
  const stored = uniqSorted(plant.native_region ?? [])
  const base = {
    id: plant.id,
    common_name: plant.common_name,
    scientific_name: plant.scientific_name ?? '',
    stored,
  }

  const wcvpRows = species.rows.filter((r) => r.source === WCVP_SOURCE)
  if (!wcvpRows.length)
    return {
      ...base,
      wcvp_native: [],
      wcvp_introduced_only: [],
      native_l3_count: 0,
      missing: [],
      extra: [],
      extra_are_introduced: [],
      thin_evidence: [],
      verdict: 'no-data',
      note: species.lookupKey
        ? 'GBIF has the taxon but carries no WCVP distribution for it'
        : `no exact species-rank GBIF match (${species.matchType ?? 'none'})`,
    }

  const nativeL2 = new Set<string>()
  const introducedL2 = new Set<string>()
  const backingL3 = new Map<string, number>()
  let nativeL3Count = 0
  const unmapped: string[] = []

  for (const row of wcvpRows) {
    const locality = (row.locality ?? '').trim()
    if (!locality) continue
    const canonical = WCVP_NAME_ALIASES[locality] ?? locality
    const code = l3ToL2.get(canonical)
    if (code === undefined) {
      unmapped.push(locality)
      continue
    }
    const region = L2_NAMES[code]
    if (!region) {
      unmapped.push(`${locality} (L2 ${code})`)
      continue
    }
    if (row.establishmentMeans === 'INTRODUCED') introducedL2.add(region)
    else {
      nativeL2.add(region)
      backingL3.set(region, (backingL3.get(region) ?? 0) + 1)
      nativeL3Count++
    }
  }

  const exclusion = MANUAL_EXCLUSIONS[plant.scientific_name ?? '']
  const excludedRegions = (exclusion?.drop ?? []).filter((r) => nativeL2.has(r))
  for (const region of excludedRegions) {
    nativeL2.delete(region)
    nativeL3Count -= backingL3.get(region) ?? 0
    backingL3.delete(region)
  }

  if (unmapped.length)
    throw new Error(
      `${plant.scientific_name}: unmapped WGSRPD region name(s): ` +
        `${uniqSorted(unmapped).join(', ')}. Add them to WCVP_NAME_ALIASES — ` +
        `dropping them would silently shrink the species' range.`
    )

  const native = uniqSorted([...nativeL2])
  const introOnly = uniqSorted(
    [...introducedL2].filter((r) => !nativeL2.has(r))
  )
  const missing = native.filter((r) => !stored.includes(r))
  const extra = stored.filter((r) => !nativeL2.has(r))

  // A reviewed override outranks WCVP. Rosmarinus officinalis is why: WCVP
  // calls Western Asia native, a review deliberately cut it, and re-reporting
  // that every run would train the reader to skim the report.
  const reviewed = MANUAL_OVERRIDES[plant.scientific_name ?? '']

  // Every WCVP row introduced and none native = a cultigen with no wild range
  // (Citrus limon). This is a real finding and is NOT the same as no-data.
  const verdict: Finding['verdict'] = reviewed
    ? 'reviewed'
    : !native.length
      ? 'no-native-range'
      : missing.length || extra.length
        ? 'disagrees'
        : 'match'

  return {
    ...base,
    wcvp_native: native,
    wcvp_introduced_only: introOnly,
    native_l3_count: nativeL3Count,
    missing,
    extra,
    extra_are_introduced: extra.filter((r) => introducedL2.has(r)),
    thin_evidence: native.filter((r) => (backingL3.get(r) ?? 0) === 1),
    ...(excludedRegions.length && exclusion
      ? { excluded: { regions: excludedRegions, why: exclusion.why } }
      : {}),
    ...(reviewed ? { note: `reviewed override: ${reviewed.reason}` } : {}),
    verdict,
  }
}

// ---------------------------------------------------------------------------

async function selectPlants(
  opts: ReturnType<typeof parseArgs>,
  ids: string[] | null
): Promise<PlantRow[]> {
  const db = getSupabaseAdmin()
  const columns = 'id, common_name, scientific_name, native_region'

  const rows = await fetchAllRows<PlantRow>((from, to) => {
    let q = db.from('plants').select(columns).order('id')
    if (ids) q = q.in('id', ids)
    return q.range(from, to)
  })
  return opts.limit ? rows.slice(0, opts.limit) : rows
}

function writeReport(findings: Finding[]): void {
  mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(JSON_OUT, JSON.stringify({ findings }, null, 2) + '\n')

  const by = (v: Finding['verdict']) => findings.filter((f) => f.verdict === v)
  const lines: string[] = [
    '# native_region cross-check against WCVP',
    '',
    `Checked **${findings.length}** plants. Authority: WCVP via GBIF distributions.`,
    '',
    `- match: **${by('match').length}**`,
    `- disagrees: **${by('disagrees').length}**`,
    `- no native range (cultigen): **${by('no-native-range').length}**`,
    `- no data: **${by('no-data').length}**`,
    `- reviewed override, WCVP not applied: **${by('reviewed').length}**`,
    '',
  ]
  for (const f of [
    ...by('disagrees'),
    ...by('no-native-range'),
    ...by('no-data'),
  ]) {
    lines.push(`## ${f.common_name} (${f.scientific_name}) — ${f.verdict}`)
    lines.push('')
    lines.push(`- stored: ${f.stored.join(', ') || '(empty)'}`)
    lines.push(`- WCVP native: ${f.wcvp_native.join(', ') || '(none)'}`)
    if (f.missing.length) lines.push(`- missing: ${f.missing.join(', ')}`)
    if (f.extra.length) lines.push(`- extra: ${f.extra.join(', ')}`)
    if (f.extra_are_introduced.length)
      lines.push(
        `- of those extras, WCVP calls these INTRODUCED: ${f.extra_are_introduced.join(', ')}`
      )
    if (f.excluded)
      lines.push(
        `- manually excluded: ${f.excluded.regions.join(', ')} — ${f.excluded.why}`
      )
    if (f.thin_evidence.length)
      lines.push(
        `- resting on a single Level 3 region: ${f.thin_evidence.join(', ')}`
      )
    if (f.note) lines.push(`- note: ${f.note}`)
    lines.push('')
  }
  writeFileSync(MD_OUT, lines.join('\n'))
}

async function applyCorrections(
  findings: Finding[],
  allowEmpty: boolean
): Promise<void> {
  const db = getSupabaseAdmin()
  // Emptying a row is a different act from editing one: it removes the plant
  // from the native filter entirely, and it is the shape a bad fetch would take
  // if the no-data guard ever failed. So it needs to be asked for by name.
  const targets = findings.filter(
    (f) =>
      f.verdict === 'disagrees' ||
      (allowEmpty && f.verdict === 'no-native-range')
  )
  const withheld = findings.filter(
    (f) => !allowEmpty && f.verdict === 'no-native-range'
  )
  for (const f of withheld)
    console.log(
      `\n· ${f.common_name} has no wild native range; pass --allow-empty to clear it.`
    )
  if (!targets.length) {
    console.log('\nNothing to apply.')
    return
  }
  console.log(`\nApplying ${targets.length} correction(s)...`)
  let applied = 0
  let skipped = 0
  for (const f of targets) {
    // Guarded: re-read and confirm the row still holds the value the report was
    // built from. A row edited since then is stale and is left alone.
    const { data, error } = await db
      .from('plants')
      .select('native_region')
      .eq('id', f.id)
      .single()
    if (error)
      throw new Error(`Re-read failed for ${f.common_name}: ${error.message}`)
    const current = uniqSorted((data?.native_region as string[]) ?? [])
    if (current.join('|') !== f.stored.join('|')) {
      console.log(`  ⚠ ${f.common_name} — changed since the report, skipped`)
      skipped++
      continue
    }
    const { error: writeError } = await db
      .from('plants')
      .update({ native_region: f.wcvp_native })
      .eq('id', f.id)
    if (writeError)
      throw new Error(
        `Write failed for ${f.common_name}: ${writeError.message}`
      )
    console.log(`  ✓ ${f.common_name}`)
    console.log(`      ${f.stored.join(', ') || '(empty)'}`)
    console.log(`   -> ${f.wcvp_native.join(', ') || '(empty)'}`)
    applied++
  }
  console.log(`\n${applied} applied, ${skipped} skipped as stale.`)
}

async function main() {
  const opts = parseArgs()

  // Scope first: it is the cheapest check and the one most likely to be wrong.
  // Resolving it after the geojson load would answer a forgotten --round with
  // a missing-file error instead. The scope flags this script established now
  // live in scripts/scope.ts, so every pass refuses in the same words.
  const scope = requireScope(
    'cross-check-native-region',
    'cross-check-native-region calls GBIF once per row; an unscoped run is a\n' +
      'catalog-wide sweep of an external API.'
  )
  const ids = scopeIds(scope)
  console.log(describeScope(scope, ids))

  const l3ToL2 = loadL3NameMap()
  const plants = await selectPlants(opts, ids)
  console.log(`Checking ${plants.length} plants against WCVP...`)

  const cache = loadCache()
  const findings: Finding[] = []
  for (const plant of plants) {
    if (!plant.scientific_name) {
      console.log(`  skip ${plant.common_name} — no scientific_name`)
      continue
    }
    let species = cache[plant.scientific_name]
    if (!species) {
      species = await fetchSpecies(plant.scientific_name)
      cache[plant.scientific_name] = species
      mkdirSync(REPORTS_DIR, { recursive: true })
      writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
      await sleep(GBIF_DELAY_MS)
    }
    findings.push(compare(plant, species, l3ToL2))
  }

  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.verdict] = (acc[f.verdict] ?? 0) + 1
    return acc
  }, {})
  console.log(
    `\nmatch ${counts.match ?? 0} · disagrees ${counts.disagrees ?? 0} · ` +
      `no-native-range ${counts['no-native-range'] ?? 0} · no-data ${counts['no-data'] ?? 0}`
  )
  for (const f of findings) {
    if (f.verdict === 'match') continue
    console.log(
      `\n${f.verdict.toUpperCase()} — ${f.common_name} (${f.scientific_name})`
    )
    console.log(`  stored: ${f.stored.join(', ') || '(empty)'}`)
    console.log(`  WCVP  : ${f.wcvp_native.join(', ') || '(none)'}`)
    if (f.extra_are_introduced.length)
      console.log(
        `  WCVP calls these INTRODUCED: ${f.extra_are_introduced.join(', ')}`
      )
    if (f.excluded)
      console.log(
        `  excluded ${f.excluded.regions.join(', ')} — ${f.excluded.why}`
      )
    if (f.note) console.log(`  note: ${f.note}`)
  }

  writeReport(findings)
  console.log(`\nReport → ${MD_OUT}`)

  if (opts.apply) await applyCorrections(findings, opts.allowEmpty)
  else if (findings.some((f) => f.verdict === 'disagrees'))
    console.log('Re-run with --apply to write the corrections.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
