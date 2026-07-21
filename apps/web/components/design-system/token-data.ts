export type TokenKind =
  | 'color'
  | 'shadow'
  | 'radius'
  | 'space'
  | 'weight'
  | 'family'
  | 'none'

export interface TokenEntry {
  name: string
  kind: TokenKind
}

export interface TokenGroup {
  title: string
  entries: TokenEntry[]
}

export interface TokenTier {
  tier: string
  intro: string
  groups: TokenGroup[]
}

const c = (...names: string[]): TokenEntry[] =>
  names.map((name) => ({ name, kind: 'color' }))
const rampNames = (hue: string): string[] =>
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(
    (step) => `--color-${hue}-${step}`
  )
const sp = (...names: string[]): TokenEntry[] =>
  names.map((name) => ({ name, kind: 'space' }))
const r = (...names: string[]): TokenEntry[] =>
  names.map((name) => ({ name, kind: 'radius' }))
const sh = (...names: string[]): TokenEntry[] =>
  names.map((name) => ({ name, kind: 'shadow' }))
const w = (...names: string[]): TokenEntry[] =>
  names.map((name) => ({ name, kind: 'weight' }))
const f = (...names: string[]): TokenEntry[] =>
  names.map((name) => ({ name, kind: 'family' }))
const n = (...names: string[]): TokenEntry[] =>
  names.map((name) => ({ name, kind: 'none' }))

/** Every custom property defined in packages/tokens/index.css, grouped and
 * ordered to match the source file exactly — this is a raw audit reference,
 * not a curated showcase. If a token exists in code, it exists here. */
export const allTokens: TokenTier[] = [
  {
    tier: 'Tier 1 — Primitives',
    intro:
      'Hue/scale names. Raw values live only here — everything else aliases these.',
    groups: [
      {
        title: 'White',
        entries: c('--color-white'),
      },
      {
        title: 'Sage — neutral (surfaces to text)',
        entries: c(...rampNames('sage')),
      },
      {
        title: 'Fern — brand accent',
        entries: c(...rampNames('fern')),
      },
      {
        title: 'Honey — warning',
        entries: c(...rampNames('honey')),
      },
      {
        title: 'Brick — critical',
        entries: c(...rampNames('brick')),
      },
      {
        title: 'Font families',
        entries: f(
          '--font-family-sans',
          '--font-family-serif',
          '--font-family-mono'
        ),
      },
      {
        title: 'Font size scale',
        entries: n(
          '--font-size-xs',
          '--font-size-sm',
          '--font-size-md',
          '--font-size-lg',
          '--font-size-xl',
          '--font-size-2xl',
          '--font-size-3xl',
          '--font-size-4xl'
        ),
      },
      {
        title: 'Font weights',
        entries: w(
          '--font-weight-thin',
          '--font-weight-light',
          '--font-weight-normal',
          '--font-weight-medium',
          '--font-weight-semibold',
          '--font-weight-bold',
          '--font-weight-extrabold',
          '--font-weight-black'
        ),
      },
      {
        title: 'Line heights',
        entries: n(
          '--line-height-none',
          '--line-height-tight',
          '--line-height-compact',
          '--line-height-snug',
          '--line-height-normal',
          '--line-height-relaxed',
          '--line-height-loose'
        ),
      },
      {
        title: 'Letter spacing',
        entries: n('--tracking-compact', '--tracking-heading'),
      },
      {
        title: 'Spacing scale (4px base unit)',
        entries: sp(
          '--spacing-0',
          '--spacing-1',
          '--spacing-2',
          '--spacing-3',
          '--spacing-4',
          '--spacing-5',
          '--spacing-6',
          '--spacing-7',
          '--spacing-8',
          '--spacing-9',
          '--spacing-10',
          '--spacing-11',
          '--spacing-12',
          '--spacing-14',
          '--spacing-16',
          '--spacing-18',
          '--spacing-20',
          '--spacing-22',
          '--spacing-24'
        ),
      },
      {
        title: 'Border radius',
        entries: r(
          '--radius-xs',
          '--radius-sm',
          '--radius-md',
          '--radius-lg',
          '--radius-xl',
          '--radius-full'
        ),
      },
      {
        title: 'Shadows',
        entries: sh(
          '--shadow-sm',
          '--shadow-md',
          '--shadow-lg',
          '--shadow-soft'
        ),
      },
      {
        title: 'Motion',
        entries: n(
          '--duration-fast',
          '--duration-normal',
          '--duration-slow',
          '--ease-linear',
          '--ease-in',
          '--ease-out',
          '--ease-in-out',
          '--ease-spring'
        ),
      },
      {
        title: 'Breakpoints (reference only — unusable in media queries)',
        entries: n(
          '--breakpoint-sm',
          '--breakpoint-md',
          '--breakpoint-lg',
          '--breakpoint-xl',
          '--breakpoint-2xl'
        ),
      },
    ],
  },
  {
    tier: 'Tier 2 — Semantic',
    intro:
      'Role names. Consumed by components ~95% of the time — this is where dark mode overrides live.',
    groups: [
      {
        title: 'Text roles',
        entries: c(
          '--color-text-primary',
          '--color-text-secondary',
          '--color-text-body-secondary',
          '--color-text-muted',
          '--color-text-faint',
          '--color-text-inverse',
          '--color-text-on-accent'
        ),
      },
      {
        title: 'Surface roles',
        entries: c(
          '--color-surface-page',
          '--color-surface-card',
          '--color-surface-drawer',
          '--color-surface-subtle',
          '--color-surface-inset',
          '--color-surface-inverse',
          '--color-surface-field',
          '--color-surface-overlay',
          '--color-surface-control',
          '--color-surface-hover',
          '--color-surface-row-hover',
          '--color-surface-active',
          '--color-surface-card-translucent',
          '--color-scrim'
        ),
      },
      {
        title: 'Tone kits — positive',
        entries: c(
          '--color-surface-positive',
          '--color-icon-positive',
          '--color-text-positive',
          '--color-border-positive'
        ),
      },
      {
        title: 'Tone kits — warning',
        entries: c(
          '--color-surface-warning',
          '--color-icon-warning',
          '--color-text-warning',
          '--color-border-warning'
        ),
      },
      {
        title: 'Tone kits — critical',
        entries: c(
          '--color-surface-critical',
          '--color-icon-critical',
          '--color-text-critical',
          '--color-border-critical'
        ),
      },
      {
        title: 'Solid fills',
        entries: c(
          '--color-fill-positive',
          '--color-fill-warning',
          '--color-fill-critical',
          '--color-fill-critical-hover'
        ),
      },
      {
        title: 'Accent',
        entries: c(
          '--color-accent',
          '--color-accent-hover',
          '--color-accent-muted'
        ),
      },
      {
        title: 'Borders',
        entries: c(
          '--color-border-card',
          '--color-border-card-translucent',
          '--color-border-divider',
          '--color-border-divider-subtle'
        ),
      },
      {
        title: 'Focus',
        entries: c('--color-focus-ring'),
      },
      {
        title: 'Typography roles (composite type sizes)',
        entries: n(
          '--font-size-title',
          '--font-size-stat',
          '--font-size-subheading',
          '--font-size-heading',
          '--font-size-section',
          '--font-size-body',
          '--font-size-body-small',
          '--font-size-label',
          '--font-size-micro'
        ),
      },
      {
        title: 'Spacing roles',
        entries: sp(
          '--space-tight-gap',
          '--space-inline-gap',
          '--space-item-gap',
          '--space-row-gap',
          '--space-section-gap',
          '--space-card-padding',
          '--space-section-break'
        ),
      },
    ],
  },
  {
    tier: 'Tier 3 — Component',
    intro:
      'Sparse and component-named. Must alias tier 1/2 or encode a measured value — never a new hue.',
    groups: [
      {
        title: 'Radii',
        entries: r(
          '--chip-radius',
          '--card-tile-radius',
          '--card-dashboard-radius',
          '--card-row-radius'
        ),
      },
      {
        title: 'Surfaces & fills',
        entries: c('--sidebar-surface', '--avatar-fill'),
      },
      {
        title: 'Effects',
        entries: n('--thumbnail-scrim'),
      },
    ],
  },
]
