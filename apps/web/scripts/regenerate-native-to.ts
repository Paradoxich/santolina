/**
 * One-shot: regenerate `native_to` as a short, human-readable range phrase.
 *
 * The seed imported Trefle's raw TDWG botanical-region list into native_to
 * (mapNativeTo) and the app shows it verbatim — a 50-item wall of text riddled
 * with defunct countries (Yugoslavia, Czechoslovakia, Zaïre), truncations
 * ("Central European Rus"), and a misspelling ("Masachusettes"). Curation was
 * meant to write a short phrase but only fills when empty, so the dump won.
 *
 * This replaces every plant's native_to with a concise modern-geography phrase
 * (e.g. "Europe and western Asia"), grounded on the scientific name and the raw
 * list as a hint to the true extent.
 *
 * Two phases so nothing unreviewed hits the live catalog:
 *   1. generate (default): calls Claude per plant, writes reports/native-to.json
 *      + reports/native-to-review.md. No DB writes.
 *        ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-to.ts
 *   2. apply: reads reports/native-to.json and patches the plants table.
 *        ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-to.ts --apply
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'

const INTER_PLANT_DELAY_MS = 2000
const REPORTS_DIR = join(process.cwd(), 'reports')
const JSON_PATH = join(REPORTS_DIR, 'native-to.json')
const REVIEW_PATH = join(REPORTS_DIR, 'native-to-review.md')

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  native_to: string | null
}

interface Result {
  id: string
  common_name: string
  scientific_name: string | null
  before: string | null
  after: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 3) => String(n).padStart(w, '0')

function buildPrompt(plant: PlantRow): string {
  return [
    `Plant: ${plant.common_name} (${plant.scientific_name ?? 'unknown'})`,
    `Reference distribution (raw botanical regions — may include outdated names, truncations, or errors): ${plant.native_to ?? '(none)'}`,
    '',
    "Write this plant's native geographic range as ONE short, human-readable phrase using present-day geography.",
    'Rules:',
    '- A concise phrase, NOT a list of many countries and NOT a sentence. Aim for 2–7 words.',
    '  Good: "Europe and western Asia", "the Mediterranean", "southeastern Europe and the Caucasus", "temperate Asia", "eastern North America".',
    '- Modern geography ONLY. Never name a country that no longer exists — no Yugoslavia, Czechoslovakia, USSR/Soviet Union, Zaire, East/West Germany. Use regional descriptors instead ("the Balkans", "central Europe", "the Caucasus", "central Asia").',
    '- Group places into natural regions rather than listing them. For very wide ranges, summarize (e.g. "temperate Northern Hemisphere").',
    '- Base it on the true native range: use the reference as a guide to extent, but correct any outdated or wrong names.',
    '',
    'Respond with ONLY JSON, no code fences: {"native_to": "..."}',
  ].join('\n')
}

async function generatePhrase(plant: PlantRow): Promise<string> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: 200,
    system:
      'You are a botanical geography assistant. Respond with ONLY valid JSON, no markdown, no code fences, no preamble.',
    messages: [{ role: 'user', content: buildPrompt(plant) }],
  })

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  const parsed = JSON.parse(raw) as { native_to?: unknown }
  const phrase =
    typeof parsed.native_to === 'string' ? parsed.native_to.trim() : ''
  if (!phrase)
    throw new Error(
      `Empty phrase for ${plant.common_name}: ${raw.slice(0, 120)}`
    )
  return phrase
}

async function generate(): Promise<void> {
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('plants')
    .select('id, common_name, scientific_name, native_to')
    .order('common_name')
  if (error) throw new Error(`Failed to fetch plants: ${error.message}`)
  const plants = (data ?? []) as PlantRow[]

  console.log(`Generating native_to phrases for ${plants.length} plants...\n`)
  const results: Result[] = []

  for (let i = 0; i < plants.length; i++) {
    const plant = plants[i]!
    try {
      const after = await generatePhrase(plant)
      results.push({
        id: plant.id,
        common_name: plant.common_name,
        scientific_name: plant.scientific_name,
        before: plant.native_to,
        after,
      })
      console.log(
        `[${pad(i + 1)}/${plants.length}] ${plant.common_name} → ${after}`
      )
    } catch (err) {
      console.error(
        `[${pad(i + 1)}/${plants.length}] ${plant.common_name} FAILED: ${(err as Error).message}`
      )
    }
    if (i < plants.length - 1) await sleep(INTER_PLANT_DELAY_MS)
  }

  mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(JSON_PATH, JSON.stringify(results, null, 2))

  const md = [
    '# native_to regeneration — review',
    '',
    `${results.length} plants. Scan the "After" column; anything off, tell Claude the id and the correction.`,
    '',
    '| Plant | Scientific | After | Before (raw) |',
    '| --- | --- | --- | --- |',
    ...results.map(
      (r) =>
        `| ${r.common_name} | *${r.scientific_name ?? ''}* | **${r.after}** | ${(r.before ?? '').slice(0, 80)}${(r.before ?? '').length > 80 ? '…' : ''} |`
    ),
  ].join('\n')
  writeFileSync(REVIEW_PATH, md)

  console.log(
    `\nDone. ${results.length} phrases written to:\n  ${JSON_PATH}\n  ${REVIEW_PATH}`
  )
  console.log(
    '\nReview, then apply with:  tsx --env-file=.env.local scripts/regenerate-native-to.ts --apply'
  )
}

async function apply(): Promise<void> {
  const results = JSON.parse(readFileSync(JSON_PATH, 'utf8')) as Result[]
  const db = getSupabaseAdmin()
  console.log(
    `Applying ${results.length} native_to phrases to the plants table...\n`
  )

  let ok = 0
  for (const r of results) {
    const { error } = await db
      .from('plants')
      .update({ native_to: r.after })
      .eq('id', r.id)
    if (error) console.error(`FAILED ${r.common_name}: ${error.message}`)
    else ok++
  }
  console.log(`\nApplied ${ok}/${results.length}.`)
}

async function main() {
  if (process.argv.includes('--apply')) await apply()
  else await generate()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
