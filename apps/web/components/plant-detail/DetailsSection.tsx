import { DetailRow } from '@paradoxui/ui'
import type { DbPlant } from '@/lib/plants-db'
import {
  formatCmRange,
  formatExposure,
  formatPlantType,
  formatWaterNeedsSummary,
} from '@/lib/format-plant'
import { DrawerSection } from '@paradoxui/ui'

interface DetailsSectionProps {
  plant: DbPlant
}

export function DetailsSection({ plant }: DetailsSectionProps) {
  const rows = [
    { label: 'Plant type', value: formatPlantType(plant) },
    {
      label: 'Height',
      value: formatCmRange(plant.height_min_cm, plant.height_max_cm),
    },
    {
      label: 'Spread',
      value: formatCmRange(plant.spread_min_cm, plant.spread_max_cm),
    },
    { label: 'Exposure', value: formatExposure(plant.sun_requirements) },
    { label: 'Water needs', value: formatWaterNeedsSummary(plant) },
    { label: 'Native to', value: plant.native_to },
    { label: 'Family', value: plant.family },
  ].filter((row) => row.value)

  if (rows.length === 0) return null

  return (
    <DrawerSection label="Details">
      <div className="flex w-full flex-col">
        {rows.map((row) => (
          <DetailRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </DrawerSection>
  )
}
