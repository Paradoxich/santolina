// Shared building blocks for the design-system chapter pages.

export interface ChapterSection {
  slug: string
  label: string
  content: React.ReactNode
}

export interface Chapter {
  slug: string
  label: string
  sections: ChapterSection[]
}

export function Section({
  title,
  intro,
  children,
}: {
  title: string
  /** Every section is titled + described — a bare heading reads unfinished
   * in a docs page, so this is required rather than an easy-to-skip prop. */
  intro: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-section-break">
      <div className="flex flex-col gap-item-gap">
        <h2 className="text-title font-semibold tracking-heading text-primary">
          {title}
        </h2>
        <p className="max-w-[640px] text-body text-body-secondary">{intro}</p>
      </div>
      {children}
    </section>
  )
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-label uppercase tracking-[0.05em] text-muted">
      {children}
    </p>
  )
}
