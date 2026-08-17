/**
 * Blind season-sanity check on seasonal_care stage assignments (flags only,
 * never writes). The companion safety net to curate-seasonal-care.ts: the
 * distillation pass reliably kills the error CLASSES (frozen-ground division,
 * "as needed" busywork, feed/fall vocabulary), but the exact SEASON for a
 * debatable action (divide in spring vs autumn, plant bulbs early vs mid autumn)
 * is model-stochastic. This pass catches those timing slips for editorial review.
 *
 * Blind, cross-check style (see cross-check-plants.ts, docs/curation.md#botanical-cross-check):
 * the checker is given each care ACTION with its assigned stage hidden, returns
 * the stage(s) it believes are horticulturally correct, and the code compares.
 * A mismatch is flagged; nothing is written to the DB.
 *
 * Usage (from apps/web):
 *   # Check populated rows in the DB (after the full curate run):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-seasonal-care.ts
 *   # Check a pre-run sample artifact instead of the DB:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-seasonal-care.ts --from-report reports/seasonal-care-sample-<stamp>.json
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-seasonal-care.ts --names "lady's mantle,Hosta sieboldiana"
 *
 * `--names` takes a comma-separated list of common or scientific names and
 * re-checks just those, which is how you close the gap on rows that errored in
 * a prior full run without paying for the whole pass again.
 *
 * Flags:
 *   --from-report F  Read seasonal_care from a sample artifact (JSON) rather
 *                    than the DB. For validating a sample before the full run.
 *   --limit N        Cap the number of plants checked (DB mode).
 *
 * Known checker biases (found in editorial review of the July 15 2026 run —
 * read the flags with these in mind, don't take "wrong stage" at face value):
 * 1. Autumn-ifies spring-divided woodlanders. The checker defaults division to
 *    autumn even for species RHS documents as spring dividers (e.g.
 *    Lamprocapnos, Brunnera) — division-in-spring for shallow-rooted woodland
 *    perennials that dislike autumn disturbance was flagged wrong when it
 *    was right.
 * 2. Over-nulls bloom-season deadheading. It reads "as needed during the
 *    flowering season" as anytime/no-season, but deadheading has a sharp
 *    trigger (a spent bloom, now) and passes the "why now?" test — it should
 *    stay attached to the bloom-window stages, not be nulled.
 * Neither is a reason to distrust the pass wholesale — both are directional
 * tendencies to weigh against, not blanket overrides.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import type { SeasonalCare, SeasonalRhythm } from '../lib/plants-db'

const INTER_PLANT_DELAY_MS = 2000

const SEASONAL_KEYS: Array<keyof SeasonalRhythm> = [
  'early_spring',
  'late_spring',
  'summer',
  'late_summer',
  'autumn',
  'winter',
]

// Mirrors lib/season.ts MONTH_TO_SEASON — keep in sync (also in
// curate-seasonal-care.ts). late_summer = September, autumn = Oct-Nov.
const STAGE_MONTHS = `- early_spring: March, April
- late_spring: May, June
- summer: July, August
- late_summer: September
- autumn: October, November
- winter: December, January, February`

// ---------------------------------------------------------------------------
// Plant + its non-null care lines
// ---------------------------------------------------------------------------

interface CheckTarget {
  common_name: string
  scientific_name: string | null
  plant_type: string | null
  lines: Array<{ stage: keyof SeasonalRhythm; text: string }>
  // The source seasonal_rhythm, kept so a wrong-stage flag can be traced back:
  // if the debatable timing appears in seasonal_rhythm, the fix belongs upstream.
  rhythm: Record<string, unknown> | null
}

function toTarget(p: {
  common_name: string
  scientific_name: string | null
  plant_type: string | null
  seasonal_care: SeasonalCare | Record<string, unknown> | null
  seasonal_rhythm: SeasonalRhythm | Record<string, unknown> | null
}): CheckTarget | null {
  const sc = p.seasonal_care
  if (!sc) return null
  const lines: CheckTarget['lines'] = []
  for (const stage of SEASONAL_KEYS) {
    const v = (sc as Record<string, unknown>)[stage]
    if (typeof v === 'string' && v.trim()) lines.push({ stage, text: v.trim() })
  }
  if (!lines.length) return null
  return {
    common_name: p.common_name,
    scientific_name: p.scientific_name,
    plant_type: p.plant_type,
    lines,
    rhythm: (p.seasonal_rhythm as Record<string, unknown>) ?? null,
  }
}

// Stopwords stripped before checking action↔rhythm word overlap.
const STOP = new Set([
  'the',
  'and',
  'for',
  'its',
  'into',
  'this',
  'that',
  'with',
  'from',
  'once',
  'them',
  'they',
  'your',
  'you',
  'are',
  'new',
  'may',
  'can',
  'not',
  'off',
  'out',
  'now',
  'while',
  'after',
  'before',
  'every',
  'level',
  'back',
  'keep',
  'need',
  'needed',
  'desired',
  'plant',
  'plants',
])

/**
 * Heuristic: does the wrongly-assigned stage's seasonal_rhythm text share a
 * content word with the care action? If so, the pass faithfully carried the
 * timing forward from seasonal_rhythm (like Scilla's late_summer bulb line), so
 * the real fix is upstream in seasonal_rhythm — flag it as such rather than only
 * correcting the seasonal_care line, or the same error regenerates on re-distill.
 */
function tracesToRhythm(
  actionText: string,
  rhythmAtStage: string | null
): boolean {
  if (!rhythmAtStage) return false
  const rhythmLower = rhythmAtStage.toLowerCase()
  const words = actionText
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
  return words.some((w) => rhythmLower.includes(w))
}

// ---------------------------------------------------------------------------
// Blind checker call
// ---------------------------------------------------------------------------

interface CheckedLine {
  index: number
  correct_stages: string[]
  confidence: 'high' | 'low'
  note?: string
}

// Return the first balanced {...} object in a string, respecting string
// literals and escapes, or null if none. Handles the checker occasionally
// emitting two concatenated objects.
function firstJsonObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

async function checkPlant(target: CheckTarget): Promise<CheckedLine[]> {
  const client = getAnthropicClient()
  const label = `${target.common_name} (${target.scientific_name ?? '—'})`
  // Blind: actions are numbered, WITHOUT their assigned stage.
  const actions = target.lines.map((l, i) => `${i + 1}. ${l.text}`).join('\n')

  const prompt = `Plant: ${label}, type ${target.plant_type ?? 'unknown'}.

This garden app splits the year into six stages by month:
${STAGE_MONTHS}

For EACH care action below, return the stage key(s) whose months are horticulturally correct for doing it to THIS plant. Multiple stages are allowed if the action spans them. If an action is an anytime / as-needed task with no proper season, return an empty array for it.

Actions:
${actions}

Use ONLY these six stage keys in correct_stages: ${JSON.stringify(SEASONAL_KEYS)} (never "late_winter" etc. — late winter is "winter", early autumn is "autumn"). Keep each note under 12 words.

Return ONLY JSON: {"results":[{"index":1,"correct_stages":["autumn"],"confidence":"high","note":"optional short reason"}, ...]} with one entry per numbered action.`

  // One retry: the checker occasionally emits malformed JSON (a raw newline in a
  // verbose note, or trailing prose). A fresh generation almost always fixes it.
  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await client.messages.create({
      model: CURATION_MODEL,
      max_tokens: 2048,
      system:
        'You are a horticultural timing fact-checker. Respond with ONLY valid JSON, no markdown, no code fences, no preamble, no explanation.',
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim()
    // Extract the FIRST balanced {...} object — the checker sometimes emits two
    // concatenated objects or trailing prose, which a naive first-to-last slice
    // would merge into invalid JSON.
    const cleaned = firstJsonObject(raw) ?? raw
    try {
      const parsed = JSON.parse(cleaned) as { results?: CheckedLine[] }
      if (!Array.isArray(parsed.results)) throw new Error('no results array')
      return parsed.results
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`Checker returned invalid JSON after retry: ${lastErr}`)
}

// ---------------------------------------------------------------------------
// Compare assigned vs checked
// ---------------------------------------------------------------------------

interface Disagreement {
  plant: string
  stage: string
  text: string
  checker_stages: string[]
  severity: 'timing' | 'anytime'
  confidence: 'high' | 'low'
  note?: string
  // True when the wrong stage's seasonal_rhythm supports the timing → fix
  // belongs upstream in seasonal_rhythm, not just on the seasonal_care line.
  upstream_candidate?: boolean
}

function compare(target: CheckTarget, checked: CheckedLine[]): Disagreement[] {
  const out: Disagreement[] = []
  const label = `${target.common_name} (${target.scientific_name ?? '—'})`
  for (const [i, line] of target.lines.entries()) {
    const result = checked.find((r) => r.index === i + 1)
    if (!result) continue
    const stages = (result.correct_stages ?? []).filter((s) =>
      SEASONAL_KEYS.includes(s as keyof SeasonalRhythm)
    )
    if (stages.length === 0) {
      // Checker says no proper season — the pass should probably have nulled it.
      out.push({
        plant: label,
        stage: line.stage,
        text: line.text,
        checker_stages: [],
        severity: 'anytime',
        confidence: result.confidence ?? 'low',
        note: result.note,
      })
    } else if (!stages.includes(line.stage)) {
      const rhythmAtStage =
        typeof target.rhythm?.[line.stage] === 'string'
          ? (target.rhythm[line.stage] as string)
          : null
      out.push({
        plant: label,
        stage: line.stage,
        text: line.text,
        checker_stages: stages,
        severity: 'timing',
        confidence: result.confidence ?? 'low',
        note: result.note,
        upstream_candidate: tracesToRhythm(line.text, rhythmAtStage),
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

async function fetchFromDb(limit: number | null): Promise<CheckTarget[]> {
  const db = getSupabaseAdmin()
  // Paginated (standing rule 5). This is a GUARD and its selection is now
  // effectively the whole catalog (seasonal_care is non-null on all 595), so a
  // silent 1000-row cap would stop it checking the tail without saying so.
  // --limit is applied after paging: it is a sampling flag, not a page size.
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
    db
      .from('plants')
      .select(
        'common_name, scientific_name, plant_type, seasonal_care, seasonal_rhythm'
      )
      .not('seasonal_care', 'is', null)
      .order('common_name')
      .order('id')
      .range(from, to)
  )
  const targets = rows
    .map((p) => toTarget(p as never))
    .filter((t): t is CheckTarget => t !== null)
  return limit != null ? targets.slice(0, limit) : targets
}

function fetchFromReport(path: string): CheckTarget[] {
  const doc = JSON.parse(readFileSync(path, 'utf8')) as {
    results?: Array<Record<string, unknown>>
  }
  const rows = doc.results ?? []
  return rows
    .map((r) =>
      toTarget({
        common_name: r['common_name'] as string,
        scientific_name: (r['scientific_name'] as string) ?? null,
        plant_type: (r['plant_type'] as string) ?? null,
        seasonal_care: r['seasonal_care'] as Record<string, unknown> | null,
        seasonal_rhythm: r['seasonal_rhythm'] as Record<string, unknown> | null,
      })
    )
    .filter((t): t is CheckTarget => t !== null)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function pad(n: number, width = 3): string {
  return String(n).padStart(width, ' ')
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const argv = process.argv.slice(2)
  let fromReport: string | null = null
  let limit: number | null = null
  let names: Set<string> | null = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from-report') {
      fromReport = argv[i + 1] ?? null
      if (!fromReport) throw new Error('--from-report requires a file path')
      i++
    } else if (argv[i] === '--limit') {
      const next = argv[i + 1]
      if (!next || !/^\d+$/.test(next))
        throw new Error('--limit must be a positive integer')
      limit = parseInt(next, 10)
      i++
    } else if (argv[i] === '--names') {
      // Re-check specific plants by common/scientific name (comma-separated).
      // For closing the gap on rows that errored in a prior full run.
      const next = argv[i + 1]
      if (!next) throw new Error('--names requires a comma-separated list')
      names = new Set(next.split(',').map((s) => s.trim().toLowerCase()))
      i++
    }
  }

  console.log(
    `\nBlind season-sanity check (${fromReport ? `report: ${fromReport}` : 'DB'})...`
  )
  let targets = fromReport
    ? fetchFromReport(fromReport)
    : await fetchFromDb(limit)
  if (names) {
    targets = targets.filter(
      (t) =>
        names!.has(t.common_name.toLowerCase()) ||
        (t.scientific_name != null &&
          names!.has(t.scientific_name.toLowerCase()))
    )
  }

  if (!targets.length) {
    console.log('No populated seasonal_care found — nothing to check.')
    process.exit(0)
  }
  console.log(`\nChecking ${targets.length} plant(s)...\n`)

  const disagreements: Disagreement[] = []
  const failures: Array<{ name: string; error: string }> = []
  let clean = 0

  for (const [i, target] of targets.entries()) {
    const label = target.scientific_name ?? target.common_name
    const prefix = `[${pad(i + 1)}/${pad(targets.length)}]`
    try {
      process.stdout.write(`${prefix} ${label} … `)
      const checked = await checkPlant(target)
      const diffs = compare(target, checked)
      if (diffs.length) {
        disagreements.push(...diffs)
        console.log(
          `⚠ ${diffs.map((d) => `${d.stage}→${d.checker_stages.join('/') || 'anytime'}`).join(', ')}`
        )
      } else {
        clean++
        console.log('✓')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`✗  ${message}`)
      failures.push({ name: label, error: message })
    }
    if (i < targets.length - 1) await sleep(INTER_PLANT_DELAY_MS)
  }

  console.log('\n─────────────────────────────────────────────────────────────')
  console.log(
    `Checked ${targets.length}: ${clean} clean, ${disagreements.length} line(s) flagged, ${failures.length} errored`
  )

  const timing = disagreements.filter((d) => d.severity === 'timing')
  const anytime = disagreements.filter((d) => d.severity === 'anytime')
  const upstream = timing.filter((d) => d.upstream_candidate)
  if (timing.length) {
    console.log(`\n⚠  Wrong-stage (assigned stage not in checker's set):`)
    for (const d of timing)
      console.log(
        `   • ${d.plant} — assigned ${d.stage}, checker says ${d.checker_stages.join('/')}${d.confidence === 'low' ? ' (low conf)' : ''}${d.upstream_candidate ? ' [UPSTREAM: traces to seasonal_rhythm]' : ''}\n       "${d.text}"${d.note ? `  — ${d.note}` : ''}`
      )
  }
  if (upstream.length) {
    console.log(
      `\n↑  ${upstream.length} flag(s) trace to seasonal_rhythm — log as UPSTREAM corrections (fix the source, or re-distillation regenerates them):`
    )
    for (const d of upstream) console.log(`   • ${d.plant} (${d.stage})`)
  }
  if (anytime.length) {
    console.log(`\n∅  Anytime action given a season (consider null):`)
    for (const d of anytime)
      console.log(`   • ${d.plant} — ${d.stage}: "${d.text}"`)
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const dir = join(__dirname, '..', 'reports')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `seasonal-care-crosscheck-${stamp}.json`)
  writeFileSync(
    file,
    JSON.stringify(
      {
        ran_at: new Date().toISOString(),
        model: CURATION_MODEL,
        source: fromReport ?? 'db',
        checked: targets.length,
        clean,
        upstream_candidates: upstream.length,
        flagged: disagreements,
        failures,
      },
      null,
      2
    )
  )
  console.log(`\nReport written to ${file}`)

  if (failures.length) process.exit(1)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
