/**
 * Sample data for the plant-detail preview.
 *
 * The preview renders the REAL GardenPlantView component, not a copy of it,
 * so this file only has to produce the shapes that component takes: a DbPlant
 * row and a list of DiaryNote. That way the preview cannot drift away from
 * what ships, which a parallel implementation would have done within a day.
 */

import type { DbPlant } from '@/lib/plants-db'
import type { DiaryNote } from '@/types/diary'

/** Sample dates track the current year so the strip always reads sensibly. */
const YEAR = new Date().getFullYear()

function iso(month: number, day: number): string {
  return `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * A catalog row with the fields this view actually reads populated, cast to
 * DbPlant rather than spelling out all sixty columns. If the view starts
 * reading a new field it reads undefined here, which surfaces as an empty
 * card in the preview — the intended failure mode, not a silent pass.
 */
export const SAMPLE_PLANT = {
  id: 'preview-lavender',
  common_name: 'English lavender',
  scientific_name: 'Lavandula angustifolia',
  common_name_aliases: [],
  family: 'Lamiaceae',
  native_to: 'Western Mediterranean',
  description:
    'A compact evergreen shrub with narrow grey green leaves and dense spikes of scented purple flowers through midsummer.',
  plant_type: 'shrub',
  plant_type_label: 'Shrub',
  bloom_months: [6, 7, 8],
  height_min_cm: 40,
  height_max_cm: 80,
  spread_min_cm: 60,
  spread_max_cm: 100,
  sun_requirements: ['full_sun'],
  light_needs: 'Full sun',
  water_needs:
    'Low once established. Water deeply but rarely, and let the soil dry between.',
  soil_needs: 'Sharp drainage above all else. Poor, gritty soil suits it.',
  maintenance_notes:
    'Prune every year after flowering to keep the mound tight. Lavender will not reshoot from bare wood, so never cut back further than the soft growth.',
  common_issues:
    'Woody, splitting centres from skipped pruning. Root rot in heavy or wet soil.',
  best_placement:
    'Sunny edges, gravel beds, along a path where you brush past it.',
  environment_benefits:
    'Heavily worked by bees and hoverflies through midsummer.',
  garden_use_tags: ['pollinator friendly', 'drought tolerant', 'fragrant'],
  seasonal_rhythm: {
    early_spring: 'Grey green foliage tightens up and new shoots push through.',
    late_spring: 'Flower spikes rise well above the mound of leaves.',
    summer: 'Full flower, heavy with bees through the hottest weeks.',
    late_summer: 'Colour fades to a dusty grey and the scent concentrates.',
    autumn: 'Growth slows. The shape is what carries the border now.',
    winter: 'Holds its silver mound. Nothing green happens above ground.',
  },
  seasonal_care: {
    early_spring: 'Clear winter debris from around the base.',
    late_spring: null,
    summer: 'Cut spent spikes back as the colour fades, not into old wood.',
    late_summer: 'Give it a light shaping once flowering finishes.',
    autumn: null,
    winter: 'Leave it alone. Wet feet in cold soil is what kills lavender.',
  },
  image_url: null,
  image_urls: [],
} as unknown as DbPlant

/** A well logged plant: roughly a note a fortnight, events through the season. */
export const NOTES_RICH: DiaryNote[] = [
  {
    id: 'n1',
    date: iso(7, 24),
    text: 'Bees on it all afternoon. The spikes nearest the path are already going papery at the tips.',
    eventTypes: [],
    photos: [
      { src: '/placeholder-img.png', width: 131 },
      { src: '/placeholder-img.png', width: 175 },
    ],
  },
  { id: 'n2', date: iso(7, 23), text: '', eventTypes: ['watered'] },
  {
    id: 'n3',
    date: iso(7, 9),
    text: 'Full flower now. Much better than last year, the extra grit clearly helped.',
    eventTypes: ['watered'],
    photos: [{ src: '/placeholder-img.png', width: 207 }],
  },
  {
    id: 'n4',
    date: iso(6, 18),
    text: 'First spikes opening.',
    eventTypes: [],
    photos: [{ src: '/placeholder-img.png', width: 131 }],
  },
  {
    id: 'n5',
    date: iso(5, 2),
    text: 'Worked a bag of grit into the bed before planting. Soil here holds more water than I would like.',
    eventTypes: ['planted'],
    photos: [
      { src: '/placeholder-img.png', width: 175 },
      { src: '/placeholder-img.png', width: 131 },
    ],
  },
]

/** A sparsely logged plant: planted, then silence. The common case. */
export const NOTES_SPARSE: DiaryNote[] = [
  { id: 's1', date: iso(5, 2), text: '', eventTypes: ['planted'] },
]

export const NOTES_NONE: DiaryNote[] = []
