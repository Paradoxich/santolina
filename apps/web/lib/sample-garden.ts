import type { GardenPlant } from '@/types/garden'

/**
 * Sample data matching the Figma design. Will be replaced by
 * Supabase-backed palette data once the backend is wired up.
 */
export const sampleGardenPlants: GardenPlant[] = [
  {
    id: '1',
    name: 'Salvia nemorosa',
    imageUrl: '/plants/plant-01.png',
    status: 'blooming',
    note: 'First flowers opening',
  },
  {
    id: '2',
    name: 'Salvia nemorosa',
    imageUrl: '/plants/plant-02.png',
    status: 'blooming',
    note: 'Recently divided',
  },
  {
    id: '3',
    name: 'Salvia nemorosa',
    imageUrl: '/plants/plant-03.png',
    status: 'pre-bloom',
    note: 'Peak bloom expected soon',
  },
  {
    id: '4',
    name: 'Rosemary',
    imageUrl: '/plants/plant-04.png',
    status: 'done',
    note: 'Cut back this week',
  },
  {
    id: '5',
    name: 'Portulaca grandiflora',
    imageUrl: '/plants/plant-05.png',
    status: 'resting',
    note: 'Cut back this week',
  },
  {
    id: '6',
    name: 'Lavanda',
    imageUrl: '/plants/plant-06.png',
    status: 'blooming',
    note: 'Bloom ending soon',
  },
  {
    id: '7',
    name: 'Echinacea purpurea',
    imageUrl: '/plants/plant-03.png',
    status: 'pre-bloom',
    note: 'Buds forming',
  },
  {
    id: '8',
    name: 'Salvia nemorosa',
    imageUrl: '/plants/plant-01.png',
    status: 'blooming',
    note: 'Thriving in full sun',
  },
  {
    id: '9',
    name: 'Rosemary',
    imageUrl: '/plants/plant-04.png',
    status: 'resting',
    note: 'New growth visible',
  },
  {
    id: '10',
    name: 'Lavanda',
    imageUrl: '/plants/plant-06.png',
    status: 'blooming',
    note: 'Attracting pollinators',
  },
  {
    id: '11',
    name: 'Portulaca grandiflora',
    imageUrl: '/plants/plant-05.png',
    status: 'done',
    note: 'Season finished',
  },
  {
    id: '12',
    name: 'Salvia nemorosa',
    imageUrl: '/plants/plant-02.png',
    status: 'pre-bloom',
    note: 'Watch for aphids',
  },
  {
    id: '13',
    name: 'Achillea millefolium',
    imageUrl: '/plants/plant-02.png',
    status: 'pre-bloom',
    note: 'Planting in early autumn',
    planned: true,
  },
  {
    id: '14',
    name: 'Nepeta faassenii',
    imageUrl: '/plants/plant-06.png',
    status: 'pre-bloom',
    note: 'Pairs well with lavender',
    planned: true,
  },
  {
    id: '15',
    name: 'Stipa tenuissima',
    imageUrl: '/plants/plant-04.png',
    status: 'pre-bloom',
    note: 'Adds movement and texture',
    planned: true,
  },
  {
    id: '16',
    name: 'Verbena bonariensis',
    imageUrl: '/plants/plant-01.png',
    status: 'pre-bloom',
    note: 'Self-seeds generously',
    planned: true,
  },
]
