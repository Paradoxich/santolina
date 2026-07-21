/**
 * Pick the best hero photo for every catalog plant, with an AI vision pass.
 *
 * THE PROBLEM: plants.image_url is whatever Trefle listed first in its
 * highest-priority category. That is not a curation decision — roughly 89% of
 * our candidate images are PlantNet user submissions, so today's heroes include
 * herbarium sheets, hands holding a leaf, nursery pots with plastic labels, and
 * out-of-focus phone photos. The Explore cards are image-forward, so this is
 * the most visible quality gap in the catalog.
 *
 * THE PASS, in three stages:
 *
 *   1. Shortlist (free). plants.image_candidates carries Trefle's per-image
 *      category label, recovered by scripts/recover-image-categories.ts. The
 *      "flower" and "habit" categories are, by construction, bloom shots and
 *      whole-plant shots — exactly what we want a hero to be. That takes ~28
 *      candidates down to ~10 without touching the network.
 *
 *   2. Probe (cheap). Each shortlisted URL gets a ranged request that reads
 *      only the file header: it confirms the link is alive and serving a real
 *      image, and measures the resolution. Resolution has to be measured here
 *      because the vision model cannot see it — it is shown a resized copy, so
 *      a well-composed 320px photo looks identical to a 2000px one and would
 *      win a pick it cannot deliver on a full-bleed card. This also closes the
 *      dead-link gap: broken URLs currently fall through to the placeholder
 *      with nothing reporting that they broke.
 *
 *   3. Pick (the only paid step). Up to MAX_FOR_VISION survivors go to Claude
 *      in one batched request per plant, alongside the incumbent image_url, and
 *      it picks the nicest and most representative. Sharpness and composition
 *      are judged here rather than computed, because that needs a full decode
 *      to approximate and the model reads it directly off the image.
 *
 * OWNERSHIP: writes image_url_curated, never image_url. Trefle re-seeds and
 * this pass therefore cannot clobber each other (upsert_trefle_plant does not
 * reference these columns), the same arrangement as hardiness_rating.
 *
 * PROTECTION: by default only rows with image_checked_at IS NULL are processed,
 * so a re-run costs nothing and an interrupted run resumes exactly where it
 * stopped. --recheck reprocesses everything.
 *
 * REVIEW: every pick carries a confidence and a one-line reason. Low-confidence
 * picks are the review queue — same model as native_to QA, where the guard
 * flags rather than blocks. Nothing here is treated as editorial sign-off.
 *
 * Usage (from apps/web):
 *   # See the shortlists and what probing rejects, spend nothing:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/pick-plant-images.ts --dry-run --limit 20
 *
 *   # Real run (batched, ~50% cheaper, usually well under an hour):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/pick-plant-images.ts
 *
 *   # Reattach to a batch if polling was interrupted — nothing is lost:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/pick-plant-images.ts --resume msgbatch_123
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/pick-plant-images.ts --recheck
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, VISION_MODEL } from '../lib/anthropic-client'
import { fetchAllRows } from '../lib/paginate'
import { probeImage, type ProbeResult } from '../lib/image-probe'
import {
  MAX_FOR_VISION,
  rankAndCap,
  shortlist,
  type ImageCandidate,
  type Measured,
} from '../lib/image-shortlist'

// Below this a photo cannot fill an Explore card without visible softening.
const MIN_LONG_EDGE = 500
// Beyond this the subject cannot survive the card's crop.
const MAX_ASPECT_RATIO = 2.5
const PROBE_CONCURRENCY = 6
const POLL_INTERVAL_MS = 30_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 3) => String(n).padStart(w, ' ')

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  bloom_months: number[] | null
  image_url: string | null
  image_candidates: ImageCandidate[] | null
}

interface PickResult {
  chosen_label: string | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

/**
 * What each batched request was actually built from.
 *
 * The batch response gives back a label and nothing else, so we have to know
 * the exact list that label refers to. Re-deriving it at collection time
 * would be wrong as well as wasteful: probing is a live network call, so a URL
 * that was reachable when the request was built but 404s an hour later would
 * shorten the list and silently shift every index after it — writing a
 * confidently-worded pick that points at the wrong photograph. Persisting the
 * list makes the mapping exact and lets --resume work from a cold start.
 */
interface Manifest {
  batchId: string
  createdAt: string
  model: string
  plants: Record<
    string,
    { commonName: string; incumbent: string | null; images: Measured[] }
  >
}

// Gitignored alongside /reports — run artefacts, not source.
const REPORTS_DIR = join(process.cwd(), 'reports')
const MANIFEST_DIR = join(REPORTS_DIR, 'image-pass')
const JSON_OUT = join(REPORTS_DIR, 'image-picks.json')
const MD_OUT = join(REPORTS_DIR, 'image-picks.md')

function manifestPath(batchId: string): string {
  return join(MANIFEST_DIR, `${batchId}.json`)
}

function saveManifest(manifest: Manifest): string {
  mkdirSync(MANIFEST_DIR, { recursive: true })
  const path = manifestPath(manifest.batchId)
  writeFileSync(path, JSON.stringify(manifest, null, 2))
  return path
}

function loadManifest(batchId: string): Manifest {
  try {
    return JSON.parse(readFileSync(manifestPath(batchId), 'utf8')) as Manifest
  } catch {
    throw new Error(
      `No manifest for batch ${batchId} at ${manifestPath(batchId)}.\n` +
        'The manifest records which images each request was built from, and a ' +
        "chosen label can't be resolved without it. If it was deleted, re-run " +
        'without --resume to start a fresh batch.'
    )
  }
}

/** Letter labels, so a pick can never be read as an off-by-one number. */
const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

/**
 * Build the response schema for a request with `count` images.
 *
 * Photos are labelled A, B, C… rather than numbered, and the schema's enum is
 * restricted to exactly the labels sent. Numbering invited an off-by-one: asked
 * for a 0-based index over six photos, the model sometimes answered 1-based.
 * At the boundary that produced an out-of-range 6 and failed loudly, but a
 * 1-based "3" resolves to a perfectly valid index 3 — the WRONG photograph,
 * written with a confident reason attached and no error anywhere. Letters have
 * no zero to disagree about, and constraining the enum to the labels actually
 * sent makes an unresolvable answer structurally impossible rather than
 * something we detect after the fact.
 */
function buildSchema(count: number) {
  return {
    type: 'object',
    properties: {
      // anyOf, not `type: ['string','null']` with a null in the enum — that
      // combination is rejected outright ("Enum value 'A' does not match
      // declared type"), and because the schema is validated per request it
      // fails every single one rather than degrading.
      chosen_label: {
        anyOf: [
          { type: 'string', enum: [...LABELS.slice(0, count)] },
          { type: 'null' },
        ],
        description:
          'Label of the best photo, or null if none is usable as a hero image.',
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      reason: {
        type: 'string',
        description: 'One short sentence explaining the pick.',
      },
    },
    required: ['chosen_label', 'confidence', 'reason'],
    additionalProperties: false,
  }
}

function parseFlag(name: string): string | null {
  const args = process.argv.slice(2)
  const i = args.indexOf(name)
  if (i < 0) return null
  const v = args[i + 1]
  if (!v || v.startsWith('--')) throw new Error(`${name} needs a value`)
  return v
}

function parseLimit(): number | null {
  const raw = parseFlag('--limit')
  if (raw === null) return null
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('--limit must be a positive integer')
  }
  return n
}

/** Run an async mapper over items with a fixed concurrency ceiling. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = cursor++
        if (index >= items.length) return
        results[index] = await fn(items[index]!)
      }
    }
  )
  await Promise.all(workers)
  return results
}

/** Probe a shortlist, drop what fails or is too small, rank what survives. */
async function measure(
  candidates: ImageCandidate[],
  incumbent: string | null
): Promise<{ kept: Measured[]; rejected: string[]; capped: number }> {
  const probes = await mapWithConcurrency(candidates, PROBE_CONCURRENCY, (c) =>
    probeImage(c.url).then((r) => ({ candidate: c, probe: r as ProbeResult }))
  )

  const kept: Measured[] = []
  const rejected: string[] = []

  for (const { candidate, probe } of probes) {
    if (!probe.ok) {
      rejected.push(`${candidate.category}: ${probe.reason}`)
      continue
    }
    const longEdge = Math.max(probe.width, probe.height)
    const aspect =
      Math.max(probe.width, probe.height) / Math.min(probe.width, probe.height)

    if (longEdge < MIN_LONG_EDGE) {
      rejected.push(
        `${candidate.category}: too small (${probe.width}x${probe.height})`
      )
      continue
    }
    if (aspect > MAX_ASPECT_RATIO) {
      rejected.push(`${candidate.category}: aspect ${aspect.toFixed(1)}:1`)
      continue
    }

    kept.push({
      url: candidate.url,
      category: candidate.category,
      width: probe.width,
      height: probe.height,
      isIncumbent: candidate.url === incumbent,
    })
  }

  const { kept: ranked, capped } = rankAndCap(kept)
  return { kept: ranked, rejected, capped }
}

function buildPrompt(plant: PlantRow, images: Measured[]): string {
  const name = plant.scientific_name
    ? `${plant.common_name} (${plant.scientific_name})`
    : plant.common_name
  const blooms = plant.bloom_months?.length
    ? `This plant blooms in months ${plant.bloom_months.join(', ')}.`
    : 'Bloom season is unrecorded for this plant.'

  const list = images
    .map((img, i) => {
      const tags = [
        `category "${img.category}"`,
        `${img.width}x${img.height}`,
        img.isIncumbent ? 'CURRENTLY IN USE' : null,
      ]
        .filter(Boolean)
        .join(', ')
      return `Image ${LABELS[i]}: ${tags}`
    })
    .join('\n')

  return `You are choosing the single hero photograph for ${name} in a garden planning app. It appears as a large, full-bleed image on a browsing card, so it has to look good at size and instantly communicate what this plant is.

${blooms}

${list}

Pick the photo that is most beautiful AND most representative of the species.

Strongly prefer:
- The plant clearly the subject, filling a good part of the frame
- Blooms visible and in sharp focus, if this plant is one people grow for its flowers
- Natural light, a garden or wild setting, an uncluttered background

Reject outright:
- Herbarium sheets, pressed or dried specimens, scanned illustrations
- Hands, fingers, people, rulers, scale bars, plastic labels or tags
- Nursery pots, plug trays, greenhouse benches, packaging
- Blurry or badly exposed photos, or ones where the plant is hard to make out
- Photos that are mostly something else, where this plant is incidental

Note that many of these come from a public plant-identification database, so specimen-style and documentary photos are common. A merely acceptable photo is not a good hero.

Return the letter label of your choice (A, B, C...). If every option fails the criteria above, return null for chosen_label rather than settling.

Confidence: "high" when the pick is clearly good and clearly the best available; "medium" when it is usable but unremarkable, when two options are close, or when the photo is a good one that still carries a flaw (a visible pot rim, decking, a fence, a busy background); "low" when nothing is really suitable and you are picking the least bad.

Be honest and be specific. Low-confidence picks get a human review, so a truthful "low" is more useful than a generous "high". In your reason, describe what is actually in the frame rather than what a good photo would contain — if there is a pot or a background object, say so instead of calling the background uncluttered.`
}

function buildRequest(
  plant: PlantRow,
  images: Measured[]
): Anthropic.Messages.Batches.BatchCreateParams.Request {
  return {
    custom_id: plant.id,
    params: {
      model: VISION_MODEL,
      // Generous because Sonnet 5 runs adaptive thinking when `thinking` is
      // omitted (Sonnet 4.6 did not) and max_tokens covers thinking AND the
      // answer. At 1024 a sixth of the catalog spent the entire budget
      // thinking and returned a thinking block with no JSON at all —
      // stop_reason "max_tokens", which reads as a parse failure rather than
      // the truncation it is. Thinking is worth keeping for a visual
      // judgement call, so bound it with effort rather than by starving it.
      max_tokens: 4096,
      output_config: {
        effort: 'medium',
        format: {
          type: 'json_schema',
          schema: buildSchema(images.length) as unknown as Record<
            string,
            unknown
          >,
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({
              type: 'image' as const,
              source: { type: 'url' as const, url: img.url },
            })),
            { type: 'text' as const, text: buildPrompt(plant, images) },
          ],
        },
      ],
    },
  } as Anthropic.Messages.Batches.BatchCreateParams.Request
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const recheck = args.includes('--recheck')
  const resumeId = parseFlag('--resume')
  const limit = parseLimit()

  const supabase = getSupabaseAdmin()

  // Rebuild the review file from current state without touching the API.
  if (args.includes('--report-only')) {
    await writeReviewReport(supabase)
    return
  }

  const anthropic = getAnthropicClient()

  // ---- Reattach to an in-flight batch -------------------------------------
  if (resumeId) {
    await collectResults(anthropic, supabase, loadManifest(resumeId))
    return
  }

  // Ordered by id — paging needs a unique column to be stable.
  let plants = await fetchAllRows<PlantRow>((from, to) => {
    let q = supabase
      .from('plants')
      .select(
        'id, common_name, scientific_name, bloom_months, image_url, image_candidates'
      )
      .not('image_candidates', 'is', null)
    if (!recheck) q = q.is('image_checked_at', null)
    return q.order('id').range(from, to)
  })

  plants.sort((a, b) => a.common_name.localeCompare(b.common_name))
  if (limit) plants = plants.slice(0, limit)

  if (plants.length === 0) {
    console.log(
      recheck
        ? 'No plants have image_candidates yet — run recover-image-categories.ts first.'
        : 'Nothing to do — every plant with candidates has been checked. Use --recheck to redo.'
    )
    // Still refresh the report: the reviewer may just want the current state.
    await writeReviewReport(supabase)
    return
  }

  console.log(`Shortlisting and probing ${plants.length} plant(s).\n`)

  const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = []
  const manifestPlants: Manifest['plants'] = {}
  const skipped: string[] = []
  let totalRejected = 0
  let totalCapped = 0

  for (const [i, plant] of plants.entries()) {
    const candidates = plant.image_candidates ?? []
    const short = shortlist(candidates, plant.image_url)
    const { kept, rejected, capped } = await measure(short, plant.image_url)
    totalRejected += rejected.length
    totalCapped += capped

    const label = `${pad(i + 1)}/${plants.length} ${plant.common_name}`

    if (kept.length === 0) {
      console.log(
        `${label} — no usable candidates (${rejected.length} rejected)`
      )
      skipped.push(plant.common_name)
      continue
    }

    // Report the cap separately from rejection — one is us choosing to stop
    // paying past six good options, the other is a candidate failing a check.
    const notes = [
      kept.some((k) => k.isIncumbent)
        ? 'incumbent included'
        : 'incumbent absent',
      rejected.length ? `${rejected.length} rejected` : null,
      capped ? `${capped} over cap` : null,
    ].filter(Boolean)

    console.log(
      `${label} — sending ${kept.length} of ${short.length} (${notes.join(', ')})`
    )
    if (dryRun) {
      for (const k of kept) {
        console.log(
          `        ${k.isIncumbent ? '*' : ' '} ${k.category.padEnd(8)} ${k.width}x${k.height}`
        )
      }
      for (const r of rejected) console.log(`          drop: ${r}`)
    }

    requests.push(buildRequest(plant, kept))
    manifestPlants[plant.id] = {
      commonName: plant.common_name,
      incumbent: plant.image_url,
      images: kept,
    }
  }

  console.log(
    `\nProbing done: ${requests.length} plant(s) ready, ${skipped.length} with nothing usable, ` +
      `${totalRejected} candidate image(s) rejected, ${totalCapped} good candidate(s) left unsent at the ${MAX_FOR_VISION}-image cap.`
  )

  if (dryRun) {
    console.log(
      '\n--dry-run: stopping before the vision pass. Nothing was written.'
    )
    return
  }
  if (requests.length === 0) {
    await writeReviewReport(supabase)
    return
  }

  const batch = await anthropic.messages.batches.create({ requests })

  // Written before the first poll so an immediate crash still leaves a
  // resumable batch rather than an orphaned one.
  const manifest: Manifest = {
    batchId: batch.id,
    createdAt: new Date().toISOString(),
    model: VISION_MODEL,
    plants: manifestPlants,
  }
  const path = saveManifest(manifest)

  console.log(`\nBatch submitted: ${batch.id}`)
  console.log(`Manifest: ${path}`)
  console.log(
    `If polling is interrupted, reattach with:\n  --resume ${batch.id}\n`
  )

  await collectResults(anthropic, supabase, manifest)
}

/** Poll a batch to completion, then write each pick back to its plant. */
async function collectResults(
  anthropic: Anthropic,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  manifest: Manifest
) {
  const batchId = manifest.batchId
  for (;;) {
    const batch = await anthropic.messages.batches.retrieve(batchId)
    if (batch.processing_status === 'ended') break
    const c = batch.request_counts
    console.log(
      `  ${batch.processing_status} — processing ${c.processing}, succeeded ${c.succeeded}, errored ${c.errored}`
    )
    await sleep(POLL_INTERVAL_MS)
  }

  console.log('\nBatch ended. Writing picks.\n')

  const stats = { high: 0, medium: 0, low: 0, none: 0, errored: 0 }
  const review: string[] = []

  for await (const entry of await anthropic.messages.batches.results(batchId)) {
    const plantId = entry.custom_id

    if (entry.result.type !== 'succeeded') {
      console.log(`  ${plantId} — ${entry.result.type}`)
      stats.errored++
      continue
    }

    const message = entry.result.message
    const text = message.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') {
      // Name the cause rather than reporting a bare "no text block": when the
      // whole budget goes to thinking the response really does arrive with a
      // thinking block and nothing else, and that looks identical to a
      // malformed reply unless stop_reason is surfaced.
      const cause =
        message.stop_reason === 'max_tokens'
          ? `truncated before answering (stop_reason max_tokens, ${message.usage.output_tokens} output tokens` +
            `${message.usage.output_tokens_details?.thinking_tokens != null ? `, ${message.usage.output_tokens_details.thinking_tokens} of them thinking` : ''}) — raise max_tokens or lower effort`
          : `no text block (stop_reason ${message.stop_reason}, blocks: ${message.content.map((b) => b.type).join(', ') || 'none'})`
      console.log(`  ${plantId} — ${cause}`)
      stats.errored++
      continue
    }

    let pick: PickResult
    try {
      pick = JSON.parse(text.text) as PickResult
    } catch {
      console.log(`  ${plantId} — unparseable response`)
      stats.errored++
      continue
    }

    // Resolve the index against the exact list this request was built from.
    const entryManifest = manifest.plants[plantId]
    if (!entryManifest) {
      console.log(`  ${plantId} — not in manifest, skipping`)
      stats.errored++
      continue
    }
    const plant = {
      common_name: entryManifest.commonName,
      image_url: entryManifest.incumbent,
    }

    const labelIndex =
      pick.chosen_label != null
        ? LABELS.indexOf(pick.chosen_label as never)
        : -1
    const chosen =
      labelIndex >= 0 ? entryManifest.images[labelIndex] : undefined

    // A label we never sent means the answer can't be resolved to a photo.
    // Count it as an error and leave the row UNSTAMPED so a plain re-run
    // retries it. Writing it as "no usable photo" would be a lie that also
    // stamps itself done — which is exactly what happened to three plants in
    // the calibration sample, each of which had a perfectly good photo and a
    // reason enthusiastically describing it.
    if (pick.chosen_label != null && !chosen) {
      console.log(
        `  ${plant.common_name} — unresolvable label "${pick.chosen_label}" (${entryManifest.images.length} sent); left unstamped for retry`
      )
      stats.errored++
      continue
    }

    if (!chosen) {
      // Stamp it anyway: "we looked and found nothing" is a real, resumable
      // outcome, and leaving it unstamped would re-run it forever.
      await supabase
        .from('plants')
        .update({
          image_pick_confidence: 'low',
          image_pick_reason: pick.reason || 'No candidate met the bar.',
          image_checked_at: new Date().toISOString(),
        })
        .eq('id', plantId)
      console.log(`  ${plant.common_name} — no usable photo: ${pick.reason}`)
      stats.none++
      review.push(`${plant.common_name}: no usable photo`)
      continue
    }

    const { error } = await supabase
      .from('plants')
      .update({
        image_url_curated: chosen.url,
        image_pick_confidence: pick.confidence,
        image_pick_reason: pick.reason,
        image_checked_at: new Date().toISOString(),
      })
      .eq('id', plantId)

    if (error) {
      console.log(`  ${plant.common_name} — DB write failed: ${error.message}`)
      stats.errored++
      continue
    }

    stats[pick.confidence]++
    const changed = chosen.url !== plant.image_url
    console.log(
      `  ${plant.common_name} — ${changed ? 'CHANGED' : 'kept'}, ${pick.confidence} (${chosen.category} ${chosen.width}x${chosen.height}): ${pick.reason}`
    )
    if (pick.confidence === 'low') {
      review.push(`${plant.common_name}: ${pick.reason}`)
    }
  }

  console.log(
    `\nDone. high ${stats.high}, medium ${stats.medium}, low ${stats.low}, no-usable ${stats.none}, errored ${stats.errored}.`
  )
  if (review.length) {
    console.log(`\n${review.length} pick(s) want a human look:`)
    for (const r of review) console.log(`  - ${r}`)
  }
  await writeReviewReport(supabase)
  // Errored rows stay unstamped, so a plain re-run retries exactly those.
}

/**
 * Write the human review artefact, matching the cross-check guards' convention
 * (`reports/<name>.json` + `.md`, gitignored).
 *
 * Built from the DATABASE, not from the records this invocation happened to
 * produce. Building it from the run's own results meant any partial re-run
 * rewrote the file with only its own rows — retrying four transient failures
 * replaced a 490-plant review file with a 4-plant one, silently destroying the
 * artefact the review depends on. The report describes the state of the
 * catalog, so the catalog is what it should read.
 *
 * The markdown is the point: it puts the old and new photo side by side per
 * plant so a reviewer judges the actual images rather than the model's
 * description of them — which is exactly where this pass has already been
 * caught overstating itself once.
 */
async function writeReviewReport(
  supabase: ReturnType<typeof getSupabaseAdmin>
) {
  const rows = await fetchAllRows<{
    common_name: string
    image_url: string | null
    image_url_curated: string | null
    image_pick_confidence: 'high' | 'medium' | 'low' | null
    image_pick_reason: string | null
  }>((from, to) =>
    supabase
      .from('plants')
      .select(
        'id, common_name, image_url, image_url_curated, image_pick_confidence, image_pick_reason'
      )
      .not('image_checked_at', 'is', null)
      .order('id')
      .range(from, to)
  )

  if (rows.length === 0) return
  mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2) + '\n')

  const noPhoto = rows.filter((r) => !r.image_url_curated)
  const byLevel = (level: string) =>
    rows.filter((r) => r.image_url_curated && r.image_pick_confidence === level)

  // Three distinct outcomes, not two. A plant that had no hero at all and now
  // has one is not "changed" — nothing was replaced — and collapsing it into
  // the changed count overstates how much the pass overrode existing choices.
  const replaced = rows.filter(
    (r) =>
      r.image_url_curated && r.image_url && r.image_url_curated !== r.image_url
  ).length
  const firstHero = rows.filter(
    (r) => r.image_url_curated && !r.image_url
  ).length
  const kept = rows.filter(
    (r) => r.image_url_curated && r.image_url_curated === r.image_url
  ).length

  const lines = [
    '# Plant hero image picks — review',
    '',
    `${rows.length} plant(s) checked: ${replaced} replaced an existing photo, ${firstHero} given a hero for the first time, ${kept} confirmed the existing photo was already the best, ${noPhoto.length} with no usable photo.`,
    `Confidence: high ${byLevel('high').length}, medium ${byLevel('medium').length}, low ${byLevel('low').length}.`,
    '',
    'Lowest confidence first — that is the queue. A "kept" row means the pass',
    'confirmed the existing photo rather than changing it, which is a real',
    'result and not a no-op.',
    '',
  ]

  const section = (title: string, group: typeof rows, withImages = true) => {
    if (group.length === 0) return
    lines.push(`## ${title} (${group.length})`, '')
    for (const r of group) {
      const isChanged = r.image_url_curated !== r.image_url
      lines.push(
        `### ${r.common_name}${r.image_url_curated ? ` — ${isChanged ? 'changed' : 'kept'}` : ''}`,
        '',
        r.image_pick_reason ?? '(no reason recorded)',
        ''
      )
      if (withImages && r.image_url_curated) {
        lines.push(
          r.image_url && isChanged
            ? `| before | after |\n| --- | --- |\n| <img src="${r.image_url}" width="280"> | <img src="${r.image_url_curated}" width="280"> |`
            : `<img src="${r.image_url_curated}" width="280">`,
          ''
        )
      }
    }
  }

  section('No usable photo', noPhoto, false)
  section('low', byLevel('low'))
  section('medium', byLevel('medium'))
  section('high', byLevel('high'))

  writeFileSync(MD_OUT, lines.join('\n') + '\n')
  console.log(`\nReview report: ${MD_OUT} (${rows.length} plant(s))`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
