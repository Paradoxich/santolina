import Image from 'next/image'
import { StatCard } from '@paradoxui/ui'
import type { DbPlant } from '@/lib/plants-db'
import { formatLightNeeds } from '@/lib/format-plant'
import { DrawerSection } from './DrawerSection'

interface CareSectionProps {
  plant: DbPlant
}

function icon(src: string) {
  return <Image src={src} alt="" width={16} height={16} />
}

export function CareSection({ plant }: CareSectionProps) {
  const light = formatLightNeeds(plant)
  const cards = [
    { label: 'Water', body: plant.water_needs, icon: '/icons/icon-water.svg' },
    { label: 'Light', body: light, icon: '/icons/icon-water.svg' },
    { label: 'Soil', body: plant.soil_needs, icon: '/icons/icon-soil.svg' },
    {
      label: 'Maintenance',
      body: plant.maintenance_notes,
      icon: '/icons/icon-maintenance.svg',
    },
  ].filter((c) => c.body)

  if (cards.length === 0 && !plant.common_issues) return null

  return (
    <DrawerSection label="Care">
      <div className="grid w-full grid-cols-1 gap-inline-gap sm:grid-cols-2">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} icon={icon(card.icon)}>
            {card.body}
          </StatCard>
        ))}
        {plant.common_issues && (
          <StatCard
            tone="warning"
            label="Common issues"
            icon={icon('/icons/icon-issues.svg')}
            className="sm:col-span-2"
          >
            {plant.common_issues}
          </StatCard>
        )}
      </div>
    </DrawerSection>
  )
}
