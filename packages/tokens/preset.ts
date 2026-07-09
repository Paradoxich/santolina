import type { Config } from 'tailwindcss'

/**
 * @paradoxui/tokens Tailwind preset.
 *
 * Maps the token CSS custom properties (index.css) into the Tailwind theme
 * so utilities and raw CSS stay in sync by construction. Consumers add:
 *
 *   presets: [require('@paradoxui/tokens/preset')]
 *
 * `theme` keys here REPLACE Tailwind defaults on purpose: the stock palette
 * is removed so hardcodes like `bg-white` fail visibly instead of shipping
 * off-system colors. Escape hatch for genuinely new needs: the primitive
 * ramps (e.g. `bg-green-200`) — but reach for a semantic role first.
 *
 * Naming: utilities read as roles — `text-primary`, `bg-surface-card`,
 * `border-divider`, `ring-focus` — matching docs/token-taxonomy.md.
 */

const ramps = {
  transparent: 'transparent',
  current: 'currentColor',
  inherit: 'inherit',
  green: {
    100: 'var(--color-green-100)',
    200: 'var(--color-green-200)',
    300: 'var(--color-green-300)',
    600: 'var(--color-green-600)',
    700: 'var(--color-green-700)',
    950: 'var(--color-green-950)',
  },
  sage: {
    50: 'var(--color-sage-50)',
    100: 'var(--color-sage-100)',
    150: 'var(--color-sage-150)',
    200: 'var(--color-sage-200)',
    300: 'var(--color-sage-300)',
  },
  gold: {
    100: 'var(--color-gold-100)',
    700: 'var(--color-gold-700)',
  },
  gray: {
    0: 'var(--color-gray-0)',
    100: 'var(--color-gray-100)',
    500: 'var(--color-gray-500)',
    600: 'var(--color-gray-600)',
    900: 'var(--color-gray-900)',
  },
  red: {
    100: 'var(--color-red-100)',
    500: 'var(--color-red-500)',
    600: 'var(--color-red-600)',
    700: 'var(--color-red-700)',
  },
}

const preset = {
  content: [],
  theme: {
    colors: ramps,
    textColor: {
      ...ramps,
      primary: 'var(--color-text-primary)',
      secondary: 'var(--color-text-secondary)',
      'body-secondary': 'var(--color-text-body-secondary)',
      muted: 'var(--color-text-muted)',
      faint: 'var(--color-text-faint)',
      inverse: 'var(--color-text-inverse)',
      'on-accent': 'var(--color-text-on-accent)',
      positive: 'var(--color-text-positive)',
      warning: 'var(--color-text-warning)',
      critical: 'var(--color-text-critical)',
      icon: {
        positive: 'var(--color-icon-positive)',
        warning: 'var(--color-icon-warning)',
        critical: 'var(--color-icon-critical)',
      },
      accent: 'var(--color-accent)',
    },
    backgroundColor: {
      ...ramps,
      surface: {
        page: 'var(--color-surface-page)',
        card: 'var(--color-surface-card)',
        subtle: 'var(--color-surface-subtle)',
        sunken: 'var(--color-surface-sunken)',
        inverse: 'var(--color-surface-inverse)',
        field: 'var(--color-surface-field)',
        overlay: 'var(--color-surface-overlay)',
        control: 'var(--color-surface-control)',
        hover: 'var(--color-surface-hover)',
        active: 'var(--color-surface-active)',
        'card-translucent': 'var(--color-surface-card-translucent)',
        positive: 'var(--color-surface-positive)',
        warning: 'var(--color-surface-warning)',
        critical: 'var(--color-surface-critical)',
      },
      scrim: 'var(--color-scrim)',
      avatar: 'var(--avatar-fill)',
      accent: {
        DEFAULT: 'var(--color-accent)',
        hover: 'var(--color-accent-hover)',
        muted: 'var(--color-accent-muted)',
      },
      fill: {
        positive: 'var(--color-fill-positive)',
        warning: 'var(--color-fill-warning)',
        critical: 'var(--color-fill-critical)',
        'critical-hover': 'var(--color-fill-critical-hover)',
      },
    },
    borderColor: {
      ...ramps,
      /* Preflight + bare `border-*` classes fall back to this. Without it,
       * Tailwind uses currentColor and borders render as text-black. */
      DEFAULT: 'var(--color-border-divider)',
      card: {
        DEFAULT: 'var(--color-border-card)',
        translucent: 'var(--color-border-card-translucent)',
      },
      divider: {
        DEFAULT: 'var(--color-border-divider)',
        subtle: 'var(--color-border-divider-subtle)',
      },
      positive: 'var(--color-border-positive)',
      warning: 'var(--color-border-warning)',
      critical: 'var(--color-border-critical)',
      accent: 'var(--color-accent)',
    },
    ringColor: {
      ...ramps,
      focus: 'var(--color-focus-ring)',
      critical: 'var(--color-fill-critical)',
    },
    outlineColor: {
      ...ramps,
      focus: 'var(--color-focus-ring)',
    },
    fontFamily: {
      sans: ['var(--font-family-sans)'],
      serif: ['var(--font-family-serif)'],
      mono: ['var(--font-family-mono)'],
    },
    fontSize: {
      /* primitive scale */
      xs: 'var(--font-size-xs)',
      sm: 'var(--font-size-sm)',
      base: 'var(--font-size-md)',
      lg: 'var(--font-size-lg)',
      xl: 'var(--font-size-xl)',
      '2xl': 'var(--font-size-2xl)',
      '3xl': 'var(--font-size-3xl)',
      '4xl': 'var(--font-size-4xl)',
      /* type roles — composite "text styles" (size + leading + tracking) */
      title: [
        'var(--font-size-title)',
        { lineHeight: 'var(--line-height-tight)' },
      ],
      stat: [
        'var(--font-size-stat)',
        { lineHeight: 'var(--line-height-tight)' },
      ],
      subheading: [
        'var(--font-size-subheading)',
        { lineHeight: 'var(--line-height-tight)' },
      ],
      heading: [
        'var(--font-size-heading)',
        { lineHeight: 'var(--line-height-tight)' },
      ],
      section: [
        'var(--font-size-section)',
        {
          lineHeight: 'var(--line-height-tight)',
          letterSpacing: 'var(--tracking-heading)',
        },
      ],
      body: [
        'var(--font-size-body)',
        { lineHeight: 'var(--line-height-compact)' },
      ],
      'body-small': [
        'var(--font-size-body-small)',
        {
          lineHeight: 'var(--line-height-compact)',
          letterSpacing: 'var(--tracking-compact)',
        },
      ],
      label: [
        'var(--font-size-label)',
        { lineHeight: 'var(--line-height-normal)' },
      ],
      micro: [
        'var(--font-size-micro)',
        { lineHeight: 'var(--line-height-normal)' },
      ],
    },
    borderRadius: {
      none: '0',
      DEFAULT: 'var(--radius-xs)',
      xs: 'var(--radius-xs)',
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      full: 'var(--radius-full)',
      /* component tier */
      chip: 'var(--chip-radius)',
      'card-dashboard': 'var(--card-dashboard-radius)',
      'card-tile': 'var(--card-tile-radius)',
      'card-row': 'var(--card-row-radius)',
    },
    boxShadow: {
      none: 'none',
      sm: 'var(--shadow-sm)',
      DEFAULT: 'var(--shadow-md)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
      soft: 'var(--shadow-soft)',
    },
    transitionDuration: {
      DEFAULT: 'var(--duration-normal)',
      fast: 'var(--duration-fast)',
      normal: 'var(--duration-normal)',
      slow: 'var(--duration-slow)',
    },
    transitionTimingFunction: {
      DEFAULT: 'var(--ease-in-out)',
      linear: 'var(--ease-linear)',
      in: 'var(--ease-in)',
      out: 'var(--ease-out)',
      'in-out': 'var(--ease-in-out)',
      spring: 'var(--ease-spring)',
    },
    extend: {
      spacing: {
        'tight-gap': 'var(--space-tight-gap)',
        'inline-gap': 'var(--space-inline-gap)',
        'item-gap': 'var(--space-item-gap)',
        'row-gap': 'var(--space-row-gap)',
        'section-gap': 'var(--space-section-gap)',
        'card-padding': 'var(--space-card-padding)',
        'section-break': 'var(--space-section-break)',
      },
      lineHeight: {
        compact: 'var(--line-height-compact)',
      },
      letterSpacing: {
        compact: 'var(--tracking-compact)',
        heading: 'var(--tracking-heading)',
      },
    },
  },
} satisfies Config

export default preset
