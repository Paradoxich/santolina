import { Badge } from '@paradoxui/ui'
import type { DisplayBloomStatus } from '@/lib/bloom-status'

// Matches the status filter menu labels exactly.
export const bloomStatusLabels: Record<DisplayBloomStatus, string> = {
  blooming: 'Blooming',
  'pre-bloom': 'Pre-bloom',
  resting: 'Resting',
  evergreen: 'Evergreen',
}

// Compact per-status tint: a light hue fill with same-hue readable text. The
// colour → status mapping is domain knowledge, so it lives here in the app
// layer; the generic Badge primitive stays status-agnostic. Each pairing is a
// vetted surface/text step (≥4.5:1). Resting is the quiet neutral default.
const bloomStatusColors: Record<DisplayBloomStatus, string> = {
  blooming: 'bg-brick-100 text-brick-700',
  'pre-bloom': 'bg-honey-100 text-honey-700',
  resting: 'bg-sage-300 text-sage-800',
  evergreen: 'bg-fern-100 text-fern-700',
}

interface BloomStatusBadgeProps {
  status: DisplayBloomStatus
  className?: string
}

/**
 * The plant's bloom status as a compact, squared-off chip (not the Badge
 * pill default). Used as the GardenPlantTile title adornment.
 */
export function BloomStatusBadge({ status, className }: BloomStatusBadgeProps) {
  return (
    <Badge
      className={`shrink-0 rounded-sm border-transparent ${bloomStatusColors[status]} ${className ?? ''}`}
    >
      {bloomStatusLabels[status]}
    </Badge>
  )
}

export default BloomStatusBadge
