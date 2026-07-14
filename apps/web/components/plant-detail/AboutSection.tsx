import { DrawerSection } from '@paradoxui/ui'

interface AboutSectionProps {
  description: string | null
}

export function AboutSection({ description }: AboutSectionProps) {
  if (!description) return null
  return (
    <DrawerSection label="About">
      <p className="w-full text-body leading-normal text-primary">
        {description}
      </p>
    </DrawerSection>
  )
}
