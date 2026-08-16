/**
 * Regenerate `native_region` for the whole catalog from structured distribution
 * data. Decision: Notion "Region Data Model — Decision" (Option A, signed off).
 *
 * WHY: the existing native_region tags (mediterranean / balkans / croatia) are
 * an unreliable prompt artifact from the round-5 seed. They are discarded and
 * regenerated for all plants from one consistent source so the tags cannot
 * contradict the plant's real native range and coverage is complete by
 * construction rather than dependent on what a prompt happened to ask for.
 *
 * MODEL (Option A — TDWG WGSRPD Level 2, one consistent zoom level):
 *   Primary   — Trefle `distributions.native[]` (Level-3 codes, native-only,
 *               already establishment-filtered), each L3 unit rolled up to its
 *               Level-2 region via the authoritative tdwg/wgsrpd table. "YUG"
 *               (the atomic Level-3 unit; Croatia is not exposed below it)
 *               becomes "Southeastern Europe" — the stale label never surfaces.
 *   Fallback  — when Trefle returns an EMPTY native list (a Trefle coverage
 *               hole, confirmed on accepted records — not bad IDs), derive the
 *               Level-2 tags from the already-clean `native_to` prose using the
 *               curation model. Garden hybrids / cultigens with no wild range
 *               stay correctly empty.
 *
 * NOT in scope: rewriting the user-facing `native_to` prose. That is voice-
 * passed copy and belongs in a separate, copy-reviewed pass. This script only
 * writes `native_region`, which is currently read by nothing (inert column),
 * so applying it has no downstream breakage.
 *
 * SAFETY: generate-then-apply, same split as cross-check-native-to.ts.
 *   Default run  — computes everything, writes a review report + JSON to
 *                  reports/, and NEVER touches the DB.
 *   --apply      — reads back the generated JSON and writes native_region.
 *                  Run the default first, review reports/native-region-regen.md,
 *                  THEN --apply.
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-region.ts --round 8
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-region.ts --all --why "<reason>"
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-region.ts --round 8 --limit 20
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-region.ts --round 8 --apply
 *
 * A scope (--round, --ids, or --all --why) is REQUIRED in both modes; there
 * is no default. See the note above main(), and scripts/scope.ts.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getSpeciesBySlug } from '../lib/trefle'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import { fetchAllRows } from '../lib/paginate'
import { MANUAL_OVERRIDES as SHARED_OVERRIDES } from '../lib/native-region-overrides'
import {
  type Scope,
  requireScope,
  requireReasonForAll,
  scopeIds,
  describeScope,
  scopeGuard,
} from './scope'
import { L2_NAMES, L2_VOCAB, L2_SET } from '../lib/wgsrpd-regions'
import { recipeHash, withRunRecord } from './run-provenance'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const REPORTS_DIR = join(process.cwd(), 'reports')
const GEOJSON = join(REPORTS_DIR, 'level3.geojson')
const WGSRPD_MAP = join(REPORTS_DIR, 'wgsrpd-l3-map.json')
const TREFLE_CACHE = join(REPORTS_DIR, 'trefle-native-cache.json')
const NATIVE_TO_CACHE = join(REPORTS_DIR, 'native_to-l2-cache.json')
const PLAN_JSON = join(REPORTS_DIR, 'native-region-regen.json')
const PLAN_MD = join(REPORTS_DIR, 'native-region-regen.md')

// A plant whose native_to says it has no wild range — empty is correct.
const NO_WILD_RANGE =
  /garden|hybrid|cultivar|cultigen|of cultivated|origin unknown/i

// Reviewed manual corrections to specific model-derived fallback rows. Kept as
// data (not hand-edits to the plan JSON) so they survive re-generation and stay
// auditable. `tags` forces an exact Level-2 set; `noWildRange` forces empty.
const MANUAL_OVERRIDES = SHARED_OVERRIDES

const uniqSorted = (xs: string[]) => [...new Set(xs)].sort()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Authoritative WGSRPD L3 -> L2 map (downloaded once, cached).
// ---------------------------------------------------------------------------
interface L3Info {
  l2cod: number
  l2name: string
  l1cod: number
  l3name: string
}

async function loadWgsrpdMap(): Promise<Record<string, L3Info>> {
  if (existsSync(WGSRPD_MAP))
    return JSON.parse(readFileSync(WGSRPD_MAP, 'utf8'))
  let text: string
  if (existsSync(GEOJSON)) {
    text = readFileSync(GEOJSON, 'utf8')
  } else {
    console.log('Downloading tdwg/wgsrpd level3.geojson (once)…')
    const res = await fetch(
      'https://raw.githubusercontent.com/tdwg/wgsrpd/master/geojson/level3.geojson'
    )
    if (!res.ok) throw new Error(`geojson download failed: ${res.status}`)
    text = await res.text()
    writeFileSync(GEOJSON, text)
  }
  const gj = JSON.parse(text)
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
// Trefle native L3 codes, cached by source_species_id.
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

// Trefle allows 120 req/min (docs/architecture.md#plant-data-provider). This makes ONE call per species, so 600ms
// (~100/min) sits under the ceiling with headroom.
//
// THE BUG THIS REPLACED (found round 8, July 27 2026): the delay was 120ms —
// roughly 500 req/min — so a cold cache 429'd after about the first 120
// species. The catch below stored the 429 as a cache entry, and downstream an
// errored entry is treated the same as an empty native list, which routes the
// plant to the `native_to` prose fallback. The run then reported SUCCESS with
// "trefle-l3=121, native_to-fallback=469" — a plausible-looking source mix
// that was really 466 rate-limit errors laundered into model-derived guesses.
// Applying it would have overwritten most of the catalog's authoritative
// regions. Hence both halves of the fix: pace + retry so the fetch succeeds,
// and throw if any fetch is still errored rather than silently degrade.
const TREFLE_DELAY_MS = 600
const TREFLE_MAX_ATTEMPTS = 4
const TREFLE_BACKOFF_MS = 5000

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
      for (let attempt = 0; attempt < TREFLE_MAX_ATTEMPTS; attempt++) {
        try {
          // Trefle's native zone objects carry the TDWG code under `tdwg_code`
          // and the level under `tdwg_level` — NOT `code`/`level`. Reading the
          // wrong field names leaves `code` undefined, so every zone falls
          // through as unmapped-L3 and the plant ends up untagged.
          const detail = (await getSpeciesBySlug(sid)) as unknown as {
            scientific_name?: string
            distributions?: {
              native?: Array<{
                name: string
                tdwg_code?: string
                tdwg_level?: number
              }> | null
            } | null
          }
          const native = (detail.distributions?.native ?? []).map((z) => ({
            name: z.name,
            code: z.tdwg_code ?? '',
            level: z.tdwg_level ?? 0,
          }))
          cache[String(sid)] = { sci: detail.scientific_name, native }
          delete cache[String(sid)]!.error
          break
        } catch (e) {
          cache[String(sid)] = { error: String(e) }
          // A 429 is a throttle, not an answer. Back off and retry rather than
          // letting it settle into the cache as "no distribution" — see the
          // rate-limit note above loadTrefleNative.
          if (String(e).includes('429') && attempt < TREFLE_MAX_ATTEMPTS - 1) {
            await sleep(TREFLE_BACKOFF_MS * Math.pow(2, attempt))
            continue
          }
          break
        }
      }
      if ((i + 1) % 20 === 0) writeFileSync(TREFLE_CACHE, JSON.stringify(cache))
      await sleep(TREFLE_DELAY_MS)
    }
    writeFileSync(TREFLE_CACHE, JSON.stringify(cache))
  }

  // Fail loudly rather than degrade. An errored fetch is indistinguishable
  // downstream from a genuine empty distribution, so it would silently route
  // the plant to the model fallback and the run would look like a success.
  const errored = sids.filter((s) => cache[String(s)]?.error)
  if (errored.length) {
    const sample = errored
      .slice(0, 3)
      .map((s) => String(cache[String(s)]?.error))
    throw new Error(
      `${errored.length} of ${sids.length} Trefle distribution fetches failed. ` +
        `Refusing to build a plan on them: an errored fetch looks exactly like an ` +
        `empty native list, so every one would silently become a model-derived ` +
        `guess. Errored species are cached as errors and a re-run retries only ` +
        `those.\nFirst errors:\n  ${sample.join('\n  ')}`
    )
  }
  return cache
}

// ---------------------------------------------------------------------------
// Fallback: native_to prose -> Level-2 regions, via the curation model.
// Cached by the exact native_to string so re-runs are stable and cheap.
// ---------------------------------------------------------------------------
function deriveFromNativeToPrompt(nativeTo: string): string {
  return `You translate a plant's native-range phrase into a set of TDWG WGSRPD Level-2 botanical regions. Return the MINIMAL set of regions the phrase implies as NATIVE range — no introduced/cultivated range, no padding.

Use ONLY these exact region strings:
${JSON.stringify(L2_VOCAB)}

Notes:
- Bare "Europe" means all five European regions (Northern, Middle, Southwestern, Southeastern, Eastern Europe).
- WGSRPD places Italy, Greece, Crete, the Balkans, Romania, Bulgaria in "Southeastern Europe"; Iberia, France, Corsica, Sardinia, Baleares in "Southwestern Europe".
- "the Mediterranean" spans Southwestern Europe, Southeastern Europe, Northern Africa, and Western Asia.
- Turkey spans "Western Asia" (its European sliver is Southeastern Europe).

Native-range phrase: "${nativeTo}"

Respond with ONLY a JSON array of region strings, no prose, no code fences.`
}

const DERIVE_MAX_TOKENS = 300

/**
 * The recipe that PRODUCES the tags, recorded into the plan so the run that
 * writes them can carry it.
 *
 * This script is a generate-then-apply pair, and the two halves sit on opposite
 * sides of the provenance boundary: generate calls the model and writes no
 * catalog value, apply writes every catalog value and calls no model. A run
 * record on apply alone would answer "what produced this native_region?" with
 * "a file", which is true and useless.
 *
 * So generate stamps its own derivation recipe into the plan, and apply reads it
 * back and records it as the recipe for the values it writes. The model in the
 * apply record is then the model that actually produced them.
 */
function derivationRecipe() {
  return {
    model: CURATION_MODEL,
    // Rendered against a probe phrase: the vocabulary and every standing note
    // are inside the template, so a change to any of them moves the hash.
    template: deriveFromNativeToPrompt('probe range'),
    // Trefle is the primary source and the model is only the fallback, so the
    // tables that override BOTH belong in the recipe: a plan built before an
    // override was added is a different cohort from one built after.
    ingredients: {
      l2_names: L2_NAMES,
      manual_overrides: MANUAL_OVERRIDES,
      no_wild_range: NO_WILD_RANGE.source,
    },
    decoding: { max_tokens: DERIVE_MAX_TOKENS },
  }
}

async function deriveFromNativeTo(
  nativeTo: string,
  cache: Record<string, string[]>
): Promise<{ tags: string[]; offVocab: string[] }> {
  if (cache[nativeTo]) return { tags: cache[nativeTo]!, offVocab: [] }
  const client = getAnthropicClient()
  const msg = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: DERIVE_MAX_TOKENS,
    messages: [{ role: 'user', content: deriveFromNativeToPrompt(nativeTo) }],
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
  const arr = JSON.parse(
    cleaned.slice(cleaned.indexOf('['), cleaned.lastIndexOf(']') + 1)
  ) as unknown[]
  const all = arr.filter((x): x is string => typeof x === 'string')
  const tags = uniqSorted(all.filter((r) => L2_SET.has(r)))
  const offVocab = all.filter((r) => !L2_SET.has(r))
  cache[nativeTo] = tags
  writeFileSync(NATIVE_TO_CACHE, JSON.stringify(cache, null, 2))
  return { tags, offVocab }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PlantRow {
  id: string
  source_species_id: number | null
  common_name: string
  scientific_name: string | null
  native_to: string | null
  native_region: string[] | null
}

type Source =
  | 'trefle-l3'
  | 'native_to-fallback'
  | 'empty-no-wild-range'
  | 'empty-unresolved'
  | 'manual-override'

interface PlanEntry {
  id: string
  common_name: string
  scientific_name: string | null
  native_to: string | null
  old_tags: string[]
  new_tags: string[]
  source: Source
  flags: string[]
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------
async function generate(
  limit: number | null,
  scope: Scope
): Promise<PlanEntry[]> {
  const supabase = getSupabaseAdmin()

  const roundIds = scopeIds(scope)
  console.log(describeScope(scope, roundIds))
  if (scope.kind === 'all') {
    console.log(
      'FULL CATALOG regeneration (--all). This re-derives every plant, including\n' +
        'rows tagged in earlier rounds, and can change settled data. Use --round\n' +
        'after a seed; --all only when the region model itself changes.'
    )
  }

  // Paginated: a bare .select() silently caps at 1000 rows, which would quietly
  // drop plants from the plan once the catalog passes that mark (it is at 595).
  const data = await fetchAllRows<PlantRow>((from, to) => {
    let q = supabase
      .from('plants')
      .select(
        'id, source_species_id, common_name, scientific_name, native_to, native_region'
      )
    if (roundIds) q = q.in('id', roundIds)
    return q.order('common_name').range(from, to)
  })
  let plants = data as PlantRow[]
  if (limit) plants = plants.slice(0, limit)

  const wgsrpd = await loadWgsrpdMap()
  const sids = plants
    .map((p) => p.source_species_id)
    .filter((s): s is number => s != null)
  const trefle = await loadTrefleNative(sids)
  const nativeToCache: Record<string, string[]> = existsSync(NATIVE_TO_CACHE)
    ? JSON.parse(readFileSync(NATIVE_TO_CACHE, 'utf8'))
    : {}

  const unknownCodes = new Set<string>()
  const plan: PlanEntry[] = []
  let fallbackCount = 0

  for (const p of plants) {
    const old_tags = p.native_region ?? []
    const flags: string[] = []
    let new_tags: string[] = []
    let source: Source

    const entry =
      p.source_species_id != null
        ? trefle[String(p.source_species_id)]
        : undefined
    const native = entry?.native ?? []

    if (native.length > 0) {
      // Primary: Trefle L3 -> L2
      const l2: string[] = []
      for (const z of native) {
        const info = wgsrpd[z.code]
        if (!info) {
          unknownCodes.add(z.code)
          flags.push(`unmapped-L3:${z.code}`)
          continue
        }
        l2.push(info.l2name)
      }
      new_tags = uniqSorted(l2)
      source = 'trefle-l3'
    } else if (p.native_to && NO_WILD_RANGE.test(p.native_to)) {
      // Correctly empty (garden hybrid / no wild range)
      new_tags = []
      source = 'empty-no-wild-range'
    } else if (p.native_to) {
      // Fallback: derive from native_to prose (Trefle had no native data)
      fallbackCount++
      const { tags, offVocab } = await deriveFromNativeTo(
        p.native_to,
        nativeToCache
      )
      new_tags = tags
      source = 'native_to-fallback'
      flags.push('MODEL-DERIVED — review')
      if (offVocab.length) flags.push(`off-vocab-dropped:${offVocab.join('/')}`)
      if (tags.length >= 12) flags.push(`over-broad:${tags.length}-regions`)
      await sleep(1200)
    } else {
      new_tags = []
      source = 'empty-unresolved'
      flags.push('NO native_to and NO Trefle data — cannot tag')
    }

    // Reviewed manual corrections win over the derived result.
    const override = p.scientific_name
      ? MANUAL_OVERRIDES[p.scientific_name]
      : undefined
    if (override) {
      if (override.noWildRange) {
        new_tags = []
        source = 'empty-no-wild-range'
      } else {
        const bad = (override.tags ?? []).filter((t) => !L2_SET.has(t))
        if (bad.length)
          throw new Error(
            `override for ${p.scientific_name} has invalid L2 tags: ${bad.join(', ')}`
          )
        new_tags = uniqSorted(override.tags ?? [])
        source = 'manual-override'
      }
      flags.push(`OVERRIDE: ${override.reason}`)
    }

    plan.push({
      id: p.id,
      common_name: p.common_name,
      scientific_name: p.scientific_name,
      native_to: p.native_to,
      old_tags,
      new_tags,
      source,
      flags,
    })
  }

  // ---- report ----
  const bySource: Record<string, number> = {}
  for (const e of plan) bySource[e.source] = (bySource[e.source] ?? 0) + 1
  const emptyNew = plan.filter((e) => e.new_tags.length === 0)
  const flagged = plan.filter((e) => e.flags.length > 0)

  // The plan records WHAT generated it. reports/ is gitignored, so without
  // scope + generatedAt a stale --all sweep is indistinguishable from the
  // current round's plan — the shape that rewrote 20 settled rows in round 8.
  // --apply refuses any plan whose scope does not match its own command line.
  //
  // `derivation` carries the recipe across the generate/apply boundary, so the
  // run that writes these tags can record what produced them rather than
  // recording the file it read.
  const derivation = derivationRecipe()
  writeFileSync(
    PLAN_JSON,
    JSON.stringify(
      {
        scope,
        generatedAt: new Date().toISOString(),
        derivation: {
          model: derivation.model,
          recipe_hash: recipeHash(derivation),
        },
        plan,
      },
      null,
      2
    )
  )

  const L: string[] = []
  L.push(
    '# native_region regeneration plan — REVIEW BEFORE --apply (no DB writes yet)'
  )
  L.push('')
  L.push(
    `Plants: **${plan.length}**. Option A (TDWG Level 2). native_region only.`
  )
  L.push('')
  L.push('## Source breakdown')
  for (const [k, v] of Object.entries(bySource).sort((a, b) => b[1] - a[1]))
    L.push(`- ${k}: **${v}**`)
  L.push('')
  L.push(
    `- New tag set empty after regen: **${emptyNew.length}** — ${emptyNew.map((e) => e.scientific_name).join(', ') || '(none)'}`
  )
  L.push(
    `- Unmapped L3 codes encountered: **${unknownCodes.size}** ${unknownCodes.size ? '— ' + [...unknownCodes].join(', ') : ''}`
  )
  L.push('')
  L.push(`## Rows needing a human glance (${flagged.length})`)
  L.push('| plant | native_to | source | new tags | flags |')
  L.push('|---|---|---|---|---|')
  for (const e of flagged) {
    L.push(
      `| ${e.common_name} | ${e.native_to ?? ''} | ${e.source} | ${e.new_tags.join(', ') || '—'} | ${e.flags.join('; ')} |`
    )
  }
  L.push('')
  L.push('## Full plan (old → new)')
  L.push('| plant | old | new | source |')
  L.push('|---|---|---|---|')
  for (const e of plan) {
    L.push(
      `| ${e.common_name} | ${e.old_tags.join(',') || '—'} | ${e.new_tags.join(', ') || '—'} | ${e.source} |`
    )
  }
  writeFileSync(PLAN_MD, L.join('\n'))

  console.log('\n=== GENERATE COMPLETE (no DB writes) ===')
  console.log(`plants: ${plan.length}`)
  console.log(
    `sources: ${Object.entries(bySource)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`
  )
  console.log(
    `fallback model calls: ${fallbackCount} | empty after regen: ${emptyNew.length} | unmapped L3: ${unknownCodes.size}`
  )
  console.log(`review -> ${PLAN_MD}`)
  // The printed command must carry the scope: --apply without one exits 1
  // (assertPlanScope needs a command line to compare the plan against).
  console.log(
    `then apply -> ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-region.ts ${scopeFlags(scope)} --apply`
  )
  return plan
}

/** The scope, spelled back as the flags that reproduce it. */
function scopeFlags(scope: Scope): string {
  switch (scope.kind) {
    case 'round':
      return `--round ${scope.label}`
    case 'ids':
      return `--ids ${scope.ids.join(',')}`
    case 'all':
      return '--all --why "<same reason>"'
  }
}

// ---------------------------------------------------------------------------
// Apply — read back the reviewed plan and write native_region only.
// ---------------------------------------------------------------------------

/**
 * Refuse a plan that was not generated by the scope on the command line.
 *
 * Trap 3's live half: --apply used to replay reports/native-region-regen.json
 * with no scope check at all, and reports/ is gitignored, so a stale --all
 * plan replayed under a round label would rewrite the whole catalog while
 * every message on screen said "round N". A plan with no recorded scope is
 * refused for the same reason: it cannot be told apart from that stale sweep.
 */
export function assertPlanScope(planScope: unknown, cliScope: Scope): void {
  const isScope = (v: unknown): v is Scope =>
    !!v &&
    typeof v === 'object' &&
    'kind' in v &&
    ['round', 'ids', 'all'].includes((v as { kind: string }).kind)

  if (!isScope(planScope))
    throw new Error(
      'This plan records no scope — it predates the 2026-08-14 plan format ' +
        'or was hand-edited. A scope-less plan cannot be told apart from a ' +
        'stale --all sweep, which is exactly what rewrote 20 settled rows in ' +
        'round 8. Regenerate the plan with a scope and review it again.'
    )

  const match =
    planScope.kind === cliScope.kind &&
    (planScope.kind !== 'round' ||
      cliScope.kind !== 'round' ||
      planScope.label === cliScope.label) &&
    (planScope.kind !== 'ids' ||
      cliScope.kind !== 'ids' ||
      (planScope.ids.length === cliScope.ids.length &&
        planScope.ids.every((id) => cliScope.ids.includes(id))))

  if (!match)
    throw new Error(
      `Plan scope ${JSON.stringify(planScope)} does not match the command ` +
        `line ${JSON.stringify(cliScope)}. --apply replays the plan file ` +
        'verbatim, so the two must agree. Regenerate under the scope you ' +
        'mean to apply.'
    )
}

/**
 * Has this row moved since the plan was built?
 *
 * assertPlanScope proves the plan was GENERATED for this command line. It cannot
 * prove the catalog still holds what the plan was built from, and those are
 * different failures: a plan is reviewed by a person and applied later, and in
 * between a hand correction can land on one of its rows. MANUAL_OVERRIDES exists
 * because exactly that kept being clobbered — the corrections were re-derived
 * away, one plant at a time, until they were moved into code.
 *
 * Compared per row rather than as a global generatedAt-versus-updated_at test.
 * The global form gets both answers wrong at once: it refuses a whole plan
 * because of a row it does not touch, and it passes a plan whose single drifted
 * row is the one that matters. It also cannot tell a real edit from a trigger
 * bumping updated_at on an idempotent re-upsert.
 *
 * Compared on the TAGS, not on a timestamp, for the same reason the stamp is the
 * only honest witness of a defaulted column: the question is whether the value
 * this plan was built from is still there, and only the value answers it.
 */
export function planRowIsStale(
  currentTags: string[] | null,
  plannedOldTags: string[]
): boolean {
  return (
    uniqSorted(currentTags ?? []).join(',') !==
    uniqSorted(plannedOldTags).join(',')
  )
}

async function apply(cliScope: Scope): Promise<void> {
  if (!existsSync(PLAN_JSON)) {
    throw new Error(
      'No plan found. Run the default (generate) mode and review it first.'
    )
  }
  const {
    scope: planScope,
    generatedAt,
    derivation,
    plan,
  } = JSON.parse(readFileSync(PLAN_JSON, 'utf8')) as {
    scope?: unknown
    generatedAt?: string | null
    derivation?: { model?: string | null; recipe_hash?: string }
    plan: PlanEntry[]
  }
  assertPlanScope(planScope, cliScope)

  // Age is printed, not enforced: the scope check above already blocks the
  // accidental replay, and an --all plan is behind a typed --why. But the
  // operator deciding "is this still the plan I reviewed?" needs the date in
  // front of them, not in a gitignored file they would have to open.
  if (generatedAt) {
    const hours = (Date.now() - Date.parse(generatedAt)) / 3_600_000
    console.log(
      `Plan generated ${generatedAt} (${hours.toFixed(1)}h ago)` +
        (hours > 24 ? ' — OLDER THAN A DAY; regenerate if in doubt.' : '')
    )
  }

  // Belt and braces: the scope check above proves the plan's PROVENANCE; this
  // guard proves each WRITE. A hand-edited plan row outside the round still
  // refuses, per the scopeGuard rationale in scope.ts.
  const ids = scopeIds(cliScope)
  const guard = scopeGuard(cliScope, ids)

  const supabase = getSupabaseAdmin()
  console.log(describeScope(cliScope, ids))
  console.log(`Applying native_region for ${plan.length} plants…`)

  await withRunRecord(
    {
      step: 'regenerate-native-region --apply',
      writeSet: ['native_region', 'native_region_checked_at'],
      // The plan's identity travels in `scope`, which is the record's readable
      // field. The recipe hash below folds the derivation in, but a hash cannot
      // be read back — an operator asking "which plan was this?" needs the date
      // and the derivation in front of them.
      scope:
        `${describeScope(cliScope, ids)} · plan ${generatedAt ?? 'undated'}` +
        ` · derivation ${derivation?.recipe_hash ?? 'unrecorded'}`,
      recipe: {
        // The model that PRODUCED these tags, carried across from generate. This
        // pass calls no model itself; recording null here would answer "what
        // produced this value?" with "a file".
        model: derivation?.model ?? null,
        template:
          'apply: plan entry new_tags → native_region; native_region_checked_at := null where the tags changed',
        ingredients: {
          derivation_recipe:
            derivation?.recipe_hash ??
            'plan predates the 2026-08-16 derivation stamp',
        },
      },
      // NEITHER member can witness itself.
      //
      // native_region is an array of region names, not an instant.
      //
      // native_region_checked_at is CLEARED, and only on the subset whose tags
      // moved. Its own column cannot see a clearing write at all: a nulled row
      // matches no window, so the default stamp witness would observe 0 against
      // a claim of N and record a correct run as CONTRADICTED.
      evidence: [
        {
          kind: 'row-touched',
          covers: 'native_region',
          table: 'plants',
          column: 'updated_at',
        },
        {
          kind: 'row-touched',
          covers: 'native_region_checked_at',
          table: 'plants',
          column: 'updated_at',
        },
      ],
    },
    async (run) => {
      let changed = 0
      /** Rows whose tags moved between the plan and now — see the check below. */
      const stale: string[] = []

      for (let i = 0; i < plan.length; i++) {
        const e = plan[i]!
        guard(e.id, e.common_name)
        const before = [...e.old_tags].sort().join(',')
        const after = [...e.new_tags].sort().join(',')

        // Plan freshness, per row — see planRowIsStale. The re-read sits ON the
        // write, in the same loop iteration, for the reason guardStampTarget
        // gives in cross-check-plants: a check that runs near the write instead
        // of on it stops being a check the first time someone reorders the loop.
        const { data, error: readError } = await supabase
          .from('plants')
          .select('native_region')
          .eq('id', e.id)
          .single()
        if (readError)
          throw new Error(
            `Re-read failed for ${e.common_name}: ${readError.message}`
          )
        if (
          planRowIsStale(data?.native_region as string[] | null, e.old_tags)
        ) {
          console.log(
            `  ⚠ ${e.common_name} — native_region changed since the plan, skipped`
          )
          stale.push(e.common_name)
          continue
        }

        // Inverse obligation from migration 20260728193815: a WCVP validation is a
        // statement about a specific set of tags, so rewriting them invalidates it.
        // Only rows whose tags actually change are un-stamped — nulling every row
        // an --all run touches would wipe the coverage the WCVP tail is building
        // for no reason.
        const patch =
          before === after
            ? { native_region: e.new_tags }
            : { native_region: e.new_tags, native_region_checked_at: null }
        const { error } = await supabase
          .from('plants')
          .update(patch)
          .eq('id', e.id)
        if (error)
          throw new Error(
            `update failed for ${e.common_name}: ${error.message}`
          )
        run.wrote(e.id)
        if (before !== after) changed++
        if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${plan.length}`)
      }

      console.log(`\n=== APPLY COMPLETE ===`)
      console.log(
        `rows written: ${plan.length - stale.length} | ` +
          `rows whose tags changed: ${changed} | ` +
          `skipped as stale: ${stale.length}`
      )
      if (stale.length) {
        console.log(
          `\n⚠ ${stale.length} row(s) moved since the plan was generated and were ` +
            `left alone:\n  ${stale.join('\n  ')}\n` +
            `  Regenerate the plan to pick up their current state.`
        )
      }
      if (plan.length && stale.length === plan.length) {
        run.markFailed(
          `every one of the ${plan.length} planned row(s) had drifted; the plan is stale`
        )
      }
    }
  )
}

// ---------------------------------------------------------------------------
/**
 * Scope is REQUIRED and has no default, deliberately.
 *
 * This script began as a one-time migration: the original region tags were an
 * unreliable prompt artifact, so every plant had to be re-derived from one
 * consistent source. That migration finished several rounds ago, but the
 * full-catalog scope stayed, so each round re-derived all ~600 plants when only
 * the new ones needed it. Two consequences, both found in round 8:
 *
 *   · It is the reason the Trefle rate limit was reachable at all. ~600 cold
 *     fetches tripped it; ~100 never would have.
 *   · It silently rewrites settled data. Round 8's full run changed 20
 *     PRE-EXISTING plants alongside its own 101 — nobody asked for those, and
 *     nothing separated them from the round's real work. The hand-maintained
 *     MANUAL_OVERRIDES table above exists precisely because corrections were
 *     being clobbered by re-generation; it patches the symptom one plant at a
 *     time.
 *
 * So there is no bare default: pass `--round <label>` after a seed, or
 * `--all --why "<reason>"` when the region model itself changes. An expensive,
 * data-moving run should be something you asked for, not something you got.
 *
 * Scope parsing lives in scripts/scope.ts (this file kept a private copy
 * until 2026-08-14; the private copy also let --apply skip the scope check
 * entirely — see assertPlanScope).
 */
async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const args = process.argv.slice(2)
  const isApply = args.includes('--apply')
  const li = args.indexOf('--limit')
  const limit = li >= 0 && args[li + 1] ? parseInt(args[li + 1]!, 10) : null

  // Scope is required in BOTH modes. --apply used to "inherit whatever scope
  // generated the plan", which in practice meant no check at all against a
  // gitignored file of unknown age.
  const scope = requireScope(
    'regenerate-native-region',
    'regenerate-native-region rewrites native_region and can null\n' +
      'native_region_checked_at; an unscoped run moves data settled in\n' +
      'earlier rounds (round 8 changed 20 pre-existing plants this way).'
  )
  requireReasonForAll(scope)

  if (isApply) {
    await apply(scope)
    return
  }
  await generate(limit, scope)
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
