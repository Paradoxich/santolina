/**
 * Native-range cross-check — a gross-error guard for the `native_to` phrases.
 *
 * The phrases were AI-generated from Trefle's raw distribution, which is sparse
 * and occasionally wrong. This does NOT try to make them botanically perfect
 * (western vs central Mediterranean is nobody's problem) — it catches the
 * embarrassing class: a plant placed on the WRONG CONTINENT (a Middle-Eastern
 * species labelled South America, etc.).
 *
 * IT ALSO CATCHES A SECOND CLASS THE CONTINENT TEST CANNOT SEE. `native_to` and
 * `native_region` answer the same question, and only the tags have been through
 * WCVP — so a phrase can name the wrong range while sitting on the right
 * continent, and every continent test passes. `Imperata cylindrica` is the
 * case: phrase "eastern and southeastern Asia" (the range it was INTRODUCED
 * into), validated tags Africa and the Mediterranean, both technically "Asia"
 * once Western Asia is in the tags. That is verdict `contradicts`, and the
 * validated tags are used as evidence ONLY once they carry a
 * native_region_checked_at stamp — see regionSignal().
 *
 * Three signals are weighed against the stored phrase:
 *   1. WCVP's native distribution (Kew's World Checklist, read through GBIF) —
 *      an external authority, not our own data. Introduced range is dropped, so
 *      only native localities are kept. The lookup, its guards and its cache
 *      are shared with cross-check-native-region via scripts/wcvp-lookup.ts;
 *      read that header before changing anything about the evidence here.
 *   2. Claude's own knowledge of the species (it is NOT shown the WCVP data as
 *      gospel — it reconciles both, and the raw Trefle list when available).
 *   3. Our own `native_region` tags, but ONLY once WCVP has validated them.
 *      Unstamped, they are still Trefle's naturalised-inclusive range and would
 *      be the phrase's own source vouching for it (regionSignal()).
 * When WCVP has nothing, the prompt says so as missing evidence rather than as
 * an empty native range, and there is no lower-quality fallback source: a
 * `NATIVE` marker from some other checklist is not Kew's opinion (trap 15).
 * Claude returns the native continents, the continents our phrase implies, and
 * a literal translation of the phrase into Level-2 region names. Every severity
 * call is made in code, and deliberately only where it is safe to make one:
 * "gross" when the continent sets are disjoint, "contradicts" when the phrase
 * and the validated tags share NO region at all. Partial gaps are not a verdict
 * — they are a ranked list at the end of the report, because prose is fuzzy and
 * Level 2 is exact. reconcileVerdict() records what the two sharper designs
 * cost before this one.
 *
 * Default run writes a ranked report and never EDITS catalog data — it only
 * stamps the operational native_checked_at column (docs/curation.md#botanical-cross-check, migration
 * 20260716120000) per row. `--apply` patches ONLY rows the check rated "gross"
 * that carry a suggested replacement phrase — the same generate-then-apply
 * safety split as scripts/archive/regenerate-native-to.ts.
 *
 * `contradicts` rows are deliberately NOT applied. A wrong continent is a
 * factual error any reader would call a bug; a contradicted range is a rewrite
 * of user-facing copy, and this phrase is hand-owned and voice-passed. The
 * suggested phrases on those rows are drafts for a person, not a patch.
 *
 * --round <label> is the preferred post-seed scope: exactly the ids the seed
 * run recorded in rounds/<label>/manifest.json. --new-only scopes to rows
 * never checked before (native_checked_at IS NULL) — state-based and
 * resumable (this guard was once killed at 279/494; the next run continues
 * from where it stopped), but it only narrows to a batch once the rest of the
 * catalog is stamped, and that baseline does not exist (see generate()).
 *
 * Usage (from apps/web):
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-to.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-to.ts --round 8
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-to.ts --new-only
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-to.ts --limit 10
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-to.ts --apply
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-to.ts --report-only
 *
 * `--report-only` rebuilds the markdown from the JSON already on disk, with no
 * Claude calls, no GBIF and no scope. A presentation bug in the report used to
 * mean re-billing the catalog to fix it; the first full run of the region gap
 * list shipped 25 no-evidence rows at the top and this is how that was
 * corrected.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import {
  requireScope,
  scopeIds,
  describeScope,
  scopeGuard,
  requireReasonForAll,
} from './scope'
import { getAnthropicClient, CURATION_MODEL } from '../lib/anthropic-client'
import { fetchAllRows } from '../lib/paginate'
import { L2_SET, L2_VOCAB } from '../lib/wgsrpd-regions'
import { readRoundManifest } from './round-manifest'
// One guarded, cached GBIF/WCVP lookup, shared with cross-check-native-region.
import {
  loadCache,
  lookupSpecies,
  noEvidenceReason,
  wcvpNativeLocalities,
  type CachedSpecies,
} from './wcvp-lookup'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// 2s between Claude calls — same pacing as curate-plants.ts / cross-check-plants.ts
const INTER_PLANT_DELAY_MS = 2000

const REPORTS_DIR = join(process.cwd(), 'reports')
const JSON_OUT = join(REPORTS_DIR, 'native-to-crosscheck.json')
const MD_OUT = join(REPORTS_DIR, 'native-to-crosscheck.md')
// Raw Trefle distribution, if scripts/archive/regenerate-native-to.ts left it behind (optional).
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
  native_region: string[] | null
  native_region_checked_at: string | null
  created_at: string
}

// --new-only restricts the check to rows this guard has never checked —
// native_checked_at IS NULL. State-based, so it's exact (no UTC-midnight batch
// split) and resumable — the reason it matters here: this guard was once
// killed at 279/494, and the next --new-only run now continues from where it
// stopped instead of re-billing Claude for the rows already checked. Replaced
// an earlier newest-calendar-day heuristic. Mirrors cross-check-plants.ts.

// Stamp a row as native-checked. Operational metadata only — never touches a
// catalog field (native_to edits happen only via the explicit --apply path).
/**
 * The id to stamp, refusing if it is outside the active scope.
 *
 * A guard is set up in main() and consumed here, so the module-level indirection
 * is deliberate: the check has to sit ON the write, not near it.
 */
let activeGuard: ((id: string) => void) | null = null
function guardStampTarget(id: string): string {
  activeGuard?.(id)
  return id
}

async function stampChecked(id: string): Promise<void> {
  const db = getSupabaseAdmin()
  const { error } = await db
    .from('plants')
    .update({ native_checked_at: new Date().toISOString() })
    .eq('id', guardStampTarget(id))
  if (error) throw new Error(`Failed to stamp ${id}: ${error.message}`)
}

type Continent = (typeof CONTINENTS)[number]
type Verdict = 'ok' | 'minor' | 'gross' | 'contradicts' | 'no_data'

interface Judgment {
  native_continents: Continent[]
  phrase_continents: Continent[]
  verdict: Verdict
  confidence: 'high' | 'low'
  suggested_phrase: string | null
  note: string
  /**
   * The phrase itself, translated into Level-2 region names — what the wording
   * claims, not what the plant is. The model translates; the CODE decides
   * whether that set contradicts the validated tags (reconcileVerdict).
   */
  phrase_regions: string[]
  /**
   * The validated tags rendered back into house-style prose — the draft a
   * person edits on a `contradicts` row. Never written to the catalog by this
   * script: `native_to` is voice-passed copy (see the header).
   */
  phrase_from_tags: string | null
}

interface Result extends Judgment {
  id: string
  common_name: string
  scientific_name: string | null
  stored_phrase: string | null
  gbif_tier: string
  gbif_regions: string[]
  region_tier: string
  region_tags: string[]
  /** Regions the phrase claims that the validated tags do not list. */
  claimed_not_in_tags: string[]
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
// WCVP — independent native distribution, keyed by scientific name
// ---------------------------------------------------------------------------

/**
 * WCVP's native localities for a species, via the shared lookup.
 *
 * THIS USED TO BE ITS OWN LOOKUP, and it was the weaker of the two the pipeline
 * ran (see scripts/wcvp-lookup.ts for the whole story). Three things changed
 * when it moved onto the shared one, and each closes a recorded trap:
 *
 *   · `strict=true` plus a species-rank guard, so an unknown binomial fails
 *     instead of resolving to its genus and answering for 41 regions (trap 11).
 *   · rows filtered to `source === WCVP_SOURCE`. The old code accepted any row
 *     GBIF returned, so a `NATIVE` marker from the World Register of Marine
 *     Species read as Kew's opinion (trap 15). Its two fallback tiers
 *     ("native-recs", "weak") were exactly that contamination, handed to Claude
 *     labelled as an authority — worse than no evidence, because the prompt
 *     presented it as the independent signal.
 *   · the committed cache, so this and cross-check-native-region pay GBIF once
 *     between them rather than once each.
 *
 * Dropping the fallback tiers means fewer species carry evidence here. That is
 * the intended direction: `tier` now says WHY it is missing, and the prompt
 * states the absence as missing evidence rather than as an empty native range.
 * A failed or unmatched lookup must never read as "native nowhere" (trap 1).
 */
async function wcvpNativeSignal(
  sci: string,
  cache: Record<string, CachedSpecies>
): Promise<{ tier: string; regions: string[] }> {
  const species = await lookupSpecies(sci, cache)
  const missing = noEvidenceReason(species)
  if (missing) return { tier: missing, regions: [] }
  return { tier: 'wcvp', regions: wcvpNativeLocalities(species).native }
}

/**
 * Our own `native_region` tags, used as evidence ONLY once WCVP has seen them.
 *
 * WHY THE GATE. `native_region` and `native_to` describe the same origin, so
 * the tags are the sharpest available check on the phrase — but only after
 * cross-check-native-region has validated them against Kew. Before that they
 * are Trefle's `distributions.native[]`, which mixes in naturalised range
 * (trap 3) — the very error the phrase might be repeating. Feeding unvalidated
 * tags to the model would be checking a source against its own sibling and
 * calling the agreement proof.
 *
 * An unstamped row therefore contributes no region evidence at all, stated as
 * absence, the same discipline wcvpNativeSignal() applies to a failed lookup.
 */
function regionSignal(plant: PlantRow): { tier: string; regions: string[] } {
  const tags = plant.native_region ?? []
  if (!plant.native_region_checked_at)
    return { tier: 'not-yet-validated-against-wcvp', regions: [] }
  if (!tags.length) return { tier: 'validated-as-no-wild-range', regions: [] }
  return { tier: 'wcvp-validated', regions: tags }
}

// ---------------------------------------------------------------------------
// Claude — reconcile GBIF + own knowledge, judge the stored phrase
// ---------------------------------------------------------------------------

function buildPrompt(
  plant: PlantRow,
  gbif: { tier: string; regions: string[] },
  region: { tier: string; regions: string[] },
  raw: string | null
): string {
  const identity = [
    `common name: ${plant.common_name}`,
    plant.scientific_name ? `scientific name: ${plant.scientific_name}` : '',
    plant.family ? `family: ${plant.family}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  // Absence of evidence is stated AS absence, with its reason. "(none
  // returned)" read as "this plant is native nowhere", which is trap 1 wearing
  // a prompt: a lookup that failed or never matched must not be presented as a
  // finding about the species.
  const gbifLine = gbif.regions.length
    ? `WCVP native distribution (Kew's World Checklist, via GBIF; introduced range removed):\n${gbif.regions.join(', ').slice(0, 1500)}`
    : `WCVP native distribution: NOT AVAILABLE — ${gbif.tier}. This is missing evidence, NOT evidence that the plant has no native range. Judge from your own knowledge of the species and lower your confidence accordingly.`

  const rawLine = raw
    ? `Raw Trefle distribution we originally imported (may contain outdated names): ${raw.slice(0, 800)}`
    : ''

  // The tags are presented as OUR data that Kew has checked, not as a second
  // authority — they came from the same import the phrase did, and only the
  // WCVP pass makes them worth believing over it.
  const regionLine =
    region.tier === 'wcvp-validated'
      ? `Our structured native_region tags for this plant, WGSRPD Level-2, already validated against WCVP and human-reviewed:\n${region.regions.join(', ')}`
      : region.tier === 'validated-as-no-wild-range'
        ? `Our structured native_region tags: validated against WCVP and deliberately EMPTY — Kew records no wild native range for this species (a cultigen or garden hybrid).`
        : `Our structured native_region tags: NOT USABLE — ${region.tier}. Ignore them entirely; judge from WCVP and your own knowledge.`

  return `You are a botanical geography fact-checker. Decide whether our catalog's short native-range phrase for a plant puts it on the correct CONTINENT(S). We care ONLY about gross errors (e.g. a Eurasian plant labelled South America). Sub-continental imprecision (e.g. "western" vs "central Mediterranean", a dropped secondary region) is NOT a gross error.

You must also TRANSLATE the phrase into WGSRPD Level-2 region names — "phrase_regions" below. Translate the WORDING ONLY: every region the phrase's own words claim, and nothing else. Do not add regions you know the plant occurs in, do not drop regions you think are wrong, and do not consult the tags to decide. Where an everyday word is broader than the Level-2 region that shares its name, translate the everyday meaning: "eastern Asia" in ordinary English covers China, so it is ["Eastern Asia", "China"], not ["Eastern Asia"] alone. Worked examples: "Japan, Korea, and China" is exactly ["Eastern Asia", "China"]. "the Mediterranean" is ["Southwestern Europe", "Southeastern Europe", "Northern Africa", "Western Asia"]. "southeastern Asia" is ["Indo-China", "Malesia"]. "central Asia" is ["Middle Asia"]. Comparing that set against our tags is done afterwards in code, not by you.

Plant identity:
${identity}

Our catalog phrase (the thing being checked): "${plant.native_to ?? '(none)'}"

Independent evidence:
${gbifLine}
${regionLine}
${rawLine}

Weigh the GBIF evidence together with your own knowledge of this species' TRUE NATIVE range (ignore where it is merely cultivated or naturalised). For cultivated hybrids or garden cultigens with no real wild native range, set confidence "low".

Continents vocabulary (use these exact strings): ${JSON.stringify(CONTINENTS)}

Level-2 region vocabulary for "phrase_regions" (use these exact strings, nothing else): ${JSON.stringify(L2_VOCAB)}

Respond with ONLY JSON, no code fences:
{
  "native_continents": [ ...the plant's true native continents... ],
  "phrase_continents": [ ...the continents our catalog phrase implies... ],
  "phrase_regions": [ ...the Level-2 regions our phrase's WORDING claims, translated literally... ],
  "verdict": "ok" | "minor" | "gross",   // "gross" = phrase places the plant on a continent it is NOT native to (a wrong-place error); "minor" = right continent(s) but imprecise or incomplete; "ok" = accurate
  "confidence": "high" | "low",
  "suggested_phrase": "a short 2-7 word modern-geography replacement, same terse style as the original, whenever the phrase names a continent the plant is not native to; otherwise null",
  "phrase_from_tags": "a 2-7 word phrase describing EXACTLY the validated native_region tags above and nothing more, or null if they were not usable. This is a translation, not a judgement: do not add or drop range. House style — lowercase directional words (central, southern, eastern, western, northern) and connectors, capitalize only proper place names, write \\"the Mediterranean\\" with the article, no dashes of any kind, no parentheses, no \\"including\\" or \\"particularly\\". For empty tags (a cultigen with no wild range) write a phrase saying it is a garden plant with no wild origin.",
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
    // Off-vocabulary names are dropped rather than trusted: an unrecognised
    // string cannot be compared against the tags, and keeping it would let a
    // typo read as a region the tags "exclude".
    phrase_from_tags:
      typeof p.phrase_from_tags === 'string' && p.phrase_from_tags.trim()
        ? p.phrase_from_tags.trim()
        : null,
    phrase_regions: Array.isArray(p.phrase_regions)
      ? (p.phrase_regions as unknown[]).filter(
          (r): r is string => typeof r === 'string' && L2_SET.has(r)
        )
      : [],
  }
}

async function judge(
  plant: PlantRow,
  gbif: { tier: string; regions: string[] },
  region: { tier: string; regions: string[] },
  raw: string | null
): Promise<Judgment> {
  const client = getAnthropicClient()
  const message = await client.messages.create({
    model: CURATION_MODEL,
    max_tokens: 512,
    system:
      'You are a botanical geography fact-checker. Respond with ONLY valid JSON, no markdown, no code fences, no preamble.',
    messages: [
      { role: 'user', content: buildPrompt(plant, gbif, region, raw) },
    ],
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
 *   - conflicts with validated tags  -> contradicts (right continent, wrong range)
 *   - overlapping but not identical  -> minor  (right place, imprecise/incomplete;
 *                                               includes multi-continent words
 *                                               like "the Mediterranean")
 *   - identical                      -> ok
 *
 * `contradicts` exists because continent overlap is too coarse to catch the
 * error this pair of fields actually makes. Imperata cylindrica's phrase and
 * its true range both say "Asia", so every continent test passes — while the
 * phrase names the range it was introduced into and the validated tags say
 * Africa and the Mediterranean. It ranks below gross and above minor: the place
 * is wrong, but a reader is not being sent to the wrong continent.
 *
 * THE COMPARISON IS DONE HERE, NOT BY THE MODEL — and it is deliberately blunt.
 * Two sharper designs were tried and both flooded the report:
 *
 *   1. Asking Claude "does this contradict the tags?" flagged phrases for
 *      OMITTING regions the tags list, which is a phrase being less specific
 *      and is not an error. `Styrax japonicus` — "Japan, Korea, and China"
 *      against tags including China and Eastern Asia — was called a
 *      contradiction, when Japan and Korea ARE Eastern Asia here.
 *   2. Translating the phrase to Level-2 names and flagging ANY claimed region
 *      absent from the tags. This looks rigorous and is not: prose is fuzzy and
 *      Level 2 is exact, so an umbrella word manufactures contradictions at its
 *      edges. "the Mediterranean" expands to include Western Asia, which
 *      Rosmarinus officinalis' tags deliberately exclude (a reviewed override,
 *      lib/native-region-overrides.ts) — so the catalog's single most obviously
 *      correct phrase came back flagged. Lavandula and Cistus went the same way.
 *
 * So the VERDICT fires only where fuzziness cannot explain the gap: the phrase
 * and the tags share NOTHING, or the tags are validated-empty and the phrase
 * claims a range anyway. Everything else keeps its continent verdict and
 * carries `claimed_not_in_tags` as data — the report ranks those so a person
 * reads the widest gaps first. A guard that cries wolf on Rosemary is worth
 * less than a short list somebody actually reads.
 */
function claimedNotInTags(
  j: Judgment,
  region: { regions: string[] }
): string[] {
  const tags = new Set(region.regions)
  return j.phrase_regions.filter((r) => !tags.has(r))
}

function reconcileVerdict(
  j: Judgment,
  region: { tier: string; regions: string[] }
): Verdict {
  const nat = j.native_continents
  const phr = j.phrase_continents

  // A cultigen validated as having no wild range: the phrase claims an origin
  // Kew says does not exist. Tested before the no_data guard below, which would
  // otherwise file Citrus limon's "southern Asia" as "we learned nothing" — an
  // empty validated range against a phrase naming one is the opposite of that.
  if (region.tier === 'validated-as-no-wild-range' && phr.length > 0)
    return 'contradicts'

  // Shares nothing with the validated tags. Fuzzy wording can misplace the edge
  // of a range; it cannot put the whole range on the wrong landmass, which is
  // what Imperata cylindrica's phrase does.
  if (region.tier === 'wcvp-validated' && j.phrase_regions.length > 0) {
    const tags = new Set(region.regions)
    if (!j.phrase_regions.some((r) => tags.has(r))) {
      const disjointContinents =
        nat.length > 0 && phr.length > 0 && !phr.some((c) => nat.includes(c))
      return disjointContinents ? 'gross' : 'contradicts'
    }
  }

  if (nat.length === 0 || phr.length === 0) return 'no_data'
  const overlap = phr.some((c) => nat.includes(c))
  if (!overlap) return 'gross'
  const equal = nat.length === phr.length && nat.every((c) => phr.includes(c))
  return equal ? 'ok' : 'minor'
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const RANK: Record<Verdict, number> = {
  gross: 0,
  contradicts: 1,
  no_data: 2,
  minor: 3,
  ok: 4,
}

/**
 * The partial-overlap queue: rows whose phrase claims regions the validated
 * tags do not list, ranked widest gap first.
 *
 * These are NOT verdicts. A wide gap is usually a fuzzy umbrella word ("the
 * Mediterranean" reaching into Western Asia) and sometimes a real over-claim
 * ("Europe, Asia, and North America" on a species Kew keeps out of North
 * America bar the subarctic) — and no threshold this script could pick tells
 * them apart, which is the whole reason they are a list instead of a flag.
 * Ranked by how much of the phrase is unsupported, so the reading stops paying
 * off from the top rather than the bottom.
 */
function gapSection(results: Result[]): string[] {
  const gaps = results
    // wcvp-validated ONLY. A row whose tags were withheld has an empty tag set,
    // so every region the phrase claims is trivially "not in the tags" and it
    // sorts to the top at 100% unsupported — no-evidence wearing the costume of
    // the strongest finding in the report. The first run put 25 of them there.
    .filter(
      (r) =>
        r.region_tier === 'wcvp-validated' &&
        r.verdict !== 'contradicts' &&
        r.claimed_not_in_tags.length
    )
    .map((r) => ({
      r,
      share:
        r.claimed_not_in_tags.length / Math.max(r.phrase_regions.length, 1),
    }))
    .sort(
      (a, b) =>
        b.share - a.share ||
        b.r.claimed_not_in_tags.length - a.r.claimed_not_in_tags.length
    )
  if (!gaps.length) return []
  const cell = (s: string) => s.replace(/\|/g, '\\|')
  return [
    '',
    '## Phrases claiming regions the validated tags exclude',
    '',
    `${gaps.length} rows. Ranked by the share of the phrase that the tags do not`,
    'support. Read from the top; most of the tail is a broad word being broad.',
    'Nothing here is auto-applied.',
    '',
    '| unsupported | plant | stored phrase | claims not in tags | validated regions | draft from tags |',
    '| --- | --- | --- | --- | --- | --- |',
    ...gaps.map(
      ({ r, share }) =>
        `| ${Math.round(share * 100)}% | ${cell(r.common_name)} | ${cell(r.stored_phrase ?? '')} | ${cell(r.claimed_not_in_tags.join(', '))} | ${cell(r.region_tags.join(', '))} | ${cell(r.phrase_from_tags ?? '')} |`
    ),
  ]
}

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
      `| ${r.verdict}${r.confidence === 'low' ? ' (low)' : ''} | ${cell(r.common_name)} | *${cell(r.scientific_name ?? '')}* | ${cell(r.stored_phrase ?? '')} | ${cell(r.native_continents.join(', '))} | ${cell(r.region_tags.join(', '))} | ${cell((r.verdict === 'contradicts' ? r.phrase_from_tags : r.suggested_phrase) ?? '')} | ${cell(r.claimed_not_in_tags.length ? 'phrase claims: ' + r.claimed_not_in_tags.join(', ') : r.note)} |`
  )

  const md = [
    '# native_to cross-check — continent-level gross-error guard',
    '',
    `${results.length} plants checked against GBIF/WCVP native ranges + our validated native_region tags + Claude.`,
    '',
    `**gross: ${counts['gross'] ?? 0}**  ·  **contradicts: ${counts['contradicts'] ?? 0}**  ·  no_data: ${counts['no_data'] ?? 0}  ·  minor: ${counts['minor'] ?? 0}  ·  ok: ${counts['ok'] ?? 0}`,
    '',
    'Only non-ok rows are listed. "gross" = wrong continent (fix these).',
    '"contradicts" = the phrase and our WCVP-validated native_region tags share no',
    'region at all, or the tags are validated-empty and the phrase claims a range —',
    'the phrase is describing somewhere else entirely. "no_data" = no native signal',
    'from GBIF and Claude was unsure (often cultigens/hybrids — eyeball). "minor" =',
    'right continent, imprecise wording.',
    '',
    'A blank region column means the tags were not WCVP-validated for that row and',
    'were withheld from the check rather than believed.',
    '',
    '| verdict | plant | scientific | stored phrase | native continents | validated regions | suggested | note |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    ...gapSection(results),
  ].join('\n')
  writeFileSync(MD_OUT, md + '\n')

  console.log(
    `\nDone. gross=${counts['gross'] ?? 0} contradicts=${counts['contradicts'] ?? 0} no_data=${counts['no_data'] ?? 0} minor=${counts['minor'] ?? 0} ok=${counts['ok'] ?? 0}`
  )
  console.log(`Report:\n  ${MD_OUT}\n  ${JSON_OUT}`)
  if ((counts['gross'] ?? 0) > 0) {
    console.log(
      '\nApply the gross fixes with:  tsx --env-file=.env.local scripts/cross-check-native-to.ts --apply'
    )
  }
  const gapCount = results.filter(
    (r) =>
      r.region_tier === 'wcvp-validated' &&
      r.verdict !== 'contradicts' &&
      r.claimed_not_in_tags.length
  ).length
  if (gapCount > 0) {
    console.log(
      `\n${gapCount} more row(s) claim regions the tags do not list — ranked in\n` +
        'the report under "Phrases claiming regions the validated tags exclude".'
    )
  }
  if ((counts['contradicts'] ?? 0) > 0) {
    console.log(
      `\n${counts['contradicts']} contradicts row(s) are NOT applied by --apply.\n` +
        'They are user-facing copy: the suggested phrases are drafts for a voice pass.'
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
    // Patching native_to changes what was checked, so null the stamp too (the
    // cascade rule) — a later --new-only run re-verifies the replacement phrase.
    const { error } = await db
      .from('plants')
      .update({ native_to: r.suggested_phrase, native_checked_at: null })
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

async function generate(
  limit: number | null,
  newOnly: boolean,
  roundLabel: string | null
): Promise<void> {
  const db = getSupabaseAdmin()

  // --round is the exact post-seed scope. --new-only only narrows to a batch
  // once every other row carries a stamp, and that baseline was never
  // established here either — native_checked_at was NULL catalog-wide at round
  // 8, so --new-only would have re-billed all 595. See the same note in
  // cross-check-plants.ts.
  // Scope is MANDATORY (scripts/scope.ts). It used to be optional here, with
  // `--new-only` as the fallback — and `--new-only` is a state predicate, not
  // a scope, so a run without --round quietly reached every unstamped plant in
  // the catalog and billed for it.
  const scope = requireScope(
    'cross-check-native-to',
    'This guard bills Claude a call per plant on top of a GBIF lookup. An ' +
      'unscoped run re-checks the whole catalog.'
  )
  const roundIds = scopeIds(scope)
  const whyAll = requireReasonForAll(scope)
  activeGuard = scopeGuard(scope, roundIds)
  console.log(describeScope(scope, roundIds))
  if (whyAll) console.log(`Whole-catalog run, because: ${whyAll}`)

  let plants = await fetchAllRows<PlantRow>((from, to) => {
    let q = db
      .from('plants')
      .select(
        'id, common_name, scientific_name, family, native_to, native_region, native_region_checked_at, created_at'
      )
    if (newOnly) q = q.is('native_checked_at', null)
    if (roundIds) q = q.in('id', roundIds)
    return q.order('id').range(from, to)
  })
  if (limit !== null) plants = plants.slice(0, limit)

  const rawByID = loadRawSnapshot()
  // Loaded once and passed down: lookupSpecies mutates and persists it, so a
  // species this round already checked against WCVP costs no GBIF call here.
  const wcvpCache = loadCache()
  console.log(`Cross-checking native_to for ${plants.length} plants...\n`)
  const results: Result[] = []

  for (let i = 0; i < plants.length; i++) {
    const plant = plants[i]!
    try {
      const gbif = plant.scientific_name
        ? await wcvpNativeSignal(plant.scientific_name, wcvpCache)
        : { tier: 'row has no scientific_name', regions: [] }

      const region = regionSignal(plant)

      const j = await judge(plant, gbif, region, rawByID.get(plant.id) ?? null)
      const claimedExtra = claimedNotInTags(j, region)
      const verdict = reconcileVerdict(j, region)
      results.push({
        id: plant.id,
        common_name: plant.common_name,
        scientific_name: plant.scientific_name,
        stored_phrase: plant.native_to,
        gbif_tier: gbif.tier,
        gbif_regions: gbif.regions,
        region_tier: region.tier,
        region_tags: region.regions,
        claimed_not_in_tags: claimedExtra,
        ...j,
        verdict,
      })
      const tag =
        verdict === 'gross'
          ? 'GROSS'
          : verdict === 'contradicts'
            ? 'CONFLICT'
            : verdict === 'no_data'
              ? 'no_data'
              : verdict
      console.log(
        `[${pad(i + 1)}/${plants.length}] ${tag.padEnd(8)} ${plant.common_name} — "${plant.native_to}"`
      )

      // Stamp only after a successful check (any verdict). A row that threw
      // stays unstamped so --new-only retries it next run.
      await stampChecked(plant.id)
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

function parseRound(): string | null {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--round')
  if (idx < 0) return null
  const label = args[idx + 1]
  if (!label || label.startsWith('--')) {
    throw new Error('--round requires a label, e.g. --round 8')
  }
  return label
}

async function main() {
  if (process.argv.includes('--report-only')) {
    if (!existsSync(JSON_OUT))
      throw new Error(`No report found at ${JSON_OUT}. Run the check first.`)
    writeReport(JSON.parse(readFileSync(JSON_OUT, 'utf8')) as Result[])
    return
  }

  if (process.argv.includes('--apply')) await apply()
  else
    await generate(
      parseLimit(),
      process.argv.includes('--new-only'),
      parseRound()
    )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
