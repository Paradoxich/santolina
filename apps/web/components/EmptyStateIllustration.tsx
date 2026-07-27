import Image from 'next/image'

/**
 * Ana's dithered botanical engravings for the page-level empty states
 * (Growing, Planned, Reflections). Each asset is a full tile canvas
 * (726x557, 2x) with the art bottom-anchored inside it, so it fills the kit
 * EmptyState's tile — which supplies the surface-subtle background and
 * rounded clipping. Decorative (empty alt); `unoptimized` so the dither
 * doesn't moire under Next's image pipeline. See
 * project_empty_state_illustrations memory.
 */
const illustrations = {
  growing: '/illustrations/illustration-growing.png',
  planned: '/illustrations/illustration-planned-2.png',
  reflections: '/illustrations/illustration-reflections.png',
} as const

export type EmptyStateIllustrationName = keyof typeof illustrations

export function EmptyStateIllustration({
  name,
}: {
  name: EmptyStateIllustrationName
}) {
  return (
    <Image
      src={illustrations[name]}
      alt=""
      aria-hidden="true"
      fill
      sizes="363px"
      unoptimized
      draggable={false}
      className="select-none object-cover"
    />
  )
}

export default EmptyStateIllustration
