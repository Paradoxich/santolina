import { Button, Chip, Icon, IconButton, Tooltip } from '@paradoxui/ui'
import { icons } from '@/lib/icons'
import { Label, Section } from '@/components/design-system/chapter-helpers'

// Temporary reference page for the design-system branch's button-unification
// pass. Not linked from the design-system nav — visit directly at
// /design-system/button-audit. Safe to delete once the audit is resolved.

function Code({ children }: { children: string }) {
  return (
    <pre className="w-full overflow-x-auto rounded-xs bg-surface-page p-inline-gap text-label leading-normal text-muted">
      <code className="font-mono">{children}</code>
    </pre>
  )
}

function Specimen({
  label,
  source,
  code,
  children,
}: {
  label: string
  source: string
  code: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-tight-gap rounded-sm border border-card bg-surface-card p-inline-gap">
      <div className="flex min-h-[64px] items-center justify-center rounded-xs bg-surface-page p-item-gap">
        {children}
      </div>
      <div className="flex flex-col gap-tight-gap">
        <p className="text-body-small font-medium text-primary">{label}</p>
        <code className="text-label text-muted">{source}</code>
        <Code>{code}</Code>
      </div>
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-item-gap sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  )
}

export default function ButtonAuditPage() {
  return (
    <div className="flex flex-col gap-section-break">
      <div className="flex flex-col gap-item-gap">
        <h1 className="text-title font-semibold tracking-heading text-primary">
          Button audit
        </h1>
        <p className="max-w-[720px] text-body text-body-secondary">
          Every button style live in the product right now, next to its source.
          The formal <code className="text-primary">Button</code> component
          covers a fraction of these — the rest are hand-rolled{' '}
          <code className="text-primary">{'<button>'}</code> elements with
          inline Tailwind. Temporary page for the design-system branch — not in
          the nav, delete once the unification is done.
        </p>
      </div>

      <Section
        title="1. Formal Button — packages/ui"
        intro="The component everything below should probably be using instead."
      >
        <div className="flex flex-col gap-inline-gap">
          <Label>All variants × states</Label>
          <div className="flex flex-wrap items-center gap-item-gap">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="control">Control</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="destructive-ghost">Destructive ghost</Button>
            <Button variant="primary" isLoading>
              Loading
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <Label>Sizes</Label>
          <div className="flex flex-wrap items-center gap-item-gap">
            <Button size="sm">Small · 32</Button>
            <Button size="md">Medium · 40</Button>
            <Button size="lg">Large · 48</Button>
          </div>
        </div>
      </Section>

      <Section
        title="2. Destructive & primary confirm actions"
        intro="Only genuinely irreversible actions stay destructive/primary. Add to plan and Remove from garden were styled dark purely as an ad-hoc choice — they're reversible, so they move to control below instead."
      >
        <Grid>
          <Specimen
            label="Delete note / Clear diary — now Button destructive"
            source="DiaryDetailDrawer.tsx:589 (also 633)"
            code={`<Button variant="destructive" size="sm">
  Delete note
</Button>`}
          >
            <Button variant="destructive" size="sm">
              Delete note
            </Button>
          </Specimen>

          <Specimen
            label="Add entry (composer send) — now IconButton primary"
            source="DiaryDetailDrawer.tsx:537"
            code={`<IconButton variant="primary" size="sm"
  aria-label="Add entry">
  <Icon src={icons.arrowRight} />
</IconButton>`}
          >
            <IconButton variant="primary" size="sm" aria-label="Add entry">
              <Icon src={icons.arrowRight} />
            </IconButton>
          </Specimen>
        </Grid>
      </Section>

      <Section
        title="3. Control — the shared reversible-action recipe"
        intro="Cancel, Add to plan, Remove from garden — none of these are the primary action of their screen, and none of them destroy anything permanently. All wire to the same Button control variant now."
      >
        <Grid>
          <Specimen
            label="Cancel — old ad-hoc markup"
            source="PlantDetailDrawer.tsx:472, DiaryDetailDrawer.tsx:581/625"
            code={`className="flex h-8 items-center rounded-sm border
  border-card bg-surface-control px-inline-gap
  text-body-small text-secondary
  disabled:cursor-not-allowed disabled:opacity-50"`}
          >
            <button
              type="button"
              className="flex h-8 items-center rounded-sm border border-card bg-surface-control px-inline-gap text-body-small text-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </Specimen>

          <Specimen
            label="Cancel — new Button control variant"
            source='Button variant="control" size="sm"'
            code={`<Button variant="control" size="sm">
  Cancel
</Button>`}
          >
            <Button variant="control" size="sm">
              Cancel
            </Button>
          </Specimen>

          <Specimen
            label="Add to plan — now Button control"
            source="PlantDetailDrawer.tsx:360"
            code={`<Button variant="control" size="sm">
  Add to plan
</Button>`}
          >
            <Button variant="control" size="sm">
              Add to plan
            </Button>
          </Specimen>

          <Specimen
            label="Remove from garden (modal confirm) — now Button control"
            source="PlantDetailDrawer.tsx:476"
            code={`<Button variant="control" size="sm">
  Remove from garden
</Button>`}
          >
            <Button variant="control" size="sm">
              Remove from garden
            </Button>
          </Specimen>

          <Specimen
            label="Add back to garden (full-width variant)"
            source="DiaryDetailDrawer.tsx:552"
            code={`<Button variant="control" size="sm"
  className="w-full justify-between">
  Add back to garden
  <Icon src={icons.arrowRight} />
</Button>`}
          >
            <Button
              variant="control"
              size="sm"
              className="w-full justify-between"
            >
              Add back to garden
              <Icon src={icons.arrowRight} />
            </Button>
          </Specimen>
        </Grid>
      </Section>

      <Section
        title="4. IconButton"
        intro="New shared primitive. Same variant vocabulary as Button (primary / control / ghost / destructive), same size scale (32/40/48), radius unified to rounded-sm (8px) — replacing both rounded-full and the stray rounded-[6px]."
      >
        <Grid>
          <Specimen
            label="Primary — Add entry"
            source='IconButton variant="primary"'
            code={`<IconButton variant="primary" aria-label="Add entry">
  <Icon src={icons.arrowRight} />
</IconButton>`}
          >
            <IconButton variant="primary" aria-label="Add entry">
              <Icon src={icons.arrowRight} />
            </IconButton>
          </Specimen>

          <Specimen
            label="Control — Remove from garden / Chat"
            source='IconButton variant="control"'
            code={`<IconButton variant="control" aria-label="Remove">
  <Icon src={icons.trash} />
</IconButton>`}
          >
            <div className="flex gap-tight-gap">
              <Tooltip content="Remove from garden">
                <IconButton variant="control" aria-label="Remove from garden">
                  <Icon src={icons.trash} />
                </IconButton>
              </Tooltip>
              <IconButton variant="control" aria-label="Chat about this plant">
                <Icon src={icons.chat} />
              </IconButton>
            </div>
          </Specimen>

          <Specimen
            label="Ghost — Clear diary / Add photo / Filter"
            source='IconButton variant="ghost"'
            code={`<IconButton variant="ghost" aria-label="Filter">
  <Icon src={icons.filter} />
</IconButton>`}
          >
            <div className="flex gap-tight-gap">
              <IconButton variant="ghost" aria-label="Clear diary">
                <Icon src={icons.trash} />
              </IconButton>
              <IconButton variant="ghost" aria-label="Add photo">
                <Icon src={icons.plus} />
              </IconButton>
              <IconButton variant="ghost" aria-label="Filter plants">
                <Icon src={icons.filter} />
              </IconButton>
            </div>
          </Specimen>

          <Specimen
            label="Sizes — sm/md/lg (32/40/48), same radius throughout"
            source='IconButton size="sm|md|lg"'
            code={`<IconButton variant="control" size="sm">…
<IconButton variant="control" size="md">…
<IconButton variant="control" size="lg">…`}
          >
            <div className="flex items-center gap-tight-gap">
              <IconButton variant="control" size="sm" aria-label="Small">
                <Icon src={icons.trash} />
              </IconButton>
              <IconButton variant="control" size="md" aria-label="Medium">
                <Icon src={icons.trash} />
              </IconButton>
              <IconButton variant="control" size="lg" aria-label="Large">
                <Icon src={icons.trash} />
              </IconButton>
            </div>
          </Specimen>

          <Specimen
            label="Destructive / destructive-ghost — reserved, no consumer yet"
            source='IconButton variant="destructive|destructive-ghost"'
            code={`<IconButton variant="destructive" aria-label="Delete">
<IconButton variant="destructive-ghost" aria-label="Delete">`}
          >
            <div className="flex gap-tight-gap">
              <IconButton variant="destructive" aria-label="Delete">
                <Icon src={icons.trash} />
              </IconButton>
              <IconButton variant="destructive-ghost" aria-label="Delete">
                <Icon src={icons.trash} />
              </IconButton>
            </div>
          </Specimen>
        </Grid>
      </Section>

      <Section
        title="5. Toggle pills reimplementing Chip"
        intro="These two functionally duplicate the formal Chip (selected/unselected pill) but were built from scratch instead of imported. Not part of this pass — noted for a follow-up."
      >
        <Grid>
          <Specimen
            label="Chip — the formal primitive, for comparison"
            source="packages/ui/src/components/Chip.tsx"
            code={`<Chip>Resting</Chip>
<Chip selected>Selected</Chip>`}
          >
            <div className="flex gap-tight-gap">
              <Chip>Resting</Chip>
              <Chip selected>Selected</Chip>
            </div>
          </Specimen>
        </Grid>
      </Section>

      <Section
        title="6. Text / link-styled buttons"
        intro="Low-emphasis actions rendered as plain text with a hover color shift. Not part of this pass — left as-is for now."
      >
        <Grid>
          <Specimen
            label="Clear filters"
            source="ExploreFilters.tsx:130"
            code={`className="text-body-small text-secondary
  hover:text-primary"`}
          >
            <button
              type="button"
              className="text-body-small text-secondary transition-colors duration-normal hover:text-primary"
            >
              Clear filters
            </button>
          </Specimen>
        </Grid>
      </Section>

      <Section
        title="7. Custom primary buttons → Button primary"
        intro="Both now wire to the same Button primary — the login page's shape (h-12, border-login) stays as a className override, which is the intended escape hatch, not a sign a new variant is needed."
      >
        <Grid>
          <Specimen
            label="Google sign-in"
            source="LoginForm.tsx:126"
            code={`<Button
  className="w-full rounded-md border-login"
  isLoading={googleLoading}
>
  Continue with Google
</Button>`}
          >
            <Button size="lg" className="w-full rounded-md border-login">
              Continue with Google
            </Button>
          </Specimen>

          <Specimen
            label="Send magic link"
            source="LoginForm.tsx:160"
            code={`<Button type="submit" size="lg"
  className="border-login">
  Send me a sign in link
</Button>`}
          >
            <Button size="lg" className="border-login">
              Send me a sign in link
            </Button>
          </Specimen>
        </Grid>
      </Section>
    </div>
  )
}
