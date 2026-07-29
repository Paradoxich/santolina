# Paradox UI — Token Taxonomy

Status: **fully implemented** (2026-07-07) — all four migration steps are
done: new `index.css`, Tailwind preset, every component (packages/ui and
apps/web) migrated to preset classes, and the deprecated alias block deleted.
No old token names exist in code. Remaining: rebuild the Figma Variable
collections from this structure (transcribe from the live `/design-system`
page). Based on the design-system audit of the same date.

---

## The grammar

```
--{category}-{role}-{variant?}-{state?}
```

- **Category** says what kind of value it is: `color`, `font`, `space`, `radius`,
  `shadow`, `duration`, `ease`.
- **Role is always function, never location.** `surface-card` (a role) — not
  `background-close-button` (a location). Location names are banned from tiers 1–2
  and allowed only in tier 3, where they are the point.
- Tier is encoded by vocabulary, not prefix: primitives use **hue/scale names**
  (`green-600`), semantics use **role names** (`accent`), component tokens use
  **component names** (`chip-radius`).

### The two rules that keep the system small

1. **New role vs. new value.** Add a new _semantic role_ only if you can state its
   usage rule in one sentence ("`text-muted` is UI metadata: labels, captions,
   timestamps"). Add a new _value_ (primitive) only if design actually chose one.
   Two roles may share one primitive today and diverge later by re-pointing one
   alias — that divergence-for-free is what the semantic tier is for.
2. **Components consume shared roles, never mint per-component text/surface
   tokens.** Three card components with three text slots each = the same
   title/caption/description roles reused three times, not nine tokens. A
   component token (tier 3) exists only to encode a component-specific _measured
   value_ (a radius, a scrim) or expose a deliberate theming hook — and must
   alias tier 1/2, never introduce a new hue.

---

<!-- tokens:historical: the 2026-07-07 audit snapshot. These values are a
record of what the system looked like that day, including ramps (green, gold,
gray) that no longer exist — they are history, not a claim about today. For
current values see /design-system, which reads them live from :root. The
"Changes since this audit" section at the foot of this file is NOT exempt: a
drift log that goes stale is worse than no drift log. -->

## Tier 1 — Primitives (hue-named ramps; raw values live ONLY here)

Four brand ramps seeded from values already in production (exact steps to be
designed in Figma), plus a `red` ramp for destructive. The stock Tailwind ramps
(`primary`, `secondary`, `neutral`, `success`, `info`) are deleted — the brand
green `#2b6e3f` appears in no current ramp, which is the root defect.

```css
/* Green — brand */
--color-green-100: #d9f0e0; /* was background-benefit-card */
--color-green-200: #b1d7bc; /* was badge-bg */
--color-green-300: #99bd9d; /* was background-active (at full alpha) */
--color-green-600: #386b41; /* was avatar-fill */
--color-green-700: #2b6e3f; /* was accent-primary */
--color-green-950: #020e03; /* was background-inverse */

/* Sage — tinted neutrals for surfaces */
--color-sage-50: #f8f8f8; /* was background-card-subtle */
--color-sage-100: #edf2ee; /* was background-card */
--color-sage-200: #dfe8e1; /* was background-page */
--color-sage-300: #d1e0d3; /* was background-close-button */

/* Gold — warm/warning family */
--color-gold-100: #eee8da; /* was background-caution-card */
--color-gold-700: #9a7b2d; /* was accent-caution */

/* Gray — true neutrals for text */
--color-gray-0: #ffffff;
--color-gray-100: #afafaf; /* was text-faint */
--color-gray-500: #6b6b6b; /* was text-meta et al. (#717171 merges here at the primitive level) */
--color-gray-600: #555555; /* was text-page-subtitle et al. */
--color-gray-900: #111111; /* was text-primary et al. */
```

Non-color primitives (`--spacing-*`, `--font-size-xs…4xl`, `--font-weight-*`,
`--radius-*`, `--shadow-*`, `--duration-*`, `--ease-*`) carry over as-is, plus
two additions that kill literals repeated across 7+ components:

```css
--leading-compact: 1.3;
--tracking-compact: -0.01em;
```

---

## Tier 2 — Semantic (role-named; every value is a `var()` alias)

The layer components consume ~95% of the time, and the only layer a dark mode
or retheme ever touches.

### Text — 7 roles (replaces 29 location-named tokens)

```css
--color-text-primary: var(--color-gray-900);
--color-text-secondary: var(
  --color-gray-600
); /* subtitles, card captions, button labels */
--color-text-body-secondary: var(
  --color-gray-500
); /* supporting CONTENT: descriptions, summaries */
--color-text-muted: var(
  --color-gray-500
); /* UI METADATA: labels, captions, timestamps */
--color-text-faint: var(--color-gray-100);
--color-text-inverse: var(--color-sage-50); /* text over images/dark surfaces */
--color-text-on-accent: var(
  --color-gray-0
); /* text on accent-filled controls */
```

Decision recorded: `body-secondary` (#717171) and `muted` (#6b6b6b) stay
**separate roles sharing one primitive** — the 4% value gap was accidental
drift, but the roles are real (content vs. metadata) and may diverge later.

### Surface

```css
/* Elevation/function axis */
--color-surface-page: var(--color-sage-200);
--color-surface-card: var(--color-sage-100);
--color-surface-subtle: var(--color-sage-50);
--color-surface-sunken: var(
  --color-sage-200
); /* page color used inside a card */
--color-surface-inverse: var(--color-green-950);
--color-surface-field: rgb(255 255 255 / 0.6);
--color-surface-overlay: rgb(255 255 255 / 0.5);

/* Interaction states */
--color-surface-hover: rgb(255 255 255 / 0.3);
--color-surface-active: rgb(153 189 157 / 0.5);
```

### Tone families — the extensible state pattern

Vocabulary: **`positive` / `warning` / `critical` / `info`** (single dialect;
component `tone`/`variant` props migrate to it — `caution` and `success`
survive nowhere). Every tone ships as a fixed four-role kit so the next
stateful component never mints a hex:

```css
--color-surface-warning: var(--color-gold-100);
--color-icon-warning: var(--color-gold-700);
--color-text-warning: var(--color-gold-700); /* darken if contrast demands */
--color-border-warning: var(--color-gold-100);

--color-surface-positive: var(--color-green-100);
--color-icon-positive: var(--color-green-700);
--color-text-positive: var(--color-green-700);
--color-border-positive: var(--color-green-100);

/* critical: same four from the red ramp; info: added when a component needs it */
```

### Accent, border, focus

```css
--color-accent: var(--color-green-700);
--color-accent-muted: var(--color-green-200);
--color-border-card: var(--color-gray-0);
--color-border-divider: #e1e5e2; /* slot into sage ramp when designed */
--color-border-divider-subtle: rgb(225 229 226 / 0.3);
--color-focus-ring: var(--color-green-700);
```

### Typography roles — size and color are separate axes

The old `--text-card-title` conflated a color decision and a size decision.
They decompose: "card title" = `text-primary` (color) × `font-size-heading`
(size) × `semibold` (weight). Size roles:

```css
--font-size-title: 2rem; /* page titles           (was page-title) */
--font-size-stat: 1.5rem; /* big numbers           (was stat-number) */
--font-size-subheading: 1.25rem; /* was the value-named font-size-20 — confirm role during migration */
--font-size-heading: 1.125rem; /* card/drawer titles    (was card-title) */
--font-size-section: 1.0625rem; /* section titles */
--font-size-body: 0.875rem;
--font-size-body-small: 0.8125rem;
--font-size-label: 0.6875rem;
--font-size-micro: 0.5625rem;
```

### Semantic spacing

`--space-tight-gap`, `--space-inline-gap`, `--space-item-gap`, `--space-row-gap`,
`--space-section-gap`, `--space-card-padding`, `--space-section-break` are
already correctly role-named — they re-point at `var(--spacing-N)` primitives.
The stray `--space-8` (duplicate of `--spacing-8`) is deleted.

---

## Tier 3 — Component (sparse; location names welcome; always aliases or measured values)

```css
--chip-radius: var(--radius-full);
--card-dashboard-radius: 1.25rem; /* resolve the 20px-vs-24px comment mismatch against Figma first */
--card-tile-radius: 1.25rem;
--card-row-radius: var(--radius-lg);
--sidebar-surface: rgb(178 209 184 / 0.3);
--avatar-fill: var(--color-green-600);
--thumbnail-scrim: linear-gradient(to top, rgb(0 0 0 / 0.49), rgb(0 0 0 / 0.1));
```

Anti-example: `--color-background-close-button` fails the tier-3 test (it's just
a hue) — it becomes `--color-surface-subtle` or an alias of `sage-300` on the
component that needs it.

---

## Tailwind preset — ships from `@paradoxui/tokens`

`packages/tokens/preset.ts` maps semantic tokens into `theme` (not `extend`),
so Tailwind's default palette is **removed** — every `bg-white`/`text-white`/
`bg-black/50` hardcode in `packages/ui` stops compiling at migration time and
gets flushed out mechanically. Both `tailwind.config.ts` files shrink to
`presets: [paradoxui]` and can no longer drift.

`bg-[var(--color-background-caution-card)]` → `bg-surface-warning`:
autocompletable, and a typo becomes a visible unknown class instead of a
silently-empty CSS variable.

The preset also defines composite type roles via Tailwind's `fontSize` tuples
(`text-heading` = size + line-height + tracking + weight), giving code the same
"text style" concept Figma has — CSS variables alone can't bundle these.

---

## Exception zone: the WIP landing page

`apps/web/app/page.module.css` (santolina.app placeholder) is **exempt from
token rules** — it predates the design system and will be replaced by a real
landing page. Policy: migrate to semantic tokens where one already fits
(surface/page, text roles, accent greens); keep its landing-specific values
(`#fbfcfa`, `#616456`, `#e5e8dc` gradient) hardcoded; **do not mint tokens for
them**. Its type scale may differ from the product's — token font sizes
describe the product UI. Mark the file with an exemption comment. The Switzer
and Instrument Serif `@import`s in `globals.css` are dead (nothing references
either font) and are removed.

---

## What this buys

- **Dark mode** = one override block at tier 2 (`[data-theme='dark'] { … }`).
  The four alpha-white surfaces (`field`, `overlay`, `hover`, plus `active`)
  are the only tokens needing real dark values rather than a re-alias.
- **10x components** add zero text tokens and zero surface hexes; a new state
  is one four-token kit; a genuinely new text role (e.g. an "eyebrow") is added
  once, usable everywhere, gated by the one-sentence rule.
- **External consumers** get `index.css` + the preset + Public Sans loading
  moved into the tokens package (today the app loads it, so outside the
  monorepo fonts silently fall back).
- **Figma stays 1:1**: three Variable collections — Primitives (hidden),
  Semantic (Light/Dark modes), Component — matching the tiers by name.

---

## Migration order

1. Rewrite `packages/tokens/index.css` in this taxonomy, keeping every old name
   as a **deprecated alias** (`--text-page-title: var(--color-text-primary)`) —
   non-breaking on day one.
2. Ship `preset.ts`; point both Tailwind configs at it.
3. Migrate `packages/ui` components to preset classes (the `text-white` sweep
   happens here for free), then app components; align `tone`/`variant` prop
   vocabulary to `positive`/`warning`/`critical`.
4. Delete deprecated aliases and dead ramps; sync final structure to Figma
   Variables.

## Resolved decisions

- `--font-size-20` → `subheading`: confirmed. Its two usages (diary "Plants"
  subsection heading, dashboard insight text) are both 20px display text one
  step under a title.
- `--card-dashboard-radius: 20px`: confirmed deliberate (changed from the
  original 24px).
- Close button surface stays `sage-300` (#d1e0d3); the #d2e0d6 in Figma is
  stale and gets corrected during the Figma rebuild.
- Logo ink unified from raw #000 to `text-primary` (#111); MyPlantsCard image
  gradient unified onto `--thumbnail-scrim` (49%→10%).

<!-- /tokens:historical -->

## Open items

- `critical` tone values await a designed red ramp (placeholder acceptable).
- Figma Variable collections to be rebuilt from this file (Primitives hidden,
  Semantic with Light/Dark modes, Component).

## Changes since this audit

This file is a point-in-time record — it isn't rewritten as the system
evolves. For current values, `/design-system`'s **All Tokens** tab is
authoritative. Notable drift from the snapshot above:

- **New surface token**: `--color-surface-card-translucent` — added for the
  sidebar's active-nav-item highlight, which needed to read against the
  sidebar's own translucent background where `surface-active` (the green wash)
  was already spoken for by the Agent button. **That is no longer what it
  does:** the sidebar highlight moved to its own `--color-surface-nav-active`,
  and `surface-card-translucent` now backs the mobile tab bar's active pill and
  add-note button. Its value lives in `/design-system` — this entry used to
  quote one, and it had drifted from the ramp step it named.
- **Ramp-derived translucent tokens no longer copy their channels.** They use
  relative colour syntax (`rgb(from var(--color-sage-200) r g b / 0.7)`) so the
  ramp step stays the single home for the value. The hand-copied `rgb()`
  triples they replaced had drifted from the steps their comments named; do not
  paste one back in.
- **`--card-tile-radius` / `--card-dashboard-radius` de-duplicated**: both were
  independently hardcoded to `1.25rem`, which is exactly the kind of
  same-value-two-places drift this taxonomy exists to prevent.
  `--card-tile-radius` is now the source; `--card-dashboard-radius: var(--card-tile-radius)`.
  Fix the source once, both move together.
- **Close button surface is no longer `sage-300`**: it now uses
  `bg-surface-control` (the same translucent-white role every other small
  action button in a drawer header uses), so the resolved decision recorded
  above is superseded.
- **New primitives**: `MediaCard` (packages/ui) unifies the plant tile shell
  used across Growing/Planned/Explore. `Icon` (packages/ui) plus an
  `apps/web/lib/icons.ts` registry now own icon rendering — see
  `DESIGN_SYSTEM.md` §5 for the pattern.
