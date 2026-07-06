import type { CatalogPlant } from '@/types/garden'

/**
 * Sample recommended plants matching the Figma design. Will be replaced
 * by Perenual-backed catalog data once the backend is wired up.
 */
export const sampleCatalogPlants: CatalogPlant[] = [
  {
    id: '1',
    commonName: 'Woodland Sage',
    botanicalName: 'Salvia nemorosa',
    imageUrl: '/plants/plant-01.png',
    description:
      'Thrives in sunny coastal gardens and handles dry summers well once established.',
  },
  {
    id: '2',
    commonName: 'Santolina',
    botanicalName: 'Santolina chamaecyparissus',
    imageUrl: '/plants/plant-02.png',
    description:
      'Excellent pollinator plant that brings movement and color through late spring and summer.',
  },
  {
    id: '3',
    commonName: 'Echinacea',
    botanicalName: 'Echinacea purpurea',
    imageUrl: '/plants/plant-03.png',
    description:
      'Coneflowers form dense clumps and attract pollinators from midsummer into early autumn.',
  },
  {
    id: '4',
    commonName: 'Moss Rose',
    botanicalName: 'Portulaca grandiflora',
    imageUrl: '/plants/plant-05.png',
    description:
      'Long flowering season with minimal maintenance, ideal for relaxed Mediterranean-style planting.',
  },
  {
    id: '5',
    commonName: 'Rosemary',
    botanicalName: 'Salvia rosmarinus',
    imageUrl: '/plants/plant-04.png',
    description:
      'Pairs naturally with lavender, grasses, and other drought-tolerant perennials common in your garden conditions.',
  },
  {
    id: '6',
    commonName: 'Lavender',
    botanicalName: 'Lavandula angustifolia',
    imageUrl: '/plants/plant-06.png',
    description:
      'Fragrant silver foliage and violet spikes, thriving in dry, sunny borders.',
  },
  {
    id: '7',
    commonName: 'Foxglove',
    botanicalName: 'Digitalis purpurea',
    imageUrl: '/plants/plant-03.png',
    description:
      'Tall spires of tubular blooms, well suited to woodland edges and cottage borders.',
  },
  {
    id: '8',
    commonName: 'Christmas Rose',
    botanicalName: 'Helleborus niger',
    imageUrl: '/plants/plant-06.png',
    description:
      'Evergreen foliage with pale winter blooms, thriving in shaded, sheltered spots.',
  },
  {
    id: '9',
    commonName: 'Heartleaf foamflower',
    botanicalName: 'Tiarella cordifolia',
    imageUrl: '/plants/plant-04.png',
    description:
      'Spreads by runners to form dense ground cover with attractive heart-shaped leaves.',
  },
]
