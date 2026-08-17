/**
 * native_region cross-check — validates the WGSRPD Level 2 tags against an
 * external authority instead of against the source that produced them.
 *
 * docs/curation.md#native-region generates native_region from Trefle's distribution list. Nothing checked
 * it afterwards, and Trefle turns out to be wrong in a specific, invisible way:
 * it does not reliably separate NATIVE range from INTRODUCED range. Imperata
 * cylindrica was tagged China / Eastern Asia / Indo-China, which is precisely
 * the range it was introduced into — its native range is Africa, the
 * Mediterranean and West Asia. A user filtering "native to my region" got the
 * exact opposite answer, and no guard could see it.
 *
 * The authority here is WCVP (Kew's World Checklist of Vascular Plants), read
 * through GBIF's species/{key}/distributions endpoint. WCVP is the right source
 * for three reasons: it is the dataset POWO itself publishes, it records one
 * row per WGSRPD Level 3 region — the same geography our field rolls up from —
 * and it marks introduced occurrences explicitly. So the comparison is
 * like-for-like rather than a prose-to-tags guess.
 *
 * NO AI. Unlike the other cross-checks this one is pure data: an authority
 * with the same vocabulary needs reconciling, not judging.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-region.ts --round 8
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-region.ts --ids <uuid,uuid>
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-region.ts --all --limit 3
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/cross-check-native-region.ts --ids <uuid> --apply
 *
 * `--allow-empty` lets --apply CLEAR a region rather than skipping the row, for
 * a plant with no wild native range. Off by default: an empty result is far
 * more often a lookup that failed than a plant that has nowhere to be from.
 *
 * Report-only by default (writes reports/native-region-crosscheck.{json,md}).
 * `--apply` writes only rows where WCVP disagrees, and is guarded the same way
 * as apply-sun-widening.ts: each write asserts the value it expects to find, so
 * a row that changed since the report is skipped rather than clobbered. Never
 * flips is_curated — this is a mechanical correction, not an editorial pass.
 *
 * TWO DISTINCTIONS THIS SCRIPT REFUSES TO BLUR (see docs/curation.md#native-region's rate-limit trap):
 *
 *   · "no WCVP rows at all" is NOT "no native range". The first means we
 *     learned nothing and the row is skipped; the second is a real finding
 *     about a cultigen. Collapsing them would let an API outage silently empty
 *     the catalog's native tags — a failed fetch must never look like a
 *     negative result.
 *   · a region name we cannot map to Level 2 is an ERROR, not an omission.
 *     Silently dropping unmapped names would quietly shrink a species' range
 *     and read as a confident answer.
 *
 * --apply ALSO NULLS plants.native_checked_at on every row it corrects. The
 * `native_to` prose answers the same question this field does, so a corrected
 * region invalidates the prose's last check and the prose guard must see the
 * row again. See applyCorrections().
 *
 * REPORT-ONLY RUNS DO WRITE ONE THING: plants.native_region_checked_at — but
 * only on rows the run SETTLED (match/reviewed). Until 2026-08-14 they also
 * stamped disagreements, so round close certified corrections that were still
 * pending and later --new-only sweeps skipped them (trap 24; fired in rounds
 * 8 and 11). rowsToStamp() is now the single decision. Stamping stays
 * operational metadata, not catalog content, so the flags-only rule
 * (docs/curation.md#botanical-cross-check) still holds — the same precedent
 * migration 20260716120000 set for the other guard stamps, and
 * check-round-scope already demotes *_checked_at writes to a WARN.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { MANUAL_OVERRIDES } from '../lib/native-region-overrides'
import { L2_NAMES } from '../lib/wgsrpd-regions'
import { fetchAllRows } from '../lib/paginate'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { requireScope, scopeIds, describeScope } from './scope'
import { withRunRecord, type Witness } from './run-provenance'
// The lookup, its guards and its committed cache live in scripts/wcvp-lookup.ts
// so that this guard and cross-check-native-to share one answer instead of
// asking GBIF the same question twice per round. See that file's header.
import {
  loadCache,
  lookupSpecies,
  noEvidenceReason,
  wcvpRows,
  type CachedSpecies,
} from './wcvp-lookup'

const REPORTS_DIR = join(process.cwd(), 'reports')
const WGSRPD_GEOJSON = join(REPORTS_DIR, 'level3.geojson')

const JSON_OUT = join(REPORTS_DIR, 'native-region-crosscheck.json')
const MD_OUT = join(REPORTS_DIR, 'native-region-crosscheck.md')

// Rows per stamping update — the whole batch is decided before anything is
// written, so the stamps go out in chunks rather than one call per row.
const STAMP_CHUNK = 100

// WCVP has modernised some country names since the WGSRPD geojson was cut
// (Türkiye, Eswatini, DR Congo). These are naming drift, not new regions —
// each maps onto the same Level 3 unit. Anything NOT listed here and not in the
// geojson is a hard error, so a genuinely new code can never slip through as a
// silent omission.
const WCVP_NAME_ALIASES: Record<string, string> = {
  'Czechia-Slovakia': 'Czechoslovakia',
  'NW. Balkan Pen.': 'Yugoslavia',
  Türkiye: 'Turkey',
  'Türkiye-in-Europe': 'Turkey-in-Europe',
  Kirgizstan: 'Kirgizistan',
  Yakutiya: 'Yakutskiya',
  Panamá: 'Panama',
  Gambia: 'Gambia, The',
  'Leeward Is.': 'Leeward Is. AB Ant',
  Eswatini: 'Swaziland',
  Suriname: 'Surinam',
  'Cocos (Keeling) Is.': 'Cocos (Keeling) I.',
  'DR Congo': 'Zaïre',
  'Sudan-South Sudan': 'Sudan',
  'Central American Pacific Is.': 'C. American Pacific Is.',
}

// WCVP's establishment marker is occasionally missing on a single Level 3 row,
// which promotes an introduced occurrence into a whole native Level 2 region.
// Galium verum is the worked example: its only Australian row is Tasmania, it
// carries no marker, and GBIF's GRIIS-Australia dataset lists the species as
// INTRODUCED there outright. Rather than teach the script to arbitrate between
// datasets, the contradiction is recorded here with its evidence — the same
// pattern as regenerate-native-region.ts's manual override table.
const MANUAL_EXCLUSIONS: Record<string, { drop: string[]; why: string }> = {
  'Galium verum': {
    drop: ['Australia'],
    why: 'only backing row is Tasmania with no establishment marker; GBIF GRIIS-Australia lists the species as INTRODUCED',
  },
  'Polystichum polyblepharum': {
    drop: ['Middle Europe'],
    why: 'only backing row is the Netherlands with no establishment marker, while the adjacent Belgium row on the same taxon IS marked INTRODUCED — a Japanese/Korean garden fern escaping in the Low Countries, not a native European range. The Afro-Asian rows are deliberately left in: many backing rows, and Catalogue of Life describes the same disjunct range independently',
  },
}

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  native_region: string[] | null
}

export interface Finding {
  id: string
  common_name: string
  scientific_name: string
  stored: string[]
  wcvp_native: string[]
  wcvp_introduced_only: string[]
  native_l3_count: number
  missing: string[]
  extra: string[]
  extra_are_introduced: string[]
  /** Native regions resting on a single Level 3 row — the shape a missing
   *  establishment marker takes. Reported so a reviewer can sanity-check the
   *  edges of a range instead of trusting the rollup blindly. */
  thin_evidence: string[]
  excluded?: { regions: string[]; why: string }
  verdict: 'match' | 'disagrees' | 'no-native-range' | 'no-data' | 'reviewed'
  note?: string
}

function parseArgs() {
  const args = process.argv.slice(2)
  const at = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const limitRaw = at('--limit')
  // --round / --ids / --all are parsed by scripts/scope.ts, not here.
  return {
    apply: args.includes('--apply'),
    allowEmpty: args.includes('--allow-empty'),
    limit: limitRaw ? Number(limitRaw) : undefined,
  }
}

// ---------------------------------------------------------------------------
// WGSRPD Level 3 name -> Level 2 region
// ---------------------------------------------------------------------------

function loadL3NameMap(): Map<string, number> {
  if (!existsSync(WGSRPD_GEOJSON))
    throw new Error(
      `Missing ${WGSRPD_GEOJSON}. regenerate-native-region.ts downloads it; ` +
        `run that first (reports/ is gitignored, so a fresh worktree has none).`
    )
  const geo = JSON.parse(readFileSync(WGSRPD_GEOJSON, 'utf8')) as {
    features: { properties: { LEVEL3_NAM: string; LEVEL2_COD: number } }[]
  }
  const map = new Map<string, number>()
  for (const f of geo.features)
    map.set(f.properties.LEVEL3_NAM, f.properties.LEVEL2_COD)
  return map
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function uniqSorted(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function compare(
  plant: PlantRow,
  species: CachedSpecies,
  l3ToL2: Map<string, number>
): Finding {
  const stored = uniqSorted(plant.native_region ?? [])
  const base = {
    id: plant.id,
    common_name: plant.common_name,
    scientific_name: plant.scientific_name ?? '',
    stored,
  }

  const rows = wcvpRows(species)
  const noEvidence = noEvidenceReason(species)
  if (noEvidence)
    return {
      ...base,
      wcvp_native: [],
      wcvp_introduced_only: [],
      native_l3_count: 0,
      missing: [],
      extra: [],
      extra_are_introduced: [],
      thin_evidence: [],
      verdict: 'no-data',
      note: noEvidence,
    }

  const nativeL2 = new Set<string>()
  const introducedL2 = new Set<string>()
  const backingL3 = new Map<string, number>()
  let nativeL3Count = 0
  const unmapped: string[] = []

  for (const row of rows) {
    const locality = (row.locality ?? '').trim()
    if (!locality) continue
    const canonical = WCVP_NAME_ALIASES[locality] ?? locality
    const code = l3ToL2.get(canonical)
    if (code === undefined) {
      unmapped.push(locality)
      continue
    }
    const region = L2_NAMES[code]
    if (!region) {
      unmapped.push(`${locality} (L2 ${code})`)
      continue
    }
    if (row.establishmentMeans === 'INTRODUCED') introducedL2.add(region)
    else {
      nativeL2.add(region)
      backingL3.set(region, (backingL3.get(region) ?? 0) + 1)
      nativeL3Count++
    }
  }

  const exclusion = MANUAL_EXCLUSIONS[plant.scientific_name ?? '']
  const excludedRegions = (exclusion?.drop ?? []).filter((r) => nativeL2.has(r))
  for (const region of excludedRegions) {
    nativeL2.delete(region)
    nativeL3Count -= backingL3.get(region) ?? 0
    backingL3.delete(region)
  }

  if (unmapped.length)
    throw new Error(
      `${plant.scientific_name}: unmapped WGSRPD region name(s): ` +
        `${uniqSorted(unmapped).join(', ')}. Add them to WCVP_NAME_ALIASES — ` +
        `dropping them would silently shrink the species' range.`
    )

  const native = uniqSorted([...nativeL2])
  const introOnly = uniqSorted(
    [...introducedL2].filter((r) => !nativeL2.has(r))
  )
  const missing = native.filter((r) => !stored.includes(r))
  const extra = stored.filter((r) => !nativeL2.has(r))

  // A reviewed override outranks WCVP. Rosmarinus officinalis is why: WCVP
  // calls Western Asia native, a review deliberately cut it, and re-reporting
  // that every run would train the reader to skim the report.
  const reviewed = MANUAL_OVERRIDES[plant.scientific_name ?? '']

  // Every WCVP row introduced and none native = a cultigen with no wild range
  // (Citrus limon). This is a real finding and is NOT the same as no-data.
  const verdict: Finding['verdict'] = reviewed
    ? 'reviewed'
    : !native.length
      ? 'no-native-range'
      : missing.length || extra.length
        ? 'disagrees'
        : 'match'

  return {
    ...base,
    wcvp_native: native,
    wcvp_introduced_only: introOnly,
    native_l3_count: nativeL3Count,
    missing,
    extra,
    extra_are_introduced: extra.filter((r) => introducedL2.has(r)),
    thin_evidence: native.filter((r) => (backingL3.get(r) ?? 0) === 1),
    ...(excludedRegions.length && exclusion
      ? { excluded: { regions: excludedRegions, why: exclusion.why } }
      : {}),
    ...(reviewed ? { note: `reviewed override: ${reviewed.reason}` } : {}),
    verdict,
  }
}

// ---------------------------------------------------------------------------

async function selectPlants(
  opts: ReturnType<typeof parseArgs>,
  ids: string[] | null
): Promise<PlantRow[]> {
  const db = getSupabaseAdmin()
  const columns = 'id, common_name, scientific_name, native_region'

  const rows = await fetchAllRows<PlantRow>((from, to) => {
    let q = db.from('plants').select(columns).order('id')
    if (ids) q = q.in('id', ids)
    return q.range(from, to)
  })
  return opts.limit ? rows.slice(0, opts.limit) : rows
}

function writeReport(findings: Finding[]): void {
  mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(JSON_OUT, JSON.stringify({ findings }, null, 2) + '\n')

  const by = (v: Finding['verdict']) => findings.filter((f) => f.verdict === v)
  const lines: string[] = [
    '# native_region cross-check against WCVP',
    '',
    `Checked **${findings.length}** plants. Authority: WCVP via GBIF distributions.`,
    '',
    `- match: **${by('match').length}**`,
    `- disagrees: **${by('disagrees').length}**`,
    `- no native range (cultigen): **${by('no-native-range').length}**`,
    `- no data: **${by('no-data').length}**`,
    `- reviewed override, WCVP not applied: **${by('reviewed').length}**`,
    '',
  ]
  for (const f of [
    ...by('disagrees'),
    ...by('no-native-range'),
    ...by('no-data'),
  ]) {
    lines.push(`## ${f.common_name} (${f.scientific_name}) — ${f.verdict}`)
    lines.push('')
    lines.push(`- stored: ${f.stored.join(', ') || '(empty)'}`)
    lines.push(`- WCVP native: ${f.wcvp_native.join(', ') || '(none)'}`)
    if (f.missing.length) lines.push(`- missing: ${f.missing.join(', ')}`)
    if (f.extra.length) lines.push(`- extra: ${f.extra.join(', ')}`)
    if (f.extra_are_introduced.length)
      lines.push(
        `- of those extras, WCVP calls these INTRODUCED: ${f.extra_are_introduced.join(', ')}`
      )
    if (f.excluded)
      lines.push(
        `- manually excluded: ${f.excluded.regions.join(', ')} — ${f.excluded.why}`
      )
    if (f.thin_evidence.length)
      lines.push(
        `- resting on a single Level 3 region: ${f.thin_evidence.join(', ')}`
      )
    if (f.note) lines.push(`- note: ${f.note}`)
    lines.push('')
  }
  writeFileSync(MD_OUT, lines.join('\n'))
}

/** Returns the ids it SKIPPED as stale, so the stamp pass can exclude them. */
async function applyCorrections(
  findings: Finding[],
  allowEmpty: boolean
): Promise<Set<string>> {
  const db = getSupabaseAdmin()
  // Emptying a row is a different act from editing one: it removes the plant
  // from the native filter entirely, and it is the shape a bad fetch would take
  // if the no-data guard ever failed. So it needs to be asked for by name.
  const targets = findings.filter(
    (f) =>
      f.verdict === 'disagrees' ||
      (allowEmpty && f.verdict === 'no-native-range')
  )
  const withheld = findings.filter(
    (f) => !allowEmpty && f.verdict === 'no-native-range'
  )
  for (const f of withheld)
    console.log(
      `\n· ${f.common_name} has no wild native range; pass --allow-empty to clear it.`
    )
  if (!targets.length) {
    console.log('\nNothing to apply.')
    return new Set()
  }
  console.log(`\nApplying ${targets.length} correction(s)...`)
  let applied = 0
  const staleSkipped = new Set<string>()
  for (const f of targets) {
    // Guarded: re-read and confirm the row still holds the value the report was
    // built from. A row edited since then is stale and is left alone.
    const { data, error } = await db
      .from('plants')
      .select('native_region')
      .eq('id', f.id)
      .single()
    if (error)
      throw new Error(`Re-read failed for ${f.common_name}: ${error.message}`)
    const current = uniqSorted((data?.native_region as string[]) ?? [])
    if (current.join('|') !== f.stored.join('|')) {
      console.log(`  ⚠ ${f.common_name} — changed since the report, skipped`)
      staleSkipped.add(f.id)
      continue
    }
    // Nulling native_checked_at is the cascade rule reaching across fields: a
    // corrected region means the `native_to` prose describing the same origin
    // is now suspect, and the prose guard only re-reads rows whose stamp is
    // null. Without this the two fields silently part company — July 30
    // corrected 53 regions and left every matching phrase saying the old thing,
    // Imperata cylindrica among them, still naming the range it was introduced
    // into.
    const { error: writeError } = await db
      .from('plants')
      .update({ native_region: f.wcvp_native, native_checked_at: null })
      .eq('id', f.id)
    if (writeError)
      throw new Error(
        `Write failed for ${f.common_name}: ${writeError.message}`
      )
    console.log(`  ✓ ${f.common_name}`)
    console.log(`      ${f.stored.join(', ') || '(empty)'}`)
    console.log(`   -> ${f.wcvp_native.join(', ') || '(empty)'}`)
    applied++
  }
  console.log(`\n${applied} applied, ${staleSkipped.size} skipped as stale.`)
  return staleSkipped
}

/**
 * Which rows this run may honestly stamp as checked. The stamp is what
 * round-status.ts accepts as FAIL-level proof the step ran AND settled the
 * row, so it must never outrun the write (trap 24: a report-only run stamped
 * its disagreements, round close certified them, and the pending corrections
 * were invisible to every later --new-only sweep — it fired in round 8 and
 * again in round 11).
 *
 *   · 'match' / 'reviewed' — always: nothing was pending.
 *   · 'disagrees' — only when --apply actually wrote the correction.
 *   · 'no-native-range' — only when --apply --allow-empty wrote the clear
 *     (applyCorrections withholds it otherwise).
 *   · 'no-data' — never: GBIF returned nothing, so we learned nothing. A
 *     failed fetch must not leave a permanent record of a check that did not
 *     happen.
 *
 * Rows applyCorrections skipped as stale are subtracted by the caller — their
 * correction was withheld, so their stamp is too.
 */
export function rowsToStamp(
  findings: Pick<Finding, 'id' | 'verdict'>[],
  apply: boolean,
  allowEmpty: boolean
): string[] {
  return findings
    .filter((f) => {
      switch (f.verdict) {
        case 'no-data':
          return false
        case 'disagrees':
          return apply
        case 'no-native-range':
          return apply && allowEmpty
        default:
          return true
      }
    })
    .map((f) => f.id)
}

/**
 * Record which rows this run actually validated AND settled, in
 * plants.native_region_checked_at (migration 20260728193815). The id list
 * comes from rowsToStamp above.
 */
async function stampChecked(ids: string[]): Promise<number> {
  const db = getSupabaseAdmin()
  if (!ids.length) return 0

  const now = new Date().toISOString()
  for (let i = 0; i < ids.length; i += STAMP_CHUNK) {
    const chunk = ids.slice(i, i + STAMP_CHUNK)
    const { error } = await db
      .from('plants')
      .update({ native_region_checked_at: now })
      .in('id', chunk)
    if (error) throw new Error(`Stamping failed: ${error.message}`)
  }
  return ids.length
}

/**
 * What this invocation may mutate, which genuinely depends on the flags.
 *
 * Without --apply this is a report-and-stamp pass and touches one column. With
 * it, the same run also rewrites the region tags and NULLS native_checked_at as
 * the cross-field cascade. Declaring the union regardless would assert on every
 * dry run that the pass could have rewritten the catalog, and the write-set is
 * an assertion a reviewer reads — so it says what THIS invocation could do.
 *
 * The two extra members both need an explicit witness, for different reasons:
 *
 *   native_region       is an array of prose names. Not window-queryable at all,
 *                       so comparing it to an instant is meaningless.
 *   native_checked_at   is CLEARED here, not set. Its own column is the one
 *                       witness that cannot see this write: a nulled row matches
 *                       no window, so the default stamp witness would observe 0
 *                       against a claim of N and record a correct run as
 *                       CONTRADICTED. A clearing write is invisible to its own
 *                       column by construction.
 *
 * updated_at bounds both — it establishes rows moved in the window without
 * attributing the movement to this run, which is all the evidence supports.
 */
function writeSetFor(apply: boolean): {
  writeSet: string[]
  evidence: Witness[]
} {
  const bounded = (covers: string): Witness => ({
    kind: 'row-touched',
    covers,
    table: 'plants',
    column: 'updated_at',
  })
  // Set, not cleared, so it witnesses itself in the window.
  const stamp: Witness = {
    kind: 'stamp',
    covers: 'native_region_checked_at',
    column: 'native_region_checked_at',
  }
  if (!apply) {
    return { writeSet: ['native_region_checked_at'], evidence: [stamp] }
  }
  return {
    writeSet: [
      'native_region_checked_at',
      'native_region',
      'native_checked_at',
    ],
    evidence: [stamp, bounded('native_region'), bounded('native_checked_at')],
  }
}

async function main() {
  const opts = parseArgs()

  // Scope first: it is the cheapest check and the one most likely to be wrong.
  // Resolving it after the geojson load would answer a forgotten --round with
  // a missing-file error instead. The scope flags this script established now
  // live in scripts/scope.ts, so every pass refuses in the same words.
  const scope = requireScope(
    'cross-check-native-region',
    'cross-check-native-region calls GBIF once per row; an unscoped run is a\n' +
      'catalog-wide sweep of an external API.'
  )
  const ids = scopeIds(scope)
  console.log(describeScope(scope, ids))

  const l3ToL2 = loadL3NameMap()
  const plants = await selectPlants(opts, ids)
  console.log(`Checking ${plants.length} plants against WCVP...`)

  const cache = loadCache()
  const findings: Finding[] = []

  const { writeSet, evidence } = writeSetFor(opts.apply)
  await withRunRecord(
    {
      step: opts.apply
        ? 'cross-check-native-region --apply'
        : 'cross-check-native-region',
      writeSet,
      evidence,
      scope: `${describeScope(scope, ids)}${opts.allowEmpty ? ' (--allow-empty)' : ''}`,
      recipe: {
        // No model. This pass derives its answer from WCVP rows through a fixed
        // rollup rule, so the recipe is that rule plus the tables that arbitrate
        // it — not a prompt.
        model: null,
        template:
          'WCVP native rows → WGSRPD Level 3 → Level 2 rollup; establishment marker decides native vs introduced; verdict = match | disagrees | no-native-range | no-data | reviewed',
        // Every committed table that can change an answer without the rule
        // changing. MANUAL_EXCLUSIONS is the one that matters most: it overrides
        // the data source itself, so a cohort judged before an entry was added is
        // a different cohort from one judged after.
        ingredients: {
          l2_names: L2_NAMES,
          wcvp_name_aliases: WCVP_NAME_ALIASES,
          manual_exclusions: MANUAL_EXCLUSIONS,
          manual_overrides: MANUAL_OVERRIDES,
        },
      },
    },
    async (run) => {
      for (const plant of plants) {
        if (!plant.scientific_name) {
          console.log(`  skip ${plant.common_name} — no scientific_name`)
          continue
        }
        const species = await lookupSpecies(plant.scientific_name, cache)
        findings.push(compare(plant, species, l3ToL2))
      }

      const counts = findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.verdict] = (acc[f.verdict] ?? 0) + 1
        return acc
      }, {})
      console.log(
        `\nmatch ${counts.match ?? 0} · disagrees ${counts.disagrees ?? 0} · ` +
          `no-native-range ${counts['no-native-range'] ?? 0} · no-data ${counts['no-data'] ?? 0}`
      )
      for (const f of findings) {
        if (f.verdict === 'match') continue
        console.log(
          `\n${f.verdict.toUpperCase()} — ${f.common_name} (${f.scientific_name})`
        )
        console.log(`  stored: ${f.stored.join(', ') || '(empty)'}`)
        console.log(`  WCVP  : ${f.wcvp_native.join(', ') || '(none)'}`)
        if (f.extra_are_introduced.length)
          console.log(
            `  WCVP calls these INTRODUCED: ${f.extra_are_introduced.join(', ')}`
          )
        if (f.excluded)
          console.log(
            `  excluded ${f.excluded.regions.join(', ')} — ${f.excluded.why}`
          )
        if (f.note) console.log(`  note: ${f.note}`)
      }

      writeReport(findings)
      console.log(`\nReport → ${MD_OUT}`)

      const staleSkipped = opts.apply
        ? await applyCorrections(findings, opts.allowEmpty)
        : new Set<string>()

      const stampIds = rowsToStamp(
        findings,
        opts.apply,
        opts.allowEmpty
      ).filter((id) => !staleSkipped.has(id))
      const stamped = await stampChecked(stampIds)
      // Counted after stampChecked returned. A row this run corrected AND
      // stamped is one written row, not two — run.wrote() is a set of ids, which
      // is what the stamp witness can observe however many columns moved.
      for (const id of stampIds) run.wrote(id)
      const unstamped = findings.length - stamped
      console.log(
        `\nStamped native_region_checked_at on ${stamped} row(s)` +
          (unstamped ? `; ${unstamped} left NULL (unsettled or no data).` : '.')
      )

      const pending = findings.filter((f) => f.verdict === 'disagrees').length
      if (!opts.apply && pending)
        console.log(
          `\n⚠ ${pending} disagreement(s) left UNSTAMPED — a later --new-only ` +
            `sweep will re-find them.\n  Re-run with --apply to write the ` +
            `corrections and settle them.`
        )
    }
  )
}

// Guarded so the test file can import rowsToStamp without running the sweep
// — same pattern as pick-plant-images.ts.
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
