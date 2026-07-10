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
        <span className="text-label uppercase tracking-[0.05em] text-primary">
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

function Primitives() {
  return (
    <Section
      title="Primitive ramps"
      intro="Hue-named, raw values live only here. Reach for a semantic role first; ramps are the escape hatch."
    >
      <div className="flex flex-col gap-section-break">
        <div>
          <Label>green — brand</Label>
          <div className="mt-2 grid grid-cols-3 gap-item-gap sm:grid-cols-6">
            <Swatch name="green-100" className="bg-green-100" />
            <Swatch name="green-200" className="bg-green-200" />
            <Swatch name="green-300" className="bg-green-300" />
            <Swatch name="green-600" className="bg-green-600" />
            <Swatch name="green-700" className="bg-green-700" />
            <Swatch name="green-950" className="bg-green-950" />
          </div>
        </div>
        <div>
          <Label>sage — surface neutrals</Label>
          <div className="mt-2 grid grid-cols-3 gap-item-gap sm:grid-cols-6">
            <Swatch name="sage-50" className="bg-sage-50" />
            <Swatch name="sage-100" className="bg-sage-100" />
            <Swatch name="sage-150" className="bg-sage-150" />
            <Swatch name="sage-200" className="bg-sage-200" />
            <Swatch name="sage-300" className="bg-sage-300" />
          </div>
        </div>
        <div>
          <Label>gold · gray · red</Label>
          <div className="mt-2 grid grid-cols-3 gap-item-gap sm:grid-cols-6">
            <Swatch name="gold-100" className="bg-gold-100" />
            <Swatch name="gold-700" className="bg-gold-700" />
            <Swatch name="gray-0" className="bg-gray-0" />
            <Swatch name="gray-100" className="bg-gray-100" />
            <Swatch name="gray-500" className="bg-gray-500" />
            <Swatch name="gray-900" className="bg-gray-900" />
            <Swatch name="red-100" className="bg-red-100" />
            <Swatch name="red-500" className="bg-red-500" />
            <Swatch name="red-600" className="bg-red-600" />
            <Swatch name="red-700" className="bg-red-700" />
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
        <Swatch name="surface-sunken" className="bg-surface-sunken" />
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
