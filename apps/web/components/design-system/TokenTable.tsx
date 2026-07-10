'use client'

import { useEffect, useState } from 'react'
import type { TokenEntry, TokenGroup, TokenKind, TokenTier } from './token-data'

/** Reads a custom property's raw value live from :root — can never drift. */
function useTokenValue(name: string): string {
  const [value, setValue] = useState('')
  useEffect(() => {
    setValue(
      getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    )
  }, [name])
  return value
}

function TokenPreview({ name, kind }: { name: string; kind: TokenKind }) {
  const boxClasses = 'size-6 shrink-0'

  if (kind === 'color') {
    return (
      <span
        className={`${boxClasses} rounded-xs border border-card-translucent`}
        style={{ background: `var(${name})` }}
        aria-hidden
      />
    )
  }
  if (kind === 'shadow') {
    return (
      <span
        className={`${boxClasses} rounded-xs bg-surface-card`}
        style={{ boxShadow: `var(${name})` }}
        aria-hidden
      />
    )
  }
  if (kind === 'radius') {
    return (
      <span
        className={`${boxClasses} border border-card bg-surface-card`}
        style={{ borderRadius: `var(${name})` }}
        aria-hidden
      />
    )
  }
  if (kind === 'space') {
    return (
      <span
        className="h-3 shrink-0 rounded-full bg-accent-muted"
        style={{ width: `var(${name})`, minWidth: 2 }}
        aria-hidden
      />
    )
  }
  if (kind === 'weight') {
    return (
      <span
        className={`${boxClasses} flex items-center justify-center text-body-small text-primary`}
        style={{ fontWeight: `var(${name})` }}
        aria-hidden
      >
        Aa
      </span>
    )
  }
  if (kind === 'family') {
    return (
      <span
        className={`${boxClasses} flex items-center justify-center text-body-small text-primary`}
        style={{ fontFamily: `var(${name})` }}
        aria-hidden
      >
        Aa
      </span>
    )
  }
  return <span className={boxClasses} aria-hidden />
}

function TokenRow({ name, kind }: TokenEntry) {
  const value = useTokenValue(name)
  return (
    <div className="flex min-h-[40px] flex-wrap items-center gap-x-row-gap gap-y-tight-gap border-b border-divider py-tight-gap last:border-b-0 sm:flex-nowrap">
      <code className="w-full truncate text-body-small text-primary sm:w-[280px] sm:shrink-0">
        {name}
      </code>
      <span className="min-w-0 flex-1 truncate text-body-small text-muted">
        {value}
      </span>
      <TokenPreview name={name} kind={kind} />
    </div>
  )
}

function TokenGroupBlock({ group }: { group: TokenGroup }) {
  return (
    <div className="flex flex-col gap-tight-gap">
      <p className="text-label uppercase tracking-[0.05em] text-muted">
        {group.title}
      </p>
      <div className="rounded-sm border border-card bg-surface-card px-row-gap">
        {group.entries.map((entry) => (
          <TokenRow key={entry.name} {...entry} />
        ))}
      </div>
    </div>
  )
}

/** Renders a tier's token groups. Title and intro belong to the caller —
 * the chapter's Section owns the single heading, so nothing repeats. */
export function TokenTierBlock({ tier }: { tier: TokenTier }) {
  return (
    <div className="flex flex-col gap-section-break">
      {tier.groups.map((group) => (
        <TokenGroupBlock key={group.title} group={group} />
      ))}
    </div>
  )
}
