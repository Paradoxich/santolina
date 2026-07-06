import type { Garden } from '@/types/garden'

/**
 * Fallback garden profile used until onboarding + auth create real
 * rows in the gardens table. Mirrors the sunny Mediterranean garden
 * the sample content and Figma copy assume.
 */
export const DEFAULT_GARDEN: Garden = {
  id: 'default-garden',
  name: 'My Garden',
  city: null,
  country: null,
  climate_zone: 'mediterranean',
  hardiness_zone: '9',
  space_type: 'ground_garden',
  sun_exposure: 'full_sun',
  size: 'medium',
  style: ['mediterranean'],
}
