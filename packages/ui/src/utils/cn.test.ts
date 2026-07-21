import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('joins conditional class values like clsx', () => {
    expect(cn('a', false && 'b', 'c', undefined, ['d', 'e'])).toBe('a c d e')
  })

  it('lets the last class win for stock utility conflicts', () => {
    expect(cn('p-4', 'p-8')).toBe('p-8')
    expect(cn('flex', 'block')).toBe('block')
  })

  it('resolves conflicts within the custom semantic spacing scale', () => {
    // both are padding — the override must win, not co-exist
    expect(cn('p-card-padding', 'p-8')).toBe('p-8')
    expect(cn('gap-item-gap', 'gap-row-gap')).toBe('gap-row-gap')
  })

  it('resolves conflicts within the custom radius and type-role scales', () => {
    expect(cn('rounded-chip', 'rounded-full')).toBe('rounded-full')
    expect(cn('text-body-small', 'text-heading')).toBe('text-heading')
  })

  it('keeps semantic text COLOUR separate from the text SIZE role', () => {
    // text-muted (colour) and text-body-small (size) are different axes —
    // both should survive together
    expect(cn('text-muted', 'text-body-small')).toBe(
      'text-muted text-body-small'
    )
    // but two colours conflict
    expect(cn('text-muted', 'text-primary')).toBe('text-primary')
    // and two background surfaces conflict
    expect(cn('bg-surface-card', 'bg-surface-subtle')).toBe('bg-surface-subtle')
  })

  it('merges a base string with a consumer override (the clobber fix)', () => {
    const base = 'rounded-chip bg-surface-card p-card-padding'
    expect(cn(base, 'p-8')).toBe('rounded-chip bg-surface-card p-8')
  })

  it('resolves conflicts between the custom shadow key and stock shadows', () => {
    expect(cn('shadow-soft', 'shadow-none')).toBe('shadow-none')
    expect(cn('shadow-sm', 'shadow-soft')).toBe('shadow-soft')
  })

  it('recognises the modal radius key from the preset', () => {
    expect(cn('rounded-modal', 'rounded-chip')).toBe('rounded-chip')
  })
})
