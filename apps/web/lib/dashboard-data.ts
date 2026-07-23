import { cache } from 'react'
import { listPalette } from '@/server/palette-actions'
import { listGardenCareEvents } from '@/server/diary-actions'
import { getSessionGardenContext } from '@/lib/session-garden'
import { getForecast } from '@/lib/open-meteo'
import type { Garden } from '@/types/garden'
import type { WeatherDay } from '@/types/dashboard'

/**
 * Request-scoped reads for the dashboard's streamed cards. Each card on
 * /overview fetches its own data inside a Suspense boundary, so several cards
 * ask for the palette (and the forecast) concurrently in the same request.
 * React `cache()` collapses those into one query each per request — same
 * pattern as `getSessionGardenContext`. Lives here (not in the server-action
 * files) because 'use server' modules may only export plain async functions.
 */
export const getPaletteCached = cache(() => listPalette())

export const getCareEventsCached = cache(() => listGardenCareEvents())

/**
 * Garden row plus its 7-day forecast in one cached read. `days` is null when
 * the garden has no coordinates yet or Open-Meteo is unreachable — consumers
 * render their empty/fallback state, never throw.
 */
export const getGardenForecastCached = cache(
  async (): Promise<{
    garden: Garden | null
    days: WeatherDay[] | null
  }> => {
    const garden = (await getSessionGardenContext())?.garden ?? null
    if (garden?.lat == null || garden?.lon == null) {
      return { garden, days: null }
    }
    try {
      return { garden, days: await getForecast(garden.lat, garden.lon) }
    } catch {
      return { garden, days: null }
    }
  }
)
