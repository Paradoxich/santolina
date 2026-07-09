# Santolina + Paradox UI — Roadmap

Working backlog for the Santolina app and the Paradox UI design system extracted
from it. Grouped into buckets and roughly prioritized within each; open items
come first, completed ones are grouped under **Done** at the end of each section.
This is a living document, not a commitment.

---

## Design System (Paradox UI)

Paradox UI is extracted from the product as it's built. The current focus is
closing the gap between the kit and how the app actually consumes it.

**Kit vs. product**

- [ ] Extend `Button` with the variants the product needs (small circular icon buttons, light "control" style), then adopt it across the existing hand-rolled call sites. Highest-leverage cleanup.
- [ ] Adopt `Badge`/`Avatar` for the bloom-status pill, status tags, and sidebar avatar. Give the plant status tags distinct colors (currently uniform).

**Kit consistency**

- [ ] Add `forwardRef` across kit components (form libraries, tooltip positioning).
- [ ] Unify prop naming (`variant` vs. `tone`, `size` vs. `inputSize`).
- [ ] Add a class-merging strategy for consumer style overrides (`tailwind-merge` or equivalent).
- [ ] Spacing-token migration for Button, Input, and Modal — fold into each component's redesign pass rather than a standalone sweep (mapping numeric padding onto the semantic scale is a design decision, and a standalone pass would be churned by the redesigns anyway).
- [ ] Redesign Toasts, Input fields, and Modal to the product's visual language.

**Publishing prep**

- [ ] Remove product/domain-specific naming from kit components, token comments, and Storybook demo copy.
- [ ] Prepare the package for external consumers (built output, Tailwind setup docs).
- [ ] Ship the Tailwind preset mapping to real tokens; sweep remaining hardcoded values in the app.

**Design**

- [ ] Final weather icon set — 7 concepts (Sunny, Partly Cloudy, Cloudy, Foggy, Rain, Snow, Thunderstorm). Night variants deferred.
- [ ] Empty-state placeholder illustration.
- [ ] General motion/transition pass across the UI.

**Done**

- [x] Extract `EmptyState` into `@paradoxui/ui` — the `next/link` coupling inverted via a `linkComponent` prop (defaults to `<a>`); app call sites pass Next's `Link`.
- [x] Extract `DrawerSection` into `@paradoxui/ui` — moved unchanged; the plant-detail sections import it from the kit.
- [x] Componentize the Sidebar — already a single `AppSidebar` (plus `MobileTabBar`); Avatar adoption stays tracked under the `Badge`/`Avatar` item above.
- [x] Fix small kit bugs — undefined `--color-neutral-*` references, fixed Modal element id, SSR-unsafe Tooltip ids (`Tooltip`/`Modal` now use `useId()`).
- [x] Extract `Drawer` into `@paradoxui/ui` — the kit owns the non-animated chrome (positioning, scroll lock, header/close); animation is injected via `panelComponent`/`panelProps`, so the kit carries no framer-motion dependency. `lib/drawer-motion.ts` is the app's single slide-in source of truth.
- [x] Card spacing migrated to semantic tokens (`px-card-padding py-row-gap`, value-identical to the old `px-6 py-4`).

---

## Database & Plant Data

- [ ] **Editorial review of the cross-check's remaining flags** — a few plant-type classifications and one hardiness value. Judgment calls, intentionally unapplied.
- [ ] `users` / `agent_sessions` tables — idle by design until authentication and the agent land.

**Done**

- [x] **Populate `plant_combinations`** via an AI pass — 311 companion pairs across the 125-plant catalog, capped at 5 per plant and deduped; verified rendering in the app.
- [x] **Correct systematic under-reporting of sun requirements** — data corrected, plus two forward fixes in the curation and cross-check scripts so future drafts capture the full tolerated range.
- [x] **Build the botanical cross-check** (`cross-check-plants.ts`) — a blind second-pass fact-checker over curated fields; flags only, never writes.
- [x] **Expand the plant catalog** — now 125 species, all curated with images and descriptions.
- [x] **Replayable migration** recording the direct-to-DB data corrections, guarded and idempotent.

_Accepted v1 gap: orphaned storage files are not cleaned up on delete._

---

## Features

- [ ] **Authentication & accounts** — sign-in, sessions, and per-user data. The app currently runs as a single-tenant development setup; this is the largest item and is scoped alongside onboarding.
- [ ] **Onboarding** — garden-profile wizard.
- [ ] **The Agent** — invisible in the wiring, summonable as a plant-scoped assistant (⌘K sidebar plus drawer chat entry points). Behavior finalized when agent design begins.
- [ ] **Garden Reflections** — pattern-level synthesis across the diary over time, not a chronological log.
- [ ] **Explore** — validate richer filters / condition-based personalization before building.
- [ ] **Content strategy** for the Garden Insight, Care Tips, and Growing-card status messages — define what each should communicate in its final form.

_Deferred by design: diary AI summaries (wait for the agent), repo split (wait for Paradox UI's first external consumer), night weather icons._

---

## UI Fixes

- [ ] Care Tips — rework the header count for the generic-fallback state.
- [ ] Diary — edit/delete a single note; refine the "removed from garden" treatment; reposition the clear-diary and add-note actions; add a top border above the notes list.
- [ ] Apply tooltips to all icon buttons.
- [ ] Search — recommended chips below the search field.
- [ ] Plant detail — polish small card backgrounds, swap the water icon, add an image placeholder for missing photos.
- [ ] Bloom Timeline — show a plant's name on hover.

**Done**

- [x] 404 page — on-brand `app/not-found.tsx` with a back-to-dashboard link.
- [x] My Plants card — thumbnail border radius 4px → 8px.

---

## Suggested sequencing

1. Extend `Button` and adopt it across the app — stops the kit/product drift and unblocks consistent UI work.
2. Bundle the Diary UI fixes.
3. Kit consistency, de-gardening, and packaging as Paradox UI rises in priority.
4. Authentication last, scoped alongside onboarding.
