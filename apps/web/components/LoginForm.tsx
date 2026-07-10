'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, Card, CardBody, Input } from '@paradoxui/ui'
import { createSupabaseBrowserClient } from '@/lib/supabase-client'

// NOTE: functional copy + layout, not yet through Ana's voice/design pass.
// Kept intentionally plain so the design pass has a clean base.

function callbackUrl(next: string) {
  const target = `${window.location.origin}/auth/callback`
  return next && next !== '/'
    ? `${target}?next=${encodeURIComponent(next)}`
    : target
}

export function LoginForm() {
  const searchParams = useSearchParams()
  const rawNext = searchParams.get('next')
  const next = rawNext && rawNext.startsWith('/') ? rawNext : '/'
  const callbackFailed = searchParams.get('error') === 'auth'

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('sending')

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(next) },
    })

    if (error) {
      setStatus('idle')
      setError('We could not send the link. Check the address and try again.')
      return
    }
    setStatus('sent')
  }

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(next) },
    })

    // On success the browser is already navigating to Google, so we only reach
    // here on failure (e.g. the provider is not configured yet).
    if (error) {
      setGoogleLoading(false)
      setError('Google sign in is not available right now.')
    }
  }

  if (status === 'sent') {
    return (
      <Card>
        <CardBody className="flex flex-col gap-3 text-center">
          <h1 className="text-heading text-primary">Check your email</h1>
          <p className="text-body text-secondary">
            We sent a sign in link to {email}. Open it on this device to
            continue.
          </p>
          <button
            type="button"
            className="text-body-small text-accent hover:underline"
            onClick={() => {
              setStatus('idle')
              setEmail('')
            }}
          >
            Use a different email
          </button>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-heading text-primary">Sign in to Santolina</h1>
          <p className="text-body-small text-secondary">
            Use your email or your Google account.
          </p>
        </div>

        {(error || callbackFailed) && (
          <p className="text-body-small text-critical" role="alert">
            {error ??
              'That sign in link did not work. Request a new one below.'}
          </p>
        )}

        <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Button
            type="submit"
            isLoading={status === 'sending'}
            disabled={status === 'sending'}
          >
            Email me a sign in link
          </Button>
        </form>

        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="flex-1 border-t border-divider" />
          <span className="text-body-small text-faint">or</span>
          <span className="flex-1 border-t border-divider" />
        </div>

        <Button
          type="button"
          variant="secondary"
          isLoading={googleLoading}
          onClick={handleGoogle}
        >
          <GoogleMark />
          Continue with Google
        </Button>
      </CardBody>
    </Card>
  )
}

function GoogleMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92A8.78 8.78 0 0 0 17.64 9.2z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
