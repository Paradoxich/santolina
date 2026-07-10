import { unstable_cache } from 'next/cache'
import type { WeatherDay } from '@/types/dashboard'
import {
  getWeatherDescription,
  getWeatherIconAsset,
  mapWeatherCode,
} from './weather-icon'

export interface GeocodingResult {
  id: number
  name: string
  admin1: string | null
  country: string
  latitude: number
  longitude: number
}

interface OpenMeteoGeocodingResponse {
  results?: Array<{
    id: number
    name: string
    admin1?: string
    country: string
    latitude: number
    longitude: number
  }>
}

interface OpenMeteoForecastResponse {
  daily: {
    time: string[]
    weathercode: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
}

/**
 * Open-Meteo's geocoding API — free, no key. Called directly from the
 * browser as the user types in the location picker.
 */
export async function searchCities(query: string): Promise<GeocodingResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=10&language=en&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding request failed: ${res.status}`)

  const data = (await res.json()) as OpenMeteoGeocodingResponse
  return (data.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    admin1: r.admin1 ?? null,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
  }))
}

/** Today + next 2 days, shaped for the dashboard Weather card. */
async function fetchForecast(lat: number, lon: number): Promise<WeatherDay[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Forecast request failed: ${res.status}`)

  const data = (await res.json()) as OpenMeteoForecastResponse
  const { time, weathercode, temperature_2m_max, temperature_2m_min } =
    data.daily

  return time.slice(0, 3).map((dateStr, i) => {
    const concept = mapWeatherCode(weathercode[i] ?? 0)
    const label =
      i === 0
        ? 'Today'
        : i === 1
          ? 'Tomorrow'
          : new Date(dateStr).toLocaleDateString('en-US', {
              weekday: 'short',
            })

    return {
      label,
      icon: getWeatherIconAsset(concept),
      high: Math.round(temperature_2m_max[i] ?? 0),
      low: Math.round(temperature_2m_min[i] ?? 0),
      description: getWeatherDescription(concept),
    }
  })
}

/**
 * Cached ~1h per lat/lon. Weather barely moves hour to hour, so there's no
 * reason to re-hit Open-Meteo (a non-co-located third party) on every dashboard
 * load — this keeps it off the request's critical path. `unstable_cache` caches
 * across requests even though the dashboard is force-dynamic.
 */
export const getForecast = unstable_cache(
  fetchForecast,
  ['open-meteo-forecast'],
  {
    revalidate: 3600,
  }
)
