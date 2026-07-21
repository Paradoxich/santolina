'use client'

import { cn } from '@paradoxui/ui'
import { useEffect, useRef, useState } from 'react'

/** Formats a computed color as hex, with an alpha suffix when translucent. */
function formatColor(value: string): string {
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (!m) return value
  const [, r, g, b, a] = m
  const hex =
    '#' + [r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('')
  const alpha = a === undefined ? 1 : Number(a)
  return alpha < 1 ? `${hex} · ${Math.round(alpha * 100)}%` : hex
}

/** WCAG relative luminance from sRGB 0-255 channels. */
function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
}

/** Below this luminance, white text has more contrast than black text. */
const LUMINANCE_CROSSOVER = 0.1791

const COPIED_TIMEOUT_MS = 1200

/**
 * A color swatch that renders a token class and reads its RESOLVED value
 * back from the DOM — the displayed name/value can never drift from the
 * tokens. Bare color on rest; name + value surface on hover/focus and
 * clicking copies the value to the clipboard.
 */
export function Swatch({
  name,
  className,
}: {
  /** Label shown on hover (token or utility name) */
  name: string
  /** Classes that paint the swatch, e.g. "bg-surface-card" */
  className: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [value, setValue] = useState('')
  const [isDark, setIsDark] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!ref.current) return
    const bg = getComputedStyle(ref.current).backgroundColor
    setValue(formatColor(bg))
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (m) {
      const [, r, g, b] = m
      setIsDark(
        relativeLuminance(Number(r), Number(g), Number(b)) < LUMINANCE_CROSSOVER
      )
    }
  }, [])

  useEffect(() => () => clearTimeout(copiedTimeout.current), [])

  const handleCopy = () => {
    if (!value) return
    void navigator.clipboard.writeText(value.split(' · ')[0] ?? value)
    setCopied(true)
    clearTimeout(copiedTimeout.current)
    copiedTimeout.current = setTimeout(
      () => setCopied(false),
      COPIED_TIMEOUT_MS
    )
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleCopy}
      aria-label={value ? `Copy ${name}, ${value}` : `Copy ${name}`}
      className={cn(
        'group relative h-20 w-full overflow-hidden rounded-sm shadow-[0_0_0_1px_rgba(255,255,255,0.2)] transition-transform hover:scale-[1.04] focus-visible:scale-[1.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97]',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 flex flex-col items-start justify-end gap-0 p-tight-gap opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          isDark ? 'text-white' : 'text-sage-950'
        )}
      >
        <span className="truncate text-label font-medium">{name}</span>
        <span className="truncate text-micro">{copied ? 'Copied' : value}</span>
      </span>
    </button>
  )
}

/** Prints the raw value of a CSS custom property, read live from :root. */
export function CssVar({ name }: { name: string }) {
  const [value, setValue] = useState('')

  useEffect(() => {
    setValue(
      getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    )
  }, [name])

  return <span className="text-micro text-muted">{value}</span>
}
