'use client'

import { useState } from 'react'
import { DitheredImage } from '@paradoxui/ui'

type HoverMode = 'reveal' | 'organic' | 'magnify' | 'coarsen' | 'spotlight'

const MODES: { id: HoverMode; label: string; hint: string }[] = [
  { id: 'reveal', label: 'Reveal', hint: 'clean photo inside a soft circle' },
  {
    id: 'organic',
    label: 'Organic',
    hint: 'reveal with a torn, wobbling edge',
  },
  { id: 'magnify', label: 'Magnify', hint: 'photo bulges toward the cursor' },
  { id: 'coarsen', label: 'Coarsen', hint: 'dots swell into chunky blocks' },
  {
    id: 'spotlight',
    label: 'Spotlight',
    hint: 'photo brightens and saturates',
  },
]

/**
 * Playground for tuning the DitheredHero effect. Lives under the public
 * /design-system area (no auth). Hover the image to feel the lens, drag the
 * sliders, and copy the snippet into <DitheredHero /> wherever it is used.
 */
export default function DitherLabPage() {
  const [levels, setLevels] = useState(6)
  const [cell, setCell] = useState(2)
  const [radius, setRadius] = useState(130)
  const [softness, setSoftness] = useState(0.45)
  const [weight, setWeight] = useState(0.5)
  const [mode, setMode] = useState<HoverMode>('reveal')

  const activeHint = MODES.find((m) => m.id === mode)?.hint

  return (
    <div>
      <h1 className="text-title text-primary">Dither lab</h1>
      <p className="mt-2 max-w-[560px] text-body text-muted">
        Tuning the signup hero. Higher levels keeps more of the photo (finer
        grain); lower posterises it. Hover the image to try the cursor lens.
        Changes apply live.
      </p>

      <div className="mt-8 flex flex-col gap-8 md:flex-row">
        {/* Preview panel, matching the login hero framing. */}
        <div className="md:w-[440px] md:shrink-0">
          <DitheredImage
            src="/textures/signup-hero-landscape.jpg"
            className="aspect-[3/4] rounded-card-tile bg-accent"
            levels={levels}
            cell={cell}
            revealRadius={radius}
            softness={softness}
            weight={weight}
            hoverMode={mode}
          />
          <p className="mt-2 text-label text-muted">Hover the image ↑</p>
        </div>

        {/* Controls. */}
        <div className="flex flex-1 flex-col gap-8">
          {/* Hover mode. */}
          <div className="flex flex-col gap-2">
            <span className="text-label uppercase tracking-label text-muted">
              Hover mode
            </span>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  aria-pressed={mode === m.id}
                  className={
                    mode === m.id
                      ? 'rounded-full border border-accent bg-accent px-3 py-1 text-label text-on-accent'
                      : 'rounded-full border border-card px-3 py-1 text-label text-primary transition-colors hover:bg-surface-hover'
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span className="text-label text-muted">{activeHint}</span>
          </div>

          <Slider
            label="Levels"
            value={levels}
            min={2}
            max={16}
            onChange={setLevels}
            hint="2 = chunky posterised · 16 = barely-there grain"
          />
          <Slider
            label="Cell (px)"
            value={cell}
            min={1}
            max={8}
            onChange={setCell}
            hint="1 = fine dots · 8 = big deliberate dots"
          />
          <Slider
            label="Lens radius (px)"
            value={radius}
            min={40}
            max={300}
            onChange={setRadius}
            hint="size of the hover lens"
          />
          <Slider
            label="Edge softness"
            value={softness}
            min={0}
            max={1}
            step={0.05}
            onChange={setSoftness}
            hint="0 = hard edge · 1 = very feathered"
          />
          <Slider
            label="Weight"
            value={weight}
            min={0}
            max={1}
            step={0.05}
            onChange={setWeight}
            hint="0 = weightless, instant · 1 = heavy, lags and smears"
          />

          <div className="rounded-card-tile bg-surface-card p-4">
            <p className="text-label uppercase tracking-label text-muted">
              Current
            </p>
            <code className="mt-2 block text-body text-primary">
              {`<DitheredImage levels={${levels}} cell={${cell}} hoverMode="${mode}" revealRadius={${radius}} softness={${softness}} weight={${weight}} />`}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  hint: string
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between text-label uppercase tracking-label text-muted">
        {label}
        <span className="text-body tabular-nums text-primary">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[color:var(--color-accent)]"
      />
      <span className="text-label text-muted">{hint}</span>
    </label>
  )
}
