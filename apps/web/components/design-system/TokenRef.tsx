'use client'

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

/**
 * A color swatch that renders a token class and reads its RESOLVED value
 * back from the DOM — the displayed hex can never drift from the tokens.
 */
export function Swatch({
  name,
  className,
}: {
  /** Label shown under the swatch (token or utility name) */
  name: string
  /** Classes that paint the swatch, e.g. "bg-surface-card" */
  className: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (ref.current) {
      setValue(formatColor(getComputedStyle(ref.current).backgroundColor))
    }
  }, [])

  return (
    <div className="flex min-w-0 flex-col gap-tight-gap">
      <div
        ref={ref}
        className={`h-14 w-full rounded-sm border border-card-translucent ${className}`}
      />
      <p className="truncate text-label text-primary">{name}</p>
      <p className="truncate text-micro text-muted">{value}</p>
    </div>
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
