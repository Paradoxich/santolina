import { Icon, StatCard } from '@paradoxui/ui'
import type { DbPlant } from '@/lib/plants-db'
import { formatLightNeeds } from '@/lib/format-plant'
import { icons, type IconName } from '@/lib/icons'
import { DrawerSection } from '@paradoxui/ui'

interface CareSectionProps {
  plant: DbPlant
}

export function CareSection({ plant }: CareSectionProps) {
  const light = formatLightNeeds(plant)
  const allCards: { label: string; body: string | null; icon: IconName }[] = [
    { label: 'Water', body: plant.water_needs, icon: 'water' },
    { label: 'Light', body: light, icon: 'light' },
    { label: 'Soil', body: plant.soil_needs, icon: 'soil' },
    {
      label: 'Maintenance',
      body: plant.maintenance_notes,
      icon: 'maintenance',
    },
  ]
  const cards = allCards.filter((c) => c.body)

  if (cards.length === 0 && !plant.common_issues) return null

  return (
    <DrawerSection label="Care">
      <div className="grid w-full grid-cols-1 gap-inline-gap sm:grid-cols-2">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            icon={<Icon src={icons[card.icon]} />}
          >
            {card.body}
          </StatCard>
        ))}
        {plant.common_issues && (
          <StatCard
            tone="warning"
            label="Common issues"
            icon={<Icon src={icons.issues} />}
            className="sm:col-span-2"
          >
            {plant.common_issues}
          </StatCard>
        )}
      </div>
    </DrawerSection>
  )
}
