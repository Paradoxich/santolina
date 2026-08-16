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
 *
 * VERIFY MODE (--verify) answers a different question about a different thing.
 * The pick above is COMPARATIVE — "which of these candidates is best?" — and a
 * `medium` result usually means two were close, or the winner carried a small
 * flaw. Re-running the pick cannot resolve that; it just re-stages the same
 * comparison. So --verify shows the model the ONE image that won, alone,
 * alongside the plant's identity, and asks an absolute question: is this the
 * right species, and is it good enough to be the hero? See the block comment
 * above runVerify() for why this is not a re-roll of a judgment we dislike.
 *
 *   # Smoke test first, per the pipeline rules:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/pick-plant-images.ts \
 *     --verify --round 8 --limit 3 --dry-run
 *   # Real run:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/pick-plant-images.ts --verify --round 8
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getAnthropicClient, VISION_MODEL } from '../lib/anthropic-client'
import { fetchAllRows } from '../lib/paginate'
import {
  displayUrlFor,
  fetchImageBlob,
  probeImage,
  type ImageBlob,
  type ProbeResult,
} from '../lib/image-probe'
import {
  MAX_FOR_VISION,
  rankAndCap,
  shortlist,
  type ImageCandidate,
  type Measured,
} from '../lib/image-shortlist'
import {
  requireScope,
  scopeIds,
  describeScope,
  applyScope,
  scopeGuard,
  requireReasonForAll,
} from './scope'
import { withRunRecord, type Witness } from './run-provenance'

// Below this a photo cannot fill an Explore card without visible softening.
const MIN_LONG_EDGE = 500
// Beyond this the subject cannot survive the card's crop.
const MAX_ASPECT_RATIO = 2.5
const PROBE_CONCURRENCY = 6
const POLL_INTERVAL_MS = 30_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pad = (n: number, w = 3) => String(n).padStart(w, ' ')

/**
 * Why a batch entry did not succeed, in one line.
 *
 * `result.type` alone is "errored" for a permanently unreachable candidate URL
 * and for a transient upstream timeout alike, and those need OPPOSITE
 * responses: one is a plant that needs a new photograph, the other is a plain
 * re-run. Round 12 printed seven bare UUIDs and the reason had to be read back
 * out of the Batch API by hand before the rows could be re-run safely — every
 * one turned out to be the retryable kind, which the log had no way to say.
 *
 * This is the same rule the `stop_reason` branch below already follows: name
 * the cause rather than the category. `canceled` and `expired` carry no detail
 * and say enough on their own. The `request_id` is included because it is the
 * handle Anthropic support asks for, and it is what made the round-12
 * diagnosis possible at all.
 */
export function describeBatchFailure(
  result: Anthropic.Messages.Batches.MessageBatchIndividualResponse['result']
): string {
  if (result.type !== 'errored') return result.type
  const { error, request_id: requestId } = result.error
  return (
    `errored — ${error.type}: ${error.message}` +
    (requestId ? ` (request ${requestId})` : '')
  )
}

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
  /** null means the batch was built under --all. */
  scopeIds?: string[] | null
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

/**
 * Probe a shortlist, drop what fails or is too small, rank what survives.
 *
 * `rejected` and `unresolved` are deliberately two lists. A rejected candidate
 * has been judged — dead link, too small, wrong shape — and dropping it is the
 * right answer. An unresolved one failed transiently and kept failing after
 * every retry, so its quality is simply unknown, and treating that as a
 * rejection is trap 1: it converts "we could not look" into "we looked and it
 * was no good", then stamps the row so nothing ever looks again.
 */
async function measure(
  candidates: ImageCandidate[],
  incumbent: string | null
): Promise<{
  kept: Measured[]
  rejected: string[]
  unresolved: string[]
  capped: number
}> {
  const probes = await mapWithConcurrency(candidates, PROBE_CONCURRENCY, (c) =>
    probeImage(c.url).then((r) => ({ candidate: c, probe: r as ProbeResult }))
  )

  const kept: Measured[] = []
  const rejected: string[] = []
  const unresolved: string[] = []

  for (const { candidate, probe } of probes) {
    if (!probe.ok) {
      const line = `${candidate.category}: ${probe.reason}`
      if (probe.transient) unresolved.push(line)
      else rejected.push(line)
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
      // Carry source + attribution through so a Wikimedia winner can be
      // credited when it is written back.
      source: candidate.source,
      attribution: candidate.attribution,
    })
  }

  const { kept: ranked, capped } = rankAndCap(kept)
  return { kept: ranked, rejected, unresolved, capped }
}

/**
 * Rendered for the recipe hash only — never sent, and no image is ever fetched
 * for it.
 *
 * Bloom months are POPULATED, because the template branches on having them and
 * the populated branch is the one carrying interpolated content. Two probe
 * images rather than one, so the numbered per-image line renders more than once
 * and a change to its shape moves the hash. The incumbent flag is set on one of
 * them for the same reason: it is an optional tag, and an all-false probe would
 * hide "CURRENTLY IN USE" from the recipe entirely.
 */
const RECIPE_PROBE_PLANT: PlantRow = {
  id: 'recipe-probe',
  common_name: 'probe',
  scientific_name: 'Probe probe',
  bloom_months: [6],
  image_url: null,
  image_candidates: null,
}

const RECIPE_PROBE_IMAGES: Measured[] = [
  {
    url: 'https://example.invalid/a',
    category: 'flower',
    width: 1200,
    height: 900,
    isIncumbent: true,
  },
  {
    url: 'https://example.invalid/b',
    category: 'habit',
    width: 1000,
    height: 800,
    isIncumbent: false,
  },
]

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

/**
 * Build one batch request for a plant.
 *
 * Trefle/PlantNet/CloudFront images go by URL (Anthropic fetches them fine and
 * it keeps the payload small). Wikimedia images must be sent as base64 — the
 * upload host rejects Anthropic's fetcher, so a Wikimedia URL block silently
 * fails the whole request. `blobs` holds the pre-fetched base64 for those,
 * keyed by url; a Wikimedia image whose fetch failed is dropped from the set so
 * the request still succeeds on the rest.
 */
function buildRequest(
  plant: PlantRow,
  images: Measured[],
  blobs: Map<string, ImageBlob>
): Anthropic.Messages.Batches.BatchCreateParams.Request | null {
  const usable = images.filter(
    (img) => img.source !== 'wikimedia' || blobs.has(img.url)
  )
  if (usable.length === 0) return null

  const imageBlocks = usable.map((img) => {
    const blob = blobs.get(img.url)
    return blob
      ? {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: blob.mediaType,
            data: blob.data,
          },
        }
      : {
          type: 'image' as const,
          source: { type: 'url' as const, url: img.url },
        }
  })

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
      max_tokens: PICK_MAX_TOKENS,
      output_config: {
        effort: PICK_EFFORT,
        format: {
          type: 'json_schema',
          schema: buildSchema(usable.length) as unknown as Record<
            string,
            unknown
          >,
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text' as const, text: buildPrompt(plant, usable) },
          ],
        },
      ],
    },
  } as Anthropic.Messages.Batches.BatchCreateParams.Request
}

// ---------------------------------------------------------------------------
// Verify mode — an absolute second look at the hero a pick already chose
// ---------------------------------------------------------------------------

/**
 * WHY THIS IS NOT JUST RE-ROLLING UNTIL WE GET "high".
 *
 * That objection is the right one to raise, so it is answered here rather than
 * left implicit. Three things make this a different question and not a second
 * attempt at the same one:
 *
 *   1. It is ABSOLUTE, not comparative. The pick was shown up to six photos and
 *      asked which is best; `medium` there is largely a statement about the
 *      FIELD ("two were close", "the winner has a pot rim in it"). Verify is
 *      shown exactly one photo and asked whether that photo, on its own, is the
 *      right species and good enough to be the hero. A "close call between two
 *      good photos" and "a plausible photo of possibly the wrong plant" are
 *      indistinguishable in the pick's output and could not be more different
 *      editorially. Only the second should block sign-off.
 *
 *   2. The verdict is COMPUTED, not asked for. The model never names a
 *      confidence level, so it cannot be nudged toward the answer we want. It
 *      answers two narrow factual questions and `mapVerdict` below turns those
 *      into a confidence. The promotion rule is therefore in the diff, testable
 *      and arguable, rather than in a prompt asking nicely for "high".
 *
 *   3. It can DEMOTE. A verified row can come out `low`, which is worse than
 *      where it started and is the outcome that actually matters: a plausible
 *      hero showing the wrong species is the most visible error the catalog can
 *      make. If this pass only ever moved rows upward it would be laundering.
 *
 * It also runs ONCE per row: `image_verified_at` records the second look, so a
 * row that stays `medium` after it stays medium. There is no third ask.
 */

interface VerifyAnswer {
  species_match: 'yes' | 'unsure' | 'no'
  hero_quality: 'good' | 'acceptable' | 'poor'
  reason: string
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    species_match: {
      type: 'string',
      enum: ['yes', 'unsure', 'no'],
      description:
        'Whether the photo shows the named species. "unsure" when the photo is ' +
        'too tight, too distant or too obscured to tell, or when the genus is ' +
        'right but the species cannot be confirmed.',
    },
    hero_quality: {
      type: 'string',
      enum: ['good', 'acceptable', 'poor'],
      description:
        'How well this works as a large full-bleed card image, judged on ' +
        'composition, focus, light and background.',
    },
    reason: {
      type: 'string',
      description:
        'One or two sentences describing what is actually in the frame.',
    },
  },
  required: ['species_match', 'hero_quality', 'reason'],
  additionalProperties: false,
}

/**
 * Turn the two factual answers into the confidence the catalog stores.
 *
 * `acceptable` quality with a confirmed species clears. That is deliberate and
 * it is where this pass earns its keep: the strict bar exists to catch the
 * wrong plant, not an unremarkable photograph. Holding a correctly-identified,
 * perfectly usable photo off sign-off because it is merely fine would make
 * `is_curated` a photography award. An unconfirmed species never clears, at any
 * quality.
 */
export function mapVerdict(a: VerifyAnswer): 'high' | 'medium' | 'low' {
  if (a.species_match === 'no' || a.hero_quality === 'poor') return 'low'
  if (a.species_match === 'unsure') return 'medium'
  return 'high'
}

/**
 * mapVerdict's rule, stated for the recipe hash. Carries the same limit as
 * recover-image-categories' EXTRACTION_RULE: it is a description of code rather
 * than content identity, so it can drift from mapVerdict if one is edited
 * without the other. Recorded anyway, because the verdict is COMPUTED rather
 * than asked for, and a reader given only the prompt would not know that.
 */
const VERDICT_MAPPING_RULE =
  'species_match=no OR hero_quality=poor → low; species_match=unsure → medium; else high'

const VERIFY_MAX_TOKENS = 4096

function buildVerifyPrompt(plant: VerifyRow): string {
  const name = plant.scientific_name
    ? `${plant.common_name} (${plant.scientific_name})`
    : plant.common_name
  const blooms = plant.bloom_months?.length
    ? `Recorded bloom months: ${plant.bloom_months.join(', ')}.`
    : 'Bloom season is unrecorded for this plant.'

  return `This single photograph is the hero image for ${name} in a garden planning app. It appears large and full-bleed on a browsing card. Judge it on its own merits — there is nothing to compare it against and no alternative to pick.

${blooms}

Answer two separate questions.

1. species_match — does this photograph show ${name}?
   "yes" only if what you can see is consistent with this species and you would
   stand behind it. "unsure" if the frame is too tight, too distant, too
   obscured, or shows a plant you can place only to the genus. "no" if it is a
   different plant, or is not a living plant at all (a herbarium sheet, a
   pressed specimen, a botanical illustration, a seed packet).
   Do not resolve doubt in the photo's favour. "unsure" is a useful answer and
   costs nothing; a wrong "yes" puts the wrong plant on a plant's own page,
   which a reader will notice without knowing anything about plants.

2. hero_quality — how well does it work as a large card image?
   "good": the plant is clearly the subject and in focus, the light and
   background do it justice.
   "acceptable": usable and clear, but unremarkable, or carrying a minor
   distraction such as a pot rim, a fence, decking or a busy background.
   "poor": blurry, badly exposed, the plant hard to make out or incidental to
   the frame, or the shot is documentary rather than horticultural (hands,
   rulers, scale bars, labels, nursery trays, packaging).

These are independent. A beautiful photo of the wrong plant is species_match
"no" with hero_quality "good", and saying so is more useful than averaging them.

In your reason, describe what is actually in the frame rather than what a good
photo of this plant would contain. If there is a pot or a background object, say
so. Do not comment on punctuation or wording of anything.`
}

interface VerifyRow {
  id: string
  common_name: string
  scientific_name: string | null
  bloom_months: number[] | null
  image_url_curated: string | null
  image_pick_confidence: string | null
  image_pick_reason: string | null
  image_attribution: string | null
}

interface VerifyManifest {
  batchId: string
  createdAt: string
  model: string
  plants: Record<
    string,
    {
      commonName: string
      scientificName: string | null
      url: string
      priorConfidence: string | null
      priorReason: string | null
    }
  >
}

function verifyManifestPath(batchId: string): string {
  return join(MANIFEST_DIR, `verify-${batchId}.json`)
}

async function runVerify(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  anthropic: Anthropic,
  opts: { dryRun: boolean; limit: number | null; reverify: boolean }
) {
  // Mandatory, like every other pass that bills Claude per row (scripts/scope.ts).
  const scope = requireScope(
    'pick-plant-images --verify',
    'Verification is a vision call per row, so an unscoped run bills the ' +
      'whole medium remainder of the catalog rather than the round you meant.'
  )
  const ids = scopeIds(scope)
  console.log(`${describeScope(scope, ids)}\n`)

  let rows = await fetchAllRows<VerifyRow>((from, to) => {
    let q = supabase
      .from('plants')
      .select(
        'id, common_name, scientific_name, bloom_months, image_url_curated, image_pick_confidence, image_pick_reason, image_attribution'
      )
      // Only `medium`. `high` is settled and `low` needs a new candidate, not a
      // second opinion on the same photo.
      .eq('image_pick_confidence', 'medium')
      .not('image_url_curated', 'is', null)
    if (ids) q = q.in('id', ids)
    if (!opts.reverify) q = q.is('image_verified_at', null)
    return q.order('id').range(from, to)
  })

  rows.sort((a, b) => a.common_name.localeCompare(b.common_name))
  if (opts.limit) rows = rows.slice(0, opts.limit)

  if (rows.length === 0) {
    console.log(
      'Nothing to verify — no unverified medium-confidence heroes in scope.'
    )
    return
  }

  console.log(`Verifying ${rows.length} medium-confidence hero(es).\n`)

  const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = []
  const manifestPlants: VerifyManifest['plants'] = {}

  for (const [i, plant] of rows.entries()) {
    const url = plant.image_url_curated!
    // Wikimedia rejects Anthropic's fetcher, so those go as base64 — the same
    // constraint the pick pass hit, and the same fix. Decided from the URL
    // host, not from image_attribution: attribution is a rendering concern and
    // a row could carry one for another reason, whereas the host is the thing
    // that actually breaks the fetch.
    const isWikimedia = /(^|\.)wikimedia\.org$/.test(new URL(url).hostname)
    const blob = isWikimedia ? await fetchImageBlob(url) : null
    if (isWikimedia && !blob) {
      console.log(
        `${pad(i + 1)}/${rows.length} ${plant.common_name} — hero image unfetchable, skipping`
      )
      continue
    }

    console.log(`${pad(i + 1)}/${rows.length} ${plant.common_name}`)
    if (opts.dryRun) {
      console.log(`        was: ${plant.image_pick_reason ?? '(no reason)'}`)
      console.log(`        url: ${url}`)
    }

    requests.push({
      custom_id: plant.id,
      params: {
        model: VISION_MODEL,
        // Same reasoning as the pick pass: thinking shares this budget.
        max_tokens: VERIFY_MAX_TOKENS,
        output_config: {
          effort: 'medium',
          format: {
            type: 'json_schema',
            schema: VERIFY_SCHEMA as unknown as Record<string, unknown>,
          },
        },
        messages: [
          {
            role: 'user',
            content: [
              blob
                ? {
                    type: 'image' as const,
                    source: {
                      type: 'base64' as const,
                      media_type: blob.mediaType,
                      data: blob.data,
                    },
                  }
                : {
                    type: 'image' as const,
                    source: { type: 'url' as const, url },
                  },
              { type: 'text' as const, text: buildVerifyPrompt(plant) },
            ],
          },
        ],
      },
    } as Anthropic.Messages.Batches.BatchCreateParams.Request)

    manifestPlants[plant.id] = {
      commonName: plant.common_name,
      scientificName: plant.scientific_name,
      url,
      priorConfidence: plant.image_pick_confidence,
      priorReason: plant.image_pick_reason,
    }
  }

  if (opts.dryRun) {
    console.log(
      `\n--dry-run: ${requests.length} request(s) built, nothing sent, nothing written.`
    )
    return
  }
  if (requests.length === 0) return

  const batch = await anthropic.messages.batches.create({ requests })
  const manifest: VerifyManifest = {
    batchId: batch.id,
    createdAt: new Date().toISOString(),
    model: VISION_MODEL,
    plants: manifestPlants,
  }
  mkdirSync(MANIFEST_DIR, { recursive: true })
  writeFileSync(verifyManifestPath(batch.id), JSON.stringify(manifest, null, 2))

  console.log(`\nBatch submitted: ${batch.id}`)
  console.log(`Manifest: ${verifyManifestPath(batch.id)}`)
  console.log(`Reattach with:\n  --verify --resume ${batch.id}\n`)

  await collectVerifyResults(anthropic, supabase, manifest)
}

/** Poll a verify batch and write each verdict back. */
/** The verify probe. Same construction as the pick probe above. */
const RECIPE_PROBE_VERIFY_ROW: VerifyRow = {
  id: 'recipe-probe',
  common_name: 'probe',
  scientific_name: 'Probe probe',
  bloom_months: [6],
  image_url_curated: 'https://example.invalid/a',
  image_pick_confidence: 'high',
  image_pick_reason: 'probe',
  image_attribution: null,
}

async function collectVerifyResults(
  anthropic: Anthropic,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  manifest: VerifyManifest
) {
  return withRunRecord(
    {
      // A DIFFERENT STEP, not a flag on the same one. --verify asks an absolute
      // question about one image where the pick asked a comparative one about
      // several, and its answers land on a different set of columns.
      step: 'pick-plant-images --verify',
      writeSet: [
        'image_pick_confidence',
        'image_pick_reason',
        'image_verified_at',
        'editorial_checked_at',
      ],
      evidence: [
        // SET here — the same column the pick pass CLEARS. That inversion is
        // why a witness cannot be derived from a column name, only declared.
        {
          kind: 'stamp',
          covers: 'image_verified_at',
          column: 'image_verified_at',
        },
        {
          kind: 'row-touched',
          covers: 'image_pick_confidence',
          table: 'plants',
          column: 'updated_at',
        },
        {
          kind: 'row-touched',
          covers: 'image_pick_reason',
          table: 'plants',
          column: 'updated_at',
        },
        // Cleared, and only on rows whose confidence actually moved.
        {
          kind: 'row-touched',
          covers: 'editorial_checked_at',
          table: 'plants',
          column: 'updated_at',
        },
      ],
      scope: `batch ${manifest.batchId} (submitted ${manifest.createdAt})`,
      recipe: {
        model: manifest.model,
        template: buildVerifyPrompt(RECIPE_PROBE_VERIFY_ROW),
        // The verdict is COMPUTED from the model's two independent answers, not
        // asked for, so the mapping is part of the recipe: re-tune it and the
        // same answers produce different confidences.
        ingredients: { verdict_mapping: VERDICT_MAPPING_RULE },
        decoding: { max_tokens: VERIFY_MAX_TOKENS },
      },
    },
    (run) => collectVerifyResultsInner(anthropic, supabase, manifest, run)
  )
}

async function collectVerifyResultsInner(
  anthropic: Anthropic,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  manifest: VerifyManifest,
  run: { wrote: (id: string) => void; markFailed: (reason: string) => void }
) {
  for (;;) {
    const batch = await anthropic.messages.batches.retrieve(manifest.batchId)
    if (batch.processing_status === 'ended') break
    const c = batch.request_counts
    console.log(
      `  ${batch.processing_status} — processing ${c.processing}, succeeded ${c.succeeded}, errored ${c.errored}`
    )
    await sleep(POLL_INTERVAL_MS)
  }

  console.log('\nBatch ended. Writing verdicts.\n')

  const stats = { high: 0, medium: 0, low: 0, errored: 0 }
  const records: VerifyRecord[] = []

  for await (const entry of await anthropic.messages.batches.results(
    manifest.batchId
  )) {
    const plantId = entry.custom_id
    const m = manifest.plants[plantId]
    if (!m) {
      console.log(`  ${plantId} — not in manifest, skipping`)
      stats.errored++
      continue
    }

    if (entry.result.type !== 'succeeded') {
      console.log(`  ${m.commonName} — ${describeBatchFailure(entry.result)}`)
      stats.errored++
      continue
    }
    const text = entry.result.message.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') {
      console.log(
        `  ${m.commonName} — no text block (stop_reason ${entry.result.message.stop_reason})`
      )
      stats.errored++
      continue
    }

    let answer: VerifyAnswer
    try {
      answer = JSON.parse(text.text) as VerifyAnswer
    } catch {
      console.log(`  ${m.commonName} — unparseable response`)
      stats.errored++
      continue
    }

    const confidence = mapVerdict(answer)
    const changed = confidence !== m.priorConfidence

    const update: Record<string, unknown> = {
      image_pick_confidence: confidence,
      image_pick_reason: `verify: ${answer.reason}`,
      image_verified_at: new Date().toISOString(),
    }
    // The inverse obligation from migration 20260728220852: a pass that moves
    // something the editorial verdict rested on must null that verdict's stamp.
    // Criterion 1 reads image_pick_confidence directly, so a row whose
    // confidence moved has an editorial verdict built on a fact that no longer
    // holds — in either direction.
    if (changed) update.editorial_checked_at = null

    const { error } = await supabase
      .from('plants')
      .update(update)
      .eq('id', plantId)
    if (error) {
      console.log(`  ${m.commonName} — DB write failed: ${error.message}`)
      stats.errored++
      continue
    }
    run.wrote(plantId)

    stats[confidence]++
    console.log(
      `  ${m.commonName} — ${m.priorConfidence} → ${confidence} (species ${answer.species_match}, quality ${answer.hero_quality}): ${answer.reason}`
    )
    records.push({
      id: plantId,
      common_name: m.commonName,
      scientific_name: m.scientificName,
      url: m.url,
      prior_confidence: m.priorConfidence,
      prior_reason: m.priorReason,
      species_match: answer.species_match,
      hero_quality: answer.hero_quality,
      confidence,
      reason: answer.reason,
    })
  }

  console.log(
    `\nDone. cleared (high) ${stats.high}, still unresolved (medium) ${stats.medium}, ` +
      `demoted (low) ${stats.low}, errored ${stats.errored}.`
  )
  if (stats.low) {
    console.log(
      '\nThe low rows need a NEW candidate image (Wikimedia or a manual hero), ' +
        'not another re-check. They are in the report below.'
    )
  }
  if (stats.errored && !(stats.high + stats.medium + stats.low)) {
    run.markFailed(`all ${stats.errored} batch entr(ies) failed`)
  }
  writeVerifyReport(records)
  // Errored rows keep image_verified_at NULL, so a plain re-run retries them.
}

interface VerifyRecord {
  id: string
  common_name: string
  scientific_name: string | null
  url: string
  prior_confidence: string | null
  prior_reason: string | null
  species_match: string
  hero_quality: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

/**
 * Written from this run's records, not from the database — unlike the pick
 * report, which describes catalog state. This one describes a set of DECISIONS
 * and their before/after, which is only knowable here: once the verdict is
 * written, the prior confidence is gone from the row.
 */
function writeVerifyReport(records: VerifyRecord[]) {
  if (records.length === 0) return
  mkdirSync(REPORTS_DIR, { recursive: true })
  const jsonOut = join(REPORTS_DIR, 'image-verify.json')
  writeFileSync(jsonOut, JSON.stringify(records, null, 2) + '\n')

  const group = (c: string) => records.filter((r) => r.confidence === c)
  const lines = [
    '# Hero image verification — review',
    '',
    `${records.length} medium-confidence hero(es) re-judged on their own merits.`,
    `Result: ${group('high').length} cleared, ${group('medium').length} still unresolved, ${group('low').length} demoted.`,
    '',
    'Demoted first — those need a new candidate image, not another check.',
    '',
  ]
  const section = (title: string, rows: VerifyRecord[]) => {
    if (!rows.length) return
    lines.push(`## ${title} (${rows.length})`, '')
    for (const r of rows) {
      lines.push(
        `### ${r.common_name}${r.scientific_name ? ` (${r.scientific_name})` : ''}`,
        '',
        `species ${r.species_match}, quality ${r.hero_quality}`,
        '',
        r.reason,
        '',
        `_pick said:_ ${r.prior_reason ?? '(no reason recorded)'}`,
        '',
        `<img src="${r.url}" width="280">`,
        ''
      )
    }
  }
  section('Demoted to low', group('low'))
  section('Still medium', group('medium'))
  section('Cleared to high', group('high'))

  writeFileSync(join(REPORTS_DIR, 'image-verify.md'), lines.join('\n') + '\n')
  console.log(`\nVerify report: ${join(REPORTS_DIR, 'image-verify.md')}`)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const recheck = args.includes('--recheck')
  const resumeId = parseFlag('--resume')
  const limit = parseLimit()

  const supabase = getSupabaseAdmin()

  if (args.includes('--verify')) {
    const anthropic = getAnthropicClient()
    if (resumeId) {
      const manifest = JSON.parse(
        readFileSync(verifyManifestPath(resumeId), 'utf8')
      ) as VerifyManifest
      await collectVerifyResults(anthropic, supabase, manifest)
      return
    }
    await runVerify(supabase, anthropic, {
      dryRun,
      limit,
      reverify: args.includes('--reverify'),
    })
    return
  }

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

  // Scope is mandatory here too. `image_checked_at IS NULL` is a state
  // predicate, not a scope: it selects every plant the pass has never reached,
  // across every round, so a routine run for a new batch quietly picks heroes
  // for older ones as well.
  const scope = requireScope(
    'pick-plant-images',
    'This pass bills a vision call per plant and OVERWRITES the hero image. ' +
      'An unscoped run would re-pick for every unchecked plant in the catalog.'
  )
  const scopeIdList = scopeIds(scope)
  const whyAll = requireReasonForAll(scope)
  console.log(describeScope(scope, scopeIdList))
  if (whyAll) console.log(`Whole-catalog run, because: ${whyAll}`)

  // Ordered by id — paging needs a unique column to be stable.
  //
  // Fetched WITHOUT filtering on image_candidates on purpose, so a row missing
  // its candidates is counted rather than silently dropped. See the check below.
  let scoped = await fetchAllRows<PlantRow>((from, to) => {
    let q = supabase
      .from('plants')
      .select(
        'id, common_name, scientific_name, bloom_months, image_url, image_candidates'
      )
    if (!recheck) q = q.is('image_checked_at', null)
    return applyScope(q, scopeIdList).order('id').range(from, to)
  })

  // A ROW WITH NO CANDIDATES IS UNJUDGED, NOT JUDGED-AND-FINE.
  //
  // This filter used to live in the query as `.not('image_candidates','is',null)`,
  // which made rows without candidates vanish before anything counted them. The
  // pass then printed "every plant with candidates has been checked" and exited
  // 0. Round 9 hit exactly that: all 50 plants had NULL image_candidates, the
  // vision pass judged none of them and reported success, and the truth only
  // surfaced one step later when curate-editorial held all 50 for "the image
  // pass never judged this row".
  //
  // image_candidates is populated by recover-image-categories.ts, which is now
  // runbook step 7 — but a missing prerequisite must FAIL rather than read as
  // a clean result. Same rule as a rate-limited fetch: no data is not the same
  // answer as a negative one.
  const missingCandidates = scoped.filter((p) => p.image_candidates === null)
  if (missingCandidates.length > 0) {
    console.error(
      `\n${missingCandidates.length} of ${scoped.length} plant(s) in scope have no image_candidates.\n` +
        'They CANNOT be judged, and skipping them quietly is how a round ends up\n' +
        'with heroes nobody picked. Populate the candidates first:\n\n' +
        '  ./node_modules/.bin/tsx --env-file=.env.local scripts/recover-image-categories.ts\n\n' +
        'Then re-run this pass. First few affected:\n' +
        missingCandidates
          .slice(0, 5)
          .map((p) => `  · ${p.common_name} (${p.scientific_name})`)
          .join('\n')
    )
    process.exit(1)
  }

  let plants = scoped
  plants.sort((a, b) => a.common_name.localeCompare(b.common_name))
  if (limit) plants = plants.slice(0, limit)

  if (plants.length === 0) {
    console.log(
      'Nothing to do — every plant in scope has been checked. Use --recheck to redo.'
    )
    // Still refresh the report: the reviewer may just want the current state.
    await writeReviewReport(supabase)
    return
  }

  console.log(`Shortlisting and probing ${plants.length} plant(s).\n`)

  const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = []
  const manifestPlants: Manifest['plants'] = {}
  const skipped: string[] = []
  const deferred: string[] = []
  let totalRejected = 0
  let totalCapped = 0

  for (const [i, plant] of plants.entries()) {
    const candidates = plant.image_candidates ?? []
    const short = shortlist(candidates, plant.image_url)
    const { kept, rejected, unresolved, capped } = await measure(
      short,
      plant.image_url
    )
    totalRejected += rejected.length
    totalCapped += capped

    const label = `${pad(i + 1)}/${plants.length} ${plant.common_name}`

    // An incomplete pool is not a pool. Judging what did load would write a
    // confidently-worded pick chosen from a set the reviewer never intended,
    // and stamping the row means a plain re-run skips it forever — so leave the
    // row untouched and let the next run retry it, which is what an errored row
    // already does everywhere else in this pass.
    if (unresolved.length > 0) {
      console.log(
        `${label} — DEFERRED, ${unresolved.length} candidate(s) unresolved after retries; not judged, not stamped`
      )
      for (const u of unresolved) console.log(`          unresolved: ${u}`)
      deferred.push(plant.common_name)
      continue
    }

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
    } else {
      // A dropped Wikimedia candidate is reported even outside a dry run,
      // because it is the one kind of loss nobody would otherwise notice.
      // Trefle candidates arrive in bulk and a dead one among twenty-eight is
      // routine; a Wikimedia candidate was sourced BY HAND for this exact
      // plant, usually because nothing else was good enough. Losing it puts
      // the pick back among the photos that were already judged inadequate,
      // stamps the row, and says nothing. Probing now retries transient
      // failures (lib/image-probe.ts), so anything still dropping here has
      // failed three times and is worth a human seeing.
      for (const r of rejected) {
        if (r.startsWith('wikimedia:')) console.log(`          drop: ${r}`)
      }
    }

    // Pre-fetch Wikimedia images as base64 (Anthropic can't fetch the upload
    // host). A fetch that fails drops that candidate from the request, so build
    // the manifest from the SAME set the request is built from — the label the
    // model returns indexes that exact list, and a mismatch resolves the wrong
    // photo.
    const blobs = new Map<string, ImageBlob>()
    let unfetchable = false
    for (const img of kept) {
      if (img.source !== 'wikimedia') continue
      const blob = await fetchImageBlob(img.url)
      if (blob) blobs.set(img.url, blob)
      else {
        // Same reasoning as the unresolved-probe branch above: the photo
        // measured fine seconds ago, so failing to fetch it now is a network
        // answer, not a verdict. Defer rather than judge the rest.
        console.log(
          `${label} — DEFERRED, wikimedia image measured but could not be fetched: ${img.url}`
        )
        unfetchable = true
      }
    }
    if (unfetchable) {
      deferred.push(plant.common_name)
      continue
    }

    const request = buildRequest(plant, kept, blobs)
    if (!request) {
      console.log(`${label} — no sendable images after fetch, skipping`)
      skipped.push(plant.common_name)
      continue
    }
    const sent = kept.filter(
      (img) => img.source !== 'wikimedia' || blobs.has(img.url)
    )

    requests.push(request)
    manifestPlants[plant.id] = {
      commonName: plant.common_name,
      incumbent: plant.image_url,
      images: sent,
    }
  }

  console.log(
    `\nProbing done: ${requests.length} plant(s) ready, ${skipped.length} with nothing usable, ` +
      `${deferred.length} deferred, ` +
      `${totalRejected} candidate image(s) rejected, ${totalCapped} good candidate(s) left unsent at the ${MAX_FOR_VISION}-image cap.`
  )
  if (deferred.length > 0) {
    console.log(
      `\nDeferred (unstamped, re-run to retry): ${deferred.join(', ')}`
    )
    // Exit non-zero even though the rest of the batch is about to run fine: a
    // round must not read this step as finished while a plant it was pointed at
    // was never looked at. This is the StepStatus.vacuous lesson in a second
    // costume — "this run has no news about X" is not "there is no X".
    process.exitCode = 1
  }

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
    // The scope's ids ride along in the manifest so a --resume days later is
    // still bound by the scope the batch was built under. Re-parsing the flags
    // at resume time would let a different --round silently rebind the writes.
    scopeIds: scopeIdList,
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

const PICK_MAX_TOKENS = 4096
const PICK_EFFORT = 'medium'

/**
 * The two modes are two RUNS, and the run is opened where the writes happen.
 *
 * Both modes submit a batch in one process and write the results in another —
 * `--resume <batch-id>` reattaches days later. The submitting half writes
 * nothing, so the invocation that owns the provenance is the collecting half,
 * whichever entry point reached it. A resumed collect is a separate run with its
 * own id, which is exactly right: it is a separate invocation, and the record
 * says so rather than pretending one run spanned both halves.
 *
 * WHY NOT ONE RUN WITH A UNION WRITE-SET. The two modes disagree about the same
 * column in opposite directions. `image_verified_at` is CLEARED by the pick (the
 * old verification was about a photo that is no longer the hero) and SET by
 * verify. A single write-set could name it once and would then have to pick one
 * witness for two opposite acts — which is the concrete version of why the
 * column can never identify its writer.
 */
function pickWitnesses(): Witness[] {
  const bounded = (covers: string): Witness => ({
    kind: 'row-touched',
    covers,
    table: 'plants',
    column: 'updated_at',
  })
  return [
    // The one column this pass SETS, so the one that can confirm the claim.
    {
      kind: 'stamp',
      covers: 'image_checked_at',
      column: 'image_checked_at',
    },
    // Values: a url, a credit, a verdict and its prose. None is an instant.
    bounded('image_url_curated'),
    bounded('image_attribution'),
    bounded('image_pick_confidence'),
    bounded('image_pick_reason'),
    // CLEARED as the inverse obligation from migration 20260728220852 — a new
    // hero invalidates the editorial verdict and the verification that were
    // about the old one. A cleared column holds NULL and matches no window, so
    // neither can witness itself here.
    bounded('editorial_checked_at'),
    bounded('image_verified_at'),
  ]
}

/** Poll a batch to completion, then write each pick back to its plant. */
async function collectResults(
  anthropic: Anthropic,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  manifest: Manifest
) {
  return withRunRecord(
    {
      step: 'pick-plant-images',
      writeSet: [
        'image_url_curated',
        'image_attribution',
        'image_pick_confidence',
        'image_pick_reason',
        'image_checked_at',
        'editorial_checked_at',
        'image_verified_at',
      ],
      evidence: pickWitnesses(),
      // The batch id, because it is the only thing that ties a resumed collect
      // back to the submission that produced its answers.
      scope: `batch ${manifest.batchId} (submitted ${manifest.createdAt})${
        manifest.scopeIds ? `, ${manifest.scopeIds.length} id(s)` : ', --all'
      }`,
      recipe: {
        // VISION_MODEL, not CURATION_MODEL. Recorded from the MANIFEST rather
        // than from the constant: a --resume days later must report the model
        // the batch actually ran on, not whatever the constant says today.
        model: manifest.model,
        template: buildPrompt(RECIPE_PROBE_PLANT, RECIPE_PROBE_IMAGES),
        // The shortlist cap shapes what the model ever gets to see, so a run
        // that showed 6 candidates is not the same recipe as one that showed 12.
        ingredients: {
          max_for_vision: MAX_FOR_VISION,
          min_long_edge: MIN_LONG_EDGE,
          schema: buildSchema(RECIPE_PROBE_IMAGES.length),
        },
        // Effort is a decoding parameter here in the way temperature is
        // elsewhere: it bounds the thinking budget, and at 1024 tokens a sixth
        // of the catalog spent the whole budget thinking and returned no JSON.
        decoding: { max_tokens: PICK_MAX_TOKENS, effort: PICK_EFFORT },
      },
    },
    (run) => collectResultsInner(anthropic, supabase, manifest, run)
  )
}

async function collectResultsInner(
  anthropic: Anthropic,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  manifest: Manifest,
  run: { wrote: (id: string) => void; markFailed: (reason: string) => void }
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

  // Enforced from the MANIFEST, not from this invocation's flags, so a
  // --resume days later is still bound by the scope the batch was built
  // under. Re-reading the flags here would let a different --round rebind
  // where the writes land, which is the one thing --resume must never do.
  const allowed = manifest.scopeIds ? new Set(manifest.scopeIds) : null

  const stats = { high: 0, medium: 0, low: 0, none: 0, errored: 0 }
  const review: string[] = []

  for await (const entry of await anthropic.messages.batches.results(batchId)) {
    const plantId = entry.custom_id

    if (entry.result.type !== 'succeeded') {
      // The manifest is the only place the name lives at this point, and a
      // bare UUID is unreadable in a 28-row summary.
      const named = manifest.plants[plantId]?.commonName ?? plantId
      console.log(`  ${named} — ${describeBatchFailure(entry.result)}`)
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
    if (allowed && !allowed.has(plantId)) {
      console.log(
        `  ${entryManifest.commonName} — outside this batch's scope, refusing to write`
      )
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
      // A "no usable photo" row is written and stamped like any other, so it
      // counts. It is the outcome the stamp exists to make resumable.
      run.wrote(plantId)
      console.log(`  ${plant.common_name} — no usable photo: ${pick.reason}`)
      stats.none++
      review.push(`${plant.common_name}: no usable photo`)
      continue
    }

    // Store a rendition when the winner is an oversized Commons original. The
    // photograph is identical and the attribution unchanged; only the bytes a
    // browser is asked to pull differ.
    const display = await displayUrlFor(chosen.url)
    if (display.kind === 'unmeasured') {
      console.log(
        `  ${plant.common_name} — could not size-check the winning image (${display.reason}); storing the original`
      )
    }
    const displayUrl = display.url

    const { error } = await supabase
      .from('plants')
      .update({
        image_url_curated: displayUrl,
        // Credit the source when it requires one (Wikimedia); a Trefle pick
        // carries no attribution, so this clears any stale credit from a prior
        // Wikimedia pick that has since been beaten by a Trefle photo.
        image_attribution: chosen.attribution ?? null,
        image_pick_confidence: pick.confidence,
        image_pick_reason: pick.reason,
        image_checked_at: new Date().toISOString(),
        // The inverse obligation from migration 20260728220852. This pass
        // decides the hero, and criterion 1 of the editorial bar is "the image
        // shows the right plant" — so any editorial verdict on this row was
        // made about whatever photograph used to be here. Keeping the stamp
        // would leave an approval attached to an image nobody signed off.
        //
        // Nulled unconditionally rather than only when the URL changes: a
        // re-pick that lands on the same photo still rewrites the confidence
        // the verdict was read from, and "same URL" is not the same claim as
        // "same judgment".
        editorial_checked_at: null,
        // Likewise the verification: it was a judgment about a specific photo.
        image_verified_at: null,
      })
      .eq('id', plantId)

    if (error) {
      console.log(`  ${plant.common_name} — DB write failed: ${error.message}`)
      stats.errored++
      continue
    }
    run.wrote(plantId)

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
  // A batch where every entry errored is a failure even though nothing threw.
  const written = stats.high + stats.medium + stats.low + stats.none
  if (stats.errored && !written) {
    run.markFailed(`all ${stats.errored} batch entr(ies) failed`)
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

// Importable for tests without running main().
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
