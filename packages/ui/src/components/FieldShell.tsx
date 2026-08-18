import React from 'react'
import { cn } from '../utils/cn'

export type FieldSize = 'md' | 'lg'

/**
 * INTERNAL. Deliberately not exported from the package index, and the package
 * has a closed `exports` map, so this cannot be imported from the app at all.
 *
 * That is the point. The shell is the look of a field with none of the things
 * that make a field usable — no label association, no error message, no
 * `aria-invalid`. Anything reaching for it directly would be building a field
 * that looks right and reads wrong. Every control that needs this look has a
 * complete component in front of it: Input, Textarea, SearchField, Select.
 *
 * If a fifth control ever needs the shell, add the component here rather than
 * exporting this — adding a line to index.ts is the deliberate act that
 * reopens the question, and it shows up in a diff.
 */

/**
 * Two steps, not three. A 36px `sm` shipped with the first version and had no
 * consumer the day it landed — the note scope picker, the only candidate, was
 * ruled up to 40. Reintroduce it when something asks for it, rather than
 * carrying a size whose only proof of usefulness is a Storybook row.
 */
const HEIGHTS: Record<FieldSize, string> = {
  md: 'h-10',
  lg: 'h-12',
}

/**
 * The element the shell renders as. Each value exists because a control needs
 * the shell itself to be the interactive element rather than a box around one:
 * `label` so clicking anywhere in a search field focuses its input, `button` so
 * the whole of a select is one target. `div` is for controls that carry their
 * own label element and use focus-within.
 */
type ShellElement = 'div' | 'label' | 'button'

export interface FieldShellProps {
  as?: ShellElement
  size?: FieldSize
  /** Grows with content instead of taking a fixed height. Textareas. */
  multiline?: boolean
  /** Applies the critical edge and holds it through focus. */
  invalid?: boolean
  disabled?: boolean
  /** Rendered before the control — a magnifier, say. */
  leading?: React.ReactNode
  /** Rendered after the control — a chevron, a clear button, a submit. */
  trailing?: React.ReactNode
  children?: React.ReactNode
  className?: string
  /** Forwarded to the rendered element. Typed loosely because `as` varies. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref?: React.Ref<any>
}

export function FieldShell({
  as = 'div',
  size = 'md',
  multiline = false,
  invalid = false,
  disabled = false,
  leading,
  trailing,
  children,
  className,
  ...rest
}: FieldShellProps & Record<string, unknown>) {
  const Element = as as React.ElementType

  /**
   * The edge is BRIGHTER than the fill it borders — white over a translucent
   * white field — so it reads as a soft inset rather than a drawn line. The
   * fill is translucent for a reason that outlives the look: it composites
   * against whatever is behind it, so one token holds on the page ground and
   * on a modal card. The two treatments this replaced were the same
   * relationship hardcoded twice, at different values, because an opaque fill
   * cannot adapt.
   */
  const base = [
    'flex w-full items-center gap-inline-gap',
    'rounded-md border bg-surface-field px-item-gap',
    'text-left transition-colors duration-normal',
    multiline ? 'items-start py-item-gap' : HEIGHTS[size],
  ]

  /**
   * Focus is an outline rather than a ring so it never participates in the
   * border, and it is offset so it reads against a fill this close to white.
   * In error the outline stays critical THROUGH focus: focusing a field to fix
   * it must not be what hides the reason it is wrong.
   *
   * A `button` shell is focusable itself, so it takes focus-visible. A `div`
   * or `label` shell is a container around the focusable control, so it takes
   * focus-within — a label is never focusable, and focus-visible on it would
   * simply never fire.
   *
   * Written out in full rather than composed from parts: Tailwind scans source
   * for literal class names, so a class built by interpolation is never
   * generated and the style silently does not exist.
   */
  const FOCUS_WITHIN =
    'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus'
  const FOCUS_VISIBLE =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
  const INVALID_WITHIN =
    'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-critical'
  const INVALID_VISIBLE =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-critical'

  const isButton = as === 'button'
  const state = invalid
    ? ['border-critical', isButton ? INVALID_VISIBLE : INVALID_WITHIN]
    : ['border-card', isButton ? FOCUS_VISIBLE : FOCUS_WITHIN]

  return (
    <Element
      className={cn(
        base,
        state,
        disabled && 'cursor-not-allowed opacity-70',
        className
      )}
      {...(as === 'button' ? { type: 'button', disabled } : {})}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </Element>
  )
}
