import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Menu } from './Menu'

const ACTIONS = [
  { label: 'Edit note', onSelect: vi.fn() },
  { label: 'Delete note', onSelect: vi.fn(), tone: 'critical' as const },
]

const CHOICES = [
  { label: 'All plants', onSelect: vi.fn(), selected: true },
  { label: 'Blooming', onSelect: vi.fn(), selected: false },
  { label: 'Resting', onSelect: vi.fn(), selected: false, disabled: true },
]

describe('Menu', () => {
  it('renders actions as plain menuitems with no checked state', () => {
    render(
      <Menu label="Note actions" trigger="⋯" intent="actions" items={ACTIONS} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Note actions' }))

    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(2)
    expect(items[0]?.hasAttribute('aria-checked')).toBe(false)
    expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0)
  })

  /**
   * The defect `intent` exists for. StatusFilterMenu picks one bloom status
   * out of five and rendered them as plain menuitems, which announce no state
   * — so a screen reader user heard five options and never which one was
   * filtering the list. `menuitemradio` is what ARIA provides for a menu that
   * chooses one of a set. A Select would have been the wrong fix here: the
   * trigger is a 40px icon, not a field.
   */
  it('renders choices as menuitemradio carrying aria-checked', () => {
    render(
      <Menu
        label="Filter by status"
        trigger="⚑"
        intent="choices"
        items={CHOICES}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }))

    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
    const radios = screen.getAllByRole('menuitemradio')
    expect(radios).toHaveLength(3)

    expect(
      screen
        .getByRole('menuitemradio', { name: 'All plants' })
        .getAttribute('aria-checked')
    ).toBe('true')
    expect(
      screen
        .getByRole('menuitemradio', { name: 'Blooming' })
        .getAttribute('aria-checked')
    ).toBe('false')
  })

  it('keeps a disabled choice disabled', () => {
    render(
      <Menu
        label="Filter by status"
        trigger="⚑"
        intent="choices"
        items={CHOICES}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }))
    expect(
      screen
        .getByRole('menuitemradio', { name: 'Resting' })
        .hasAttribute('disabled')
    ).toBe(true)
  })

  /**
   * The guard itself, pinned where it lives — in the type, not at runtime.
   * These are compile-time assertions: `@ts-expect-error` FAILS the typecheck
   * if the line it marks stops being an error, so deleting `intent` or
   * loosening the union breaks the build here rather than shipping a menu that
   * announces nothing.
   */
  it('will not compile a menu that has not declared its intent', () => {
    const reject = () => (
      <>
        {/* @ts-expect-error — intent is required: actions or choices */}
        <Menu label="Unstated" trigger="⋯" items={ACTIONS} />

        {/* @ts-expect-error — choices must carry `selected` on every item */}
        <Menu label="Choices" trigger="⚑" intent="choices" items={ACTIONS} />

        {/* @ts-expect-error — an action cannot claim to be checked */}
        <Menu label="Actions" trigger="⋯" intent="actions" items={CHOICES} />
      </>
    )
    expect(typeof reject).toBe('function')
  })
})
