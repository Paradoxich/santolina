import { ChecklistItem } from '@paradoxui/ui'
import type { GoodForBullet } from '@/lib/good-for-your-garden'
import { DrawerSection } from '@paradoxui/ui'

interface GoodForYourGardenSectionProps {
  bullets: GoodForBullet[]
}

export function GoodForYourGardenSection({
  bullets,
}: GoodForYourGardenSectionProps) {
  if (bullets.length === 0) return null
  return (
    <DrawerSection label="Good for your garden">
      <ul role="list" className="flex w-full flex-col">
        {bullets.map((bullet) => (
          <ChecklistItem key={bullet.text} tone={bullet.tone}>
            {bullet.text}
          </ChecklistItem>
        ))}
      </ul>
    </DrawerSection>
  )
}
