'use client'

/**
 * The plant's full story, in a drawer: every note, its photos and events, and
 * the composer to add another.
 *
 * It is a drawer for the same reason Plant care is one. The card grid wants a
 * Diary card that says how much is there and shows the last few lines; the
 * full list is a different job, and putting both on the page meant two
 * surfaces doing one thing, with the read-and-write one stranded at the
 * bottom outside the card system.
 */

import { motion } from 'framer-motion'
import { Drawer, Icon } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { DRAWER_MOTION } from '@/lib/drawer-motion'
import { StorySection } from './StorySection'
import { StoryComposer } from './StoryComposer'
import type { DiaryNote } from '@/types/diary'

interface DiaryDrawerProps {
  plantId: string
  plantName: string
  notes: DiaryNote[]
  paletteId: string | null
  isGrowing: boolean
  onClose: () => void
  onAddedBackToGarden: (result: { paletteId: string }) => void
}

export function DiaryDrawer({
  plantId,
  plantName,
  notes,
  paletteId,
  isGrowing,
  onClose,
  onAddedBackToGarden,
}: DiaryDrawerProps) {
  return (
    <Drawer
      label={`${plantName} diary`}
      onClose={onClose}
      closeLabel="Close diary"
      closeIcon={<Icon src={icons.close} />}
      panelComponent={motion.aside}
      panelProps={DRAWER_MOTION}
    >
      {/* The list scrolls; the composer stays pinned, so adding a note never
          means scrolling past the history to reach the field. */}
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-card-padding pt-card-padding">
        <StorySection
          plantId={plantId}
          plantName={plantName}
          notes={notes}
          isGrowing={isGrowing}
        />
      </div>
      <div className="w-full shrink-0 border-t border-card-translucent p-card-padding">
        <StoryComposer
          plantId={plantId}
          paletteId={paletteId}
          isGrowing={isGrowing}
          onAddedBackToGarden={onAddedBackToGarden}
        />
      </div>
    </Drawer>
  )
}

export default DiaryDrawer
