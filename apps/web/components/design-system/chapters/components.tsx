import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ChecklistItem,
  Chip,
  Thumbnail,
  DetailRow,
  EmptyState,
  Icon,
  IconButton,
  Input,
  MediaCard,
  Panel,
  SearchField,
  Spinner,
  StatCard,
  Tabs,
  Toast,
  Tooltip,
} from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { Label, Section, type Chapter } from '../chapter-helpers'

const placeholderImage = <div className="size-full bg-sage-300" aria-hidden />

// ---------------------------------------------------------------------------
// State matrix — documents each control across its real interaction states.
//
// Hover and Focus are frozen previews: the same resolved utility a real
// pointer/keyboard would trigger, applied at rest via className. cn() runs
// tailwind-merge, so the override cleanly replaces the variant's base class.
// The maps below MIRROR the components' own variantStyles — keep them in sync.
// There is no distinct pressed/"active" state by design (hover shifts the
// background; keyboard focus shows a ring), so no such column exists.
// ---------------------------------------------------------------------------

type BtnVariant =
  | 'primary'
  | 'secondary'
  | 'control'
  | 'ghost'
  | 'destructive'
  | 'destructive-ghost'

const BUTTON_VARIANTS: { key: BtnVariant; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'control', label: 'Control' },
  { key: 'ghost', label: 'Ghost' },
  { key: 'destructive', label: 'Destructive' },
  { key: 'destructive-ghost', label: 'Destructive ghost' },
]

// Hover background per variant, mirrored from Button/IconButton variantStyles.
const HOVER_BG: Record<BtnVariant, string> = {
  primary: 'bg-accent-hover',
  secondary: 'bg-surface-positive',
  control: 'bg-surface-hover',
  ghost: 'bg-surface-hover',
  destructive: 'bg-fill-critical-hover',
  'destructive-ghost': 'bg-surface-critical',
}

// Focus ring — critical variants ring critical, everything else rings focus.
const focusRing = (v: BtnVariant) =>
  `ring-2 ring-offset-2 ${v.startsWith('destructive') ? 'ring-critical' : 'ring-focus'}`

const BUTTON_STATES = ['Default', 'Hover', 'Focus', 'Disabled', 'Loading']
const ICON_VARIANTS = BUTTON_VARIANTS.filter((v) => v.key !== 'secondary')
const CHIP_STATES = ['Default', 'Hover', 'Focus']

const SIZES: { key: 'sm' | 'md' | 'lg'; label: string }[] = [
  { key: 'sm', label: 'sm · 32px' },
  { key: 'md', label: 'md · 40px' },
  { key: 'lg', label: 'lg · 48px' },
]

/** A labelled row × column grid, horizontally scrollable on narrow screens. */
function StateMatrix({
  columns,
  rows,
  minWidth = 600,
}: {
  columns: string[]
  rows: { label: string; render: (column: string) => React.ReactNode }[]
  minWidth?: number
}) {
  const template = `minmax(112px, 150px) repeat(${columns.length}, minmax(88px, 1fr))`
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }}>
        <div
          className="grid items-center gap-item-gap border-b border-divider pb-tight-gap"
          style={{ gridTemplateColumns: template }}
        >
          <span />
          {columns.map((c) => (
            <span
              key={c}
              className="text-label uppercase tracking-label text-muted"
            >
              {c}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid items-center gap-item-gap border-b border-divider py-item-gap last:border-b-0"
            style={{ gridTemplateColumns: template }}
          >
            <span className="text-body-small text-secondary">{row.label}</span>
            {columns.map((c) => (
              <div key={c} className="flex">
                {row.render(c)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function buttonCell(variant: BtnVariant, state: string) {
  const label = 'Button'
  switch (state) {
    case 'Hover':
      return (
        <Button variant={variant} className={HOVER_BG[variant]}>
          {label}
        </Button>
      )
    case 'Focus':
      return (
        <Button variant={variant} className={focusRing(variant)}>
          {label}
        </Button>
      )
    case 'Disabled':
      return (
        <Button variant={variant} disabled>
          {label}
        </Button>
      )
    case 'Loading':
      return (
        <Button variant={variant} isLoading>
          {label}
        </Button>
      )
    default:
      return <Button variant={variant}>{label}</Button>
  }
}

type IconBtnVariant = Exclude<BtnVariant, 'secondary'>

function iconButtonCell(variant: IconBtnVariant, state: string) {
  const glyph = <Icon src={icons.plus} />
  const label = `${variant} ${state}`
  switch (state) {
    case 'Hover':
      return (
        <IconButton
          variant={variant}
          className={HOVER_BG[variant]}
          aria-label={label}
        >
          {glyph}
        </IconButton>
      )
    case 'Focus':
      return (
        <IconButton
          variant={variant}
          className={focusRing(variant)}
          aria-label={label}
        >
          {glyph}
        </IconButton>
      )
    case 'Disabled':
      return (
        <IconButton variant={variant} disabled aria-label={label}>
          {glyph}
        </IconButton>
      )
    case 'Loading':
      return (
        <IconButton variant={variant} isLoading aria-label={label}>
          {glyph}
        </IconButton>
      )
    default:
      return (
        <IconButton variant={variant} aria-label={label}>
          {glyph}
        </IconButton>
      )
  }
}

function chipCell(selected: boolean, state: string) {
  const hover = selected ? 'bg-accent-hover' : 'bg-surface-hover'
  const focus = 'outline outline-2 outline-offset-2 outline-focus'
  const className =
    state === 'Hover' ? hover : state === 'Focus' ? focus : undefined
  return (
    <Chip selected={selected} className={className}>
      Chip
    </Chip>
  )
}

function Actions() {
  return (
    <Section
      title="Actions"
      intro="Buttons and chips drive every committed change and filter in the product. Each control is shown across its interaction states — hover and focus are frozen previews of the styles a real pointer or keyboard triggers. There is no separate pressed state by design."
    >
      <div className="flex flex-col gap-section-break">
        <div className="flex flex-col gap-inline-gap">
          <Label>Button — variant × state</Label>
          <StateMatrix
            columns={BUTTON_STATES}
            rows={BUTTON_VARIANTS.map((v) => ({
              label: v.label,
              render: (state) => buttonCell(v.key, state),
            }))}
          />
        </div>

        <div className="flex flex-col gap-inline-gap">
          <Label>
            IconButton — variant × state (shares Button&apos;s vocabulary)
          </Label>
          <StateMatrix
            columns={BUTTON_STATES}
            rows={ICON_VARIANTS.map((v) => ({
              label: v.label,
              render: (state) => iconButtonCell(v.key as IconBtnVariant, state),
            }))}
          />
        </div>

        <div className="flex flex-col gap-inline-gap">
          <Label>Chip — selectable filter pill, resting vs selected</Label>
          <StateMatrix
            columns={CHIP_STATES}
            rows={[
              { label: 'Resting', render: (state) => chipCell(false, state) },
              { label: 'Selected', render: (state) => chipCell(true, state) },
            ]}
          />
        </div>

        <div className="flex flex-col gap-inline-gap">
          <Label>
            Size — Button &amp; IconButton share one 32 / 40 / 48px scale
          </Label>
          <StateMatrix
            minWidth={380}
            columns={['Button', 'IconButton']}
            rows={SIZES.map((s) => ({
              label: s.label,
              render: (column) =>
                column === 'Button' ? (
                  <Button size={s.key}>Button</Button>
                ) : (
                  <IconButton
                    size={s.key}
                    variant="control"
                    aria-label={`${s.key} icon button`}
                  >
                    <Icon src={icons.plus} />
                  </IconButton>
                ),
            }))}
          />
          <p className="text-body-small text-muted">
            Button radius steps 8 → 12 → 12px; IconButton stays 8px at every
            size. Chip is a single fixed size — 32px, matching sm.
          </p>
        </div>
      </div>
    </Section>
  )
}

function Forms() {
  return (
    <Section
      title="Forms"
      intro="Text entry and search — label, helper text, and error states share one visual language."
    >
      <div className="grid max-w-[480px] grid-cols-1 gap-item-gap">
        <Label>Input · SearchField</Label>
        <Input
          label="Garden name"
          placeholder="e.g. Balcony south"
          helperText="Shown on your dashboard."
        />
        <Input
          label="City"
          defaultValue="Opatija"
          errorMessage="We couldn't find this city."
        />
        <SearchField placeholder="Search plants" />
      </div>
    </Section>
  )
}

function Surfaces() {
  return (
    <Section
      title="Surfaces"
      intro="Containers that hold content — cards, panels, and stat tiles, each with its own elevation and padding rhythm."
    >
      <div className="flex flex-col gap-section-break">
        <div className="flex flex-col gap-inline-gap">
          <Label>MediaCard</Label>
          <div className="grid grid-cols-1 gap-item-gap sm:grid-cols-3">
            <MediaCard
              image={placeholderImage}
              imageHeight={140}
              title="Lavender"
              subtitle="Lavandula angustifolia"
              body="Fragrant, drought-tolerant perennial."
            />
            <MediaCard
              image={placeholderImage}
              imageHeight={140}
              title="Lavender"
              titleAdornment={<Badge tone="positive">blooming</Badge>}
              body="❋ Deadhead spent blooms to rebloom."
            />
            <MediaCard
              image={placeholderImage}
              imageHeight={140}
              title="Lavender"
              subtitle="Part shade · Aug–Oct"
              body="Suggested for your conditions."
              border="dashed"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-section-gap sm:grid-cols-2">
          <div className="flex flex-col gap-inline-gap">
            <Label>StatCard</Label>
            <div className="grid grid-cols-1 gap-item-gap sm:grid-cols-2">
              <StatCard label="Neutral" tone="neutral">
                Recessed default card.
              </StatCard>
              <StatCard label="Soft" tone="soft">
                Subtle card surface.
              </StatCard>
              <StatCard label="Common issues" tone="warning">
                Warm background for warnings.
              </StatCard>
              <StatCard label="Environment benefits" tone="positive">
                Green background for benefits.
              </StatCard>
            </div>
          </div>
          <div className="flex flex-col gap-inline-gap">
            <Label>Card</Label>
            <Card>
              <CardHeader>
                <span className="text-heading font-semibold text-primary">
                  Card title
                </span>
              </CardHeader>
              <CardBody>
                <p className="text-body text-body-secondary">
                  Card body content styled with semantic roles.
                </p>
              </CardBody>
              <CardFooter>
                <Button variant="ghost" size="sm">
                  Action
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>

        <Panel title="Panel" meta="with title and meta">
          <p className="text-body text-body-secondary">
            Dashboard panel surface with translucent card border and
            card-dashboard radius.
          </p>
        </Panel>
      </div>
    </Section>
  )
}

function Feedback() {
  return (
    <Section
      title="Feedback"
      intro="Tells the user what just happened, or what's missing — toasts for events, empty states for nothing-here, spinners for in-flight work."
    >
      <div className="flex flex-col gap-section-break">
        <div className="flex flex-col gap-inline-gap">
          <Label>Toast</Label>
          <div className="grid grid-cols-1 gap-item-gap sm:grid-cols-2">
            <Toast tone="neutral" message="Removed from your planned list." />
            <Toast tone="positive" message="Plant added to your palette." />
            <Toast tone="warning" message="Frost expected this week." />
            <Toast tone="critical" message="Could not save your note." />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-section-gap sm:grid-cols-2">
          <div className="flex flex-col gap-inline-gap">
            <Label>EmptyState</Label>
            <div className="rounded-sm border border-card bg-surface-card">
              <EmptyState
                message="Find plants you'd like to grow. They'll show up here."
                ctaLabel="Explore plants"
                ctaHref="#"
              />
            </div>
          </div>
          <div className="flex flex-col gap-inline-gap">
            <Label>Spinner</Label>
            <div className="flex items-center gap-item-gap">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

function Display() {
  return (
    <Section
      title="Display"
      intro="Small pieces of information rendered inline — status, metadata, and labeled values."
    >
      <div className="flex flex-col gap-section-break">
        <div className="flex flex-col gap-inline-gap">
          <Label>Badge · Chip · Avatar</Label>
          <div className="flex flex-wrap items-center gap-item-gap">
            <Badge variant="default">Default</Badge>
            <Badge tone="positive">Positive</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="critical">Critical</Badge>
            <Chip>Resting chip</Chip>
            <Chip selected>Selected chip</Chip>
            <Avatar initials="PA" size="md" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-section-gap sm:grid-cols-2">
          <div className="flex flex-col gap-inline-gap">
            <Label>ChecklistItem · DetailRow</Label>
            <ul className="flex flex-col" role="list">
              <ChecklistItem>Thrives in your sun conditions</ChecklistItem>
              <ChecklistItem tone="warning">
                May struggle over winter in your zone
              </ChecklistItem>
            </ul>
            <div>
              <DetailRow label="Botanical name" value="Salvia nemorosa" />
              <DetailRow label="Height" value="40–60 cm" />
            </div>
            <div>
              <DetailRow
                labelWidth="sm"
                label="Spring"
                value="New growth emerges; feed once."
              />
              <DetailRow
                labelWidth="sm"
                label="Summer"
                value="Deadhead to extend blooming."
              />
            </div>
          </div>
          <div className="flex flex-col gap-inline-gap">
            <Label>Thumbnail</Label>
            <div className="flex h-20 gap-inline-gap">
              <Thumbnail src="/plants/plant-01.png" label="Lavender" />
              <Thumbnail src="/plants/plant-02.png" label="Echinacea" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-inline-gap">
          <Label>Icon — app icon registry at 16px</Label>
          <div className="flex flex-wrap gap-item-gap">
            {Object.entries(icons).map(([name, src]) => (
              <div
                key={name}
                className="flex w-20 flex-col items-center gap-tight-gap rounded-sm border border-card bg-surface-card py-inline-gap"
              >
                <Icon src={src} size={16} alt="" />
                <span className="text-micro text-muted">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  )
}

function Navigation() {
  return (
    <Section
      title="Navigation"
      intro="Moves the user between views — this page's own subcategory switcher is built from the same component."
    >
      <div className="flex max-w-[480px] flex-col gap-inline-gap">
        <Label>Tabs</Label>
        <Tabs
          items={[
            { value: 'all', label: 'All', count: 24 },
            { value: 'planned', label: 'Planned', count: 6 },
            { value: 'planted', label: 'Planted' },
          ]}
          value="all"
        />
      </div>
    </Section>
  )
}

function Overlays() {
  return (
    <Section
      title="Overlays"
      intro="Tooltip renders inline below. Modal and Drawer need open/close interaction — their demos live in Storybook."
    >
      <div className="flex flex-col gap-inline-gap">
        <Label>Tooltip</Label>
        <div className="flex items-center gap-item-gap">
          <Tooltip content="Remove from garden">
            <Button variant="secondary">Hover me</Button>
          </Tooltip>
          <Tooltip content="Opens the plant's story" position="right">
            <Button variant="ghost">Or me</Button>
          </Tooltip>
        </div>
      </div>
    </Section>
  )
}

export const componentsChapter: Chapter = {
  slug: 'components',
  label: 'Components',
  sections: [
    { slug: 'actions', label: 'Actions', content: <Actions /> },
    { slug: 'forms', label: 'Forms', content: <Forms /> },
    { slug: 'surfaces', label: 'Surfaces', content: <Surfaces /> },
    { slug: 'feedback', label: 'Feedback', content: <Feedback /> },
    { slug: 'display', label: 'Display', content: <Display /> },
    { slug: 'navigation', label: 'Navigation', content: <Navigation /> },
    { slug: 'overlays', label: 'Overlays', content: <Overlays /> },
  ],
}
