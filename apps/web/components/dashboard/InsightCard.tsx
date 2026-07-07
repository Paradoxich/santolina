import { Panel } from '@paradoxui/ui'

interface InsightCardProps {
  text: string
}

export function InsightCard({ text }: InsightCardProps) {
  return (
    <Panel className="h-full justify-between">
      <p className="text-subheading font-medium leading-[1.2] tracking-heading text-primary">
        {text}
      </p>
      <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
        Garden insight
      </span>
    </Panel>
  )
}

export default InsightCard
