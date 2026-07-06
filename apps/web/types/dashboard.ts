export interface DashboardPlant {
  name: string
  imageUrl: string
}

/**
 * One horizontal span on the seasonal bloom chart. Positions are
 * percentages of the chart width; `y` is the px offset of the span's
 * vertical center inside the chart area.
 */
export interface BloomSpan {
  id: string
  plantName: string
  /** Decorative bloom color for this plant — data, like an image URL. */
  color: string
  /** Left edge of the bar, % of chart width */
  x: number
  /** Bar width, % of chart width */
  width: number
  /** Vertical center of the span, px from chart top */
  y: number
  /** Center of the plant thumbnail along the chart, % of chart width */
  thumbAt: number
  /** Thumbnail diameter in px */
  thumbSize: number
  /** Blooming now (full), upcoming (dimmed), or past (faint) */
  emphasis: 'now' | 'upcoming' | 'past'
  imageUrl: string
}

export interface BloomSeason {
  title: string
  meta: string
  /** Axis labels, one per track line */
  months: string[]
  /** Index into `months` of the current month */
  currentMonth: number
  spans: BloomSpan[]
}

export type WeatherIcon = 'cloudy' | 'rain' | 'sunny'

export interface WeatherDay {
  label: string
  icon: WeatherIcon
  high: number
  low: number
  description: string
}

export interface CareTip {
  id: string
  text: string
  due: string
}

export interface PlannedPlant {
  name: string
  imageUrl: string
  /** Bloom window, e.g. "Apr–May" */
  months: string
}
