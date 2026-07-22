// Pure logic for the Dashboard's bloom timeline card. Client-safe.
//
// Derives the card's season window, spans, and geometry from the real
// palette. The chart shows a 5-month window centered on the current
// month; each growing plant contributes one span per contiguous run of
// bloom months inside that window (a split bloom season yields two).
import type { PalettePlant } from '@/server/palette-actions'
import type { BloomSeason, BloomSpan } from '@/types/dashboard'
import { monthName } from './format-plant'
import { heroImageUrl } from './plant-image'

/** Visible height of the chart's scroll viewport, in px. */
const CHART_HEIGHT = 147
/** Vertical padding so spans don't clip at the chart edges. */
const Y_PAD = 12
/**
 * Rows that fit in the viewport before the chart scrolls. Sets the row
 * pitch: up to this many spans spread to fill the height; beyond it, rows
 * keep the same pitch and the extra ones overflow into a vertical scroll.
 */
const VISIBLE_ROWS = 5

const WINDOW_SIZE = 5
/** Index of the current month within the window — the emphasized center line. */
const CENTER = Math.floor(WINDOW_SIZE / 2)
/** % of chart width from one month gridline to the next. */
const MONTH_STEP = 100 / (WINDOW_SIZE - 1)

/** Muted chart colors keyed by the curated bloom_color English names. */
const BLOOM_COLOR_HEX: Record<string, string> = {
  purple: '#a38eb8',
  violet: '#a38eb8',
  lavender: '#b3a3c8',
  blue: '#9aa4c4',
  pink: '#c9a6b8',
  magenta: '#c9a6b8',
  red: '#c48a8a',
  orange: '#d6a987',
  apricot: '#d6a987',
  yellow: '#d1c187',
  gold: '#d1c187',
  white: '#c8c2a4',
  cream: '#c8c2a4',
  green: '#a8b0a4',
}
const FALLBACK_COLORS = ['#a38eb8', '#d6a987', '#9aa4c4', '#c8c2a4', '#a8b0a4']
const PAST_COLOR = '#afafaf'

const THUMB_SIZE: Record<BloomSpan['emphasis'], number> = {
  now: 24,
  upcoming: 16,
  past: 12,
}

/** Row order, top to bottom — blooming now first, spent blooms last. */
const EMPHASIS_RANK: Record<BloomSpan['emphasis'], number> = {
  now: 0,
  upcoming: 1,
  past: 2,
}

function normalizeMonth(month: number): number {
  return ((month - 1 + 12) % 12) + 1
}

function seasonTitle(month: number): string {
  if (month >= 3 && month <= 5) return 'Spring'
  if (month >= 6 && month <= 8) return 'Summer'
  if (month >= 9 && month <= 11) return 'Autumn'
  return 'Winter'
}

function isoWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  )
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

interface SpanDraft extends Omit<BloomSpan, 'y'> {
  /** Window index the run starts at — used to sort before laying out rows. */
  startIndex: number
}

export function deriveBloomSeason(
  palette: PalettePlant[],
  today: Date = new Date()
): BloomSeason {
  const currentMonth = today.getMonth() + 1
  const windowMonths = Array.from({ length: WINDOW_SIZE }, (_, i) =>
    normalizeMonth(currentMonth - CENTER + i)
  )

  const growing = palette.filter((p) => p.status === 'planted')
  const bloomingNow = growing.filter((p) =>
    p.plant.bloom_months?.includes(currentMonth)
  ).length

  const drafts: SpanDraft[] = []
  for (const [plantIndex, row] of growing.entries()) {
    const { plant } = row
    const imageUrl = heroImageUrl(plant)
    const bloomSet = new Set(plant.bloom_months ?? [])
    if (!imageUrl || bloomSet.size === 0) continue

    const inBloom = windowMonths.map((m) => bloomSet.has(m))

    // Each contiguous run of in-bloom window months becomes one span.
    let runStart: number | null = null
    for (let i = 0; i <= WINDOW_SIZE; i++) {
      if (i < WINDOW_SIZE && inBloom[i]) {
        runStart = runStart ?? i
        continue
      }
      if (runStart === null) continue
      const runEnd = i - 1

      const x = Math.max(0, runStart * MONTH_STEP - MONTH_STEP / 2)
      const right = Math.min(100, runEnd * MONTH_STEP + MONTH_STEP / 2)
      // A run covering the current month is 'now'; one entirely before it is
      // 'past' (spent); one entirely after is 'upcoming'.
      const emphasis: BloomSpan['emphasis'] =
        runStart <= CENTER && runEnd >= CENTER
          ? 'now'
          : runEnd < CENTER
            ? 'past'
            : 'upcoming'

      drafts.push({
        id: `${row.id}-${runStart}`,
        plantName: plant.common_name,
        color:
          emphasis === 'past'
            ? PAST_COLOR
            : (BLOOM_COLOR_HEX[plant.bloom_color?.[0] ?? ''] ??
              FALLBACK_COLORS[plantIndex % FALLBACK_COLORS.length]!),
        x,
        width: right - x,
        thumbAt:
          emphasis === 'now'
            ? x + (right - x) / 2
            : emphasis === 'upcoming'
              ? Math.min(x + 3, 97)
              : Math.max(right - 3, 3),
        thumbSize: THUMB_SIZE[emphasis],
        emphasis,
        imageUrl,
        startIndex: runStart,
      })
      runStart = null
    }
  }

  // Order rows top to bottom by relevance — blooming now first, then
  // upcoming, then spent — so the current blooms sit at the top of the
  // viewport and anything past falls below the fold, reachable by scrolling.
  const kept = [...drafts].sort(
    (a, b) =>
      EMPHASIS_RANK[a.emphasis] - EMPHASIS_RANK[b.emphasis] ||
      a.startIndex - b.startIndex ||
      a.x - b.x
  )

  // Up to VISIBLE_ROWS spans spread to fill the viewport; beyond that, rows
  // keep that same pitch so the extras overflow into the scroll rather than
  // squeezing everything tighter. `contentHeight` is how tall the scrolling
  // inner area must be to hold every row.
  const usable = CHART_HEIGHT - 2 * Y_PAD
  const rowPitch = usable / (VISIBLE_ROWS - 1)
  const rowY = (i: number): number => {
    if (kept.length === 1) return Math.round(CHART_HEIGHT / 2)
    if (kept.length <= VISIBLE_ROWS) {
      return Math.round(Y_PAD + (i * usable) / (kept.length - 1))
    }
    return Math.round(Y_PAD + i * rowPitch)
  }
  const spans: BloomSpan[] = kept.map(({ startIndex: _, ...span }, i) => ({
    ...span,
    y: rowY(i),
  }))
  const contentHeight =
    kept.length <= VISIBLE_ROWS
      ? CHART_HEIGHT
      : Math.round(2 * Y_PAD + (kept.length - 1) * rowPitch)

  return {
    title: seasonTitle(currentMonth),
    meta: `Week ${isoWeek(today)} · ${bloomingNow} blooming now`,
    weekLabel: `Week ${isoWeek(today)}`,
    months: windowMonths.map((m, i) =>
      i === CENTER ? monthName(m).slice(0, 3) : monthName(m).slice(0, 1)
    ),
    currentMonth: CENTER,
    contentHeight,
    spans,
  }
}
