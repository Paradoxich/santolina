import { EmptyState } from '@paradoxui/ui'
import { EmptyStateIllustration } from '@/components/EmptyStateIllustration'

/**
 * A whole-page empty state, so it centres in the viewport rather than sitting
 * at the top left of a page that has nothing else in it. The other empty
 * states in the app are the opposite case — a gap inside a populated shell,
 * under a header and tabs that are still doing their job — and those stay
 * where their content would have been.
 *
 * Vertical centring is md+ only: the mobile shell reserves room for the tab
 * bar with a bottom padding on <main>, so a full-height child there would push
 * past it into a scroll. --app-chrome-top is the demo banner's height, unset
 * for a real session, which is why it falls back to 0.
 */
export default function ReflectionsPage() {
  return (
    <div className="flex flex-col items-center pb-16 pt-8 text-center md:min-h-[calc(100vh-var(--app-chrome-top,0px))] md:justify-center md:pb-0 md:pt-0">
      <header className="flex max-w-[52ch] flex-col gap-item-gap">
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
