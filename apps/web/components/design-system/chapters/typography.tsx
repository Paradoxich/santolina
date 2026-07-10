import { CssVar } from '../TokenRef'
import { Section, type Chapter } from '../chapter-helpers'

function TypeRow({
  role,
  className,
  sample,
}: {
  role: string
  className: string
  sample: string
}) {
  return (
    <div className="flex items-baseline gap-row-gap border-b border-divider py-item-gap">
      <span className="w-[140px] shrink-0 text-label text-muted">
        {role} · <CssVar name={`--font-size-${role.replace('text-', '')}`} />
      </span>
      <span className={`min-w-0 flex-1 truncate text-primary ${className}`}>
        {sample}
      </span>
    </div>
  )
}

function TypographyRoles() {
  return (
    <Section
      title="Typography roles"
      intro="Composite text styles from the preset — size, line height and tracking travel together."
    >
      <div className="rounded-sm border border-card bg-surface-card px-row-gap">
        <TypeRow
          role="title"
          className="text-title font-semibold"
          sample="Page title"
        />
        <TypeRow
          role="stat"
          className="text-stat font-semibold"
          sample="24 plants"
        />
        <TypeRow
          role="subheading"
          className="text-subheading font-semibold"
          sample="Subheading"
        />
        <TypeRow
          role="heading"
          className="text-heading font-semibold"
          sample="Card and drawer titles"
        />
        <TypeRow
          role="section"
          className="text-section font-medium"
          sample="Section title"
        />
        <TypeRow
          role="body"
          className="text-body"
          sample="Body copy for descriptions and content."
        />
        <TypeRow
          role="body-small"
          className="text-body-small"
          sample="Small body copy with compact leading and tracking."
        />
        <TypeRow
          role="label"
          className="text-label"
          sample="LABELS, CAPTIONS, TIMESTAMPS"
        />
        <TypeRow
          role="micro"
          className="text-micro"
          sample="micro annotations"
        />
      </div>
    </Section>
  )
}

export const typographyChapter: Chapter = {
  slug: 'typography',
  label: 'Typography',
  sections: [{ slug: 'roles', label: 'Roles', content: <TypographyRoles /> }],
}
