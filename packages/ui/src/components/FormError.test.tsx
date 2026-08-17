import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { FormError } from './FormError'
import { Input } from './Input'

// What these pin is the sweep's premise: every error in the app now comes from
// this one component, so the tone roles are asserted here once instead of being
// re-read out of fourteen call sites. A test that only checked the text would
// pass while the colour drifted, which is the exact failure the sweep undid.

describe('FormError', () => {
  it('announces itself', () => {
    render(<FormError>Something went wrong.</FormError>)
    expect(screen.getByRole('alert').textContent).toBe('Something went wrong.')
  })

  it('carries the critical tone and the body-small role as a line', () => {
    render(<FormError>Nope</FormError>)
    const cls = screen.getByRole('alert').className
    expect(cls).toContain('text-critical')
    expect(cls).toContain('text-body-small')
  })

  it('takes the tinted surface and the label role as a banner', () => {
    render(<FormError variant="banner">Nope</FormError>)
    const cls = screen.getByRole('alert').className
    expect(cls).toContain('text-critical')
    expect(cls).toContain('bg-surface-critical')
    expect(cls).toContain('text-label')
    expect(cls).not.toContain('text-body-small')
  })

  it('centres only as a line, never as a banner', () => {
    const { unmount } = render(<FormError align="center">Nope</FormError>)
    expect(screen.getByRole('alert').className).toContain('text-center')
    unmount()

    render(
      <FormError variant="banner" align="center">
        Nope
      </FormError>
    )
    expect(screen.getByRole('alert').className).not.toContain('text-center')
  })

  it('takes an id so a field can point at it', () => {
    render(<FormError id="email-error">Nope</FormError>)
    expect(screen.getByRole('alert').getAttribute('id')).toBe('email-error')
  })

  it('is how Input speaks its own errorMessage, so the two cannot drift', () => {
    render(<Input label="Email" errorMessage="Not an address" />)
    const alert = screen.getByRole('alert')
    expect(alert.className).toContain('text-body-small')
    expect(alert.className).toContain('text-critical')
    expect(
      screen.getByLabelText('Email').getAttribute('aria-describedby')
    ).toBe(alert.getAttribute('id'))
  })
})
