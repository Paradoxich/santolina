import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { Select } from './Select'

const OPTIONS = [
  { value: 'garden', label: 'Your garden' },
  { value: 'jasmine', label: 'Common jasmine' },
  { value: 'stipa', label: 'Stipa gigantea' },
  { value: 'gone', label: 'Removed plant', disabled: true },
]

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState<string | null>('garden')
  return (
    <Select
      label="Note scope"
      options={OPTIONS}
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange?.(v)
      }}
    />
  )
}

describe('Select', () => {
  /**
   * The defect this component was built to fix. The note scope picker was a
   * Menu, whose trigger takes its accessible name from `aria-label` — so it
   * announced "Choose what this note is about" and never the chosen plant. A
   * screen reader user could not hear what their note was about.
   */
  it('announces the selected value as part of the trigger name', () => {
    render(<Harness />)
    expect(
      screen.getByRole('button', { name: /Note scope Your garden/ })
    ).toBeDefined()
  })

  /**
   * The same defect by a different route, and the one the first version of
   * this component shipped with. AddNoteModal renders its own visible label,
   * so it passes `aria-label` — and an aria-label on the trigger REPLACES its
   * name, silencing the value again. The browser caught this; these tests did
   * not, because they only exercised the visible-label path.
   */
  it('announces the value when named by aria-label rather than a label', () => {
    render(
      <Select
        aria-label="What is this about"
        options={OPTIONS}
        value="jasmine"
        onChange={() => {}}
      />
    )
    expect(
      screen.getByRole('button', { name: /What is this about Common jasmine/ })
    ).toBeDefined()
  })

  /**
   * The other half of the same defect: a list of choices was `role="menu"`,
   * which ARIA reserves for actions. A value picker is a listbox, and its
   * options carry aria-selected.
   */
  it('is a listbox with a selected option, not a menu', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('listbox')).toBeDefined()
    expect(screen.queryByRole('menu')).toBeNull()

    const selected = screen.getByRole('option', { name: 'Your garden' })
    expect(selected.getAttribute('aria-selected')).toBe('true')
    expect(
      screen
        .getByRole('option', { name: 'Common jasmine' })
        .getAttribute('aria-selected')
    ).toBe('false')
  })

  it('opens on ArrowDown and focuses the selected option', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('option', { name: 'Your garden' })
      )
    )
  })

  it('commits with Enter and returns focus to the trigger', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const trigger = screen.getByRole('button')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const first = await screen.findByRole('option', { name: 'Your garden' })
    await waitFor(() => expect(document.activeElement).toBe(first))

    fireEvent.keyDown(first, { key: 'ArrowDown' })
    const second = screen.getByRole('option', { name: 'Common jasmine' })
    await waitFor(() => expect(document.activeElement).toBe(second))
    fireEvent.keyDown(second, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('jasmine')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button'))
  })

  it('closes on Escape without changing the value', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const trigger = screen.getByRole('button')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const first = await screen.findByRole('option', { name: 'Your garden' })
    fireEvent.keyDown(first, { key: 'Escape' })

    expect(onChange).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button'))
  })

  it('skips a disabled option when arrowing', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    // garden -> jasmine -> stipa -> wraps PAST the disabled row to garden
    const step = async (from: string, to: string) => {
      const el = screen.getByRole('option', { name: from })
      await waitFor(() => expect(document.activeElement).toBe(el))
      fireEvent.keyDown(el, { key: 'ArrowDown' })
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('option', { name: to })
        )
      )
    }
    await step('Your garden', 'Common jasmine')
    await step('Common jasmine', 'Stipa gigantea')
    await step('Stipa gigantea', 'Your garden')
  })

  it('wires the error message to the trigger', () => {
    render(
      <Select
        label="Note scope"
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        errorMessage="Pick what this note is about."
      />
    )
    const trigger = screen.getByRole('button')
    expect(trigger.getAttribute('aria-invalid')).toBe('true')
    const describedBy = trigger.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      'Pick what this note is about.'
    )
  })
})
