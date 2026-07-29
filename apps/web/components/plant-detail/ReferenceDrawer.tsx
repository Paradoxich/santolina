'use client'

/**
 * The species reference — water, light, soil, pruning, the full year, the
 * botanical details — in a drawer.
 *
 * It became a drawer when its entry point moved into the bottom card row:
 * expanding eight sections inside a third-width card would set two StatCards
 * side by side in ~360px and stretch the row to several screens. The Diary
 * card already reaches its full content this way, so the two behave alike.
 */

import { motion } from 'framer-motion'
import { Drawer, Icon } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { DRAWER_MOTION } from '@/lib/drawer-motion'
import { AboutSection } from './AboutSection'
import { GoodForYourGardenSection } from './GoodForYourGardenSection'
import { CareSection } from './CareSection'
import { SeasonalRhythmSection } from './SeasonalRhythmSection'
import { InYourGardenSection } from './InYourGardenSection'
import { WorksWellWithSection } from './WorksWellWithSection'
import { GoodForSection } from './GoodForSection'
import { DetailsSection } from './DetailsSection'
import type { GoodForBullet } from '@/lib/good-for-your-garden'
import type { CompanionPlant } from '@/lib/plant-detail'
import type { DbPlant } from '@/lib/plants-db'

interface ReferenceDrawerProps {
  plant: DbPlant
  companions: CompanionPlant[]
  /** Pre-built "good for your garden" bullets from the page. */
  bullets: GoodForBullet[]
  onClose: () => void
}

export function ReferenceDrawer({
  plant,
  companions,
  bullets,
  onClose,
}: ReferenceDrawerProps) {
  return (
    <Drawer
      label={`${plant.common_name} care reference`}
      onClose={onClose}
      closeLabel="Close care reference"
      closeIcon={<Icon src={icons.close} />}
      panelComponent={motion.aside}
      panelProps={DRAWER_MOTION}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col gap-section-break overflow-y-auto p-card-padding">
        <AboutSection description={plant.description} />
        <GoodForYourGardenSection bullets={bullets} />
        <CareSection plant={plant} />
        <SeasonalRhythmSection rhythm={plant.seasonal_rhythm} />
        <InYourGardenSection plant={plant} />
        <WorksWellWithSection companions={companions} />
        <GoodForSection tags={plant.garden_use_tags} />
        <DetailsSection plant={plant} />
      </div>
    </Drawer>
  )
}

export default ReferenceDrawer
