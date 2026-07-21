import { Swatch } from '../TokenRef'
import { Label, Section, type Chapter } from '../chapter-helpers'

function ToneKit({
  tone,
  surface,
  icon,
  text,
}: {
  tone: string
  surface: string
  icon: string
  text: string
}) {
  return (
    <div
      className={`flex flex-col gap-inline-gap rounded-sm p-row-gap ${surface}`}
    >
      <div className="flex items-center gap-inline-gap">
        <span
          className={`size-3 rounded-full bg-current ${icon}`}
          aria-hidden
        />
        <span className="text-label uppercase tracking-label text-primary">
          {tone}
        </span>
      </div>
      <p className={`text-body-small font-medium ${text}`}>
        surface-{tone} · icon-{tone} · text-{tone} · border-{tone}
      </p>
      <p className="text-body-small text-body-secondary">
        Every tone ships as a four-role kit. A new stateful component composes a
        kit — it never mints a hex.
      </p>
    </div>
  )
}

/* Literal class lists — Tailwind's scanner can't see interpolated names. */
const RAMP_CLASSES = {
  sage: [
    'bg-sage-50',
    'bg-sage-100',
    'bg-sage-200',
    'bg-sage-300',
    'bg-sage-400',
    'bg-sage-500',
    'bg-sage-600',
    'bg-sage-700',
    'bg-sage-800',
    'bg-sage-900',
    'bg-sage-950',
  ],
  fern: [
    'bg-fern-50',
    'bg-fern-100',
    'bg-fern-200',
    'bg-fern-300',
    'bg-fern-400',
    'bg-fern-500',
    'bg-fern-600',
    'bg-fern-700',
    'bg-fern-800',
    'bg-fern-900',
    'bg-fern-950',
  ],
  honey: [
    'bg-honey-50',
    'bg-honey-100',
    'bg-honey-200',
    'bg-honey-300',
    'bg-honey-400',
    'bg-honey-500',
    'bg-honey-600',
    'bg-honey-700',
    'bg-honey-800',
    'bg-honey-900',
    'bg-honey-950',
  ],
  brick: [
    'bg-brick-50',
    'bg-brick-100',
    'bg-brick-200',
    'bg-brick-300',
    'bg-brick-400',
    'bg-brick-500',
    'bg-brick-600',
    'bg-brick-700',
    'bg-brick-800',
    'bg-brick-900',
    'bg-brick-950',
  ],
}

function Ramp({
  label,
  hue,
}: {
  label: string
  hue: keyof typeof RAMP_CLASSES
}) {
  return (
    <div className="flex flex-col gap-inline-gap sm:flex-row sm:items-center">
      <div className="w-full shrink-0 sm:w-36">
        <Label>{label}</Label>
      </div>
      <div className="flex flex-1 gap-inline-gap">
        {RAMP_CLASSES[hue].map((cls) => (
          <Swatch
            key={cls}
            name={cls.replace('bg-', '')}
            className={`flex-1 ${cls}`}
          />
        ))}
      </div>
    </div>
  )
}

function Primitives() {
  return (
    <Section
      title="Primitive ramps"
      intro="Hue-named, raw values live only here. Reach for a semantic role first; ramps are the escape hatch. Hover a step for its name and value, click to copy."
    >
      <div className="flex flex-col gap-6">
        <Ramp label="sage — neutral" hue="sage" />
        <Ramp label="fern — accent" hue="fern" />
        <Ramp label="honey — warning" hue="honey" />
        <Ramp label="brick — critical" hue="brick" />
        <div className="flex flex-col gap-inline-gap sm:flex-row sm:items-center">
          <div className="w-full shrink-0 sm:w-36">
            <Label>white</Label>
          </div>
          <div className="w-16">
            <Swatch name="white" className="bg-white" />
          </div>
        </div>
      </div>
    </Section>
  )
}

function TextRoles() {
  return (
    <Section
      title="Text roles"
      intro="Color and size are separate axes: a card title is text-primary × text-heading × semibold."
    >
      <div className="flex flex-col gap-inline-gap rounded-sm border border-card bg-surface-card p-row-gap">
        <p className="text-body text-primary">
          text-primary — headings, titles, primary body copy
        </p>
        <p className="text-body text-secondary">
          text-secondary — subtitles, card captions, button labels
        </p>
        <p className="text-body text-body-secondary">
          text-body-secondary — supporting content: descriptions, summaries
        </p>
        <p className="text-body text-muted">
          text-muted — UI metadata: labels, captions, timestamps
        </p>
        <p className="text-body text-faint">
          text-faint — de-emphasised / dimmed values
        </p>
        <p className="rounded-xs bg-surface-inverse px-2 py-1 text-body text-inverse">
          text-inverse — over images and dark surfaces
        </p>
        <p className="rounded-xs bg-accent px-2 py-1 text-body text-on-accent">
          text-on-accent — on accent-filled controls
        </p>
      </div>
    </Section>
  )
}

function Surfaces() {
  return (
    <Section
      title="Surfaces"
      intro="Containers by elevation and function. Translucent surfaces bake in light-mode; they get real values in a dark theme."
    >
      <div className="grid grid-cols-2 gap-item-gap sm:grid-cols-4">
        <Swatch name="surface-page" className="bg-surface-page" />
        <Swatch name="surface-card" className="bg-surface-card" />
        <Swatch name="surface-subtle" className="bg-surface-subtle" />
        <Swatch name="surface-inset" className="bg-surface-inset" />
        <Swatch name="surface-inverse" className="bg-surface-inverse" />
        <Swatch name="surface-field" className="bg-surface-field" />
        <Swatch name="surface-overlay" className="bg-surface-overlay" />
        <Swatch name="surface-control" className="bg-surface-control" />
        <Swatch name="surface-hover" className="bg-surface-hover" />
        <Swatch name="surface-active" className="bg-surface-active" />
        <Swatch
          name="surface-card-translucent"
          className="bg-surface-card-translucent"
        />
        <Swatch name="scrim" className="bg-scrim" />
        <Swatch name="accent" className="bg-accent" />
        <Swatch name="accent-hover" className="bg-accent-hover" />
        <Swatch name="accent-muted" className="bg-accent-muted" />
      </div>
    </Section>
  )
}

function ToneKits() {
  return (
    <Section
      title="Tone kits"
      intro="Positive, warning, and critical each ship as a matched surface, icon, text, and border — never mixed across tones."
    >
      <div className="grid grid-cols-1 gap-item-gap sm:grid-cols-3">
        <ToneKit
          tone="positive"
          surface="bg-surface-positive"
          icon="text-icon-positive"
          text="text-positive"
        />
        <ToneKit
          tone="warning"
          surface="bg-surface-warning"
          icon="text-icon-warning"
          text="text-warning"
        />
        <ToneKit
          tone="critical"
          surface="bg-surface-critical"
          icon="text-icon-critical"
          text="text-critical"
        />
      </div>
    </Section>
  )
}

export const colorsChapter: Chapter = {
  slug: 'colors',
  label: 'Colors',
  sections: [
    { slug: 'primitives', label: 'Primitives', content: <Primitives /> },
    { slug: 'text', label: 'Text roles', content: <TextRoles /> },
    { slug: 'surfaces', label: 'Surfaces', content: <Surfaces /> },
    { slug: 'tones', label: 'Tone kits', content: <ToneKits /> },
  ],
}
