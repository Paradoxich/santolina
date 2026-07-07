import Image from 'next/image'
import { StatCard } from '@paradoxui/ui'
import type { DbPlant } from '@/lib/plants-db'
import { formatBloomRange } from '@/lib/format-plant'
import { DrawerSection } from './DrawerSection'

interface InYourGardenSectionProps {
  plant: DbPlant
}

function icon(src: string) {
  return <Image src={src} alt="" width={16} height={16} />
}

export function InYourGardenSection({ plant }: InYourGardenSectionProps) {
  const bloom = formatBloomRange(plant.bloom_months)
  if (!bloom && !plant.best_placement && !plant.environment_benefits)
    return null

  return (
    <DrawerSection label="In your garden">
      <div className="flex w-full flex-col gap-inline-gap">
        {(bloom || plant.best_placement) && (
          <div className="grid w-full grid-cols-2 gap-inline-gap">
            {bloom && (
              <StatCard
                tone="soft"
                label="Expected Bloom"
                icon={icon('/icons/icon-bloom.svg')}
              >
                {bloom}
              </StatCard>
            )}
            {plant.best_placement && (
              <StatCard
                tone="soft"
                label="Best Placement"
                icon={icon('/icons/icon-placement.svg')}
                className={bloom ? '' : 'col-span-2'}
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
            icon={icon('/icons/icon-benefits.svg')}
          >
            {plant.environment_benefits}
          </StatCard>
        )}
      </div>
    </DrawerSection>
  )
}
