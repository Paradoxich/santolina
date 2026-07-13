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
  EmptyState,
  Icon,
  Input,
  MediaCard,
  Panel,
  SearchField,
  SeasonalStageRow,
  Spinner,
  StatCard,
  Tabs,
  Toast,
  Tooltip,
} from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { Label, Section, type Chapter } from '../chapter-helpers'

const placeholderImage = <div className="size-full bg-sage-300" aria-hidden />

function Actions() {
  return (
    <Section
      title="Actions"
      intro="Buttons drive every committed change in the product — a plant added, a note saved, an item removed."
    >
      <div className="flex flex-col gap-inline-gap">
        <Label>Button</Label>
        <div className="flex flex-wrap items-center gap-item-gap">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="destructive-ghost">Destructive ghost</Button>
          <Button variant="primary" isLoading>
            Loading
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
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
            <Toast
              tone="default"
              title="Default"
              description="Neutral information."
            />
            <Toast
              tone="positive"
              title="Positive"
              description="Plant added to your palette."
            />
            <Toast
              tone="warning"
              title="Warning"
              description="Frost expected this week."
            />
            <Toast
              tone="critical"
              title="Critical"
              description="Could not save your note."
            />
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
            <Label>CompanionThumbnail</Label>
            <div className="flex h-20 gap-inline-gap">
              <CompanionThumbnail src="/plants/plant-01.png" label="Lavender" />
              <CompanionThumbnail
                src="/plants/plant-02.png"
                label="Echinacea"
              />
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
          <Tooltip content="Opens the plant's diary" position="right">
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
