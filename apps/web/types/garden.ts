export type BloomStatus = 'blooming' | 'pre-bloom' | 'resting' | 'done'

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
}

export interface GardenPlant {
  id: string
  name: string
  imageUrl: string
  status: BloomStatus
  note: string
  planned?: boolean
  /** e.g. "Part shade · Aug–Oct" — shown on planned plant cards */
  caption?: string
}
