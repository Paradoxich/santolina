# Santolina Design System

How to build UI in this repo. This is the reference for humans and AI agents
alike — read it before adding or changing any visual code.

**Source of truth: the code.** Tokens live in `packages/tokens/index.css`,
named by the grammar in the tokens section below, and rendered live at
`/design-system` in the app. There is no Figma counterpart yet — see the
final section, Syncing code → Figma.

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

Live visual reference: `/design-system` in the running app. Names follow one
grammar — `--{category}-{role}-{variant?}-{state?}` — where category says what
kind of value it is (`color`, `font`, `space`, `radius`, `shadow`, `duration`,
`ease`), and the tier is encoded by vocabulary, not prefix:

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

### No token copies another token's channels

**Rule 6, added July 29 2026, and it is mechanically checked.** A translucent
token must not re-type the RGB channels of the token it is derived from. Write
it in relative colour syntax so the derivation is real rather than remembered:

```css
--surface-card-translucent: rgb(from var(--color-sage-200) r g b / 0.6);
```

Twelve translucent tokens were converted at once. Eleven computed
byte-identical to the literals they replaced; the twelfth,
`surface-card-translucent`, had **already drifted** from the colour it claimed
to be, and only tracks sage-200 now because the derivation replaced the copy.
That is the whole argument — a copy does not announce when it stops matching.

**`pnpm tokens:check` enforces it**, and runs in CI on `pull_request` (a pure
source scan with no secrets, unlike the main-only database jobs). Four checks:
**A** no token value appears in prose (`docs/` plus the root-level docs),
**B** no token re-types another's channels — including literals buried inside
compound values like gradients (black excepted: it is `--color-scrim`'s own
value, and shadows legitimately compose it), **C** the `/design-system` list
and `index.css` cover each other in both directions, **D** every colour in
`/public/icons` is a current token value (the `weather-*` set excepted — see
the icon checklist). `token-consumers.generated.ts` is generated by walking the real
Tailwind preset, so no document has to claim where a token is used — and it is
prettier-ignored, because reformatting it would make the staleness diff a
permanent false alarm.

**Historical token values stay legal behind an explicit marker.** A doc that
deliberately records old values wraps them in
`<!-- tokens:historical: reason -->` … `<!-- /tokens:historical -->`. Explicit
rather than inferred. (The 2026-07-07 migration snapshot that used it,
`docs/token-taxonomy.md`, was deleted July 2026 — git history keeps it; its
hand-maintained drift log had already gone stale once, which is this rule's
whole argument.)

**Check B's first version was a false guard, and this is why the rule exists.**
It scanned _comments_ for literals and went green against a faithful
reproduction of the real bug — the literal sits in the declaration, the comment
only mislabels it. It was checking the symptom. Rewritten to compare channels it
immediately found **six live copies**, including `border-divider-subtle`
re-typing sage-300 one line below the `var()` form of the same colour; check C
found **18 tokens** missing from a list whose own comment claimed "if a token
exists in code, it exists here". **A guard that has never failed has not been
tested.**

**Known limit, stated so nobody over-trusts it:** an _already-drifted_ copy
matches no primitive and is invisible to check B. It closes the path, not the
state — safe only because every pre-existing copy was eliminated in the same
change.

### Settled colour rulings — do not re-litigate

These were decided by Ana with the trade-offs on the table. Reopening them needs
a new reason, not a fresh opinion.

- **`--sidebar-surface` derives from sage-200.** The mobile tab bar is
  deliberately lighter and much less green than the raw literal it replaced.
  Looked at and approved.
- **The login placeholder stays on `text-faint`**, knowing it measures ~1.9:1
  against the field and that 4.5:1 would need `text-muted`. A placeholder that
  passes contrast reads almost as strongly as real input, which defeats the
  point of a placeholder.
- **`sage-200` moved lighter** in July 2026, so contrast improves marginally.
  The value itself lives in `packages/tokens/index.css` and is deliberately not
  repeated here — see rule 6.
- **`--login-hairline` is retired.** It was never a hairline, its only consumer
  was the login placeholder (now `text-faint`), and its comment named `gray-900`,
  a ramp deleted in July.
- **`--color-scrim`'s black is the last raw colour in the token file**, and it
  legitimately is its own value rather than an alias.

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
className = 'text-black text-[13px] border-gray-200'
```

Notes:

- Tailwind's default palette is intentionally gone, so `text-black` and
  `border-gray-200` produce no CSS — the visible breakage is the point. White
  is the one stock name kept: `bg-white` / `--color-white`. Near-black surfaces
  are `surface-inverse`.
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

The current primitives are whatever `packages/ui/src/index.ts` exports. That
list is not copied here; a copied list goes stale and this one had.

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

### Icon export checklist (Figma → `/public/icons`)

Icons render through `Icon`, a plain `<img>` wrapper — so whatever the SVG
file contains is exactly what ships. Nothing in the pipeline catches a bad
export, so check each of these before committing (origin incident:
`weather-partly-cloudy.svg` shipped with baked-in frame artwork and stale
surface hexes, fixed in `eb4b922`):

- **Export the glyph, not its Figma frame.** Selecting the frame bakes in
  surrounding artwork: background rects, drop-shadow filters, clip paths with
  off-viewBox geometry. The file should contain only the glyph's paths —
  delete any `<defs>` (filters, clipPaths) the paths don't reference.
- **Transparent background.** No background rect, no hardcoded surface hexes.
  The icon must sit on any surface token without carrying its own.
- **No off-viewBox paths.** Every path lives inside the `viewBox`; anything
  outside it is frame residue.
- **Root attributes**: `width="100%" height="100%" overflow="visible"`, to
  match the existing weather icons. Fixed pixel width/height fights `Icon`'s
  `object-contain` sizing.
- **Strip `var(--stroke-0, #hex)` wrappers.** Figma exports them, but CSS
  custom properties never resolve inside an `<img>` — the fallback hex is
  what renders, so keep just the hex.
- **Stroke/fill hexes must be current token values, written as plain hexes.**
  An `<img>`-loaded SVG can't reference tokens, so each hex is a frozen copy
  of one. `pnpm tokens:check` verifies every icon colour against `index.css`
  (check D), so a ramp move now fails the build instead of going stale
  silently. The `weather-*.svg` icons are exempt by design: they are
  illustrations with their own fixed palette (sun yellow, rain blue), not UI
  glyphs, and check D skips them.

### Drawers / slide-in edge panels

Use the `Drawer` and `DrawerSection` primitives from `packages/ui`. Every
slide-in panel in the app is built on them — `PlantDetailDrawer`,
`CareTipsDrawer`, `ReferenceDrawer` — so a new one should not rebuild the
shell. Three decisions are baked into the primitive and worth knowing before
changing it:

- **The shell is split from the scroll region.** The header is a `shrink-0`
  sibling _outside_ the scrollable area, not a `position: sticky` child inside
  it. Sticky-inside-scroll works but is fragile: flex `gap` collapses oddly
  once the gap scrolls past, and Firefox can flash content above a sticky bar
  during trackpad scrolling. A two-sibling column needs no `will-change`
  workarounds.
- **The kit carries no framer-motion dependency.** Motion is injected by the
  app through `panelComponent={motion.aside}` and `panelProps={DRAWER_MOTION}`.
  Framer Motion cannot read CSS custom properties, so `DRAWER_MOTION`
  (`apps/web/lib/drawer-motion.ts`) mirrors `--duration-slow` and
  `--ease-in-out` by hand and is the single place to change if those move.
  Exit animation needs the caller to wrap the drawer in `<AnimatePresence>`.
- **It is an edge-attached panel, not a floating modal.** Flush against the
  viewport edge it slides from, rounded and bordered on the other three sides,
  and floating off the top and bottom the way the sidebar does.

---

## 6. Checklist for building a new screen from Figma

1. Pull the frame's design context via the Figma MCP — but treat its values
   as _input_, not truth: map every color/size/spacing onto existing semantic
   roles first.
2. A value with no matching role → apply rule 2 above. Usually the answer is
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

Not a live workflow: the final token system does not exist in Figma yet, so
nothing is kept in sync today — code is the only home. When the Figma library
is built, transcribe it from `/design-system` as three Variable collections —
**Primitives** (hidden from the design surface), **Semantic** (with Light
mode; Dark added later), **Component** — same names, `/` instead of `--`.
