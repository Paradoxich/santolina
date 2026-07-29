'use client'

import { useEffect, useState } from 'react'
import type { TokenEntry, TokenGroup, TokenKind, TokenTier } from './token-data'
import { tokenConsumers } from './token-consumers.generated'

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

/**
 * Which files use this token, from the generated source scan. It is here, and
 * not in a doc, because the hand-written version of this fact went stale and
 * spent months naming a component the token had been reassigned away from.
 *
 * Reads as a count so the row stays one line; expands to the file list. "Not
 * used anywhere" is the trustworthy end of the scan — a listed file mentions
 * the token, which is not the same as using it meaningfully.
 */
/**
 * One token. The whole row is the disclosure so the expanded file list can run
 * full width underneath — nesting a <details> inside the flex row let a long
 * path widen it and push the swatch off the right edge.
 *
 * Rows with no consumer are not expandable: there is nothing to show, and
 * "not used anywhere" is the trustworthy half of a source scan anyway.
 */
function TokenRow({ name, kind }: TokenEntry) {
  const value = useTokenValue(name)
  const files = tokenConsumers[name] ?? []
  const summary = (
    <div className="flex min-h-[40px] flex-wrap items-center gap-x-row-gap gap-y-tight-gap py-tight-gap sm:flex-nowrap">
      <code className="w-full truncate text-body-small text-primary sm:w-[280px] sm:shrink-0">
        {name}
      </code>
      <span className="min-w-0 flex-1 truncate text-body-small text-muted">
        {value}
      </span>
      <span
        className={`shrink-0 text-body-small ${
          files.length
            ? 'text-muted underline decoration-dotted underline-offset-2'
            : 'text-faint'
        }`}
      >
        {files.length === 0
          ? 'no consumers'
          : `${files.length} ${files.length === 1 ? 'file' : 'files'}`}
      </span>
      <TokenPreview name={name} kind={kind} />
    </div>
  )

  if (files.length === 0) {
    return (
      <div className="border-b border-divider last:border-b-0">{summary}</div>
    )
  }

  return (
    <details className="group border-b border-divider last:border-b-0">
      <summary className="cursor-pointer list-none transition-colors duration-normal hover:text-primary">
        {summary}
      </summary>
      <ul className="flex flex-col gap-tight-gap pb-tight-gap sm:pl-[280px]">
        {files.map((file) => (
          <li key={file} className="break-all text-body-small text-muted">
            <code>{file}</code>
          </li>
        ))}
      </ul>
    </details>
  )
}

function TokenGroupBlock({ group }: { group: TokenGroup }) {
  return (
    <div className="flex flex-col gap-tight-gap">
      <p className="text-label uppercase tracking-label text-muted">
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
