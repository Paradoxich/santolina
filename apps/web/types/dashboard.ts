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
  /** Week label alone (no bloom count), for the empty state's header meta */
  weekLabel: string
  /** Axis labels, one per track line */
  months: string[]
  /** Index into `months` of the current month */
  currentMonth: number
  /** Height in px of the scrollable chart content — >= the viewport height */
  contentHeight: number
  spans: BloomSpan[]
}

export type WeatherIcon =
  | 'sunny'
  | 'partly-cloudy'
  | 'cloudy'
  | 'foggy'
  | 'rain'
  | 'snow'
  | 'thunderstorm'

export interface WeatherDay {
  label: string
  icon: WeatherIcon
  high: number
  low: number
  description: string
}

export interface CareTip {
  plantId: string | null
  plantName: string | null
  text: string
  /**
   * When this tip is relevant, e.g. "this week" — carried by time-bound and
   * event-relative tips (the Figma timeframe ruling). Null for evergreen
   * guidance tips, which have no deadline.
   */
  timeframe?: string | null
  /**
   * The typed diary event the tip's "did it" shortcut writes (e.g. "watered",
   * "fertilized"). Present on actionable event-relative tips; null/absent on
   * evergreen guidance, which has no "did it" action.
   */
  eventType?: import('@/lib/diary-events').DiaryEventType | null
}

export interface PlannedPlant {
  name: string
  imageUrl: string
  /** Bloom window, e.g. "Apr–May" */
  months: string
}
