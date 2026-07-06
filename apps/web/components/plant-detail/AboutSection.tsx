import { DrawerSection } from './DrawerSection'

interface AboutSectionProps {
  description: string | null
}

export function AboutSection({ description }: AboutSectionProps) {
  if (!description) return null
  return (
    <DrawerSection label="About">
      <p className="w-full text-[length:var(--font-size-body)] leading-[1.5] text-[var(--text-body-primary)]">
        {description}
      </p>
    </DrawerSection>
  )
}
