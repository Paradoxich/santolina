/**
 * DRY RUN, part 2 — fallback for the empty-native plants. WRITES NOTHING.
 *
 * The main dry run (dry-run-native-region.ts, alongside this file) found 14 real plants that Trefle
 * returns no native distribution for, so they get NO Option-A tags and would
 * vanish from every region filter. Hand-tagging them reintroduces the exact
 * hand/prompt-tagging this whole change retires — and would be clobbered the
 * next time the Trefle regeneration runs. The alternative is to DERIVE their
 * tags from the already-clean `native_to` prose (populated on all 318, Ana's
 * editorial voice), using the same curation model the repo already uses.
 *
 * This script shows exactly what that fallback produces, so Ana can compare
 * "derive from native_to" vs "hand-tag" on real output before choosing. It
 * reads the main dry run's JSON for the plant list; it does not touch the DB.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/derive-empty-native-region.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAnthropicClient, CURATION_MODEL } from '../../lib/anthropic-client'

const REPORTS_DIR = join(process.cwd(), 'reports')
const DRYRUN_JSON = join(REPORTS_DIR, 'native-region-dryrun.json')
const OUT_MD = join(REPORTS_DIR, 'native-region-empties-derived.md')

// The Level-2 vocabulary — identical to the main dry run (Option A tags).
const L2_VOCAB = [
  'Northern Europe',
  'Middle Europe',
  'Southwestern Europe',
  'Southeastern Europe',
  'Eastern Europe',
  'Northern Africa',
  'Macaronesia',
  'West Tropical Africa',
  'West-Central Tropical Africa',
  'Northeast Tropical Africa',
  'East Tropical Africa',
  'South Tropical Africa',
  'Southern Africa',
  'Middle Atlantic Ocean',
  'Western Indian Ocean',
  'Siberia',
  'Russian Far East',
  'Middle Asia',
  'Caucasus',
  'Western Asia',
  'Arabian Peninsula',
  'China',
  'Mongolia',
  'Eastern Asia',
  'Indian Subcontinent',
  'Indo-China',
  'Malesia',
  'Papuasia',
  'Australia',
  'New Zealand',
  'Southwestern Pacific',
  'South-Central Pacific',
  'Northwestern Pacific',
  'North-Central Pacific',
  'Subarctic America',
  'Western Canada',
  'Eastern Canada',
  'Northwestern U.S.A.',
  'North-Central U.S.A.',
  'Northeastern U.S.A.',
  'Southwestern U.S.A.',
  'South-Central U.S.A.',
  'Southeastern U.S.A.',
  'Mexico',
  'Central America',
  'Caribbean',
  'Northern South America',
  'Western South America',
  'Brazil',
  'Southern South America',
  'Subantarctic Islands',
  'Antarctic Continent',
]
const L2_SET = new Set(L2_VOCAB)
const USER_L2_REGION = 'Southeastern Europe' // Rijeka user's Option-A region

interface PlantResult {
  common_name: string
  scientific_name: string | null
  native_to: string | null
  old_tags: string[]
  status: string
}

function buildPrompt(nativeTo: string): string {
  return `You translate a plant's native-range phrase into a set of TDWG WGSRPD Level-2 botanical regions. Return the MINIMAL set of regions the phrase actually implies as NATIVE range — do not add introduced/cultivated range, do not pad.

Use ONLY these exact region strings:
${JSON.stringify(L2_VOCAB)}

Notes:
- Bare "Europe" means all five European regions (Northern, Middle, Southwestern, Southeastern, Eastern Europe).
- WGSRPD places Italy, Greece, Crete, the Balkans, Romania, Bulgaria in "Southeastern Europe"; Iberia, France, Corsica, Sardinia, Baleares in "Southwestern Europe".
- "the Mediterranean" spans Southwestern Europe, Southeastern Europe, Northern Africa, and Western Asia.
- Turkey spans "Western Asia" (and the European sliver is Southeastern Europe).

Native-range phrase: "${nativeTo}"

Respond with ONLY a JSON array of region strings, no prose, no code fences.`
}

async function deriveRegions(nativeTo: string): Promise<string[]> {
  const client = getAnthropicClient()
  const msg = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: buildPrompt(nativeTo) }],
  })
  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown[]
  return arr.filter((x): x is string => typeof x === 'string')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const dry = JSON.parse(readFileSync(DRYRUN_JSON, 'utf8'))
  const gap = new Set<string>(dry.empty_data_gap)
  const plants: PlantResult[] = dry.results.filter((r: PlantResult) =>
    gap.has(r.scientific_name ?? '')
  )

  const rows: Array<{
    sci: string | null
    native_to: string | null
    old: string[]
    derived: string[]
    invalid: string[]
    matchesUser: boolean
  }> = []

  console.log(
    `Deriving L2 tags from native_to for ${plants.length} empty-native plants…\n`
  )
  for (const p of plants) {
    let derived: string[] = []
    let invalid: string[] = []
    if (p.native_to) {
      try {
        const raw = await deriveRegions(p.native_to)
        derived = raw.filter((r) => L2_SET.has(r))
        invalid = raw.filter((r) => !L2_SET.has(r)) // model went off-vocabulary
      } catch (e) {
        invalid = [`ERROR: ${String(e)}`]
      }
    }
    const matchesUser = derived.includes(USER_L2_REGION)
    rows.push({
      sci: p.scientific_name,
      native_to: p.native_to,
      old: p.old_tags,
      derived,
      invalid,
      matchesUser,
    })
    console.log(
      `${(p.scientific_name ?? '').padEnd(28)} | "${p.native_to}" -> ${derived.join(', ') || '(none)'}` +
        (invalid.length ? `  [off-vocab: ${invalid.join(', ')}]` : '') +
        (matchesUser ? '   ✓ Rijeka' : '')
    )
    await sleep(1500)
  }

  const nowMatch = rows.filter((r) => r.matchesUser).length
  const stillEmpty = rows.filter((r) => r.derived.length === 0).length

  const L: string[] = []
  L.push(
    '# Empty-native fallback — tags derived from `native_to` (DRY RUN, no writes)'
  )
  L.push('')
  L.push(
    `Plants: **${rows.length}** (Trefle returned no native distribution for these).`
  )
  L.push(
    `Derived a non-empty tag set for **${rows.length - stillEmpty}/${rows.length}**.`
  )
  L.push(
    `Would now be returned to a Rijeka user (Southeastern Europe): **${nowMatch}/${rows.length}**.`
  )
  L.push('')
  L.push(
    '| plant | native_to | old (discarded) | derived Option-A tags | Rijeka? |'
  )
  L.push('|---|---|---|---|:--:|')
  for (const r of rows) {
    L.push(
      `| ${r.sci} | ${r.native_to ?? ''} | ${r.old.join(', ') || '—'} | ${r.derived.join(', ') || '—'}` +
        `${r.invalid.length ? ` ⚠️ ${r.invalid.join(', ')}` : ''} | ${r.matchesUser ? '✓' : ''} |`
    )
  }
  L.push('')
  L.push(
    'Note: this is the *fallback* branch only. In the real pipeline it fires solely when Trefle returns empty; Trefle L3 data remains the primary source for the other 303 plants.'
  )
  writeFileSync(OUT_MD, L.join('\n'))

  console.log(`\n=== DERIVE DRY RUN COMPLETE (no DB writes) ===`)
  console.log(
    `derived non-empty: ${rows.length - stillEmpty}/${rows.length} | Rijeka matches recovered: ${nowMatch}/${rows.length}`
  )
  console.log(`report -> ${OUT_MD}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
