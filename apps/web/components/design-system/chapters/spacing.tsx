import { CssVar } from '../TokenRef'
import { Section, type Chapter } from '../chapter-helpers'

function SpaceRow({ role }: { role: string }) {
  return (
    <div className="flex items-center gap-row-gap border-b border-divider py-inline-gap">
      <span className="w-[140px] shrink-0 text-label text-muted">
        {role} · <CssVar name={`--space-${role}`} />
      </span>
      <span
        className="h-4 rounded-xs bg-accent-muted"
        style={{ width: `var(--space-${role})` }}
      />
    </div>
  )
}

function SpacingRoles() {
  return (
    <Section
      title="Spacing roles"
      intro="Named gaps used instead of raw Tailwind spacing — from tight-gap between an icon and its label up to section-break between major page blocks."
    >
      <div className="rounded-sm border border-card bg-surface-card px-row-gap">
        <SpaceRow role="tight-gap" />
        <SpaceRow role="inline-gap" />
        <SpaceRow role="item-gap" />
        <SpaceRow role="row-gap" />
        <SpaceRow role="section-gap" />
        <SpaceRow role="card-padding" />
        <SpaceRow role="section-break" />
      </div>
    </Section>
  )
}

function RadiusShadows() {
  return (
    <Section
      title="Radius & shadows"
      intro="Corner rounding and elevation, both scaled consistently across every surface in the kit."
    >
      <div className="flex flex-wrap items-end gap-section-gap">
        {(
          [
            ['xs', 'rounded-xs'],
            ['sm', 'rounded-sm'],
            ['md', 'rounded-md'],
            ['lg', 'rounded-lg'],
            ['xl', 'rounded-xl'],
          ] as const
        ).map(([r, cls]) => (
          <div key={r} className="flex flex-col items-center gap-tight-gap">
            <div
              className={`size-14 border border-card bg-surface-card ${cls}`}
            />
            <span className="text-label text-muted">
              {r} · <CssVar name={`--radius-${r}`} />
            </span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-tight-gap">
          <div className="h-14 w-24 rounded-full border border-card bg-surface-card" />
          <span className="text-label text-muted">full</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-section-gap pt-row-gap sm:grid-cols-4">
        {(
          [
            ['sm', 'shadow-sm'],
            ['md', 'shadow-md'],
            ['lg', 'shadow-lg'],
            ['soft', 'shadow-soft'],
          ] as const
        ).map(([s, cls]) => (
          <div key={s} className="flex flex-col items-center gap-inline-gap">
            <div className={`h-16 w-full rounded-md bg-surface-card ${cls}`} />
            <span className="text-label text-muted">shadow-{s}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

export const spacingChapter: Chapter = {
  slug: 'spacing',
  label: 'Spacing & radius',
  sections: [
    { slug: 'spacing', label: 'Spacing', content: <SpacingRoles /> },
    { slug: 'radius', label: 'Radius & shadows', content: <RadiusShadows /> },
  ],
}
