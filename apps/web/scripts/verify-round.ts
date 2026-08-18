/**
 * Post-round invariant checker — the canonical definition of catalog
 * correctness. Asserts the DB state the docs/curation.md#round-runbook cadence is
 * supposed to leave behind, instead of trusting that every step was run:
 *
 *   FAIL (exit 1) — the round is not done:
 *     · every plant has ai_drafted_at (curation ran to completion)
 *     · every non-hybrid plant has a non-empty native_region (regeneration ran)
 *     · every bloom_color value is mapped in lib/bloom-colors.ts
 *     · no duplicate scientific_name (the cultivar-collision trap)
 *     · no duplicate common_name (two species sharing a display name are
 *       indistinguishable in search — the round-8 trap)
 *     · required curation fields non-null on drafted rows
 *     · style_tags judged — proven by the stamp, not the value: the
 *       curate-plants step's round-status evidence requires style_checked_at
 *       (a `style_tags === null` check lived here until 2026-08-14 and could
 *       never fire — the column is NOT NULL DEFAULT '{}', trap 26)
 *     · sun_thrives non-empty and disjoint from sun_tolerates
 *     · every plant has ≥1 combination; no self/duplicate/reversed-duplicate
 *       pairs; nobody over the 5-companion cap
 *     · nobody over the same-axis style bar (lib/style-tags.ts) — the catalog
 *       side of a check curate-styles only ever ran on a run's own output
 *
 *   WARN (exit 0) — known gaps, reported so they stay visible:
 *     · under-supplied companions — fewer than 4, where 733 of 748 hold 5
 *     · seasonal_care null (per-plant view; a ROUND missing it FAILs via
 *       round-status, because Care Tips v2 is live and reads the field)
 *     · hardiness_rating null (track parked)
 *     · no image on either column (PlantImage placeholder covers it)
 *     · copy-rule violations in any prose field (lib/copy-rules.ts) — Ana's
 *       ruling 2026-08-18: a dash must not halt a paid pipeline mid-round, and
 *       a round must not close without anyone knowing it is there
 *
 * Read-only, no AI calls — cheap enough to run after every round.
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/verify-round.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/verify-round.ts --round 12
 *
 * `--round <label>` ADDS the per-step completeness checks for that round. It
 * does NOT narrow the checks above — those always run against the whole
 * catalog, which is what makes them catalog invariants. (This paragraph said
 * the opposite until 2026-08-18; the code has always read this way.) Findings
 * on rows the named round seeded are labelled `← THIS ROUND`.
 */

import { IGNORED_BLOOM_COLORS, RAW_TO_BUCKET } from '../lib/bloom-colors'
import {
  FOLIAGE_RAW_TO_BUCKET,
  IGNORED_FOLIAGE_COLORS,
} from '../lib/foliage-colors'
import {
  EXCLUSIVE_STYLE_AXES,
  MAX_TAGS_PER_EXCLUSIVE_AXIS,
  STYLE_AXES,
} from '../lib/style-tags'
import { getSupabaseAdmin } from '../lib/supabase-admin'
import { fetchAllRows } from '../lib/paginate'
import { readRoundManifest } from './round-manifest'
import { checkCopy, proseOf } from '../lib/copy-rules'
import {
  roundStatus,
  formatStatus,
  unregisteredStampColumns,
} from './round-status'

const COMPANION_CAP = 5

/**
 * Below this, a plant is under-supplied rather than merely hard to pair — WARN,
 * not FAIL, because the cause is a pass finding few partners, not a bad write.
 *
 * WHY 4, AND WHY THIS EXISTS AT ALL. Counted live 2026-08-17: 733 plants hold 5
 * companions, 13 hold 4, and ONE holds 1 — Aconite-leaf buttercup. There is no
 * tail between 1 and 4, so the floor separates the outlier from the normal
 * spread rather than being a number picked to be safe.
 *
 * The zero case was already FAIL above, and the cap was already FAIL, so the
 * gap was only ever this side of the distribution: five is a cap, not a target,
 * and a row that came back with one satisfied every invariant there was. It was
 * found by counting during an unrelated question, which is the actual finding —
 * nothing was watching. `--round` scopes the plants, so this asks the same
 * question of a round at close and of the whole catalog when run bare.
 */
const COMPANION_FLOOR = 4

interface PlantRow {
  id: string
  common_name: string
  scientific_name: string | null
  ai_drafted_at: string | null
  native_region: string[] | null
  bloom_color: string[] | null
  foliage_color: string | null
  plant_type: string | null
  plant_type_label: string | null
  space_types: string[] | null
  description: string | null
  care_level: string | null
  seasonal_rhythm: unknown
  seasonal_care: unknown
  sun_thrives: string[] | null
  sun_tolerates: string[] | null
  hardiness_rating: string | null
  image_url: string | null
  image_url_curated: string | null
  maintenance_notes: string | null
  best_placement: string | null
  water_needs: string | null
  water_needs_summary: string | null
  light_needs: string | null
  soil_needs: string | null
  common_issues: string | null
  style_tags: string[] | null
  // Read only by the copy check. Deliberately NOT in REQUIRED_DRAFTED_FIELDS —
  // see the ruling below on why it stays optional.
  environment_benefits: string | null
}

interface ComboRow {
  plant_id_a: string
  plant_id_b: string
}

interface Finding {
  level: 'FAIL' | 'WARN'
  check: string
  detail: string
}

// Required on every AI-drafted row. description/care_level/seasonal_rhythm
// are core product surfaces; the array fields feed Explore filters and
// placement. bloom_months/bloom_color stay out — legitimately null on
// foliage/evergreen plants.
//
// style_tags is NOT in this list, and gets no value check here at all: `[]`
// is a real verdict (33 plants are deliberately style-neutral) and NULL is
// impossible (NOT NULL DEFAULT '{}'), so the only honest witness is the
// style_checked_at stamp — enforced at round close by the curate-plants
// step's evidence in round-status.ts.
const REQUIRED_DRAFTED_FIELDS: Array<keyof PlantRow> = [
  'plant_type',
  'plant_type_label',
  'space_types',
  'description',
  'care_level',
  'seasonal_rhythm',
  // Added 2026-08-16 (audit F4). Each was verified at ZERO null/empty across
  // all 720 drafted rows before being listed, so none of them can fail a
  // closed round retroactively — that check is the whole reason to add them
  // now rather than after the next seed.
  'maintenance_notes',
  'best_placement',
  'water_needs',
  'water_needs_summary',
  'light_needs',
  'soil_needs',
  // Added 2026-08-17, Ana's ruling, and only AFTER the 27 blank rows were
  // filled: `count(*) filter (where common_issues is null)` = 27 before the
  // pass and 0 after, so this cannot fail rounds 7, 11 or 12 retroactively.
  // Adding it first would have — the same reason the six above waited.
  //
  // WHY IT BECAME REQUIRED. The blank was a SANCTIONED answer: curate-plants'
  // prompt said "null if the species genuinely has no notable common issues".
  // But 460 of the 721 rows that had the field already said "generally pest and
  // disease free" in prose, so the null branch was a second way to write an
  // answer the drafter usually wrote out — and a reader cannot tell an easy
  // plant from an unanswered question. The prompt now forbids null.
  'common_issues',
]

// DELIBERATELY NOT IN THE LIST ABOVE:
//
//   · environment_benefits stays optional, Ana's ruling 2026-08-17, decided
//     against the rows rather than in the abstract. Its 4 blanks are three
//     houseplants (Kalanchoe blossfeldiana, Cyclamen persicum, Schlumbergera
//     truncata) and a noxious invasive whose common_issues opens "Highly
//     invasive". A pot on a windowsill contributes nothing to a garden
//     ecosystem, so requiring the field would buy four fabricated sentences.
//     THE TWO FIELDS FAIL IN OPPOSITE DIRECTIONS UNDER A GATE, which is why
//     they split: forcing common_issues pressures the drafter toward "generally
//     pest and disease free", which is true; forcing this one pressures it
//     toward inventing an ecological benefit.
//   · garden_use_tags is NOT NULL DEFAULT '{}', so an empty array is a real
//     verdict that looks exactly like the default, and the only honest witness
//     is the stamp — the same reasoning already written above for style_tags,
//     and the shape of trap 26.

// Garden hybrids (Cistus × purpureus, Calamagrostis × acutiflora, …) have no
// wild native range; an empty native_region is correct for them. Trefle
// sometimes stores a hybrid's name without the × marker, so known cases are
// exempted by name.
// Citrus limon is the same case one step further out: a cultivated hybrid
// (C. medica × C. aurantium) whose accepted name carries no × marker at all.
// WCVP records 94 distribution rows for it and marks every single one
// INTRODUCED, so empty is the right answer rather than a gap — established by
// cross-check-native-region.ts, not assumed.
const KNOWN_HYBRID_EXEMPTIONS = new Set(['cistus purpureus', 'citrus limon'])

function isHybrid(scientificName: string | null): boolean {
  if (!scientificName) return false
  if (KNOWN_HYBRID_EXEMPTIONS.has(scientificName.trim().toLowerCase()))
    return true
  return scientificName.includes('×') || / x /i.test(scientificName)
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/**
 * The columns this check reads — exported so a test can hold it to what the
 * checks actually consume. That is trap 36's lesson: a projection is a string,
 * the one part of a typed query the compiler cannot see into, and a column a
 * check reads without fetching reads `undefined` on every row and passes.
 *
 * `environment_benefits` is here for the copy check and nothing else. It was
 * absent until 2026-08-18, which is exactly how a whole field goes unguarded.
 */
export const VERIFY_PROJECTION =
  'id, common_name, scientific_name, ai_drafted_at, native_region, ' +
  'bloom_color, foliage_color, plant_type, plant_type_label, space_types, ' +
  'description, care_level, seasonal_rhythm, seasonal_care, sun_thrives, ' +
  'sun_tolerates, hardiness_rating, image_url, image_url_curated, ' +
  'maintenance_notes, best_placement, water_needs, ' +
  'water_needs_summary, light_needs, soil_needs, common_issues, style_tags, ' +
  'environment_benefits'

async function fetchAllPlants(): Promise<PlantRow[]> {
  const db = getSupabaseAdmin()
  return fetchAllRows<PlantRow>((from, to) =>
    db.from('plants').select(VERIFY_PROJECTION).order('id').range(from, to)
  )
}

async function fetchAllCombos(): Promise<ComboRow[]> {
  const db = getSupabaseAdmin()
  return fetchAllRows<ComboRow>((from, to) =>
    db
      .from('plant_combinations')
      .select('plant_id_a, plant_id_b')
      .order('id')
      .range(from, to)
  )
}

/**
 * @param ownedByRound ids the round being verified seeded, when one was named.
 *   Used ONLY to label copy findings, so a round can tell its own five dashes
 *   from the catalog's sixteen. Every check here runs catalog-wide — `--round`
 *   ADDS the completeness checks, it does not narrow these.
 */
function checkPlants(
  plants: PlantRow[],
  ownedByRound: Set<string> = new Set()
): Finding[] {
  const findings: Finding[] = []

  for (const p of plants) {
    if (!p.ai_drafted_at) {
      findings.push({
        level: 'FAIL',
        check: 'ai_drafted_at',
        detail: `${p.common_name} — never curated (run curate-plants --round <label> --new-only)`,
      })
      // Required-field checks only apply to drafted rows
    } else {
      for (const field of REQUIRED_DRAFTED_FIELDS) {
        if (isEmpty(p[field])) {
          findings.push({
            level: 'FAIL',
            check: `required field: ${field}`,
            detail: `${p.common_name} — drafted but ${field} is empty`,
          })
        }
      }
    }

    if (isEmpty(p.native_region) && !isHybrid(p.scientific_name)) {
      findings.push({
        level: 'FAIL',
        check: 'native_region',
        detail: `${p.common_name} — empty (run regenerate-native-region)`,
      })
    }

    // The same-axis bar, read against the catalog rather than against a run's
    // own output. `curate-styles` already warns about this, but only for the
    // rows the run in front of it just judged — so when Ana moved the bar 1 → 2
    // on 2026-08-17 nobody re-read the 748 rows against the new value, and one
    // row sat over it. A bar with a constant behind it is a FAIL, like the
    // companion cap: the value is not a judgment call once the constant is set.
    for (const axis of EXCLUSIVE_STYLE_AXES) {
      const onAxis = (p.style_tags ?? []).filter((t) =>
        (STYLE_AXES[axis] as readonly string[]).includes(t)
      )
      if (onAxis.length > MAX_TAGS_PER_EXCLUSIVE_AXIS) {
        findings.push({
          level: 'FAIL',
          check: `over the ${axis} style bar`,
          detail: `${p.common_name} — ${onAxis.length} ${axis} tags (max ${MAX_TAGS_PER_EXCLUSIVE_AXIS}): ${onAxis.join(', ')}`,
        })
      }
    }

    for (const raw of p.bloom_color ?? []) {
      const value = raw.toLowerCase()
      if (!RAW_TO_BUCKET[value] && !IGNORED_BLOOM_COLORS.has(value)) {
        findings.push({
          level: 'FAIL',
          check: 'bloom_color mapping',
          detail: `${p.common_name} — "${raw}" not in lib/bloom-colors.ts`,
        })
      }
    }

    if (p.foliage_color) {
      const value = p.foliage_color.trim().toLowerCase()
      if (!FOLIAGE_RAW_TO_BUCKET[value] && !IGNORED_FOLIAGE_COLORS.has(value)) {
        findings.push({
          level: 'FAIL',
          check: 'foliage_color mapping',
          detail: `${p.common_name} — "${p.foliage_color}" not in lib/foliage-colors.ts`,
        })
      }
    }

    if (isEmpty(p.sun_thrives)) {
      findings.push({
        level: 'FAIL',
        check: 'sun_thrives',
        detail: `${p.common_name} — empty`,
      })
    } else {
      const tolerates = new Set(p.sun_tolerates ?? [])
      const overlap = (p.sun_thrives ?? []).filter((s) => tolerates.has(s))
      if (overlap.length) {
        findings.push({
          level: 'FAIL',
          check: 'sun overlap',
          detail: `${p.common_name} — ${overlap.join(', ')} in both thrives and tolerates`,
        })
      }
    }

    if (isEmpty(p.seasonal_care)) {
      findings.push({
        level: 'WARN',
        check: 'seasonal_care',
        detail: `${p.common_name} — not yet distilled`,
      })
    }
    if (!p.hardiness_rating) {
      findings.push({
        level: 'WARN',
        check: 'hardiness_rating',
        detail: `${p.common_name} — unrated (track parked)`,
      })
    }
    // Both columns, in the app's own precedence: lib/plant-detail.ts resolves
    // the hero as curated-then-Trefle, so a row with only image_url_curated
    // renders fine. Checking image_url alone reported 44 plants on the
    // placeholder when the real number was 13 — a guard asserting something
    // untrue, which is worse than one that says nothing.
    if (!p.image_url && !p.image_url_curated) {
      findings.push({
        level: 'WARN',
        check: 'no image',
        detail: `${p.common_name} — no image at all, placeholder in use`,
      })
    }
    // COPY RULES (lib/copy-rules.ts) — WARN, and the level is the ruling
    // (Ana, 2026-08-18): a dash must not halt a paid pipeline mid-round, but
    // it must not be closeable without anyone knowing either. WARN is exactly
    // that pair — visible at step 8, exit 0.
    //
    // CATALOG-WIDE, LIKE EVERY OTHER CHECK IN THIS FUNCTION. `--round` adds the
    // completeness checks; it does not narrow these, whatever the header used
    // to say. That matters here more than for the other warnings, because the
    // back catalog carries 52 of these and a round's own handful would vanish
    // into them — so a finding on a row this round seeded is LABELLED. For the
    // round's rows alone: `pnpm copy:check --round <label>`.
    for (const { field, kind, text } of proseOf(
      p as unknown as Record<string, unknown>
    )) {
      for (const v of checkCopy(text, kind)) {
        findings.push({
          level: 'WARN',
          check: `copy: ${v.rule}`,
          detail:
            `${p.common_name} [${field}] …${v.match.replace(/\n/g, ' ')}…` +
            (ownedByRound.has(p.id) ? '  ← THIS ROUND' : ''),
        })
      }
    }
  }

  // Duplicate scientific names — the catalog is keyed on species, so two rows
  // sharing one scientific_name means a seed collision (the round-7 trap).
  const byName = new Map<string, string[]>()
  for (const p of plants) {
    if (!p.scientific_name) continue
    const key = p.scientific_name.trim().toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), p.common_name])
  }
  for (const [name, carriers] of byName) {
    if (carriers.length > 1) {
      findings.push({
        level: 'FAIL',
        check: 'duplicate scientific_name',
        detail: `"${name}" — ${carriers.join(' / ')}`,
      })
    }
  }

  // Duplicate common names — two species sharing a display name are
  // indistinguishable in search and on a card, which is a user-facing defect
  // even though the rows themselves are valid. Trefle hands these out freely
  // (round 8: Acer japonicum arrived as "Japanese maple" alongside the
  // existing A. palmatum), and a name-fix pass can introduce one by accident,
  // so it is checked rather than trusted.
  const byCommon = new Map<string, string[]>()
  for (const p of plants) {
    if (!p.common_name) continue
    const key = p.common_name.trim().toLowerCase()
    byCommon.set(key, [
      ...(byCommon.get(key) ?? []),
      p.scientific_name ?? '(no scientific name)',
    ])
  }
  for (const [name, carriers] of byCommon) {
    if (carriers.length > 1) {
      findings.push({
        level: 'FAIL',
        check: 'duplicate common_name',
        detail: `"${name}" — ${carriers.join(' / ')}`,
      })
    }
  }

  return findings
}

function checkCombos(plants: PlantRow[], combos: ComboRow[]): Finding[] {
  const findings: Finding[] = []
  const nameById = new Map(plants.map((p) => [p.id, p.common_name]))
  const label = (id: string) => nameById.get(id) ?? id

  const seenPairs = new Map<string, number>()
  const counts = new Map<string, number>()

  for (const c of combos) {
    if (c.plant_id_a === c.plant_id_b) {
      findings.push({
        level: 'FAIL',
        check: 'self pair',
        detail: `${label(c.plant_id_a)} paired with itself`,
      })
      continue
    }
    const key = [c.plant_id_a, c.plant_id_b].sort().join('|')
    seenPairs.set(key, (seenPairs.get(key) ?? 0) + 1)
    counts.set(c.plant_id_a, (counts.get(c.plant_id_a) ?? 0) + 1)
    counts.set(c.plant_id_b, (counts.get(c.plant_id_b) ?? 0) + 1)
  }

  for (const [key, n] of seenPairs) {
    if (n > 1) {
      const [a, b] = key.split('|') as [string, string]
      findings.push({
        level: 'FAIL',
        check: 'duplicate pair',
        detail: `${label(a)} ↔ ${label(b)} appears ${n}×`,
      })
    }
  }

  for (const p of plants) {
    const n = counts.get(p.id) ?? 0
    if (n === 0) {
      findings.push({
        level: 'FAIL',
        check: 'no combinations',
        detail: `${p.common_name} — 0 companions (run curate-combinations --round <label>)`,
      })
    } else if (n > COMPANION_CAP) {
      findings.push({
        level: 'FAIL',
        check: 'over companion cap',
        detail: `${p.common_name} — ${n} companions (cap ${COMPANION_CAP})`,
      })
    } else if (n < COMPANION_FLOOR) {
      findings.push({
        level: 'WARN',
        check: 'under-supplied companions',
        detail: `${p.common_name} — ${n} companion${n === 1 ? '' : 's'} (typical is ${COMPANION_FLOOR}-${COMPANION_CAP}; re-run curate-combinations for it)`,
      })
    }
  }

  return findings
}

function report(findings: Finding[], group: 'FAIL' | 'WARN'): void {
  const grouped = new Map<string, string[]>()
  for (const f of findings) {
    if (f.level !== group) continue
    grouped.set(f.check, [...(grouped.get(f.check) ?? []), f.detail])
  }
  for (const [check, details] of grouped) {
    console.log(
      `\n${group === 'FAIL' ? '✗' : '⚠'} ${check} — ${details.length}`
    )
    const shown = details.slice(0, 10)
    for (const d of shown) console.log(`    ${d}`)
    if (details.length > shown.length)
      console.log(`    … and ${details.length - shown.length} more`)
  }
}

/**
 * Per-round completeness. The catalog checks above ask "is this data valid?";
 * this asks "did every pipeline step actually run for this round's plants?" —
 * the question nothing used to ask, which is how three separate steps silently
 * didn't run before round 8 (see scripts/round-status.ts).
 */
async function checkRoundCompleteness(label: string): Promise<Finding[]> {
  const manifest = readRoundManifest(label)
  if (!manifest) {
    return [
      {
        level: 'FAIL',
        check: 'round manifest',
        detail: `no rounds/${label}/manifest.json — was the seed run tagged with --round ${label}?`,
      },
    ]
  }

  const rows = await roundStatus(manifest.seeded_ids)
  console.log(
    `\nRound ${manifest.label} — ${manifest.seeded_ids.length} seeded plant(s):`
  )
  for (const line of formatStatus(rows)) console.log(`  ${line}`)

  const findings: Finding[] = []

  // A MANIFEST ID WITH NO LIVE ROW, which became possible the day
  // scripts/remove-plant.ts shipped (2026-08-17).
  //
  // `roundStatus` counts against the rows it can still FETCH, so a deleted
  // plant leaves the manifest naming 101 and every step reporting out of 100 —
  // and each of those steps then reads MORE complete than it is. That is this
  // file's own founding bug wearing different clothes: round 8 reported 7/7
  // green while two passes had never run, because nothing compared the
  // denominator to what was claimed.
  //
  // Reported here rather than prevented at the source: a manifest records what
  // entered the catalog in that round and stays true after the row is gone, so
  // rewriting it to match would be falsifying provenance to silence a check.
  const missing = await missingFromManifest(manifest.seeded_ids)
  if (missing.length)
    findings.push({
      level: 'FAIL',
      check: 'manifest id with no catalog row',
      detail:
        `${missing.length} of ${manifest.seeded_ids.length} seeded id(s) no longer exist, so every step above is ` +
        `measured against ${manifest.seeded_ids.length - missing.length} plants and reads more complete than it is: ` +
        `${missing.join(', ')}. If this was a deliberate removal it is in reference/removals.json with its reason ` +
        `and the complete row; if it is not in there, a plant was deleted by something that keeps no record.`,
    })

  return [
    ...findings,
    ...rows
      .filter((r) => !r.complete)
      .map((r) => ({
        level: r.level,
        check: `step did not run: ${r.step}`,
        detail: `${r.done}/${r.total} of the round's plants have ${r.evidence}`,
      })),
  ]
}

/** Manifest ids with no row in `plants`. Paginated: a manifest can hold 100+. */
async function missingFromManifest(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const db = getSupabaseAdmin()
  const live = await fetchAllRows<{ id: string }>((from, to) =>
    db.from('plants').select('id').in('id', ids).order('id').range(from, to)
  )
  const seen = new Set(live.map((r) => r.id))
  return ids.filter((id) => !seen.has(id))
}

/**
 * Every `*_checked_at` column on `plants` must be claimed by a step in
 * round-status.ts's registry. Runs with or without --round, because it is a
 * property of the pipeline rather than of any one round.
 *
 * Why this is a FAIL and not a lint: a stamp column with no owning step is a
 * pipeline step that no completeness check can see. That is not hypothetical —
 * `greenery_checked_at` and `image_checked_at` sat unclaimed through round 8,
 * so `verify-round --round 8` reported 7/7 green while neither pass had run
 * for any of its 101 plants.
 */
async function checkStepRegistry(): Promise<Finding[]> {
  const unregistered = await unregisteredStampColumns()
  return unregistered.map((column) => ({
    level: 'FAIL' as const,
    check: 'unregistered pipeline step',
    detail:
      `plants.${column} exists but no step in round-status.ts claims it — ` +
      `a round can skip whatever writes it and still report complete. ` +
      `Add a STEP_DEFS entry with stampColumn: '${column}'.`,
  }))
}

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
  const roundLabel = parseRound()

  console.log('Fetching catalog...')
  const [plants, combos] = await Promise.all([
    fetchAllPlants(),
    fetchAllCombos(),
  ])
  console.log(`${plants.length} plants, ${combos.length} combinations.`)

  // The round's own ids, for labelling copy findings. Read here rather than
  // inside checkPlants so the catalog-wide checks stay independent of whether
  // a round was named.
  const ownedByRound = new Set(
    roundLabel ? (readRoundManifest(roundLabel)?.seeded_ids ?? []) : []
  )

  const findings = [
    ...checkPlants(plants, ownedByRound),
    ...checkCombos(plants, combos),
  ]
  findings.push(...(await checkStepRegistry()))
  if (roundLabel) findings.push(...(await checkRoundCompleteness(roundLabel)))
  else
    console.log(
      '\nNote: no --round given, so per-step completeness was NOT checked.\n' +
        'After a seed, run `verify-round.ts --round <label>` — the catalog can be\n' +
        'entirely valid while a pipeline step silently never ran.'
    )
  const fails = findings.filter((f) => f.level === 'FAIL')
  const warns = findings.filter((f) => f.level === 'WARN')

  report(findings, 'FAIL')
  report(findings, 'WARN')

  console.log(
    `\n${fails.length ? '✗' : '✓'} ${fails.length} failure(s), ${warns.length} warning(s).`
  )
  if (fails.length) process.exit(1)
}

// Guarded so VERIFY_PROJECTION can be imported by a test without the verifier
// opening a database connection and running a whole catalog check as a side
// effect of the import. Same pattern as run-round.ts.
if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
