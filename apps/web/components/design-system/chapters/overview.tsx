import { ChecklistItem, Panel } from '@paradoxui/ui'
import type { Chapter } from '../chapter-helpers'

function Rules() {
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

function Intro() {
  return (
    <header className="flex flex-col gap-item-gap">
      <h1 className="text-title font-semibold tracking-heading text-primary">
        Design System
      </h1>
      <p className="max-w-[560px] text-body text-body-secondary">
        Live reference for Paradox UI tokens and components. This page renders
        straight from <code>@paradoxui/tokens</code> — the code is the source of
        truth, and every value shown here is read from the rendered CSS, so it
        cannot drift. Taxonomy and rules: <code>docs/token-taxonomy.md</code>.
      </p>
    </header>
  )
}

export const overviewChapter: Chapter = {
  slug: 'overview',
  label: 'Overview',
  sections: [
    {
      slug: 'rules',
      label: 'Rules',
      content: (
        <>
          <Intro />
          <Rules />
        </>
      ),
    },
  ],
}
