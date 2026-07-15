/**
 * Native-range cross-check — a gross-error guard for the `native_to` phrases.
 *
 * The phrases were AI-generated from Trefle's raw distribution, which is sparse
 * and occasionally wrong. This does NOT try to make them botanically perfect
 * (western vs central Mediterranean is nobody's problem) — it catches the
 * embarrassing class: a plant placed on the WRONG CONTINENT (a Middle-Eastern
 * species labelled South America, etc.).
 *
 * Two independent signals are weighed against the stored phrase:
 *   1. GBIF / WCVP native distribution, fetched live by scientific name — an
 *      external authority, not our own data. Introduced range is filtered out
 *      (WCVP tags it "[I]"); only native regions are kept.
 *   2. Claude's own knowledge of the species (it is NOT shown the GBIF data as
 *      gospel — it reconciles both, and the raw Trefle list when available).
 * Claude returns the native continents, the continents our phrase implies, and
 * a verdict. A code-level backstop forces "gross" whenever those continent sets
 * are disjoint, so the model can't wave through a cross-continent miss.
 *
 * Default run writes a ranked report and NEVER touches the DB. `--apply` patches
 * ONLY rows the check rated "gross" that carry a suggested replacement phrase —
 * the same generate-then-apply safety split as regenerate-native-to.ts.
 *
 * --new-only scopes the check to the most recent seed batch (rows created on
 * the newest calendar day), so a post-seed run only bills Claude for the fresh
 * phrases instead of re-checking the whole catalog. Same convention as
 * cross-check-plants.ts / curate-plants.ts --new-only.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-to.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-to.ts --new-only
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-to.ts --limit 10
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-to.ts --apply
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import { fetchAllRows } from './paginate'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// 2s between Claude calls — same pacing as curate-plants.ts / cross-check-plants.ts
const INTER_PLANT_DELAY_MS = 2000
// Be polite to the free GBIF API between lookups.
const GBIF_DELAY_MS = 200

const REPORTS_DIR = join(process.cwd(), 'reports')
const JSON_OUT = join(REPORTS_DIR, 'native-to-crosscheck.json')
const MD_OUT = join(REPORTS_DIR, 'native-to-crosscheck.md')
// Raw Trefle distribution, if regenerate-native-to.ts left it behind (optional).
const RAW_SNAPSHOT = join(REPORTS_DIR, 'native-to.json')

const CONTINENTS = [
  'Europe',
  'Africa',
  'Asia',
  'North America',
  'South America',
  'Oceania',
  'Antarctica',
] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  family: string | null
  native_to: string | null
  created_at: string
}

// --new-only restricts the check to the most recent seed batch — the rows
// whose created_at falls on the same calendar day (UTC) as the newest plant.
// A seed round adds all its rows on one day, so this scopes a post-seed
// native_to guard to the fresh phrases instead of re-checking (and re-billing
// Claude for) the whole catalog. Mirrors cross-check-plants.ts --new-only.
function newestBatchOnly<T extends { created_at: string }>(rows: T[]): T[] {
  if (!rows.length) return rows
  const newestDay = rows
    .map((r) => r.created_at.slice(0, 10))
    .sort()
    .at(-1)
  return rows.filter((r) => r.created_at.slice(0, 10) === newestDay)
}

type Continent = (typeof CONTINENTS)[number]
type Verdict = 'ok' | 'minor' | 'gross' | 'no_data'

interface Judgment {
  native_continents: Continent[]
  phrase_continents: Continent[]
  verdict: Verdict
  confidence: 'high' | 'low'
  suggested_phrase: string | null
  note: string
}

interface Result extends Judgment {
  id: string
  common_name: string
  scientific_name: string | null
  stored_phrase: string | null
  gbif_tier: string
  gbif_regions: string[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 3) => String(n).padStart(w, '0')

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseLimit(): number | null {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--limit')
  const raw = idx >= 0 ? args[idx + 1] : undefined
  const limit = raw ? parseInt(raw, 10) : null
  if (limit !== null && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error('--limit must be a positive integer')
  }
  return limit
}

// ---------------------------------------------------------------------------
// GBIF — independent native distribution, keyed by scientific name
// ---------------------------------------------------------------------------

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'santolina-crosscheck' },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Native regions for a species, filtering out introduced range.
 * Tiered by source reliability:
 *   wcvp        — the authoritative WCVP record; introduced regions carry "[I]"
 *                 markers, so native = the unmarked segments. Best signal.
 *   native-recs — no WCVP record; fall back to records explicitly NATIVE.
 *   weak        — neither; keep anything not tagged introduced (leaky, low trust).
 */
async function gbifNativeRegions(
  sci: string
): Promise<{ tier: string; regions: string[] }> {
  const match = await fetchJson(
    `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(sci)}`
  )
  const key = match?.usageKey
  if (!key) return { tier: 'no-match', regions: [] }

  const dist = await fetchJson(
    `https://api.gbif.org/v1/species/${key}/distributions?limit=400`
  )
  const records: any[] = dist?.results ?? []
  const dedup = (xs: string[]) => [
    ...new Set(xs.map((s) => s.trim()).filter(Boolean)),
  ]

  const wcvp = records.filter((r) => (r.locality ?? '').includes('[I]'))
  if (wcvp.length) {
    const rec = wcvp.reduce((a, b) =>
      (b.locality ?? '').length > (a.locality ?? '').length ? b : a
    )
    const native = String(rec.locality)
      .split(';')
      .filter((seg) => !/\[i\]|\[c\]/i.test(seg))
    return { tier: 'wcvp', regions: dedup(native) }
  }

  const explicit = records
    .filter(
      (r) => String(r.establishmentMeans ?? '').toUpperCase() === 'NATIVE'
    )
    .map((r) => r.locality ?? r.country ?? '')
  if (explicit.length) return { tier: 'native-recs', regions: dedup(explicit) }

  const introduced = ['INTRODUCED', 'NATURALISED', 'INVASIVE', 'MANAGED']
  const weak = records
    .filter(
      (r) =>
        !introduced.includes(String(r.establishmentMeans ?? '').toUpperCase())
    )
    .map((r) => r.locality ?? r.country ?? '')
  return { tier: 'weak', regions: dedup(weak) }
}

// ---------------------------------------------------------------------------
// Claude — reconcile GBIF + own knowledge, judge the stored phrase
// ---------------------------------------------------------------------------

function buildPrompt(
  plant: PlantRow,
  gbif: { tier: string; regions: string[] },
  raw: string | null
): string {
  const identity = [
    `common name: ${plant.common_name}`,
    plant.scientific_name ? `scientific name: ${plant.scientific_name}` : '',
    plant.family ? `family: ${plant.family}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const gbifLine = gbif.regions.length
    ? `GBIF/WCVP native regions (introduced range removed; source tier "${gbif.tier}"):\n${gbif.regions.join(', ').slice(0, 1500)}`
    : 'GBIF/WCVP native regions: (none returned)'

  const rawLine = raw
    ? `Raw Trefle distribution we originally imported (may contain outdated names): ${raw.slice(0, 800)}`
    : ''

  return `You are a botanical geography fact-checker. Decide whether our catalog's short native-range phrase for a plant puts it on the correct CONTINENT(S). We care ONLY about gross errors (e.g. a Eurasian plant labelled South America). Sub-continental imprecision (e.g. "western" vs "central Mediterranean", a dropped secondary region) is NOT a gross error.

Plant identity:
${identity}

Our catalog phrase (the thing being checked): "${plant.native_to ?? '(none)'}"

Independent evidence:
${gbifLine}
${rawLine}

Weigh the GBIF evidence together with your own knowledge of this species' TRUE NATIVE range (ignore where it is merely cultivated or naturalised). For cultivated hybrids or garden cultigens with no real wild native range, set confidence "low".

Continents vocabulary (use these exact strings): ${JSON.stringify(CONTINENTS)}

Respond with ONLY JSON, no code fences:
{
  "native_continents": [ ...the plant's true native continents... ],
  "phrase_continents": [ ...the continents our catalog phrase implies... ],
  "verdict": "ok" | "minor" | "gross",   // "gross" = phrase places the plant on a continent it is NOT native to (a wrong-place error); "minor" = right continent(s) but imprecise or incomplete; "ok" = accurate
  "confidence": "high" | "low",
  "suggested_phrase": "a short 2-7 word modern-geography replacement, same terse style as the original, whenever the phrase names a continent the plant is not native to; otherwise null",
  "note": "one short clause explaining the verdict"
}`
}

function parseJudgment(raw: string): Judgment {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  // Extract the first balanced JSON object — the model occasionally appends a
  // stray sentence after the JSON, which would otherwise throw and drop the plant.
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const jsonText =
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  const p = JSON.parse(jsonText) as Partial<Judgment>

  const clampConts = (xs: unknown): Continent[] =>
    Array.isArray(xs)
      ? (xs.filter((c) =>
          (CONTINENTS as readonly string[]).includes(c)
        ) as Continent[])
      : []

  const verdict: Verdict =
    p.verdict === 'gross' || p.verdict === 'minor' || p.verdict === 'ok'
      ? p.verdict
      : 'minor'

  return {
    native_continents: clampConts(p.native_continents),
    phrase_continents: clampConts(p.phrase_continents),
    verdict,
    confidence: p.confidence === 'low' ? 'low' : 'high',
    suggested_phrase:
      typeof p.suggested_phrase === 'string' && p.suggested_phrase.trim()
        ? p.suggested_phrase.trim()
        : null,
    note: typeof p.note === 'string' ? p.note : '',
  }
}

async function judge(
  plant: PlantRow,
  gbif: { tier: string; regions: string[] },
  raw: string | null
): Promise<Judgment> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: 512,
    system:
      'You are a botanical geography fact-checker. Respond with ONLY valid JSON, no markdown, no code fences, no preamble.',
    messages: [{ role: 'user', content: buildPrompt(plant, gbif, raw) }],
  })
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
  return parseJudgment(text)
}

/**
 * Severity is decided by continent overlap IN CODE, not by the model's own
 * verdict label — the model over-calls "gross" on ranges that actually overlap
 * (e.g. a phrase that merely omits a secondary continent), which floods the
 * report with false positives. The only thing that matters for launch is a
 * genuinely WRONG continent: the phrase and the true native range share none.
 *   - no native/phrase signal        -> no_data (often cultigens/hybrids)
 *   - disjoint continent sets        -> gross  (wrong place — fix these)
 *   - overlapping but not identical  -> minor  (right place, imprecise/incomplete;
 *                                               includes multi-continent words
 *                                               like "the Mediterranean")
 *   - identical                      -> ok
 */
function reconcileVerdict(j: Judgment): Verdict {
  const nat = j.native_continents
  const phr = j.phrase_continents
  if (nat.length === 0 || phr.length === 0) return 'no_data'
  const overlap = phr.some((c) => nat.includes(c))
  if (!overlap) return 'gross'
  const equal = nat.length === phr.length && nat.every((c) => phr.includes(c))
  return equal ? 'ok' : 'minor'
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const RANK: Record<Verdict, number> = { gross: 0, no_data: 1, minor: 2, ok: 3 }

function writeReport(results: Result[]): void {
  mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(JSON_OUT, JSON.stringify(results, null, 2) + '\n')

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1
    return acc
  }, {})
  const sorted = [...results].sort(
    (a, b) =>
      RANK[a.verdict] - RANK[b.verdict] ||
      a.common_name.localeCompare(b.common_name)
  )
  const flagged = sorted.filter((r) => r.verdict !== 'ok')

  const cell = (s: string) => s.replace(/\|/g, '\\|')
  const rows = flagged.map(
    (r) =>
      `| ${r.verdict}${r.confidence === 'low' ? ' (low)' : ''} | ${cell(r.common_name)} | *${cell(r.scientific_name ?? '')}* | ${cell(r.stored_phrase ?? '')} | ${cell(r.native_continents.join(', '))} | ${cell(r.suggested_phrase ?? '')} | ${cell(r.note)} |`
  )

  const md = [
    '# native_to cross-check — continent-level gross-error guard',
    '',
    `${results.length} plants checked against GBIF/WCVP native ranges + Claude.`,
    '',
    `**gross: ${counts['gross'] ?? 0}**  ·  no_data: ${counts['no_data'] ?? 0}  ·  minor: ${counts['minor'] ?? 0}  ·  ok: ${counts['ok'] ?? 0}`,
    '',
    'Only non-ok rows are listed. "gross" = wrong continent (fix these). "no_data" = no',
    'native signal from GBIF and Claude was unsure (often cultigens/hybrids — eyeball).',
    '"minor" = right continent, imprecise wording (safe to ignore for launch).',
    '',
    '| verdict | plant | scientific | stored phrase | native continents | suggested | note |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
  writeFileSync(MD_OUT, md + '\n')

  console.log(
    `\nDone. gross=${counts['gross'] ?? 0} no_data=${counts['no_data'] ?? 0} minor=${counts['minor'] ?? 0} ok=${counts['ok'] ?? 0}`
  )
  console.log(`Report:\n  ${MD_OUT}\n  ${JSON_OUT}`)
  if ((counts['gross'] ?? 0) > 0) {
    console.log(
      '\nApply the gross fixes with:  tsx --env-file=.env.local scripts/cross-check-native-to.ts --apply'
    )
  }
}

// ---------------------------------------------------------------------------
// Apply — patch ONLY gross rows that carry a suggested phrase
// ---------------------------------------------------------------------------

async function apply(): Promise<void> {
  if (!existsSync(JSON_OUT)) {
    throw new Error(
      `No report found at ${JSON_OUT}. Run without --apply first.`
    )
  }
  const results = JSON.parse(readFileSync(JSON_OUT, 'utf8')) as Result[]
  const fixes = results.filter(
    (r) => r.verdict === 'gross' && r.suggested_phrase
  )
  if (!fixes.length) {
    console.log('No gross rows with a suggested phrase to apply.')
    return
  }
  const db = getSupabaseAdmin()
  console.log(`Applying ${fixes.length} gross-error fixes...\n`)
  let ok = 0
  for (const r of fixes) {
    const { error } = await db
      .from('plants')
      .update({ native_to: r.suggested_phrase })
      .eq('id', r.id)
    if (error) console.error(`FAILED ${r.common_name}: ${error.message}`)
    else {
      ok++
      console.log(
        `  ${r.common_name}: "${r.stored_phrase}" -> "${r.suggested_phrase}"`
      )
    }
  }
  console.log(`\nApplied ${ok}/${fixes.length}.`)
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

function loadRawSnapshot(): Map<string, string> {
  const map = new Map<string, string>()
  if (!existsSync(RAW_SNAPSHOT)) return map
  try {
    const rows = JSON.parse(readFileSync(RAW_SNAPSHOT, 'utf8')) as Array<{
      id: string
      before: string | null
    }>
    for (const row of rows) if (row.before) map.set(row.id, row.before)
  } catch {
    // optional signal — ignore a malformed snapshot
  }
  return map
}

async function generate(limit: number | null, newOnly: boolean): Promise<void> {
  const db = getSupabaseAdmin()
  let plants = await fetchAllRows<PlantRow>((from, to) =>
    db
      .from('plants')
      .select('id, common_name, scientific_name, family, native_to, created_at')
      .order('id')
      .range(from, to)
  )
  if (newOnly) plants = newestBatchOnly(plants)
  if (limit !== null) plants = plants.slice(0, limit)

  const rawByID = loadRawSnapshot()
  console.log(`Cross-checking native_to for ${plants.length} plants...\n`)
  const results: Result[] = []

  for (let i = 0; i < plants.length; i++) {
    const plant = plants[i]!
    try {
      const gbif = plant.scientific_name
        ? await gbifNativeRegions(plant.scientific_name)
        : { tier: 'no-name', regions: [] }
      await sleep(GBIF_DELAY_MS)

      const j = await judge(plant, gbif, rawByID.get(plant.id) ?? null)
      const verdict = reconcileVerdict(j)
      results.push({
        id: plant.id,
        common_name: plant.common_name,
        scientific_name: plant.scientific_name,
        stored_phrase: plant.native_to,
        gbif_tier: gbif.tier,
        gbif_regions: gbif.regions,
        ...j,
        verdict,
      })
      const tag =
        verdict === 'gross'
          ? 'GROSS'
          : verdict === 'no_data'
            ? 'no_data'
            : verdict
      console.log(
        `[${pad(i + 1)}/${plants.length}] ${tag.padEnd(7)} ${plant.common_name} — "${plant.native_to}"`
      )
    } catch (err) {
      console.error(
        `[${pad(i + 1)}/${plants.length}] ERROR ${plant.common_name}: ${(err as Error).message}`
      )
    }
    if (i < plants.length - 1) await sleep(INTER_PLANT_DELAY_MS)
  }

  writeReport(results)
}

// ---------------------------------------------------------------------------

async function main() {
  if (process.argv.includes('--apply')) await apply()
  else await generate(parseLimit(), process.argv.includes('--new-only'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
