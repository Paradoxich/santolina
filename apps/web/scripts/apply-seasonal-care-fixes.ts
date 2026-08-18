/**
 * Apply the editorial decisions from the cross-check queue back into
 * `seasonal_care`. Reads the reviewed CSV (see cross-check-seasonal-care.ts and
 * the `seasonal-care-editorial-queue.csv` it feeds) and applies one guarded
 * edit per row.
 *
 * Guarded, reversible-by-record, same discipline as the botanical corrections
 * (docs/curation.md#botanical-cross-check, docs/architecture.md#plant-type-label):
 * - Verifies the CSV's `line` still matches the DB before touching a row; a row
 *   whose stored line has since changed is STALE and skipped (never clobbered).
 * - A `move` into an already-occupied target stage is skipped and flagged, not
 *   overwritten.
 * - Logs every before → after. Never flips `is_curated` — editorial timing
 *   fixes are not a botanical re-verification.
 *
 * Decisions (CSV `decision` column, `value` column):
 *   keep             leave the line where it is (no-op)
 *   null             drop the line from its current stage
 *   move    value    relocate the line verbatim to stage `value` (one of the
 *                    six keys); refuses an already-occupied target
 *   edit    value    replace the line text with `value`, same stage
 *   replace value    move + reword in one step: `value` is
 *                    "<target stage>|<new text>" — drops the current stage,
 *                    writes the new text into the target, and (unlike `move`)
 *                    is explicitly allowed to overwrite an occupied target.
 *                    For the case where the checker's suggested target is
 *                    occupied by a weaker line than the corrected one — an
 *                    editorial call, not a silent clobber, since it only
 *                    fires on a row you hand-authored with this decision.
 *
 * Usage (from apps/web):
 *   # Preview (no writes):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-seasonal-care-fixes.ts --dry-run
 *   # Apply:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-seasonal-care-fixes.ts
 *   # Custom file:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/apply-seasonal-care-fixes.ts --file reports/<name>.csv
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import type { SeasonalCare, SeasonalRhythm } from '../lib/plants-db'
import { withRunRecord, type Witness } from './run-provenance'

const SEASONAL_KEYS: Array<keyof SeasonalRhythm> = [
  'early_spring',
  'late_spring',
  'summer',
  'late_summer',
  'autumn',
  'winter',
]
const STAGE_SET = new Set<string>(SEASONAL_KEYS)

const DEFAULT_FILE = 'reports/seasonal-care-editorial-queue.csv'

// ---------------------------------------------------------------------------
// Minimal RFC-4180 CSV parser (fields may be quoted and contain commas)
// ---------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') field += c
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

interface Decision {
  rowNum: string
  plant: string
  plant_id: string
  current_stage: string
  line: string
  decision: string
  value: string
}

function loadDecisions(file: string): Decision[] {
  const abs = file.startsWith('/') ? file : join(__dirname, '..', file)
  const rows = parseCsv(readFileSync(abs, 'utf8')).filter((r) =>
    r.some((c) => c.trim())
  )
  if (!rows.length) throw new Error(`Empty CSV: ${abs}`)
  const header = rows[0]!.map((h) => h.trim())
  const col = (name: string) => {
    const i = header.indexOf(name)
    if (i < 0) throw new Error(`CSV missing "${name}" column`)
    return i
  }
  const iRow = col('row')
  const iPlant = col('plant')
  const iId = col('plant_id')
  const iStage = col('current_stage')
  const iLine = col('line')
  const iDec = col('decision')
  const iVal = col('value')
  return rows.slice(1).map((r) => ({
    rowNum: (r[iRow] ?? '').trim(),
    plant: (r[iPlant] ?? '').trim(),
    plant_id: (r[iId] ?? '').trim(),
    current_stage: (r[iStage] ?? '').trim(),
    line: (r[iLine] ?? '').trim(),
    decision: (r[iDec] ?? '').trim().toLowerCase(),
    value: (r[iVal] ?? '').trim(),
  }))
}

// Light copy-rule warnings on new/edited text.
function copyWarnings(text: string): string[] {
  const w: string[] = []
  if (text.split(/\s+/).length > 12) w.push('over 12 words')
  if (text.length > 90) w.push('over ~90 chars')
  if (/[—–]/.test(text)) w.push('contains em/en dash')
  if (/\bfeed(s|ing)?\b/i.test(text)) w.push('uses "feed"')
  if (/\bfall\b/i.test(text)) w.push('uses "fall"')
  return w
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const fileArg = argv.indexOf('--file')
  const file = fileArg >= 0 ? (argv[fileArg + 1] ?? DEFAULT_FILE) : DEFAULT_FILE

  const decisions = loadDecisions(file)
  console.log(
    `\nLoaded ${decisions.length} decision(s) from ${file}${dryRun ? ' [DRY RUN]' : ''}\n`
  )

  const db = getSupabaseAdmin()

  // Group by plant so multiple edits to one plant accumulate into one write.
  const byPlant = new Map<string, Decision[]>()
  for (const d of decisions) {
    if (d.decision === 'keep' || !d.decision) continue
    if (!d.plant_id) {
      console.log(`⚠ row ${d.rowNum} (${d.plant}): no plant_id — skipped`)
      continue
    }
    if (!byPlant.has(d.plant_id)) byPlant.set(d.plant_id, [])
    byPlant.get(d.plant_id)!.push(d)
  }

  let applied = 0
  const kept = decisions.filter(
    (d) => d.decision === 'keep' || !d.decision
  ).length
  const skipped: string[] = []
  const warnings: string[] = []

  const runOptions = {
    step: 'apply-seasonal-care-fixes',
    // One column, rewritten whole: the patch is normalised to the full
    // six-key shape before it is written, so a partial decision cannot leave a
    // half-populated object behind.
    writeSet: ['seasonal_care'],
    // A jsonb value column, and this pass writes no stamp — notably it does NOT
    // clear seasonal_care_checked_at, so the cross-check's certification
    // survives a hand edit it never saw. That is worth naming rather than
    // inheriting: it is the opposite choice from apply-native-to-fixes next
    // door, which nulls its guard stamp for exactly this reason.
    evidence: [
      {
        kind: 'row-touched',
        covers: 'seasonal_care',
        table: 'plants',
        column: 'updated_at',
      },
    ] as Witness[],
    scope: `${decisions.length} hand-authored decision(s) from ${file}`,
    // Hand-authored copy: the decision file is the recipe.
    recipe: {
      model: 'human',
      template: readFileSync(
        file.startsWith('/') ? file : join(__dirname, '..', file),
        'utf8'
      ),
      ingredients: {},
      decoding: {},
    },
  }

  const applyAll = async (wrote: (id: string) => void) => {
    for (const [plantId, ds] of byPlant) {
      // Fetch the current row once (this is the guard baseline).
      const { data, error } = await db
        .from('plants')
        .select('seasonal_care')
        .eq('id', plantId)
        .single()
      if (error || !data) {
        skipped.push(
          `${ds[0]!.plant}: fetch failed (${error?.message ?? 'no row'})`
        )
        continue
      }
      const original = (data.seasonal_care ?? {}) as Record<
        string,
        string | null
      >
      const working: Record<string, string | null> = { ...original }
      const pending: string[] = [] // ✓ lines for this plant, printed after write
      let plantApplied = 0

      for (const d of ds) {
        const label = `row ${d.rowNum} (${d.plant})`
        if (!STAGE_SET.has(d.current_stage)) {
          skipped.push(`${label}: bad current_stage "${d.current_stage}"`)
          continue
        }
        // Guard: the stored line must still match what the CSV was built from.
        const stored = (original[d.current_stage] ?? '').trim()
        if (stored !== d.line) {
          skipped.push(
            `${label}: STALE — DB line "${stored}" != CSV line "${d.line}"`
          )
          continue
        }
        if (d.decision === 'null') {
          working[d.current_stage] = null
          pending.push(`✓ ${label}: ${d.current_stage} → null`)
          plantApplied++
        } else if (d.decision === 'edit') {
          if (!d.value) {
            skipped.push(`${label}: edit with empty value`)
            continue
          }
          for (const w of copyWarnings(d.value))
            warnings.push(`${label}: ${w} — "${d.value}"`)
          working[d.current_stage] = d.value
          pending.push(`✓ ${label}: ${d.current_stage} text → "${d.value}"`)
          plantApplied++
        } else if (d.decision === 'move') {
          const target = d.value
          if (!STAGE_SET.has(target)) {
            skipped.push(`${label}: move to invalid stage "${target}"`)
            continue
          }
          if (target === d.current_stage) {
            skipped.push(`${label}: move to same stage — no-op`)
            continue
          }
          if ((working[target] ?? null) !== null) {
            skipped.push(
              `${label}: target ${target} already occupied ("${working[target]}") — not clobbered`
            )
            continue
          }
          working[target] = d.line
          working[d.current_stage] = null
          pending.push(`✓ ${label}: ${d.current_stage} → ${target}`)
          plantApplied++
        } else if (d.decision === 'replace') {
          const sep = d.value.indexOf('|')
          if (sep < 0) {
            skipped.push(`${label}: replace value must be "stage|new text"`)
            continue
          }
          const target = d.value.slice(0, sep).trim()
          const newText = d.value.slice(sep + 1).trim()
          if (!STAGE_SET.has(target)) {
            skipped.push(`${label}: replace to invalid stage "${target}"`)
            continue
          }
          if (!newText) {
            skipped.push(`${label}: replace with empty text`)
            continue
          }
          for (const w of copyWarnings(newText))
            warnings.push(`${label}: ${w} — "${newText}"`)
          const overwritten = working[target]
          working[target] = newText
          if (target !== d.current_stage) working[d.current_stage] = null
          pending.push(
            `✓ ${label}: ${d.current_stage} → ${target} (reworded)${
              overwritten ? ` [replaced: "${overwritten}"]` : ''
            }`
          )
          plantApplied++
        } else {
          skipped.push(`${label}: unknown decision "${d.decision}"`)
        }
      }

      if (!plantApplied) continue

      if (!dryRun) {
        // Normalize to the full six-key shape.
        const patch = {} as SeasonalCare
        for (const k of SEASONAL_KEYS) patch[k] = working[k] ?? null
        const { error: upErr } = await db
          .from('plants')
          .update({ seasonal_care: patch })
          .eq('id', plantId)
        if (upErr) {
          skipped.push(`${ds[0]!.plant}: write failed (${upErr.message})`)
          continue
        }
        wrote(plantId)
      }
      for (const line of pending) console.log(line)
      applied += plantApplied
    }
  }

  // A dry run opens NO run: it validates the decisions and writes nothing.
  if (dryRun) {
    await applyAll(() => {})
  } else {
    await withRunRecord(runOptions, (run) => applyAll((id) => run.wrote(id)))
  }

  console.log('\n─────────────────────────────────────────────────────────────')
  console.log(
    `${dryRun ? 'Would apply' : 'Applied'} ${applied} change(s) · ${kept} kept · ${skipped.length} skipped`
  )
  if (warnings.length) {
    console.log(`\n⚠ copy warnings (applied anyway — your call):`)
    for (const w of warnings) console.log(`   ${w}`)
  }
  if (skipped.length) {
    console.log(`\n⤫ skipped:`)
    for (const s of skipped) console.log(`   ${s}`)
  }
  if (dryRun) console.log('\nDRY RUN — no rows written.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
