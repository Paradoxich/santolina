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
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-region.ts --all
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-region.ts --round 8 --limit 20
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-region.ts --apply
 *
 * A scope (--round or --all) is REQUIRED; there is no default. See parseScope.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { getSpeciesBySlug } from '../lib/trefle'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import { fetchAllRows } from '../lib/paginate'
import { MANUAL_OVERRIDES as SHARED_OVERRIDES } from '../lib/native-region-overrides'
import { readRoundManifest } from './round-manifest'
import { L2_NAMES, L2_VOCAB, L2_SET } from '../lib/wgsrpd-regions'

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

async function deriveFromNativeTo(
  nativeTo: string,
  cache: Record<string, string[]>
): Promise<{ tags: string[]; offVocab: string[] }> {
  if (cache[nativeTo]) return { tags: cache[nativeTo]!, offVocab: [] }
  const client = getAnthropicClient()
  const msg = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: 300,
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

  let roundIds: string[] | null = null
  if (scope.kind === 'round') {
    const manifest = readRoundManifest(scope.label)
    if (!manifest) {
      throw new Error(
        `No manifest for round "${scope.label}" — expected rounds/${scope.label}/manifest.json`
      )
    }
    roundIds = manifest.seeded_ids
    console.log(
      `Scoping to round ${manifest.label}: ${roundIds.length} seeded plant(s).`
    )
  } else {
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

  writeFileSync(PLAN_JSON, JSON.stringify({ generatedAt: null, plan }, null, 2))

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
  console.log(
    `then apply -> ./node_modules/.bin/tsx --env-file=.env.local scripts/regenerate-native-region.ts --apply`
  )
  return plan
}

// ---------------------------------------------------------------------------
// Apply — read back the reviewed plan and write native_region only.
// ---------------------------------------------------------------------------
async function apply(): Promise<void> {
  if (!existsSync(PLAN_JSON)) {
    throw new Error(
      'No plan found. Run the default (generate) mode and review it first.'
    )
  }
  const { plan } = JSON.parse(readFileSync(PLAN_JSON, 'utf8')) as {
    plan: PlanEntry[]
  }
  const supabase = getSupabaseAdmin()
  console.log(`Applying native_region for ${plan.length} plants…`)
  let changed = 0
  for (let i = 0; i < plan.length; i++) {
    const e = plan[i]!
    const before = [...e.old_tags].sort().join(',')
    const after = [...e.new_tags].sort().join(',')
    // Inverse obligation from migration 20260728193815: a WCVP validation is a
    // statement about a specific set of tags, so rewriting them invalidates it.
    // Only rows whose tags actually change are un-stamped — nulling every row
    // an --all run touches would wipe the coverage the WCVP tail is building
    // for no reason.
    const patch =
      before === after
        ? { native_region: e.new_tags }
        : { native_region: e.new_tags, native_region_checked_at: null }
    const { error } = await supabase.from('plants').update(patch).eq('id', e.id)
    if (error)
      throw new Error(`update failed for ${e.common_name}: ${error.message}`)
    if (before !== after) changed++
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${plan.length}`)
  }
  console.log(`\n=== APPLY COMPLETE ===`)
  console.log(
    `rows written: ${plan.length} | rows whose tags changed: ${changed}`
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
 * So there is no bare default: pass `--round <label>` after a seed, or `--all`
 * when the region model itself changes. An expensive, data-moving run should
 * be something you asked for, not something you got.
 */
type Scope = { kind: 'round'; label: string } | { kind: 'all' }

function parseScope(args: string[]): Scope | null {
  if (args.includes('--all')) return { kind: 'all' }
  const idx = args.indexOf('--round')
  if (idx < 0) return null
  const label = args[idx + 1]
  if (!label || label.startsWith('--')) {
    throw new Error('--round requires a label, e.g. --round 8')
  }
  return { kind: 'round', label }
}

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true })
  const args = process.argv.slice(2)
  const isApply = args.includes('--apply')
  const li = args.indexOf('--limit')
  const limit = li >= 0 && args[li + 1] ? parseInt(args[li + 1]!, 10) : null

  if (isApply) {
    // --apply replays the plan JSON, so it inherits whatever scope generated it.
    await apply()
    return
  }

  const scope = parseScope(args)
  if (!scope) {
    console.error(
      'Refusing to run without a scope.\n\n' +
        '  --round <label>   the plants that round seeded (use this after a seed)\n' +
        '  --all             re-derive the ENTIRE catalog (only when the region\n' +
        '                    model changes — it can move data settled in earlier rounds)\n\n' +
        'See the parseScope note in this file for why there is no default.'
    )
    process.exit(1)
  }
  await generate(limit, scope)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
