import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * The dithered botanical engravings for the dashboard empty states, plus the
 * permanent hummingbird on the Garden impact card. Each asset is a full-card
 * canvas exported at 2x with the art baked into the bottom-right corner, so it
 * renders at half its intrinsic size, pinned to the corner, and is clipped by
 * the card's own edges (the parent Panel needs `relative isolate overflow-hidden`).
 * Anchoring to the corner keeps the art fixed as the card flexes — no visible
 * cut edge, since every crop lands flush against a card edge. Decorative only
 * (empty alt); marked `unoptimized` so the dither doesn't moire under Next's
 * image pipeline. See project_empty_state_illustrations memory for the export
 * rules.
 */
const illustrations = {
  myPlants: {
    src: '/illustrations/illustration-my-plants.png',
    width: 1184,
    height: 552,
  },
  bloom: {
    src: '/illustrations/illustration-season.png',
    width: 840,
    height: 552,
  },
  planned: {
    src: '/illustrations/illustration-planned.png',
    width: 660,
    height: 468,
  },
  activity: {
    src: '/illustrations/illustration-diary.png',
    width: 660,
    height: 468,
  },
  insight: {
    src: '/illustrations/illustration-garden-insight.png',
    width: 660,
    height: 468,
  },
} as const

export type CardIllustrationName = keyof typeof illustrations

interface CardIllustrationProps {
  name: CardIllustrationName
  className?: string
}

export function CardIllustration({ name, className }: CardIllustrationProps) {
  const { src, width, height } = illustrations[name]
  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={width / 2}
      height={height / 2}
      unoptimized
      draggable={false}
      className={cn(
        'pointer-events-none absolute bottom-0 right-0 -z-10 max-w-none select-none',
        className
      )}
    />
  )
}

export default CardIllustration
