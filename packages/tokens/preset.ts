import type { Config } from 'tailwindcss'

/**
 * @paradoxui/tokens Tailwind preset.
 *
 * Maps the token CSS custom properties (index.css) into the Tailwind theme
 * so utilities and raw CSS stay in sync by construction. Consumers add:
 *
 *   import preset from '@paradoxui/tokens/preset'
 *   // ...
 *   presets: [preset]
 *
 * `theme` keys here REPLACE Tailwind defaults on purpose: the stock palette
 * is removed so hardcodes like `bg-white` fail visibly instead of shipping
 * off-system colors. Escape hatch for genuinely new needs: the primitive
 * ramps (e.g. `bg-fern-200`) — but reach for a semantic role first.
 *
 * Naming: utilities read as roles — `text-primary`, `bg-surface-card`,
 * `border-divider`, `ring-focus` — matching DESIGN_SYSTEM.md §2.
 */

const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

const ramp = (hue: string) =>
  Object.fromEntries(steps.map((s) => [s, `var(--color-${hue}-${s})`]))

const ramps = {
  transparent: 'transparent',
  current: 'currentColor',
  inherit: 'inherit',
  white: 'var(--color-white)',
  sage: ramp('sage'),
  fern: ramp('fern'),
  honey: ramp('honey'),
  brick: ramp('brick'),
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
        drawer: 'var(--color-surface-drawer)',
        subtle: 'var(--color-surface-subtle)',
        illustration: 'var(--color-surface-illustration)',
        inset: 'var(--color-surface-inset)',
        inverse: 'var(--color-surface-inverse)',
        field: 'var(--color-surface-field)',
        overlay: 'var(--color-surface-overlay)',
        control: 'var(--color-surface-control)',
        hover: 'var(--color-surface-hover)',
        'row-hover': 'var(--color-surface-row-hover)',
        active: 'var(--color-surface-active)',
        'card-translucent': 'var(--color-surface-card-translucent)',
        'nav-active': 'var(--color-surface-nav-active)',
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
      toast: {
        neutral: 'var(--color-toast-surface-neutral)',
        positive: 'var(--color-toast-surface-positive)',
        warning: 'var(--color-toast-surface-warning)',
        critical: 'var(--color-toast-surface-critical)',
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
      placeholder: 'var(--color-border-placeholder)',
      positive: 'var(--color-border-positive)',
      warning: 'var(--color-border-warning)',
      critical: 'var(--color-border-critical)',
      toast: {
        neutral: 'var(--color-toast-border-neutral)',
        positive: 'var(--color-toast-border-positive)',
        warning: 'var(--color-toast-border-warning)',
        critical: 'var(--color-toast-border-critical)',
      },
      accent: 'var(--color-accent)',
      login: {
        DEFAULT: 'var(--login-border)',
      },
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
      display: [
        'var(--font-size-display)',
        {
          lineHeight: 'var(--line-height-none)',
          letterSpacing: 'var(--tracking-heading)',
        },
      ],
      title: [
        'var(--font-size-title)',
        {
          lineHeight: 'var(--line-height-tight)',
          letterSpacing: 'var(--tracking-title)',
        },
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
      modal: 'var(--modal-radius)',
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
        /* component tier */
        sidebar: 'var(--sidebar-width)',
        'sidebar-offset': 'var(--sidebar-offset)',
        'content-gutter': 'var(--content-gutter)',
      },
      maxWidth: {
        content: 'var(--content-max)',
      },
      lineHeight: {
        /* named defaults re-pointed at tokens; numeric leading-* stay stock */
        none: 'var(--line-height-none)',
        tight: 'var(--line-height-tight)',
        compact: 'var(--line-height-compact)',
        snug: 'var(--line-height-snug)',
        normal: 'var(--line-height-normal)',
        relaxed: 'var(--line-height-relaxed)',
        loose: 'var(--line-height-loose)',
      },
      letterSpacing: {
        compact: 'var(--tracking-compact)',
        heading: 'var(--tracking-heading)',
        title: 'var(--tracking-title)',
        label: 'var(--tracking-label)',
      },
    },
  },
} satisfies Config

export default preset
