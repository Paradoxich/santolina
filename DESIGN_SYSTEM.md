# Santolina Design System

How to build UI in this repo. This is the reference for humans and AI agents
alike — read it before adding or changing any visual code.

**Source of truth: the code.** Tokens live in `packages/tokens/index.css`,
structured by `docs/token-taxonomy.md`, and rendered live at `/design-system`
in the app. Figma Variables are synced _from_ this structure, not the other
way around. When Figma and code disagree, code wins — fix Figma.

---

## 1. The three layers

```
@paradoxui/tokens   →   @paradoxui/ui   →   apps/web
(CSS vars + preset)     (generic React)     (Santolina product)
```

| Layer          | Package               | Contains                                             | May know about gardens? |
| -------------- | --------------------- | ---------------------------------------------------- | ----------------------- |
| 1 — Tokens     | `packages/tokens`     | CSS custom properties + the Tailwind preset.         | No                      |
| 2 — Primitives | `packages/ui`         | Generic React components (Button, Card, Chip, Tabs…) | **Never**               |
| 3 — Product    | `apps/web/components` | Domain components (GardenPlantTile, AppSidebar…)     | Yes                     |

**The placement rule:** before creating a component, ask _"does this component
know anything about gardens?"_

- No → `packages/ui`, with generic props (`items`, `selected`, `count`)
- Yes → `apps/web/components`, composed from Layer 2 primitives where possible

A `Chip` doesn't know it filters bloom statuses — the _page_ knows that. Keep
it this way; it's what makes the framework extractable as Paradox UI.

Dependencies flow one way only: web → ui → tokens. Never the reverse.

---

## 2. Tokens — the three tiers

Full taxonomy and rationale: `docs/token-taxonomy.md`. Live visual reference:
`/design-system` in the running app. The short version:

| Tier          | Vocabulary      | Examples                                         | Raw values allowed?  |
| ------------- | --------------- | ------------------------------------------------ | -------------------- |
| 1 — Primitive | hue/scale names | `--color-fern-700`, `--spacing-4`, `--radius-lg` | **Only here**        |
| 2 — Semantic  | role names      | `--color-text-muted`, `--color-surface-card`     | No — always aliases  |
| 3 — Component | component names | `--chip-radius`, `--thumbnail-scrim`             | Measured values only |

You can tell a token's tier by reading it. Components consume tier 2 ~95% of
the time. Dark mode (later) overrides tier 2 and nothing else.

### The rules that keep the system small

1. **Roles describe function, never location.** `surface-card`, not
   `background-close-button`. Location names are allowed in tier 3 only.
2. **New semantic role** only if you can state its usage rule in one sentence
   ("`text-muted` is UI metadata: labels, captions, timestamps").
   **New raw value** only if design actually chose one. Two roles may share a
   primitive today and diverge later by re-pointing one alias.
3. **Components consume shared roles.** Three card components with three text
   slots reuse the same roles — they don't mint nine tokens. A tier 3 token
   exists only for a component-specific measured value or a deliberate theming
   hook, added at the moment of need, never preemptively.
4. **Tone vocabulary is `positive` / `warning` / `critical`** (plus `info`
   when a component needs it). Every tone is a four-role kit: `surface-`,
   `icon-`, `text-`, `border-`. `success`, `error`, and `caution` do not exist.
5. **Color roles and size roles are separate axes.** A card title is
   `text-primary` (color) × `text-heading` (size) × `font-semibold` (weight) —
   there is no "card title" token.

### Text color roles (the complete set)

`primary` (headings, primary copy) · `secondary` (subtitles, captions, button
labels) · `body-secondary` (supporting content) · `muted` (UI metadata) ·
`faint` (dimmed) · `inverse` (over images/dark) · `on-accent` (on filled
controls). If you think you need an eighth, apply rule 2.

---

## 3. Styling pattern — preset classes

The Tailwind preset (`packages/tokens/preset.ts`, wired into both Tailwind
configs) maps every token to a utility class. **This is the house style:**

```tsx
// Good — semantic preset classes
className =
  'bg-surface-card text-muted text-body-small p-card-padding rounded-chip'

// Legacy — arbitrary values; do not write new code like this
className =
  'bg-[var(--color-surface-card)] text-[length:var(--font-size-body-small)]'

// Broken — Tailwind's stock palette is removed; these do not compile
className = 'bg-white text-black text-[13px] border-gray-200'
```

Notes:

- Tailwind's default palette is intentionally gone. `bg-white` produces no
  CSS — the visible breakage is the point. White is `--color-border-card` /
  `bg-gray-0`; near-black surfaces are `surface-inverse`.
- Bare `border` utilities default to `border-divider`. The soft white card
  outlines this design language uses everywhere are `border-card`.
- Type roles are composite: `text-body-small` sets size + line-height +
  tracking together. Don't re-add `leading-[1.3] tracking-[-0.01em]` by hand;
  override with `leading-normal` etc. only where the design genuinely differs.
- Structural utilities (`flex`, `grid`, `items-center`, `w-full`, breakpoints)
  are fine as-is — tokens are for _design_ values. Tailwind numeric spacing
  (`gap-2`, `p-4`) is acceptable for one-off layout distances; gaps that come
  from the design use the semantic keys (`gap-item-gap`, `p-card-padding`).
- Tier 3 tokens without a preset key are consumed as arbitrary values with
  the _new_ names: `bg-[var(--sidebar-surface)]`, `bg-[image:var(--thumbnail-scrim)]`.
- The visual language is soft and glassy: sage surfaces, translucent whites
  (`surface-overlay/control/field/hover`), hairline `border-card` outlines,
  `shadow-soft`, generous radii. Reach for existing surface roles before
  inventing opacity values.

### Typography

One family for the entire app: **Public Sans** (`--font-family-sans`), loaded
by `@paradoxui/tokens` itself. Components never override the font family —
hierarchy comes from size roles, weight, and color roles. If a Figma frame
appears to use another font (e.g. Inter), that's a design artifact — build it
in Public Sans.

---

## 4. Component requirements (`packages/ui`)

Every primitive must have:

1. **Typed props interface**, exported from the component file and re-exported
   from `src/index.ts` (both component and props type).
2. **Accessibility built in**: correct roles (`tablist`/`tab`, `aria-pressed`
   for toggles, `aria-current` for nav), keyboard navigation (arrow keys for
   composite widgets), and visible focus states (`focus-visible:outline-focus`
   / `ring-focus`).
3. **At least one Storybook story** in `src/stories/`.
4. **Semantic preset classes only** — no hardcoded design values, no raw
   ramps without cause, no garden knowledge.
5. `'use client'` directive only if it uses state, refs, or event handlers.
6. State/tone props use the shared vocabulary: `positive | warning | critical`.

Extend an existing primitive with a variant prop before creating a near
duplicate. Create a new component when the behavior differs, not just the skin.

Existing primitives: Button, Input, SearchField, Card (+Header/Body/Footer),
Badge, Chip, Tabs, Avatar, Spinner, Modal, Toast, Tooltip, Panel,
ChecklistItem, CompanionThumbnail, DetailRow, SeasonalStageRow, StatCard,
MediaCard, Icon.

---

## 5. App-layer conventions (`apps/web`)

- **Server components by default.** Add `'use client'` only where
  interactivity requires it.
- **The app shell** lives in `app/(app)/layout.tsx` — sage page background +
  fixed `AppSidebar`. Every product page goes inside the `(app)` route group.
- **The root page (`/`) is the public landing page** and no longer an
  exception zone. It was the in-progress roadmap page with a self-contained
  CSS module and hardcoded values; since the July 2026 rebuild it is fully
  tokenised like any other screen, so hold it to the same rules.
- **`/design-system` is the living reference** — it renders tokens and
  components straight from the packages and reads resolved values from the
  rendered CSS. When tokens change, it updates itself. Keep it current when
  adding roles or components. It's organized into tabs (Overview, Colors,
  Typography, Spacing & Radius, Components, All Tokens); **All Tokens** is a
  raw, exhaustive audit view — every custom property in `index.css`, grouped
  in file order — use it to check for gaps, not the curated showcase tabs.
- Domain components take domain types as props (`plant: GardenPlant`) and
  translate them into primitive props internally.
- **Photos**: `next/image` with `fill` + `sizes`, assets from
  `apps/web/public/` (`/plants/`, `/textures/`), downscaled to web sizes
  (~800px) before committing.
- **Icons**: never hardcode an `/icons/icon-x.svg` path in a component. Add
  the file to `apps/web/public/icons/`, register it in `apps/web/lib/icons.ts`
  (`icons.someName`), and render it with `<Icon src={icons.someName} />` from
  `@paradoxui/ui`. `Icon` is a plain `<img>` wrapper that forces every icon
  into a consistent `size × size` box via `object-contain`, regardless of the
  source SVG's own proportions — necessary because the icon SVGs (Figma
  export artifacts) carry `preserveAspectRatio="none"` with mismatched
  viewBoxes, so rendering them directly with fixed `width`/`height` distorts
  some and lets others overflow their box. Registering the path also means a
  typo'd or renamed icon fails at compile time instead of 404ing silently.
- Sample/mock data lives in `apps/web/lib/`, typed against `apps/web/types/`,
  structured so Supabase data can replace it 1:1.

### Drawers / slide-in edge panels

`PlantDetailDrawer` and `DiaryDetailDrawer` establish the pattern — follow it
for any future slide-in panel rather than reinventing it:

- **Split the shell from the scroll region.** The header (close button +
  actions) is a `shrink-0` sibling _outside_ the scrollable area, not a
  `position: sticky` child inside it. Sticky-inside-scroll works but is
  fragile (flex `gap` collapses oddly once the gap itself scrolls past, and
  Firefox can visibly flash content above a sticky bar during fast/trackpad
  scrolling). A plain two-sibling column — header, then
  `flex-1 overflow-y-auto` content — sidesteps both and needs no
  `will-change` workarounds.
- **Motion**: a `motion.aside` (`framer-motion`) with
  `initial={{ x: '100%' }}` `animate={{ x: 0 }}` `exit={{ x: '100%' }}`,
  wrapped in `<AnimatePresence>` by the parent so the exit animation plays
  before unmount instead of the element vanishing instantly. Framer Motion
  can't read CSS custom properties, so the transition is a local constant
  that mirrors `--duration-slow` / `--ease-in-out` —
  `{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }` — keep the two in sync by hand
  if those tokens ever change.
- **Shape**: flush against the true viewport edge it slides in from (no
  radius, no border there), `lg:rounded-l-lg` plus a border on the other
  three sides, and `lg:top-2 lg:bottom-2` (not `inset-y-0`) so it floats off
  the top/bottom the way the sidebar does. An edge-attached panel, not a
  floating modal — but not a hard flush rectangle either.

---

## 6. Checklist for building a new screen from Figma

1. Pull the frame's design context via the Figma MCP — but treat its values
   as _input_, not truth: map every color/size/spacing onto existing semantic
   roles first.
2. A value with no matching role → apply rule 2 (§2). Usually the answer is
   an existing role; occasionally it's a new role or tier 3 token added to
   `packages/tokens/index.css` **and** the preset **and** `/design-system`.
3. Export new assets to `apps/web/public/`, downscaled.
4. Identify the pieces: which existing primitives cover it, which new
   _generic_ primitives are needed (build in `packages/ui` with stories), and
   what remains as domain components in `apps/web/components`.
5. Build the page in `app/(app)/<route>/page.tsx`, server-rendered unless it
   needs state. Preset classes only.
6. Verify against the Figma screenshot, run `pnpm typecheck` and the build,
   and grep your diff for `var(--` and stock-palette classes — both signal a
   wrong turn.

## 7. Syncing code → Figma

When the token structure changes, update the Figma Variable collections to
match: **Primitives** (hidden from the design surface), **Semantic** (with
Light mode; Dark added later), **Component** — same names, `/` instead of
`--`. The `/design-system` page is the transcription source.
