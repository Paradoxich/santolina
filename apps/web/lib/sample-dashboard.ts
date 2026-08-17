import { CHART_COLORS } from '@/lib/chart-colors'

/**
 * Decorative bullet colors for recent activity rows, cycled by index.
 *
 * These are DECORATION, not data — they carry no meaning and the row they
 * land on is whatever the index says. The old header called them "data",
 * which is what kept three hand-typed hexes here: the first was byte-identical
 * to CHART_COLORS.blue, and the other two had drifted a step off pink and
 * sand. A copy does not announce when it stops matching, so they now come
 * from the one home the chart palette already provides.
 *
 * Two of the three shift very slightly as a result (c9b6c2 -> c9a6b8,
 * c4b6a4 -> c8c2a4). That is the drift being undone, not a design change.
 */
export const activityDotColors = [
  CHART_COLORS.blue,
  CHART_COLORS.pink,
  CHART_COLORS.sand,
]
