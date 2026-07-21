import { EmptyState } from '@paradoxui/ui'
import { EmptyStateIllustration } from '@/components/EmptyStateIllustration'

export default function ReflectionsPage() {
  return (
    <div className="max-w-[669px] pb-16 pt-8 md:pt-12">
      <header className="flex flex-col gap-item-gap">
        <h1 className="text-title font-semibold text-primary">
          Garden Reflections
        </h1>
        <p className="text-body text-secondary">
          Look back on how your garden has grown, season by season.
        </p>
      </header>

      <EmptyState
        className="mt-11"
        illustration={<EmptyStateIllustration name="reflections" />}
        message="Reflections are on their way."
      />
    </div>
  )
}
