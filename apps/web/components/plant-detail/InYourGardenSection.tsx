import { Icon, StatCard } from '@paradoxui/ui'
import type { DbPlant } from '@/lib/plants-db'
import { formatBloomRange } from '@/lib/format-plant'
import { icons } from '@/lib/icons'
import { DrawerSection } from '@paradoxui/ui'

interface InYourGardenSectionProps {
  plant: DbPlant
}

export function InYourGardenSection({ plant }: InYourGardenSectionProps) {
  const bloom = formatBloomRange(plant.bloom_months)
  if (!bloom && !plant.best_placement && !plant.environment_benefits)
    return null

  return (
    <DrawerSection label="In your garden">
      <div className="flex w-full flex-col gap-inline-gap">
        {(bloom || plant.best_placement) && (
          <div className="grid w-full grid-cols-1 gap-inline-gap sm:grid-cols-2">
            {bloom && (
              <StatCard
                label="Expected Bloom"
                icon={<Icon src={icons.bloom} />}
              >
                {bloom}
              </StatCard>
            )}
            {plant.best_placement && (
              <StatCard
                label="Best Placement"
                icon={<Icon src={icons.placement} />}
                className={bloom ? '' : 'sm:col-span-2'}
              >
                {plant.best_placement}
              </StatCard>
            )}
          </div>
        )}
        {plant.environment_benefits && (
          <StatCard
            tone="positive"
            label="Environment benefits"
            icon={<Icon src={icons.benefits} />}
          >
            {plant.environment_benefits}
          </StatCard>
        )}
      </div>
    </DrawerSection>
  )
}
