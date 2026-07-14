import { Panel } from '@paradoxui/ui'
import { CardIllustration } from './CardIllustration'

interface ImpactCardProps {
  text: string
}

export function ImpactCard({ text }: ImpactCardProps) {
  return (
    <Panel className="relative isolate min-h-[380px] justify-between overflow-hidden lg:min-h-0 lg:h-full">
      <CardIllustration name="insight" />
      {/* Keep the copy clear of the bottom-right hummingbird: on mobile the
          card is tall enough to seat the bird below the text, and the text
          stays in the left ~two-thirds so it never runs under the wing. */}
      <p className="max-w-[66%] text-subheading font-medium leading-tight tracking-heading text-primary lg:max-w-none">
        {text}
      </p>
      <span className="text-label font-medium uppercase tracking-label text-muted">
        Garden impact
      </span>
    </Panel>
  )
}

export default ImpactCard
