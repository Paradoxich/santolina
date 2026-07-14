import { formatGoodFor } from '@/lib/format-plant'
import { DrawerSection } from '@paradoxui/ui'

interface GoodForSectionProps {
  tags: string[] | null
}

export function GoodForSection({ tags }: GoodForSectionProps) {
  const sentence = formatGoodFor(tags)
  if (!sentence) return null
  return (
    <DrawerSection label="Good for">
      <p className="w-full text-body leading-normal text-primary">{sentence}</p>
    </DrawerSection>
  )
}
