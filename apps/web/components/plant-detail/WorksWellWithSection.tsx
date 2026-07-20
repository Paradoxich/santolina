import { Thumbnail } from '@paradoxui/ui'
import type { CompanionPlant } from '@/lib/plant-detail'
import { DrawerSection } from '@paradoxui/ui'

interface WorksWellWithSectionProps {
  companions: CompanionPlant[]
}

export function WorksWellWithSection({
  companions,
}: WorksWellWithSectionProps) {
  if (companions.length === 0) return null
  return (
    <DrawerSection label="Works well with">
      <div className="flex h-[105px] w-full items-center gap-tight-gap">
        {companions.slice(0, 5).map((companion) => (
          <Thumbnail
            key={companion.id}
            src={companion.image_url}
            label={companion.common_name}
          />
        ))}
      </div>
    </DrawerSection>
  )
}
