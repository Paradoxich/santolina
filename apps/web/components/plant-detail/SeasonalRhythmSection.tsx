import { SeasonalStageRow } from '@paradoxui/ui'
import type { SeasonalRhythm } from '@/lib/plants-db'
import { DrawerSection } from './DrawerSection'

interface SeasonalRhythmSectionProps {
  rhythm: SeasonalRhythm | null
}

const STAGES: { key: keyof SeasonalRhythm; label: string }[] = [
  { key: 'early_spring', label: 'Early spring' },
  { key: 'late_spring', label: 'Late spring' },
  { key: 'summer', label: 'Summer' },
  { key: 'late_summer', label: 'Late summer' },
  { key: 'autumn', label: 'Autumn' },
  { key: 'winter', label: 'Winter' },
]

export function SeasonalRhythmSection({ rhythm }: SeasonalRhythmSectionProps) {
  if (!rhythm) return null
  const stages = STAGES.filter((s) => rhythm[s.key])
  if (stages.length === 0) return null

  return (
    <DrawerSection label="Seasonal rhythm">
      <div className="flex w-full flex-col">
        {stages.map((stage) => (
          <SeasonalStageRow key={stage.key} stage={stage.label}>
            {rhythm[stage.key]}
          </SeasonalStageRow>
        ))}
      </div>
    </DrawerSection>
  )
}
