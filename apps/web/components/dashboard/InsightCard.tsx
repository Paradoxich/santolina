import { Panel } from '@paradoxui/ui'

interface InsightCardProps {
  text: string
}

export function InsightCard({ text }: InsightCardProps) {
  return (
    <Panel className="h-full justify-between">
      <p className="text-[length:var(--font-size-20)] font-medium leading-[1.2] tracking-[-0.02em] text-[var(--text-insight-text)]">
        {text}
      </p>
      <span className="text-[length:var(--font-size-label)] font-medium uppercase tracking-[0.05em] text-[var(--text-section-label)]">
        Garden insight
      </span>
    </Panel>
  )
}

export default InsightCard
