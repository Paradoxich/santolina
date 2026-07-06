# Santolina Design System

How to build UI in this repo. This is the reference for humans and AI agents
alike — read it before adding or changing any visual code.

**Source of truth:** the Santolina Figma file. Design tokens are Figma
variables, synced into `@paradoxui/tokens`. When Figma and code disagree,
Figma wins — update the tokens, don't patch components.

---

## 1. The three layers

```
@paradoxui/tokens   →   @paradoxui/ui   →   apps/web
(CSS variables)         (generic React)     (Santolina product)
```

| Layer          | Package               | Contains                                             | May know about gardens? |
| -------------- | --------------------- | ---------------------------------------------------- | ----------------------- |
| 1 — Tokens     | `packages/tokens`     | CSS custom properties only. Zero dependencies.       | No                      |
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

## 2. Tokens

All tokens live in `packages/tokens/index.css` as CSS custom properties on
`:root`. They come in two kinds:

### Core scales

Generic ramps and scales, mostly used as building blocks and fallbacks:

- `--color-primary-*`, `--color-neutral-*`, `--color-success-*`, etc. (50–950 ramps)
- `--font-size-xs` … `--font-size-4xl`
- `--spacing-1` … `--spacing-24` (4px base unit)
- `--radius-sm` (8px), `--radius-md` (12px), `--radius-lg` (16px), `--radius-xl` (24px), `--radius-full`
- `--shadow-sm/md/lg/soft`, `--duration-*`, `--ease-*`

### Semantic tokens (synced from Figma variables)

These describe _intent_, and are what you should reach for first:

| Category    | Tokens                                                              | Examples                                                                                                    |
| ----------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Backgrounds | `--color-background-*`                                              | `page`, `sidebar`, `overlay`, `subtle`, `active`, `card-subtle`                                             |
| Accents     | `--color-accent-primary`, `--color-badge-bg`, `--color-avatar-fill` | the greens                                                                                                  |
| Text        | `--text-*`                                                          | `page-title`, `page-subtitle`, `meta`, `card-title`, `card-caption`, `chip-label`, `nav-label`              |
| Type sizes  | `--font-size-*`                                                     | `page-title` (32), `card-title` (18), `body` (14), `body-small` (13), `label` (11), `logo` (16)             |
| Spacing     | `--space-*`                                                         | `tight-gap` (4), `inline-gap` (8), `item-gap` (12), `row-gap` (16), `section-gap` (20), `card-padding` (24) |
| Component   | `--component-*`                                                     | `chip-radius`, `card-dashboard-radius` (24)                                                                 |

Naming maps 1:1 from Figma: the variable `color/background/page` becomes
`--color-background-page`, `space/item-gap` becomes `--space-item-gap`.

### Rules

1. **Never hardcode** a color, font size, spacing, or radius value in a
   component. If the value you need doesn't exist as a token, add it to
   `packages/tokens/index.css` first (and ideally as a Figma variable too).
2. Prefer semantic tokens (`--text-card-title`) over raw ramps
   (`--color-neutral-900`). Use ramps only when no semantic token fits.
3. Component-specific values (like the dashboard card's 24px radius) get
   `--component-<name>-<property>` tokens.

### Syncing from Figma

When new designs land:

1. Select the frame in Figma Desktop and pull variables through the Figma MCP
   (`get_variable_defs`).
2. Add/update the semantic section of `packages/tokens/index.css`, converting
   `slash/names` to `--kebab-case`.
3. Export any new assets (photos, icons, textures) into `apps/web/public/`.
   Downscale photos to web sizes (~800px wide) before committing.

---

## 3. Typography

One family for the entire app: **Public Sans** (`--font-family-sans`), loaded
via Google Fonts in `apps/web/styles/globals.css`. The body element sets it
globally — components should never override the font family. Hierarchy comes
from size, weight, and color, not from switching typefaces.

If a Figma frame appears to use another font (e.g. Inter), that's a design
artifact — build it in Public Sans.

Use the semantic size tokens; don't invent sizes. Page titles get tight
tracking (`tracking-[-0.04em]`), matching Figma.

---

## 4. Styling pattern

Tailwind CSS with **arbitrary values referencing tokens**. This is the house
style in both `packages/ui` and `apps/web`:

```tsx
// Good — tokens via CSS variables
className="bg-[var(--color-background-subtle)] text-[var(--text-chip-label)]
           text-[length:var(--font-size-body-small)] p-[var(--space-card-padding)]
           rounded-[var(--component-chip-radius)]"

// Bad — hardcoded values
className="bg-white/70 text-[#111] text-[13px] p-6 rounded-full"
```

Notes:

- Font sizes need the `length:` prefix: `text-[length:var(--font-size-body)]`.
- Structural utilities (`flex`, `grid`, `items-center`, `relative`, `w-full`,
  breakpoint prefixes) are fine as-is — tokens are for _design_ values.
- Tailwind's own spacing utilities (`gap-2`, `mt-6`) are acceptable for
  one-off layout distances in the app, but gaps that come from the design
  should use the `--space-*` tokens.
- The visual language is soft and glassy: translucent whites over the sage
  page background, hairline white borders, `--shadow-soft`, generous radii.
  Reach for the existing background tokens before inventing new opacity values.

---

## 5. Component requirements (`packages/ui`)

Every primitive must have:

1. **Typed props interface**, exported from the component file and re-exported
   from `src/index.ts` (both component and props type).
2. **Accessibility built in**: correct roles (`tablist`/`tab`, `aria-pressed`
   for toggles, `aria-current` for nav), keyboard navigation (arrow keys for
   composite widgets), and visible focus states
   (`focus-visible:outline-[var(--color-accent-primary)]`).
3. **At least one Storybook story** in `src/stories/`.
4. **Tokens only** — no hardcoded design values, no garden knowledge.
5. `'use client'` directive only if it uses state, refs, or event handlers.

Extend an existing primitive with a variant prop before creating a near
duplicate. Create a new component when the behavior differs, not just the
skin.

Existing primitives: Button, Input, SearchField, Card (+Header/Body/Footer),
Badge, Chip, Tabs, Avatar, Spinner, Modal, Toast, Tooltip, ChecklistItem,
CompanionThumbnail, DetailRow, SeasonalStageRow, StatCard.

---

## 6. App-layer conventions (`apps/web`)

- **Server components by default.** Add `'use client'` only where
  interactivity requires it (the `/garden` page is client because of tab and
  filter state).
- **The app shell** lives in `app/(app)/layout.tsx` — sage page background +
  fixed `AppSidebar`. Every product page goes inside the `(app)` route group
  so it inherits the shell.
- **The root page (`/`) is the in-progress landing page.** It is deliberately
  self-contained (CSS module, hardcoded values, no tokens) so design-system
  changes never affect it. Leave it alone until launch, then swap it.
- Domain components take domain types as props (`plant: GardenPlant`) and
  translate them into primitive props internally.
- Images: use `next/image` with `fill` + `sizes` for photos, assets from
  `apps/web/public/` (`/plants/`, `/icons/`, `/textures/`).
- Sample/mock data lives in `apps/web/lib/` and is typed against
  `apps/web/types/` — structured so Supabase data can replace it 1:1.

---

## 7. Checklist for building a new screen from Figma

1. Select the frame in Figma Desktop; pull design context and variables via
   the Figma MCP.
2. Diff the variables against `packages/tokens/index.css`; add anything new.
3. Export new assets to `apps/web/public/`, downscaled.
4. Identify the pieces: which existing primitives cover it, which new
   _generic_ primitives are needed (build those in `packages/ui` with stories),
   and what remains as domain components in `apps/web/components`.
5. Build the page in `app/(app)/<route>/page.tsx`, server-rendered unless it
   needs state.
6. Verify against the Figma screenshot side by side, run
   `pnpm typecheck`, and check the landing page at `/` still renders
   untouched.
