export type SpaceType =
  | 'ground_garden'
  | 'raised_beds'
  | 'terrace_balcony'
  | 'mixed'

export type SunExposure = 'full_sun' | 'partial_sun' | 'shade' | 'mixed'

/** Mirrors the Supabase gardens table (profile fields only). */
export interface Garden {
  id: string
  name: string | null
  city: string | null
  country: string | null
  lat: number | null
  lon: number | null
  climate_zone: string | null
  hardiness_zone: string | null
  space_type: SpaceType | null
  sun_exposure: SunExposure | null
  size: 'small' | 'medium' | 'large' | 'unknown' | null
  style: string[]
}

export interface CatalogPlant {
  id: string
  commonName: string
  botanicalName: string
  imageUrl: string
  description: string
  /** Alternate common names — searched alongside the primary name. */
  aliases: string[]
  /** Functional growth form (plants.plant_type), e.g. "perennial". */
  plantType: string
  /** Aesthetic style tags (plants.style_tags). */
  styleTags: string[]
  /** Exposures the plant thrives in (plants.sun_thrives) — the filter axis. */
  sunThrives: string[]
  /** Months 1–12 of flowering — bloom-season filtering derives from these. */
  bloomMonths: number[]
  /** Raw bloom color values — bucketed for filtering by lib/bloom-colors.ts. */
  bloomColor: string[]
  /** WGSRPD Level-2 native region tags — powers the native-to-me lens. */
  nativeRegion: string[]
}

export interface GardenPlant {
  id: string
  name: string
  imageUrl: string
  /** Mirrors plants.bloom_months — bloom status is derived, not stored. See lib/bloom-status.ts. */
  bloomMonths: number[]
  note: string
  planned?: boolean
  /** e.g. "Part shade · Aug–Oct" — shown on planned plant cards */
  caption?: string
  /** Terse field note about position within the current stage (or a care cue) — shown on growing cards. See lib/bloom-status.ts getStageNote. */
  stageNote?: string
}
