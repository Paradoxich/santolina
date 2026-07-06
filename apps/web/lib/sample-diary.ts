import type { PlantDiary } from '@/types/diary'

/**
 * Sample data matching the Figma design. Will be replaced by
 * Supabase-backed diary data once the backend is wired up.
 */
export const samplePlantDiaries: PlantDiary[] = [
  {
    id: 'woodland-sage',
    plantName: 'Woodland Sage',
    summary:
      'This season, Woodland Sage handled dry coastal conditions well and maintained healthy foliage through warmer weeks. Blooming started earlier on the south-facing side of the garden and continued steadily after deadheading.',
    notes: [
      {
        id: 'ws-1',
        text: 'Spikes are filling out faster than last year, three already over 30 cm. Bees have found them too.',
        date: '2026-05-08',
      },
      {
        id: 'ws-2',
        text: 'First flowers opened this week. Bees started visiting almost immediately in the afternoon sun.',
        date: '2026-05-07',
        photos: [
          { src: '/diary/note-photo-01.png', width: 66 },
          { src: '/diary/note-photo-02.png', width: 93 },
        ],
      },
      {
        id: 'ws-3',
        text: 'Handled three dry days without signs of stress. Foliage still looks fresh.',
        date: '2026-05-06',
      },
      {
        id: 'ws-4',
        text: 'Peak bloom beginning now — deep violet color stands out next to the achillea.',
        date: '2026-05-06',
      },
      {
        id: 'ws-5',
        text: 'Buds forming along most spikes. Growth has been steady since the warm spell.',
        date: '2026-04-23',
      },
      {
        id: 'ws-6',
        text: 'New basal growth is dense and healthy. Divided one clump to fill the gap by the path.',
        date: '2026-04-15',
        photos: [
          { src: '/diary/note-photo-03.png', width: 93 },
          { src: '/diary/note-photo-04.png', width: 66 },
        ],
      },
    ],
  },
  {
    id: 'foxglove',
    plantName: 'Foxglove',
    thumbnailUrl: '/diary/thumb-foxglove.png',
    summary:
      'Foxglove established quickly in the shaded border and sent up taller flower stems than expected. Self-seeding should give a good second-year show.',
    notes: [
      {
        id: 'fg-1',
        text: 'First flowers open on the tallest stem. Cream and rose, taller than expected.',
        date: '2026-05-07',
        photos: [{ src: '/diary/thumb-foxglove.png', width: 66 }],
      },
    ],
  },
  {
    id: 'lavender',
    plantName: 'Lavender',
    summary:
      'A hard spring prune reset the shape after a leggy winter. New growth is coming back evenly from the base.',
    notes: [
      {
        id: 'lv-1',
        text: 'Hard prune — back to woody base. Cleaned out dead wood from center.',
        date: '2026-05-06',
      },
    ],
  },
  {
    id: 'echinacea',
    plantName: 'Echinacea',
    summary:
      'Dividing the main clump gave three healthy plants. The replanted divisions in the south strip took without wilting.',
    notes: [
      {
        id: 'ec-1',
        text: 'Divided main clump into 3. Replanted two in the south strip, gifted one.',
        date: '2026-04-28',
      },
    ],
  },
  {
    id: 'japanese-anemone',
    plantName: 'Japanese Anemone',
    summary:
      'Divisions are establishing indoors before planting out. Light from the east window has kept growth compact.',
    notes: [
      {
        id: 'ja-1',
        text: 'Propagated through division, set up in the east window for optimal light.',
        date: '2026-04-21',
      },
    ],
  },
  {
    id: 'basil',
    plantName: 'Basil',
    summary:
      'Steady harvests all month without slowing the plants down. Pinching early kept them bushy.',
    notes: [
      {
        id: 'bs-1',
        text: 'Harvested leaves for pesto, remaining plants are thriving in the herb garden.',
        date: '2026-04-16',
      },
    ],
  },
  {
    id: 'spotted-dead-nettle',
    plantName: 'Spotted dead-nettle',
    summary:
      'Settling in as ground cover along the north fence. Partial shade suits it — leaves have kept their silver markings.',
    notes: [
      {
        id: 'dn-1',
        text: 'Planted in partial shade near the north fence.',
        date: '2026-04-12',
      },
    ],
  },
  {
    id: 'christmas-rose',
    plantName: 'Christmas Rose',
    summary:
      'Repotting gave the roots room to spread, and the peat moss mix is holding moisture between waterings.',
    notes: [
      {
        id: 'cr-1',
        text: 'Transplanted into a larger pot, added peat moss for moisture retention.',
        date: '2026-04-01',
      },
    ],
  },
]
