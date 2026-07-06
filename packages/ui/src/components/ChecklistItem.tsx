import React from 'react'

export interface ChecklistItemProps extends React.LiHTMLAttributes<HTMLLIElement> {
  /**
   * Visual treatment of the leading icon.
   * - `positive` — green checkmark
   * - `caution` — amber alert
   */
  tone?: 'positive' | 'caution'
  children: React.ReactNode
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      className="size-3 text-[var(--color-accent-primary)]"
      aria-hidden="true"
    >
      <path
        d="M2 6.5L4.5 9L10 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CautionIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      className="size-3 text-[var(--color-accent-caution)]"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M6 3.5V6.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx="6" cy="8.5" r="0.75" fill="currentColor" />
    </svg>
  )
}

/**
 * A single row in a checklist: leading status icon + text. Rows draw a
 * hairline bottom border; wrap them in a `<ul>` with `role="list"`.
 * The tone is also conveyed via an sr-only prefix so it doesn't rely
 * on color alone.
 */
export function ChecklistItem({
  tone = 'positive',
  className = '',
  children,
  ...props
}: ChecklistItemProps) {
  return (
    <li
      className={[
        'flex w-full items-center gap-[var(--space-inline-gap)]',
        'border-b border-[var(--color-border-divider-subtle)]',
        'first:border-t',
        'p-[var(--space-inline-gap)]',
        className,
      ].join(' ')}
      {...props}
    >
      <span className="flex size-3 shrink-0 items-center justify-center">
        {tone === 'caution' ? <CautionIcon /> : <CheckIcon />}
      </span>
      <span className="min-w-0 flex-1 text-[length:var(--font-size-body-small)] leading-[1.3] tracking-[-0.01em] text-[var(--text-body-secondary)]">
        <span className="sr-only">{tone === 'caution' ? 'Caution: ' : ''}</span>
        {children}
      </span>
    </li>
  )
}

export default ChecklistItem
