import type { GardenPlant } from '@/types/garden'

/**
 * Sample data matching the Figma design. Will be replaced by
 * Supabase-backed palette data once the backend is wired up.
 *
 * bloomMonths mirrors each species' real bloom window — bloom status
 * badges are derived live via getBloomStatus(), not stored here.
 */
export const sampleGardenPlants: GardenPlant[] = [
  {
    id: '1',
    name: 'Salvia nemorosa',
    imageUrl: '/plants/plant-01.png',
    bloomMonths: [6, 7, 8, 9],
    note: 'First flowers opening',
  },
  {
    id: '2',
    name: 'Salvia nemorosa',
    imageUrl: '/plants/plant-02.png',
    bloomMonths: [6, 7, 8, 9],
    note: 'Recently divided',
  },
  {
    id: '3',
    name: 'Salvia nemorosa',
    imageUrl: '/plants/plant-03.png',
    bloomMonths: [6, 7, 8, 9],
    note: 'Peak bloom expected soon',
  },
  {
    id: '4',
    name: 'Rosemary',
    imageUrl: '/plants/plant-04.png',
    bloomMonths: [3, 4, 5],
    note: 'Cut back this week',
  },
  {
    id: '5',
    name: 'Portulaca grandiflora',
    imageUrl: '/plants/plant-05.png',
    bloomMonths: [6, 7, 8, 9],
    note: 'Cut back this week',
  },
  {
    id: '6',
    name: 'Lavanda',
    imageUrl: '/plants/plant-06.png',
    bloomMonths: [6, 7, 8],
    note: 'Bloom ending soon',
  },
  {
    id: '7',
    name: 'Echinacea purpurea',
    imageUrl: '/plants/plant-03.png',
    bloomMonths: [7, 8, 9],
    note: 'Buds forming',
  },
  {
    id: '8',
    name: 'Salvia nemorosa',
    imageUrl: '/plants/plant-01.png',
    bloomMonths: [6, 7, 8, 9],
    note: 'Thriving in full sun',
  },
  {
    id: '9',
    name: 'Rosemary',
    imageUrl: '/plants/plant-04.png',
    bloomMonths: [3, 4, 5],
    note: 'New growth visible',
  },
  {
    id: '10',
    name: 'Lavanda',
    imageUrl: '/plants/plant-06.png',
    bloomMonths: [6, 7, 8],
    note: 'Attracting pollinators',
  },
  {
    id: '11',
    name: 'Portulaca grandiflora',
    imageUrl: '/plants/plant-05.png',
    bloomMonths: [6, 7, 8, 9],
    note: 'Season finished',
  },
  {
    id: '12',
    name: 'Salvia nemorosa',
    imageUrl: '/plants/plant-02.png',
    bloomMonths: [6, 7, 8, 9],
    note: 'Watch for aphids',
  },
  {
    id: '13',
    name: 'Achillea millefolium',
    imageUrl: '/plants/plant-02.png',
    bloomMonths: [6, 7, 8, 9],
    note: 'Planting in early autumn',
    caption: 'Full sun · Jun–Sep',
    planned: true,
  },
  {
    id: '14',
    name: 'Nepeta faassenii',
    imageUrl: '/plants/plant-06.png',
    bloomMonths: [5, 6, 7, 8, 9],
    note: 'Pairs well with lavender',
    caption: 'Full sun · May–Sep',
    planned: true,
  },
  {
    id: '15',
    name: 'Stipa tenuissima',
    imageUrl: '/plants/plant-04.png',
    bloomMonths: [7, 8, 9, 10],
    note: 'Adds movement and texture',
    caption: 'Full sun · Jul–Oct',
    planned: true,
  },
  {
    id: '16',
    name: 'Verbena bonariensis',
    imageUrl: '/plants/plant-01.png',
    bloomMonths: [8, 9, 10],
    note: 'Self-seeds generously',
    caption: 'Part shade · Aug–Oct',
    planned: true,
  },
]
