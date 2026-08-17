// Pure logic for the "Good for your garden" checklist. Client-safe.
import type { DbPlant } from './plants-db'
import type { Garden } from '@/types/garden'
import { monthName } from './format-plant'
import { STYLE_DISPLAY_NAMES, type StyleTag } from './style-tags'

export type GoodForBullet = {
  text: string
  tone: 'positive' | 'warning'
}

export interface CompanionName {
  common_name: string
}

const MAX_BULLETS = 4

/** Height above which a plant is flagged as too large for a balcony. */
const BALCONY_MAX_HEIGHT_CM = 150

const SUN_ADJECTIVES: Record<string, string> = {
  full_sun: 'sunny',
  partial_sun: 'partially shaded',
  shade: 'shaded',
  mixed: 'mixed-light',
}

export function buildGoodForYourGarden(
  plant: DbPlant,
  garden: Garden,
  companions: CompanionName[] = []
): GoodForBullet[] {
  const bullets: GoodForBullet[] = []

  // Tier 1 — sun match (positive or warning)
  const sun = plant.sun_requirements ?? []
  if (sun.length > 0 && garden.sun_exposure) {
    if (garden.sun_exposure === 'mixed' || sun.includes(garden.sun_exposure)) {
      bullets.push({
        text: `Matches your ${SUN_ADJECTIVES[garden.sun_exposure]} garden conditions`,
        tone: 'positive',
      })
    } else if (
      garden.sun_exposure !== 'full_sun' &&
      sun.includes('full_sun') &&
      sun.length === 1
    ) {
      bullets.push({
        text: 'Needs more sun than your garden currently gets',
        tone: 'warning',
      })
    } else {
      bullets.push({
        text: 'Prefers different light than your garden currently gets',
        tone: 'warning',
      })
    }
  }

  // Tier 1 — hardiness (skip annuals and missing data)
  const gardenZone = parseZone(garden.hardiness_zone)
  const zoneMin = parseZone(plant.hardiness_zone_min)
  const zoneMax = parseZone(plant.hardiness_zone_max)
  if (
    plant.plant_type !== 'annual' &&
    gardenZone != null &&
    zoneMin != null &&
    zoneMax != null
  ) {
    if (gardenZone >= zoneMin && gardenZone <= zoneMax) {
      bullets.push({ text: 'Hardy in your climate zone', tone: 'positive' })
    } else {
      bullets.push({
        text: 'May struggle to survive winter in your climate zone',
        tone: 'warning',
      })
    }
  }

  // Tier 2 — style overlap (positive only)
  const styleMatch = (garden.style ?? []).find((s) =>
    (plant.style_tags ?? []).includes(s)
  )
  if (styleMatch) {
    // Display name, not the raw slug: the expanded vocabulary put proper nouns
    // in here ("chinese", "japanese") and the slug renders them lowercase.
    // Latent today — nothing writes gardens.style until onboarding ships, so
    // this bullet never fires; it goes live with the wizard.
    bullets.push({
      text: `Fits your ${
        STYLE_DISPLAY_NAMES[styleMatch as StyleTag] ?? styleMatch
      } garden style`,
      tone: 'positive',
    })
  }

  // Tier 2 — too large for a balcony (warning)
  if (
    garden.space_type === 'terrace_balcony' &&
    plant.height_max_cm != null &&
    plant.height_max_cm > BALCONY_MAX_HEIGHT_CM
  ) {
    bullets.push({
      text: 'May outgrow a balcony or container',
      tone: 'warning',
    })
  }

  // Static pool — fill remaining slots in priority order
  const pool: GoodForBullet[] = []

  if (plant.care_level === 'low') {
    pool.push({ text: 'Low maintenance once established', tone: 'positive' })
  }

  const bloom = [...new Set(plant.bloom_months ?? [])].sort((a, b) => a - b)
  if (bloom.length >= 3) {
    pool.push({
      text: `Long flowering period, ${monthName(bloom[0]!)} to ${monthName(bloom[bloom.length - 1]!)}`,
      tone: 'positive',
    })
  }

  if (plant.environment_benefits) {
    pool.push({ text: plant.environment_benefits, tone: 'positive' })
  }

  const companionNames = companions
    .map((c) => c.common_name)
    .filter(Boolean)
    .slice(0, 2)
  if (companionNames.length > 0) {
    pool.push({
      text: `Pairs naturally with ${companionNames.join(', ')}`,
      tone: 'positive',
    })
  }

  for (const bullet of pool) {
    if (bullets.length >= MAX_BULLETS) break
    bullets.push(bullet)
  }

  return bullets.slice(0, MAX_BULLETS)
}

/** Zones are stored as text ("8", "9b") — extract the numeric part. */
function parseZone(zone: string | number | null): number | null {
  if (zone == null) return null
  const parsed = parseInt(String(zone), 10)
  return Number.isNaN(parsed) ? null : parsed
}
