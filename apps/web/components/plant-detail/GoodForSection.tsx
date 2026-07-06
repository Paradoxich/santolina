import { formatGoodFor } from '@/lib/format-plant'
import { DrawerSection } from './DrawerSection'

interface GoodForSectionProps {
  tags: string[] | null
}

export function GoodForSection({ tags }: GoodForSectionProps) {
  const sentence = formatGoodFor(tags)
  if (!sentence) return null
  return (
    <DrawerSection label="Good for">
      <p className="w-full text-[length:var(--font-size-body)] leading-[1.5] text-[var(--text-body-primary)]">
        {sentence}
      </p>
    </DrawerSection>
  )
}
