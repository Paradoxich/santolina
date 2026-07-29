/**
 * Sample data for the plant-detail preview. Deliberately hand written rather
 * than fetched: the preview exists to judge layout and hierarchy before any
 * query or migration is committed to. Shapes mirror the real ones (DbPlant,
 * DiaryNote, CareEvent) so graduating a section to the live page is a swap of
 * the data source, not a rewrite.
 *
 * TODAY is frozen so the preview reads identically whenever it is opened.
 */

import type { DiaryEventType } from '@/lib/diary-events'

export const TODAY = new Date('2026-07-29T12:00:00Z')

export interface SamplePlant {
  common_name: string
  scientific_name: string
  plant_type: string
  /** Months 1-12 the species flowers. */
  bloom_months: number[]
  /** Per-stage description of what the plant is doing (seasonal_rhythm). */
  seasonal_rhythm: Record<string, string>
  /** Per-stage imperative action, null where there is nothing to do. */
  seasonal_care: Record<string, string | null>
  water_needs: string
  light_needs: string
  soil_needs: string
  maintenance_notes: string
  common_issues: string
  best_placement: string
  environment_benefits: string
  height: string
  spread: string
  native_to: string
  family: string
}

export const SAMPLE_PLANT: SamplePlant = {
  common_name: 'English lavender',
  scientific_name: 'Lavandula angustifolia',
  plant_type: 'Shrub',
  bloom_months: [6, 7, 8],
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
  water_needs:
    'Low once established. Water deeply but rarely, and let the soil dry between.',
  light_needs: 'Full sun',
  soil_needs: 'Sharp drainage above all else. Poor, gritty soil suits it.',
  maintenance_notes:
    'Prune every year after flowering to keep the mound tight. Lavender will not reshoot from bare wood, so never cut back further than the soft growth.',
  common_issues:
    'Woody, splitting centres from skipped pruning. Root rot in heavy or wet soil.',
  best_placement:
    'Sunny edges, gravel beds, along a path where you brush past it.',
  environment_benefits:
    'Heavily worked by bees and hoverflies through midsummer.',
  height: '40 to 80 cm',
  spread: '60 to 100 cm',
  native_to: 'Western Mediterranean',
  family: 'Lamiaceae',
}

export interface SampleEvent {
  type: DiaryEventType
  date: string
}

export interface SampleNote {
  id: string
  date: string
  text: string
  eventTypes: DiaryEventType[]
  photoCount: number
}

/** A well logged plant: roughly a note a fortnight, events through the season. */
export const NOTES_RICH: SampleNote[] = [
  {
    id: 'n1',
    date: '2026-07-24',
    text: 'Bees on it all afternoon. The spikes nearest the path are already going papery at the tips.',
    eventTypes: [],
    photoCount: 2,
  },
  {
    id: 'n2',
    date: '2026-07-23',
    text: '',
    eventTypes: ['watered'],
    photoCount: 0,
  },
  {
    id: 'n3',
    date: '2026-07-09',
    text: 'Full flower now. Much better than last year, the extra grit clearly helped.',
    eventTypes: ['watered'],
    photoCount: 1,
  },
  {
    id: 'n4',
    date: '2026-06-18',
    text: 'First spikes opening.',
    eventTypes: [],
    photoCount: 1,
  },
  {
    id: 'n5',
    date: '2026-05-02',
    text: 'Worked a bag of grit into the bed before planting. Soil here holds more water than I would like.',
    eventTypes: ['planted'],
    photoCount: 2,
  },
]

/** A sparsely logged plant: planted, then silence. The common case. */
export const NOTES_SPARSE: SampleNote[] = [
  {
    id: 's1',
    date: '2026-05-02',
    text: '',
    eventTypes: ['planted'],
    photoCount: 0,
  },
]

export const NOTES_NONE: SampleNote[] = []

/** Flattens notes into one event per logged type, as listGardenCareEvents does. */
export function eventsFromNotes(notes: SampleNote[]): SampleEvent[] {
  return notes.flatMap((note) =>
    note.eventTypes.map((type) => ({ type, date: note.date }))
  )
}
