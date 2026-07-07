import type { Metadata } from 'next'
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
  CompanionThumbnail,
  DetailRow,
  Input,
  MediaCard,
  Panel,
  SearchField,
  SeasonalStageRow,
  Spinner,
  StatCard,
  Tabs,
  Toast,
} from '@paradoxui/ui'
import { CssVar, Swatch } from '@/components/design-system/TokenRef'
import { TokenTierBlock } from '@/components/design-system/TokenTable'
import { DesignSystemTabs } from '@/components/design-system/DesignSystemTabs'
import { allTokens } from '@/components/design-system/token-data'

export const metadata: Metadata = {
  title: 'Design System — Paradox UI',
  description:
    'Live token and component reference for Paradox UI. Code is the source of truth.',
}

function Section({
  title,
  intro,
  children,
}: {
  title: string
  intro?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-section-gap">
      <div className="flex flex-col gap-tight-gap">
        <h2 className="text-subheading font-semibold text-primary">{title}</h2>
        {intro && <p className="text-body text-body-secondary">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-label uppercase tracking-[0.05em] text-muted">
      {children}
    </p>
  )
}

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

function ToneKit({
  tone,
  surface,
  icon,
  text,
}: {
  tone: string
  surface: string
  icon: string
  text: string
}) {
  return (
    <div
      className={`flex flex-col gap-inline-gap rounded-sm p-row-gap ${surface}`}
    >
      <div className="flex items-center gap-inline-gap">
        <span
          className={`size-3 rounded-full bg-current ${icon}`}
          aria-hidden
        />
        <span className="text-label uppercase tracking-[0.05em] text-primary">
          {tone}
        </span>
      </div>
      <p className={`text-body-small font-medium ${text}`}>
        surface-{tone} · icon-{tone} · text-{tone} · border-{tone}
      </p>
      <p className="text-body-small text-body-secondary">
        Every tone ships as a four-role kit. A new stateful component composes a
        kit — it never mints a hex.
      </p>
    </div>
  )
}

const placeholderImage = <div className="size-full bg-sage-300" aria-hidden />

function OverviewTab() {
  return (
    <Panel title="The rules" meta="tiers & naming">
      <ul className="flex flex-col" role="list">
        <ChecklistItem>
          Grammar: --color-{'{category}'}-{'{role}'}. Roles describe function
          (surface-card), never location (background-close-button). Location
          names are allowed in tier 3 only.
        </ChecklistItem>
        <ChecklistItem>
          Tier by vocabulary: primitives are hues (green-600), semantics are
          roles (accent), component tokens are components (chip-radius). Raw
          values live in tier 1 only; dark mode will override tier 2 only.
        </ChecklistItem>
        <ChecklistItem>
          New semantic role only if its usage rule fits one sentence. New raw
          value only if design actually chose one. Two roles may share a
          primitive and diverge later.
        </ChecklistItem>
        <ChecklistItem>
          Components consume shared roles — three cards with three text slots
          reuse the same roles, not nine new tokens.
        </ChecklistItem>
        <ChecklistItem tone="warning">
          Tone vocabulary is positive / warning / critical. “success”, “error”,
          “caution” and Tailwind stock colors (bg-white, text-black) do not
          exist — they will not compile.
        </ChecklistItem>
      </ul>
    </Panel>
  )
}

function ColorsTab() {
  return (
    <>
      <Section
        title="Tier 1 — Primitive ramps"
        intro="Hue-named, raw values live only here. Reach for a semantic role first; ramps are the escape hatch."
      >
        <div className="flex flex-col gap-section-gap">
          <div>
            <Label>green — brand</Label>
            <div className="mt-2 grid grid-cols-6 gap-item-gap">
              <Swatch name="green-100" className="bg-green-100" />
              <Swatch name="green-200" className="bg-green-200" />
              <Swatch name="green-300" className="bg-green-300" />
              <Swatch name="green-600" className="bg-green-600" />
              <Swatch name="green-700" className="bg-green-700" />
              <Swatch name="green-950" className="bg-green-950" />
            </div>
          </div>
          <div>
            <Label>sage — surface neutrals</Label>
            <div className="mt-2 grid grid-cols-6 gap-item-gap">
              <Swatch name="sage-50" className="bg-sage-50" />
              <Swatch name="sage-100" className="bg-sage-100" />
              <Swatch name="sage-150" className="bg-sage-150" />
              <Swatch name="sage-200" className="bg-sage-200" />
              <Swatch name="sage-300" className="bg-sage-300" />
            </div>
          </div>
          <div>
            <Label>gold · gray · red</Label>
            <div className="mt-2 grid grid-cols-6 gap-item-gap">
              <Swatch name="gold-100" className="bg-gold-100" />
              <Swatch name="gold-700" className="bg-gold-700" />
              <Swatch name="gray-0" className="bg-gray-0" />
              <Swatch name="gray-100" className="bg-gray-100" />
              <Swatch name="gray-500" className="bg-gray-500" />
              <Swatch name="gray-900" className="bg-gray-900" />
              <Swatch name="red-100" className="bg-red-100" />
              <Swatch name="red-500" className="bg-red-500" />
              <Swatch name="red-600" className="bg-red-600" />
              <Swatch name="red-700" className="bg-red-700" />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Tier 2 — Text roles"
        intro="Color and size are separate axes: a card title is text-primary × text-heading × semibold."
      >
        <div className="flex flex-col gap-inline-gap rounded-sm border border-card bg-surface-card p-row-gap">
          <p className="text-body text-primary">
            text-primary — headings, titles, primary body copy
          </p>
          <p className="text-body text-secondary">
            text-secondary — subtitles, card captions, button labels
          </p>
          <p className="text-body text-body-secondary">
            text-body-secondary — supporting content: descriptions, summaries
          </p>
          <p className="text-body text-muted">
            text-muted — UI metadata: labels, captions, timestamps
          </p>
          <p className="text-body text-faint">
            text-faint — de-emphasised / dimmed values
          </p>
          <p className="rounded-xs bg-surface-inverse px-2 py-1 text-body text-inverse">
            text-inverse — over images and dark surfaces
          </p>
          <p className="rounded-xs bg-accent px-2 py-1 text-body text-on-accent">
            text-on-accent — on accent-filled controls
          </p>
        </div>
      </Section>

      <Section
        title="Tier 2 — Surfaces"
        intro="Containers by elevation and function. Translucent surfaces bake in light-mode; they get real values in a dark theme."
      >
        <div className="grid grid-cols-4 gap-item-gap">
          <Swatch name="surface-page" className="bg-surface-page" />
          <Swatch name="surface-card" className="bg-surface-card" />
          <Swatch name="surface-subtle" className="bg-surface-subtle" />
          <Swatch name="surface-sunken" className="bg-surface-sunken" />
          <Swatch name="surface-inverse" className="bg-surface-inverse" />
          <Swatch name="surface-field" className="bg-surface-field" />
          <Swatch name="surface-overlay" className="bg-surface-overlay" />
          <Swatch name="surface-control" className="bg-surface-control" />
          <Swatch name="surface-hover" className="bg-surface-hover" />
          <Swatch name="surface-active" className="bg-surface-active" />
          <Swatch
            name="surface-card-translucent"
            className="bg-surface-card-translucent"
          />
          <Swatch name="scrim" className="bg-scrim" />
          <Swatch name="accent" className="bg-accent" />
          <Swatch name="accent-hover" className="bg-accent-hover" />
          <Swatch name="accent-muted" className="bg-accent-muted" />
        </div>
      </Section>

      <Section title="Tier 2 — Tone kits">
        <div className="grid grid-cols-3 gap-item-gap">
          <ToneKit
            tone="positive"
            surface="bg-surface-positive"
            icon="text-icon-positive"
            text="text-positive"
          />
          <ToneKit
            tone="warning"
            surface="bg-surface-warning"
            icon="text-icon-warning"
            text="text-warning"
          />
          <ToneKit
            tone="critical"
            surface="bg-surface-critical"
            icon="text-icon-critical"
            text="text-critical"
          />
        </div>
      </Section>
    </>
  )
}

function TypographyTab() {
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

function SpacingTab() {
  return (
    <>
      <Section title="Spacing roles">
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

      <Section title="Radius & shadows">
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
        <div className="grid grid-cols-4 gap-section-gap pt-row-gap">
          {(
            [
              ['sm', 'shadow-sm'],
              ['md', 'shadow-md'],
              ['lg', 'shadow-lg'],
              ['soft', 'shadow-soft'],
            ] as const
          ).map(([s, cls]) => (
            <div key={s} className="flex flex-col items-center gap-inline-gap">
              <div
                className={`h-16 w-full rounded-md bg-surface-card ${cls}`}
              />
              <span className="text-label text-muted">shadow-{s}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

function ComponentsTab() {
  return (
    <Section
      title="Components"
      intro="Every component consumes semantic roles only. Interactive states (Modal, Tooltip) live in Storybook."
    >
      <div className="flex flex-col gap-section-gap">
        <div className="flex flex-col gap-inline-gap">
          <Label>Button</Label>
          <div className="flex flex-wrap items-center gap-item-gap">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="primary" isLoading>
              Loading
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-inline-gap">
          <Label>Badge · Chip · Avatar · Spinner</Label>
          <div className="flex flex-wrap items-center gap-item-gap">
            <Badge variant="default">Default</Badge>
            <Badge variant="positive">Positive</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="critical">Critical</Badge>
            <Chip>Resting chip</Chip>
            <Chip selected>Selected chip</Chip>
            <Avatar initials="PA" size="md" />
            <Spinner size="md" />
          </div>
        </div>

        <div className="flex flex-col gap-inline-gap">
          <Label>MediaCard</Label>
          <div className="grid grid-cols-3 gap-item-gap">
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
              titleAdornment={<Badge variant="positive">blooming</Badge>}
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

        <div className="flex flex-col gap-inline-gap">
          <Label>Toast</Label>
          <div className="grid grid-cols-2 gap-item-gap">
            <Toast
              variant="default"
              title="Default"
              description="Neutral information."
            />
            <Toast
              variant="positive"
              title="Positive"
              description="Plant added to your palette."
            />
            <Toast
              variant="warning"
              title="Warning"
              description="Frost expected this week."
            />
            <Toast
              variant="critical"
              title="Critical"
              description="Could not save your note."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-section-gap">
          <div className="flex flex-col gap-item-gap">
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
          <div className="flex flex-col gap-item-gap">
            <Label>Tabs · StatCard</Label>
            <Tabs
              items={[
                { value: 'all', label: 'All', count: 24 },
                { value: 'planned', label: 'Planned', count: 6 },
                { value: 'planted', label: 'Planted' },
              ]}
              value="all"
            />
            <div className="grid grid-cols-2 gap-item-gap">
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
        </div>

        <div className="grid grid-cols-2 gap-section-gap">
          <div className="flex flex-col gap-inline-gap">
            <Label>ChecklistItem · DetailRow · SeasonalStageRow</Label>
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
              <SeasonalStageRow stage="Spring">
                New growth emerges; feed once.
              </SeasonalStageRow>
              <SeasonalStageRow stage="Summer">
                Deadhead to extend blooming.
              </SeasonalStageRow>
            </div>
          </div>
          <div className="flex flex-col gap-inline-gap">
            <Label>CompanionThumbnail · Card</Label>
            <div className="flex h-20 gap-inline-gap">
              <CompanionThumbnail src="/plants/plant-01.png" label="Lavender" />
              <CompanionThumbnail
                src="/plants/plant-02.png"
                label="Echinacea"
              />
            </div>
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

function AllTokensTab() {
  return (
    <Section
      title="All tokens"
      intro="Every custom property defined in packages/tokens/index.css, in file order. If it's not here, it doesn't exist yet — this is the audit view, not the showcase."
    >
      <div className="flex flex-col gap-section-break">
        {allTokens.map((tier) => (
          <TokenTierBlock key={tier.tier} tier={tier} />
        ))}
      </div>
    </Section>
  )
}

export default function DesignSystemPage() {
  return (
    <main className="mx-auto flex max-w-[880px] flex-col gap-section-break px-card-padding py-section-break">
      <header className="flex flex-col gap-item-gap">
        <h1 className="text-title font-semibold tracking-heading text-primary">
          Design System
        </h1>
        <p className="max-w-[560px] text-body text-body-secondary">
          Live reference for Paradox UI tokens and components. This page renders
          straight from <code>@paradoxui/tokens</code> — the code is the source
          of truth, and every value shown here is read from the rendered CSS, so
          it cannot drift. Taxonomy and rules:{' '}
          <code>docs/token-taxonomy.md</code>.
        </p>
      </header>

      <DesignSystemTabs
        tabs={[
          { value: 'overview', label: 'Overview', content: <OverviewTab /> },
          { value: 'colors', label: 'Colors', content: <ColorsTab /> },
          {
            value: 'typography',
            label: 'Typography',
            content: <TypographyTab />,
          },
          {
            value: 'spacing',
            label: 'Spacing & radius',
            content: <SpacingTab />,
          },
          {
            value: 'components',
            label: 'Components',
            content: <ComponentsTab />,
          },
          { value: 'tokens', label: 'All tokens', content: <AllTokensTab /> },
        ]}
      />
    </main>
  )
}
