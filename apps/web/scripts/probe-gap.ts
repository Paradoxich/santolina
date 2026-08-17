/**
 * The theme gap probe — round step 0, run BEFORE a round has a candidate list.
 *
 * WHICH RUNBOOK STEP RUNS THIS: step 0, theme selection, the one step that
 * happens before `seed-round<n>.ts` exists (docs/curation.md#round-runbook).
 * WHAT ENDS IT: nothing. It is shared machinery like `species-resolver.ts` —
 * every round asks the same question of a different list.
 *
 * WHY IT IS COMMITTED CODE AND NOT A SCRATCHPAD. Round 9 established the rule
 * this script applies: a low count is not a gap until you have checked it is
 * not the data, and a theme whose archetypal species the catalog ALREADY HOLDS
 * at >=70% is dead. Rounds 9 through 12 each ran that test by hand and recorded
 * only the verdict in the seeder's header — so the single measurement that
 * chooses what a round buys was the one part of a round nobody could reproduce.
 * Round 12's header is the worked example: four themes tested, three killed,
 * and the leading hypothesis (small-space) was WRONG at 84% held. That is a
 * result worth being able to re-run, not a paragraph.
 *
 * WHAT IT COSTS: nothing. One paginated read of the catalog's identity columns,
 * zero Trefle calls, zero Anthropic calls. It writes no catalog rows, so it
 * opens no run record (docs/write-provenance.md) — it is a read.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not resolve names through Trefle,
 * so an absentee here is "not held under this binomial or a synonym genus" and
 * not yet "seedable". That is the seeder's dry run, one step later, and keeping
 * the two apart is why this stays free. It also does not rank themes: the
 * percentage is evidence, and which gap is worth filling for a small ornamental
 * garden is a judgment (round 12 declined a theme that PASSED the test).
 *
 * READING THE OUTPUT. Three numbers per theme:
 *   held %      — >=70% kills the theme (round 9's rule).
 *   absentees   — what a round would actually seed.
 *   cultivar-bound — see CULTIVAR_BOUND below. A theme can look empty and be
 *                    unfillable, which the percentage alone will not tell you.
 *
 * Usage:
 *   pnpm probe:gap
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/probe-gap.ts
 *
 * No flags. The report is written to reports/gap-probe-<date>.md, which
 * `archive-round.ts` copies into rounds/<label>/reports/ when the round closes.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchCatalogIndex } from './species-resolver'
import type { StyleTag } from '../lib/style-tags'

/**
 * A theme is a style slug plus the palette a gardener deliberately building
 * that style would shortlist — the same SIGNATURE bar `lib/style-tags.ts` sets
 * for the tag itself, so the probe measures the thing the filter will show.
 *
 * Names are accepted binomials. Cultivars are absent on purpose: the catalog is
 * species-level, so a cultivar in this list would be an absentee the round
 * cannot seed. Where a style IS its cultivars, that is recorded below rather
 * than smuggled into the list as a miss.
 */
interface Theme {
  style: StyleTag
  /** Why this palette and not another — the judgment, kept next to the data. */
  note: string
  candidates: readonly string[]
}

/**
 * Styles whose signature planting is mostly CULTIVARS of species the catalog
 * already holds. A seeding round cannot fill these, however low the count
 * reads, and the probe says so instead of letting the percentage imply a round.
 *
 * This is the failure the flat count invites: `gothic` sits at 10 plants, which
 * looks like the emptiest style in the vocabulary and reads as an obvious
 * round. It is not one. The dark garden is 'Queen of Night' tulip, 'Black Lace'
 * elder, 'Diabolo' physocarpus, black mondo, dark heucheras and dahlias — every
 * one a selection of a species already in the catalog. Filling gothic is a
 * CULTIVAR-tier schema question (standing rule 11's list), not a seed.
 */
const CULTIVAR_BOUND: Partial<Record<StyleTag, string>> = {
  gothic:
    'The dark garden is near-entirely cultivar selections of held species ' +
    "('Queen of Night', 'Black Lace', 'Diabolo', black mondo, dark dahlias " +
    'and heucheras). A species-level round cannot move this count.',
  moon:
    'Partly cultivar-bound: the white forms of held species (white roses, ' +
    "'Annabelle' hydrangea, white foxgloves) are selections. The true " +
    'night-scented species below are seedable; the white-flowered half is not.',
}

const THEMES: readonly Theme[] = [
  {
    style: 'japanese',
    note:
      'The garden tradition, not Japanese botany — the bar style-tags.ts ' +
      'sets. Structure plants (pines, clipped evergreens, maples) weigh ' +
      'heavier than flowers, which is what the style IS.',
    candidates: [
      'Acer palmatum',
      'Acer japonicum',
      'Pinus thunbergii',
      'Pinus parviflora',
      'Pinus densiflora',
      'Cryptomeria japonica',
      'Chamaecyparis obtusa',
      'Sciadopitys verticillata',
      'Podocarpus macrophyllus',
      'Ilex crenata',
      'Rhododendron indicum',
      'Rhododendron kiusianum',
      'Camellia japonica',
      'Camellia sasanqua',
      'Pieris japonica',
      'Enkianthus campanulatus',
      'Nandina domestica',
      'Aucuba japonica',
      'Fatsia japonica',
      'Prunus serrulata',
      'Prunus incisa',
      'Cercidiphyllum japonicum',
      'Ginkgo biloba',
      'Wisteria floribunda',
      'Hakonechloa macra',
      'Ophiopogon japonicus',
      'Ophiopogon planiscapus',
      'Iris ensata',
      'Hosta sieboldiana',
      'Farfugium japonicum',
      'Equisetum hyemale',
      'Rohdea japonica',
    ],
  },
  {
    style: 'chinese',
    note:
      'The classical scholar garden — plants grown as specimens for cultural ' +
      'meaning. Overlaps japanese at the genus level and almost nowhere at ' +
      'the species level, which is the pair CONFUSABLE_STYLE_PAIRS names.',
    candidates: [
      'Paeonia suffruticosa',
      'Paeonia lactiflora',
      'Prunus mume',
      'Chimonanthus praecox',
      'Osmanthus fragrans',
      'Magnolia denudata',
      'Magnolia liliiflora',
      'Nelumbo nucifera',
      'Chrysanthemum morifolium',
      'Wisteria sinensis',
      'Phyllostachys nigra',
      'Phyllostachys aurea',
      'Fargesia murielae',
      'Nandina domestica',
      'Punica granatum',
      'Lagerstroemia indica',
      'Gardenia jasminoides',
      'Camellia sinensis',
      'Jasminum nudiflorum',
      'Jasminum sambac',
      'Hibiscus syriacus',
      'Hemerocallis fulva',
      'Lycoris radiata',
      'Iris tectorum',
      'Rosa chinensis',
      'Cercis chinensis',
      'Koelreuteria paniculata',
      'Styphnolobium japonicum',
      'Ziziphus jujuba',
      'Malus spectabilis',
      'Cymbidium goeringii',
      'Citrus trifoliata',
    ],
  },
  {
    style: 'moon',
    note:
      'The seedable half of the white/evening garden: species whose flowers ' +
      'open or scent at dusk, plus true silver foliage. White CULTIVARS of ' +
      'held species are excluded — see CULTIVAR_BOUND.',
    candidates: [
      'Ipomoea alba',
      'Nicotiana sylvestris',
      'Nicotiana alata',
      'Matthiola longipetala',
      'Hesperis matronalis',
      'Oenothera biennis',
      'Oenothera speciosa',
      'Mirabilis jalapa',
      'Cestrum nocturnum',
      'Zaluzianskya ovata',
      'Datura inoxia',
      'Polianthes tuberosa',
      'Galtonia candicans',
      'Lilium regale',
      'Lilium longiflorum',
      'Crambe cordifolia',
      'Lysimachia clethroides',
      'Anaphalis triplinervis',
      'Artemisia schmidtiana',
      'Artemisia ludoviciana',
      'Stachys byzantina',
      'Convolvulus cneorum',
      'Lunaria annua',
      'Leucanthemum superbum',
      'Hydrangea arborescens',
    ],
  },
  {
    style: 'gothic',
    note:
      'Probed for completeness and expected to be unfillable — the species ' +
      'that are genuinely dark in the species, not in a selection. Read the ' +
      'CULTIVAR_BOUND note before reading the percentage.',
    candidates: [
      'Angelica gigas',
      'Actaea simplex',
      'Geranium phaeum',
      'Iris chrysographes',
      'Scabiosa atropurpurea',
      'Papaver somniferum',
      'Fritillaria persica',
      'Fritillaria camschatcensis',
      'Cirsium rivulare',
      'Knautia macedonica',
      'Amaranthus caudatus',
      'Atriplex hortensis',
      'Ricinus communis',
      'Aeonium arboreum',
      'Trillium erectum',
      'Veratrum nigrum',
      'Dracunculus vulgaris',
      'Helleborus torquatus',
      'Aquilegia atrata',
      'Salvia discolor',
    ],
  },
]

const KILL_THRESHOLD = 0.7

export interface ThemeProbeResult {
  style: StyleTag
  total: number
  held: string[]
  absent: string[]
  heldShare: number
  killed: boolean
  cultivarBound: string | null
}

/**
 * The probe itself, separated from the report so it is callable without a DB —
 * `holds` is injected, which is how the round-9 rule gets a test rather than a
 * paragraph.
 */
export function probeThemes(
  themes: readonly Theme[],
  holds: (name: string) => boolean
): ThemeProbeResult[] {
  return themes.map((theme) => {
    const held = theme.candidates.filter((c) => holds(c))
    const absent = theme.candidates.filter((c) => !holds(c))
    const heldShare = held.length / theme.candidates.length
    return {
      style: theme.style,
      total: theme.candidates.length,
      held,
      absent,
      heldShare,
      killed: heldShare >= KILL_THRESHOLD,
      cultivarBound: CULTIVAR_BOUND[theme.style] ?? null,
    }
  })
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

async function main(): Promise<void> {
  const catalog = await fetchCatalogIndex()
  const results = probeThemes(THEMES, catalog.holds)
  const today = new Date().toISOString().slice(0, 10)

  const lines: string[] = [
    `# Theme gap probe — ${today}`,
    '',
    `Catalog holds ${catalog.names.size} species at probe time.`,
    '',
    `A theme is KILLED when the catalog already holds >=${pct(
      KILL_THRESHOLD
    )} of its signature palette (round 9's rule). Membership is synonym-aware`,
    '(`fetchCatalogIndex().holds`) but not Trefle-resolved, so an absentee here',
    'is a candidate, not yet a confirmed seedable species — that is the dry run.',
    '',
    '| Style | Palette | Held | Held % | Absent | Verdict |',
    '| --- | --- | --- | --- | --- | --- |',
  ]

  for (const r of results) {
    const verdict = r.cultivarBound
      ? 'unfillable (cultivar-bound)'
      : r.killed
        ? 'KILLED'
        : 'survives'
    lines.push(
      `| ${r.style} | ${r.total} | ${r.held.length} | ${pct(r.heldShare)} | ${
        r.absent.length
      } | ${verdict} |`
    )
  }

  for (const r of results) {
    const theme = THEMES.find((t) => t.style === r.style)!
    lines.push('', `## ${r.style}`, '', theme.note)
    if (r.cultivarBound) {
      lines.push('', `**Cultivar-bound.** ${r.cultivarBound}`)
    }
    lines.push(
      '',
      `Held ${r.held.length}/${r.total} (${pct(r.heldShare)}).`,
      '',
      '**Absent:**',
      '',
      ...(r.absent.length
        ? r.absent.map((a) => `- _${a}_`)
        : ['- none — the catalog holds the whole palette.'])
    )
  }

  const body = lines.join('\n') + '\n'
  const dir = join(process.cwd(), 'reports')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `gap-probe-${today}.md`)
  writeFileSync(path, body)

  console.log(body)
  console.log(`\nWritten to ${path}`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
