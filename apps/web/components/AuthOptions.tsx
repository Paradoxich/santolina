'use client'

import { useState } from 'react'
import { Button, FormError, cn } from '@paradoxui/ui'

// The two ways into an account — Google, or a link by email — as one set of
// controls. Extracted from LoginForm so the demo conversion modal is the same
// thing rather than a copy of it: the sign-in card and the "keep this garden"
// card have to look identical, and two copies of this markup would drift the
// first time either is touched.
//
// The split on failures is by whose fault it is, not by who is convenient:
//
//   · the ADDRESS is malformed -> this component owns it. The message sits
//     under the field it is about, wired to it by id, because it is a fact
//     about the field this component renders and nothing above knows it.
//   · the REQUEST failed (link not sent, Google down, expired link, demo
//     could not open) -> handed up through onError. The copy differs by
//     caller (signing in vs converting a demo) and the fault is not the
//     field's, so the caller renders it in its own failure slot.
//
// Both use FormError, so the two placements read as one system rather than
// two. That is also why the form carries `noValidate`: the browser's own
// bubble is a third visual system, positioned by the OS, unstyleable, and
// gone on the next keystroke. `required` and `type="email"` stay for the
// semantics they give assistive tech.
//
// Layout matches the Figma sign up screen (node 636:1811).

export interface AuthOptionsProps {
  /** Runs on "Continue with Google". Throw with user-facing copy to fail. */
  onGoogle: () => Promise<void>
  /** Runs on submit. Throw with user-facing copy to fail. */
  onEmail: (email: string) => Promise<void>
  /** Called after onEmail resolves, so the caller can show its own sent state. */
  onSent: (email: string) => void
  /** Message to display, or null to clear. Rendered by the caller. */
  onError: (message: string | null) => void
  /** Label on the submit control; also its accessible name. */
  submitLabel?: string
}

export function AuthOptions({
  onGoogle,
  onEmail,
  onSent,
  onError,
  submitLabel = 'Send me a sign in link',
}: AuthOptionsProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending'>('idle')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const hasEmail = email.trim().length > 0

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    onError(null)

    // Checked on submit, never while typing: an address is malformed for as
    // long as it is half typed, and saying so at the third keystroke is
    // scolding someone for not having finished. The empty case is unreachable
    // — the submit control is disabled until there is something in the field.
    if (!isEmailish(email)) {
      setFieldError('That does not look like an email address.')
      return
    }

    setFieldError(null)
    setStatus('sending')

    try {
      await onEmail(email)
      onSent(email)
    } catch (error) {
      onError((error as Error).message)
    } finally {
      setStatus('idle')
    }
  }

  async function handleGoogle() {
    onError(null)
    setFieldError(null)
    setGoogleLoading(true)

    try {
      await onGoogle()
      // On success the browser is already navigating to Google, so the spinner
      // is left running deliberately — clearing it would flash the idle state
      // over a page that is on its way out.
    } catch (error) {
      setGoogleLoading(false)
      onError((error as Error).message)
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <Button
        type="button"
        className="h-12 w-full gap-item-gap rounded-md border-login text-body-small"
        isLoading={googleLoading}
        onClick={handleGoogle}
      >
        <GoogleMark />
        Continue with Google
      </Button>

      <div className="flex items-center gap-5 px-3" aria-hidden="true">
        <span className="flex-1 border-t border-card-translucent" />
        <span className="text-body-small text-secondary">or</span>
        <span className="flex-1 border-t border-card-translucent" />
      </div>

      <form onSubmit={handleEmail} noValidate className="flex flex-col gap-2">
        {/* The pill is white on a photographic background, so the error cannot
            be a border — there is no border to tint. It is the ring instead,
            which is also what focus uses, so the two never stack: in error the
            ring stays critical THROUGH focus. Focusing a field to fix it must
            not be what hides the reason it is wrong. */}
        <div
          className={cn(
            'flex h-12 w-full items-center gap-2 rounded-md bg-white py-2 pl-3 pr-2',
            fieldError
              ? 'ring-2 ring-critical'
              : 'focus-within:ring-2 focus-within:ring-focus'
          )}
        >
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              // Cleared on edit, not re-checked on edit. Editing is the user
              // acting on the message, so the message has done its job.
              if (fieldError) setFieldError(null)
            }}
            placeholder="Enter your email"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? 'email-error' : undefined}
            className="min-w-0 flex-1 bg-transparent text-body-small font-medium text-primary placeholder:text-faint focus:outline-none"
          />
          <button
            type="submit"
            disabled={!hasEmail || status === 'sending'}
            aria-label={submitLabel}
            className={cn(
              'flex h-full shrink-0 items-center rounded-sm border border-login bg-accent px-2 text-body-small font-medium text-on-accent',
              'transition-opacity duration-slow',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              hasEmail ? 'hover:bg-accent-hover' : 'opacity-10'
            )}
          >
            <span
              className={cn(
                'overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-slow ease-in-out',
                hasEmail ? 'mr-2 max-w-[200px]' : 'mr-0 max-w-0'
              )}
            >
              {submitLabel}
            </span>
            {status === 'sending' ? (
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
            ) : (
              <ArrowIcon />
            )}
          </button>
        </div>

        {/* Under the pill and left aligned, against the request-level slot's
            centred line above the card: the indent says which one is about
            this field. */}
        {fieldError && <FormError id="email-error">{fieldError}</FormError>}
      </form>
    </div>
  )
}

// Deliberately as loose as the browser's own check: a local part, an @, and a
// dotted domain. It is here to catch a typo and a pasted name, not to decide
// what a valid address is — the only authority on that is whether the link
// arrives, and a stricter pattern would start rejecting real addresses.
function isEmailish(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

// Rendered on the solid-fern button, so the mark is flattened to white
// instead of Google's brand colors — those only read against a light background.
function GoogleMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#fff"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92A8.78 8.78 0 0 0 17.64 9.2z"
      />
      <path
        fill="#fff"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#fff"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33z"
      />
      <path
        fill="#fff"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 8h10m0 0-4-4m4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
