import type { WeatherIcon } from '@/types/dashboard'

/**
 * The 7 semantic weather concepts Open-Meteo's weathercodes collapse into.
 * Keyed only on the code — day/night variants are a future item, not part
 * of this pass.
 */
export type WeatherIconType =
  | 'sunny'
  | 'partly-cloudy'
  | 'cloudy'
  | 'foggy'
  | 'rain'
  | 'snow'
  | 'thunderstorm'

const FOG_CODES = new Set([45, 48])
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82])
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])
const THUNDERSTORM_CODES = new Set([95, 96, 99])

export function mapWeatherCode(code: number): WeatherIconType {
  if (code === 0 || code === 1) return 'sunny'
  if (code === 2) return 'partly-cloudy'
  if (code === 3) return 'cloudy'
  if (FOG_CODES.has(code)) return 'foggy'
  if (RAIN_CODES.has(code)) return 'rain'
  if (SNOW_CODES.has(code)) return 'snow'
  if (THUNDERSTORM_CODES.has(code)) return 'thunderstorm'
  return 'cloudy'
}

export function getWeatherIconAsset(concept: WeatherIconType): WeatherIcon {
  return concept
}

const DESCRIPTIONS: Record<WeatherIconType, string> = {
  sunny: 'Clear skies.',
  'partly-cloudy': 'Partly cloudy.',
  cloudy: 'Overcast skies.',
  foggy: 'Foggy conditions.',
  rain: 'Rain expected.',
  snow: 'Snow expected.',
  thunderstorm: 'Thunderstorms expected.',
}

export function getWeatherDescription(concept: WeatherIconType): string {
  return DESCRIPTIONS[concept]
}
