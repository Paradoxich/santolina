import type {
  BloomSeason,
  DashboardPlant,
  PlannedPlant,
} from '@/types/dashboard'

/**
 * Sample data matching the Figma design. Weather now comes from Open-Meteo
 * (see lib/open-meteo.ts); the rest from Supabase once the backend is wired up.
 */

export const dashboardSubtitle =
  'Cool mornings this week. Foxgloves are beginning to open.'

export const myPlants: DashboardPlant[] = [
  { name: 'Santolina', imageUrl: '/dashboard/plant-santolina.png' },
  { name: 'Salvia', imageUrl: '/dashboard/plant-salvia.png' },
  { name: 'Rosemary', imageUrl: '/dashboard/plant-rosemary.png' },
  { name: 'Echinacea', imageUrl: '/dashboard/plant-echinacea.png' },
  { name: 'Lavender', imageUrl: '/dashboard/plant-lavender.png' },
]

/** Span geometry mirrors the Figma chart (381×147). */
export const bloomSeason: BloomSeason = {
  title: 'Spring',
  meta: 'Week 19 · 2 blooming now',
  months: ['M', 'A', 'May', 'J', 'J'],
  currentMonth: 2,
  spans: [
    {
      id: 'salvia-now',
      plantName: 'Salvia',
      color: '#a38eb8',
      x: 35.2,
      width: 43.8,
      y: 12,
      thumbAt: 50.1,
      thumbSize: 24,
      emphasis: 'now',
      imageUrl: '/dashboard/plant-salvia.png',
    },
    {
      id: 'salvia-late',
      plantName: 'Salvia',
      color: '#c9b6c2',
      x: 64,
      width: 30.7,
      y: 38,
      thumbAt: 66.1,
      thumbSize: 16,
      emphasis: 'upcoming',
      imageUrl: '/dashboard/plant-salvia.png',
    },
    {
      id: 'echinacea-now',
      plantName: 'Echinacea',
      color: '#d6a987',
      x: 12.3,
      width: 50.9,
      y: 62,
      thumbAt: 50.1,
      thumbSize: 24,
      emphasis: 'now',
      imageUrl: '/dashboard/plant-echinacea.png',
    },
    {
      id: 'rosemary',
      plantName: 'Rosemary',
      color: '#a8b0a4',
      x: 58.8,
      width: 40.9,
      y: 82,
      thumbAt: 60.9,
      thumbSize: 16,
      emphasis: 'upcoming',
      imageUrl: '/dashboard/plant-rosemary.png',
    },
    {
      id: 'salvia-past',
      plantName: 'Salvia',
      color: '#afafaf',
      x: 0,
      width: 30.7,
      y: 101,
      thumbAt: 29.1,
      thumbSize: 12,
      emphasis: 'past',
      imageUrl: '/dashboard/plant-salvia.png',
    },
    {
      id: 'echinacea-late',
      plantName: 'Echinacea',
      color: '#c8b294',
      x: 79.5,
      width: 20.5,
      y: 108,
      thumbAt: 81.1,
      thumbSize: 12,
      emphasis: 'upcoming',
      imageUrl: '/dashboard/plant-echinacea.png',
    },
    {
      id: 'lavender',
      plantName: 'Lavender',
      color: '#c8c2a4',
      x: 59.3,
      width: 30.4,
      y: 134,
      thumbAt: 61.4,
      thumbSize: 16,
      emphasis: 'upcoming',
      imageUrl: '/dashboard/plant-lavender.png',
    },
  ],
}

export const plannedPlants: PlannedPlant[] = [
  {
    name: 'Tiarella cordifolia',
    imageUrl: '/dashboard/thumb-tiarella.png',
    months: 'Apr–May',
  },
  {
    name: 'Japanese anemone',
    imageUrl: '/dashboard/thumb-anemone.png',
    months: 'Aug–Oct',
  },
  {
    name: 'Heuchera "Palace Purple"',
    imageUrl: '/dashboard/thumb-heuchera.png',
    months: 'Jun–Aug',
  },
  {
    name: 'Rudbeckia fulgida',
    imageUrl: '/dashboard/thumb-rudbeckia.png',
    months: 'Jul–Oct',
  },
]

/** Decorative bullet colors for recent diary rows — data, cycled by index. */
export const diaryDotColors = ['#9aa4c4', '#c9b6c2', '#c4b6a4']

export const gardenInsight =
  'Your garden is supporting local pollinators during one of the busiest bloom weeks.'
