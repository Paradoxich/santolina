/**
 * The editorial pass — the step that decides whether a row is finished.
 *
 * `is_curated = true` is the catalog's only claim that a human-grade judgment
 * was made about a plant (§3). Every other pass drafts or fact-checks; this
 * one signs off. Ana's standing ruling (July 28 2026) is that an agent owns
 * this pass, including flipping the flag, so it is automated here rather than
 * left as a queue nobody works.
 *
 * The bar is in lib/editorial-standard.ts, stated once. Three criteria:
 *   1. the image shows the right plant
 *   2. the description reads well and on-brand
 *   3. the style and space tags make product sense
 *
 * HOW EACH CRITERION IS DECIDED
 *
 * 1. Image — mechanically, from `image_pick_confidence`, with NO vision call.
 *    The image pass already made this judgment per row and persisted it;
 *    re-asking pays twice for the same answer. Only `high` clears. A `medium`
 *    row is not a failure, it is an unresolved question, and it is reported as
 *    such: a targeted vision re-check of just those rows is the cheap way to
 *    clear them.
 *
 * 2. Description — a judgment call, so a model makes it. When the model finds
 *    the copy weak it proposes a rewrite. That is allowed here, unlike in the
 *    cross-checks, for the same reason curate-styles is allowed to overwrite
 *    style_tags: the existing text is itself an AI draft (curate-plants), and
 *    `is_curated = false` is precisely the record that nobody has signed off
 *    on it. Replacing a weaker draft with a better one is not a new kind of
 *    authorship. Every before/after goes in the report and the catalog is
 *    backed up first, so the whole pass is reversible.
 *
 *    THE REWRITE IS NEVER JUDGED BY THE MODEL THAT WROTE IT. A second, blind
 *    call sees only the plant's identity and the candidate text, never the old
 *    description and never the first model's reasoning, and decides whether it
 *    clears the bar. Self-approval would make the whole pass circular, which
 *    is the same argument the blind cross-checks rest on (§20).
 *
 * 3. Tags — the same judging call as 2. An empty style_tags list is a valid,
 *    deliberate answer (the July 2026 re-tag pass made 33 plants
 *    style-neutral) and is never treated as a defect.
 *
 * THE BAR IS STRICT, BY DECISION. Any unresolved doubt leaves the row
 * `is_curated = false` with its reasons recorded. A flagged row is not a
 * failure of the pass; it is the pass working. Expect a real remainder.
 *
 * Stamps `editorial_checked_at` on every row it reaches a verdict on, approved
 * or not (migration 20260728220852). Without that, a held-back row is
 * indistinguishable from an unexamined one and every run re-bills the whole
 * remainder.
 *
 * Usage (from apps/web):
 *   # Smoke test first — ALWAYS, per the pipeline rules:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-editorial.ts \
 *     --round 8 --limit 3 --dry-run
 *   # Full run:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-editorial.ts --round 8
 *   # Only rows never judged:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/curate-editorial.ts --round 8 --new-only
 *
 * Flags:
 *   --round | --ids | --all   Scope. Mandatory, no default (scripts/scope.ts).
 *   --limit N                 Cap the rows processed.
 *   --new-only                Only rows never judged (editorial_checked_at IS NULL).
 *   --dry-run                 Call Claude, print and report; write nothing.
 *
 * Run scripts/backup-catalog.ts first. restore-catalog.ts is the undo.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import {
  IMAGE_CONFIDENCE_REQUIRED,
  BANNED_PUNCTUATION,
  DESCRIPTION_MIN_CHARS,
  DESCRIPTION_MAX_CHARS,
  VOICE_PROMPT,
  TAGS_PROMPT,
} from '../lib/editorial-standard'
import { requireScope, scopeIds, describeScope } from './scope'
import {
  CLEARED_PREVIOUSLY,
  mergeFindings,
  type CriterionVerdict,
  type Finding,
} from './editorial-report'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const INTER_PLANT_DELAY_MS = 1200
const REPORTS_DIR = join(process.cwd(), 'reports')

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  plant_type_label: string | null
  description: string | null
  style_tags: string[] | null
  space_types: string[] | null
  bloom_months: number[] | null
  bloom_color: string[] | null
  foliage_color: string | null
  is_greenery: boolean | null
  height_min_cm: number | null
  height_max_cm: number | null
  image_url: string | null
  image_url_curated: string | null
  image_pick_confidence: string | null
  image_verified_at: string | null
  is_curated: boolean | null
  editorial_checked_at: string | null
  editorial_image_at: string | null
  editorial_description_at: string | null
  editorial_tags_at: string | null
}

// The report's data model and merge rules live in ./editorial-report so they
// can be unit-tested — this file exits on import (requireScope, main).

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const NEW_ONLY = args.includes('--new-only')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : null

const SCOPE = requireScope(
  'curate-editorial',
  'This pass bills Claude once or twice per row and flips is_curated, the ' +
    "catalog's only sign-off flag. An unscoped run would re-judge every plant " +
    'in the catalog.'
)

// ---------------------------------------------------------------------------
// Criterion 1 — image, decided mechanically
// ---------------------------------------------------------------------------

function judgeImage(p: PlantRow): {
  verdict: CriterionVerdict
  reason: string
} {
  const hasImage = Boolean(p.image_url_curated || p.image_url)
  if (!hasImage)
    return { verdict: 'fail', reason: 'no image at all (upstream has none)' }

  const conf = p.image_pick_confidence
  if (!conf)
    return {
      verdict: 'open',
      reason: 'no image_pick_confidence — the image pass never judged this row',
    }
  if (conf === IMAGE_CONFIDENCE_REQUIRED)
    return { verdict: 'pass', reason: `image pass: ${conf} confidence` }
  if (conf === 'medium')
    return {
      verdict: 'open',
      // Two very different situations wear the same confidence, and telling
      // them apart is the difference between "one cheap command clears this"
      // and "this needs a photograph nobody has yet".
      reason: p.image_verified_at
        ? 'image pass: medium confidence, and it SURVIVED the targeted ' +
          're-check (pick-plant-images --verify) — the species could not be ' +
          'confirmed from this photo. Needs a new candidate image, not ' +
          'another check.'
        : 'image pass: medium confidence — plausible but uncommitted, so the ' +
          'hero is unverified. A targeted vision re-check clears this ' +
          '(pick-plant-images --verify).',
    }
  return { verdict: 'fail', reason: `image pass: ${conf} confidence` }
}

// ---------------------------------------------------------------------------
// Mechanical copy checks — cheap, and they never need a model
// ---------------------------------------------------------------------------

function mechanicalCopyFault(text: string): string | null {
  if (BANNED_PUNCTUATION.test(text))
    return 'contains an em or en dash, which is banned in user-facing copy'
  if (text.length < DESCRIPTION_MIN_CHARS)
    return `description is ${text.length} chars, under the ${DESCRIPTION_MIN_CHARS} minimum`
  if (text.length > DESCRIPTION_MAX_CHARS)
    return `description is ${text.length} chars, over the ${DESCRIPTION_MAX_CHARS} maximum`
  return null
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`)
  }
}

async function callClaude(
  system: string,
  prompt: string,
  maxTokens: number
): Promise<Record<string, unknown>> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
  return parseJson(raw)
}

const JSON_SYSTEM =
  'You are a careful editor for a gardening product. Respond with ONLY valid ' +
  'JSON, no markdown, no code fences, no preamble, no explanation.'

/** Pass 1 — read the row, judge copy and tags, propose a rewrite if needed. */
async function reviewPlant(p: PlantRow) {
  const prompt = `Judge this plant entry against the editorial bar. Be strict: this decides whether the row is marked as reviewed.

PLANT DATA
${JSON.stringify(
  {
    common_name: p.common_name,
    scientific_name: p.scientific_name,
    plant_type: p.plant_type_label,
    description: p.description,
    style_tags: p.style_tags,
    space_types: p.space_types,
    bloom_months: p.bloom_months,
    bloom_color: p.bloom_color,
    foliage_color: p.foliage_color,
    is_greenery: p.is_greenery,
    height_cm: [p.height_min_cm, p.height_max_cm],
  },
  null,
  2
)}

${VOICE_PROMPT}

${TAGS_PROMPT}

Answer three things:

1. "description_verdict": "ok" if the description already clears the voice bar,
   "weak" if it does not. Judge the writing, not the botany: another pass
   verifies the facts. A description that contradicts the structured data above
   (wrong season, wrong colour, wrong size) IS an editorial defect, because a
   reader can see the contradiction.
2. "description_reason": one sentence naming a defect that is actually present
   in the text above. Punctuation and length are checked mechanically before
   you see this, so NEVER cite dashes, hyphens or length as your reason: if you
   claim a dash that is not there, the reason is worthless to the person
   reading the report. Quote the exact words you object to.
3. "rewrite": ONLY if weak, the replacement description, obeying the voice
   rules exactly. Keep every concrete fact from the original that is not
   contradicted by the structured data. Do not invent facts. If the
   description is ok, set this to null.
4. "tags_verdict": "ok" or "flag", and "tags_reason": one sentence naming the
   specific tag that is wrong. Remember an empty style_tags list is a valid
   deliberate answer, never a defect.

Respond with ONLY valid JSON:
{"description_verdict": "ok"|"weak", "description_reason": string, "rewrite": string|null, "tags_verdict": "ok"|"flag", "tags_reason": string}`

  const parsed = await callClaude(JSON_SYSTEM, prompt, 900)

  const dv = parsed.description_verdict
  const tv = parsed.tags_verdict
  if (dv !== 'ok' && dv !== 'weak')
    throw new Error(`description_verdict was ${JSON.stringify(dv)}`)
  if (tv !== 'ok' && tv !== 'flag')
    throw new Error(`tags_verdict was ${JSON.stringify(tv)}`)
  const rewrite = parsed.rewrite
  if (rewrite !== null && typeof rewrite !== 'string')
    throw new Error(`rewrite was neither string nor null`)

  return {
    descriptionVerdict: dv as 'ok' | 'weak',
    descriptionReason: String(parsed.description_reason ?? ''),
    rewrite: (rewrite as string | null) ?? null,
    tagsVerdict: tv as 'ok' | 'flag',
    tagsReason: String(parsed.tags_reason ?? ''),
  }
}

/**
 * Pass 2 — blind judgment of a candidate rewrite.
 *
 * Sees the plant's identity and the candidate text. NOT the old description,
 * NOT pass 1's reasoning. If it knew the text was a rewrite it would be
 * grading its own homework, and the approval would mean nothing.
 */
async function judgeRewrite(p: PlantRow, candidate: string) {
  const prompt = `Here is a plant description from a gardening product. Judge whether it is fit to publish.

PLANT
${JSON.stringify(
  {
    common_name: p.common_name,
    scientific_name: p.scientific_name,
    plant_type: p.plant_type_label,
    bloom_months: p.bloom_months,
    bloom_color: p.bloom_color,
    foliage_color: p.foliage_color,
    height_cm: [p.height_min_cm, p.height_max_cm],
  },
  null,
  2
)}

DESCRIPTION
${JSON.stringify(candidate)}

${VOICE_PROMPT}

Does this description clear the bar, and is it consistent with the structured
plant data above? Be strict, and judge only what is written here.

Punctuation and length have already been checked mechanically before you saw
this text, so NEVER give dashes, hyphens or length as your reason. The text in
front of you provably contains no em or en dash; claiming one is a false
report that costs a good description its approval. Quote the exact words you
object to, so the reason can be checked against the text.

Respond with ONLY valid JSON: {"verdict": "ok"|"weak", "reason": string}`

  const parsed = await callClaude(JSON_SYSTEM, prompt, 400)
  const v = parsed.verdict
  if (v !== 'ok' && v !== 'weak')
    throw new Error(`blind verdict was ${JSON.stringify(v)}`)
  return { verdict: v as 'ok' | 'weak', reason: String(parsed.reason ?? '') }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function readPreviousFindings(jsonPath: string): Finding[] {
  try {
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
      findings?: Finding[]
    }
    return parsed.findings ?? []
  } catch {
    return []
  }
}

function writeReport(current: Finding[], scopeLabel: string) {
  const slug = scopeLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const jsonPath = join(REPORTS_DIR, `editorial-${slug}.json`)
  const mdPath = join(REPORTS_DIR, `editorial-${slug}.md`)

  const findings = mergeFindings(readPreviousFindings(jsonPath), current)
  writeFileSync(jsonPath, JSON.stringify({ findings }, null, 2))

  const approved = findings.filter((f) => f.approved)
  const held = findings.filter((f) => !f.approved)
  const rewritten = findings.filter((f) => f.description.rewritten)

  const lines: string[] = [
    '# Editorial pass',
    '',
    `Judged **${findings.length}** plant(s). Approved **${approved.length}**, held back **${held.length}**.`,
    '',
    `Descriptions rewritten: **${rewritten.length}**.`,
    '',
    '## Held back',
    '',
  ]
  for (const f of held) {
    lines.push(`### ${f.common_name} (${f.scientific_name ?? 'no name'})`)
    for (const b of f.blockers) lines.push(`- ${b}`)
    lines.push('')
  }
  lines.push('## Rewritten descriptions', '')
  for (const f of rewritten) {
    lines.push(`### ${f.common_name}`)
    lines.push(`- why: ${f.description.reason}`)
    lines.push(
      `- blind judgment: ${f.description.blind_verdict} — ${f.description.blind_reason}`
    )
    lines.push('', '**before**', '', `> ${f.description.before ?? ''}`, '')
    lines.push('**after**', '', `> ${f.description.after ?? ''}`, '')
  }
  writeFileSync(mdPath, lines.join('\n'))
  console.log(`\nReport: ${jsonPath}\n        ${mdPath}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const db = getSupabaseAdmin()
  const ids = scopeIds(SCOPE)
  console.log(describeScope(SCOPE, ids))

  const rows = await fetchAllRows<PlantRow>((from, to) => {
    let q = db
      .from('plants')
      .select(
        'id, common_name, scientific_name, plant_type_label, description, style_tags, space_types, bloom_months, bloom_color, foliage_color, is_greenery, height_min_cm, height_max_cm, image_url, image_url_curated, image_pick_confidence, image_verified_at, is_curated, editorial_checked_at, editorial_image_at, editorial_description_at, editorial_tags_at'
      )
      .order('id')
      .range(from, to)
    if (ids) q = q.in('id', ids)
    if (NEW_ONLY) q = q.is('editorial_checked_at', null)
    return q
  })

  const selected = LIMIT ? rows.slice(0, LIMIT) : rows
  console.log(
    `Judging ${selected.length} plant(s)${NEW_ONLY ? ' (never judged)' : ''}${
      DRY_RUN ? ' — DRY RUN, no writes' : ''
    }\n`
  )

  const findings: Finding[] = []
  const failed: string[] = []

  for (const [i, p] of selected.entries()) {
    const tag = `[${i + 1}/${selected.length}] ${p.common_name}`
    try {
      // ONLY judge what is actually open. Each criterion carries its own
      // stamp (migration 20260729140000), so a row whose photo changed has
      // exactly one open criterion — and that one is decided mechanically,
      // for free, from the confidence the vision pass already persisted.
      //
      // This is the whole point of splitting the verdict. Under the single
      // flag, removing one style tag from Rowan re-opened the description and
      // the pass rewrote copy nobody had asked it to touch.
      const needImage = !p.editorial_image_at
      const needDescription = !p.editorial_description_at
      const needTags = !p.editorial_tags_at

      if (!needImage && !needDescription && !needTags) {
        console.log(`  ${tag}: already clear on all three criteria, skipping`)
        // Record the clearance rather than `continue`-ing. A skip emits no
        // finding, so mergeFindings has nothing to overwrite the row's
        // PREVIOUS finding with and carries the old verdict forward intact —
        // which means a row held in one run and cleared in the next still
        // reads as held in the report, quoting text the database no longer
        // has. Round 10 hit exactly that: Cyclamen persicum was cleared by an
        // --ids run, and the next --round run reported it held against its
        // pre-rewrite description, over a database that said is_curated.
        //
        // This is the mirror of the bug mergeFindings exists to fix. Merging
        // stops a partial re-run DESTROYING findings; the same merge preserves
        // a stale one unless a cleared row states its clearance out loud.
        const cleared = { verdict: 'pass', reason: CLEARED_PREVIOUSLY } as const
        findings.push({
          id: p.id,
          common_name: p.common_name,
          scientific_name: p.scientific_name,
          image: cleared,
          description: { ...cleared, rewritten: false },
          tags: cleared,
          approved: true,
          blockers: [],
        })
        continue
      }

      const image = needImage
        ? judgeImage(p)
        : ({ verdict: 'pass', reason: CLEARED_PREVIOUSLY } as const)

      // The model is called only when a criterion it decides is open. A row
      // needing just the image costs nothing at all.
      const review =
        needDescription || needTags
          ? await reviewPlant(p)
          : {
              descriptionVerdict: 'ok' as const,
              descriptionReason: CLEARED_PREVIOUSLY,
              tagsVerdict: 'ok' as const,
              tagsReason: CLEARED_PREVIOUSLY,
              rewrite: null,
            }

      const description: Finding['description'] = {
        verdict: 'pass',
        reason: review.descriptionReason,
        rewritten: false,
      }

      if (!needDescription) {
        // Cleared previously and unchanged since — the trigger would have
        // re-opened it otherwise.
      } else if (review.descriptionVerdict === 'ok') {
        // Even an approved description has to clear the mechanical rules.
        const fault = mechanicalCopyFault(p.description ?? '')
        if (fault) {
          description.verdict = 'fail'
          description.reason = fault
        }
      } else if (!review.rewrite) {
        description.verdict = 'fail'
        description.reason = `${review.descriptionReason} (no rewrite offered)`
      } else {
        const fault = mechanicalCopyFault(review.rewrite)
        if (fault) {
          description.verdict = 'fail'
          description.reason = `rewrite rejected: ${fault}`
        } else {
          const blind = await judgeRewrite(p, review.rewrite)
          description.blind_verdict = blind.verdict
          description.blind_reason = blind.reason
          if (blind.verdict === 'ok') {
            description.verdict = 'pass'
            description.rewritten = true
            description.before = p.description
            description.after = review.rewrite
          } else {
            // Keep the original text and hold the row. A rewrite the blind
            // judge would not publish is not an improvement we can assert.
            //
            // The rejected candidate is still recorded. Without it the report
            // asserts "the rewrite was bad" with nothing to check it against,
            // and a blind judge inventing a fault (it claimed em dashes that
            // the mechanical check had already proven absent) reads exactly
            // like a real rejection.
            description.verdict = 'fail'
            description.reason = `weak, and the rewrite did not clear the blind judgment: ${blind.reason}`
            description.before = p.description
            description.after = review.rewrite
          }
        }
      }

      const tags = {
        verdict: (review.tagsVerdict === 'ok'
          ? 'pass'
          : 'fail') as CriterionVerdict,
        reason: needTags ? review.tagsReason : CLEARED_PREVIOUSLY,
      }

      const blockers: string[] = []
      if (image.verdict !== 'pass') blockers.push(`image: ${image.reason}`)
      if (description.verdict !== 'pass')
        blockers.push(`description: ${description.reason}`)
      if (tags.verdict !== 'pass') blockers.push(`tags: ${tags.reason}`)

      const approved = blockers.length === 0

      findings.push({
        id: p.id,
        common_name: p.common_name,
        scientific_name: p.scientific_name,
        image,
        description,
        tags,
        approved,
        blockers,
      })

      console.log(
        `  ${tag}: ${approved ? 'APPROVE' : 'hold'}${
          description.rewritten ? ' (description rewritten)' : ''
        }${approved ? '' : ` — ${blockers.join('; ')}`}`
      )

      if (!DRY_RUN) {
        const now = new Date().toISOString()
        const patch: Record<string, unknown> = {
          editorial_checked_at: now,
        }
        if (description.rewritten) patch.description = description.after

        // Each criterion that PASSED gets its stamp. A criterion that failed
        // is left NULL, which is what makes the next run re-judge exactly it
        // and nothing else.
        //
        // These are written in the same statement as the description rewrite
        // on purpose: the trigger skips a criterion whose stamp this UPDATE
        // changes, so the rewrite cannot invalidate the approval it is part of.
        if (image.verdict === 'pass') patch.editorial_image_at = now
        if (description.verdict === 'pass') patch.editorial_description_at = now
        if (tags.verdict === 'pass') patch.editorial_tags_at = now
        if (approved) patch.is_curated = true

        const { error } = await db.from('plants').update(patch).eq('id', p.id)
        if (error) throw new Error(`DB write failed: ${error.message}`)
      }
    } catch (err) {
      // Fail loud, never fall back to a default verdict: a fabricated
      // "approve" is exactly the failure mode is_curated exists to prevent.
      failed.push(`${p.common_name} — ${(err as Error).message}`)
      console.error(`  ${tag}: FAILED — ${(err as Error).message}`)
    }
    if (i < selected.length - 1) await sleep(INTER_PLANT_DELAY_MS)
  }

  const label = SCOPE.kind === 'round' ? SCOPE.label : SCOPE.kind
  if (findings.length) writeReport(findings, label)

  const approved = findings.filter((f) => f.approved).length
  const rewritten = findings.filter((f) => f.description.rewritten).length
  console.log(
    `\nDone. ${findings.length} judged, ${approved} approved, ${
      findings.length - approved
    } held back, ${rewritten} description(s) rewritten.${
      DRY_RUN ? ' (dry run — nothing written)' : ''
    }`
  )

  // Why rows were held, most common first — the actionable half of the run.
  const reasons = new Map<string, number>()
  for (const f of findings)
    for (const b of f.blockers) {
      const key =
        b.split(':')[0] + ': ' + b.split(': ').slice(1).join(': ').slice(0, 60)
      reasons.set(key, (reasons.get(key) ?? 0) + 1)
    }
  if (reasons.size) {
    console.log('\nBlockers:')
    for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1]))
      console.log(`  ${String(n).padStart(3)}  ${reason}`)
  }

  if (failed.length) {
    console.log(`\n${failed.length} failure(s):`)
    for (const f of failed) console.log(`  ${f}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
