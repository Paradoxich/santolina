import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Class-name merge for the kit.
 *
 * `cn(base, override)` joins conditional class values (via clsx) and then
 * resolves Tailwind conflicts (via tailwind-merge) so the LAST class wins.
 * Two things this buys us:
 *
 *   1. Consumer overrides work. `cn('p-card-padding', props.className)` lets a
 *      caller pass `className="p-8"` and actually get 8, instead of both
 *      classes landing in the DOM and CSS source order deciding.
 *   2. It fixes the latent clobber bug: a component that did
 *      `<div className={base} {...props}>` silently let `props.className`
 *      REPLACE `base` (React keeps the last `className`). `cn(base, className)`
 *      merges them.
 *
 * tailwind-merge only knows Tailwind's stock scale by default, and this kit
 * replaces that scale with the semantic one from `@paradoxui/tokens`
 * (`p-card-padding`, `rounded-chip`, `text-body-small`, `bg-surface-card`…).
 * The config below registers those custom scales so conflicts between them —
 * and between them and stock utilities — are resolved correctly. Keep the
 * lists in sync with `packages/tokens/preset.ts` if its custom keys change.
 */

// --- custom scales mirrored from packages/tokens/preset.ts -----------------

const SPACING = [
  'tight-gap',
  'inline-gap',
  'item-gap',
  'row-gap',
  'section-gap',
  'card-padding',
  'section-break',
]

const BORDER_RADIUS = ['chip', 'card-dashboard', 'card-tile', 'card-row']

// Composite type-role scale (text-body-small, text-heading, …). Registered as
// font-size so it never collides with the semantic text COLOUR roles below.
const FONT_SIZE = [
  'title',
  'stat',
  'subheading',
  'heading',
  'section',
  'body',
  'body-small',
  'label',
  'micro',
]

// Colour role leaves (the token after the utility prefix): bg-surface-card,
// text-muted, border-card, ring-focus. Registered under the shared `colors`
// theme key so bg-/text-/border-/ring- all recognise them.
const COLORS = [
  // surfaces
  'surface-page',
  'surface-card',
  'surface-subtle',
  'surface-inset',
  'surface-drawer',
  'surface-inverse',
  'surface-field',
  'surface-overlay',
  'surface-control',
  'surface-hover',
  'surface-row-hover',
  'surface-active',
  'surface-card-translucent',
  'surface-positive',
  'surface-warning',
  'surface-critical',
  'scrim',
  'avatar',
  'accent',
  'accent-hover',
  'accent-muted',
  'fill-positive',
  'fill-warning',
  'fill-critical',
  'fill-critical-hover',
  // text
  'primary',
  'secondary',
  'body-secondary',
  'muted',
  'faint',
  'inverse',
  'on-accent',
  'positive',
  'warning',
  'critical',
  'icon-positive',
  'icon-warning',
  'icon-critical',
  // border
  'card',
  'card-translucent',
  'divider',
  'divider-subtle',
  // ring / outline
  'focus',
]

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: SPACING,
      borderRadius: BORDER_RADIUS,
      colors: COLORS,
    },
    classGroups: {
      'font-size': [{ text: FONT_SIZE }],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
