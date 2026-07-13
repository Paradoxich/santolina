'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, cn } from '@paradoxui/ui'
import { createSupabaseBrowserClient } from '@/lib/supabase-client'

// Layout matches the Figma sign up screen (node 636:1811). The log in variant
// and sent state copy are drafts awaiting Ana's voice pass.

function callbackUrl(next: string) {
  const target = `${window.location.origin}/auth/callback`
  return next && next !== '/'
    ? `${target}?next=${encodeURIComponent(next)}`
    : target
}

const copy = {
  signup: {
    title: 'Welcome to Santolina',
    subtitle: 'Keep track of your plants through every season.',
    footerQuestion: 'Already have an account?',
    footerAction: 'Log in',
  },
  login: {
    title: 'Welcome back',
    subtitle: 'Pick up where you left off.',
    footerQuestion: 'New to Santolina?',
    footerAction: 'Sign up',
  },
}

export function LoginForm() {
  const searchParams = useSearchParams()
  const rawNext = searchParams.get('next')
  const next = rawNext && rawNext.startsWith('/') ? rawNext : '/'
  const callbackFailed = searchParams.get('error') === 'auth'

  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasEmail = email.trim().length > 0

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
      <div className="flex w-full flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-title font-semibold text-primary">
            Check your email
          </h1>
          <p className="text-body text-secondary">
            We sent a sign in link to {email}. Open it on this device to
            continue.
          </p>
        </div>
        <button
          type="button"
          className="text-body-small font-semibold text-secondary hover:text-primary"
          onClick={() => {
            setStatus('idle')
            setEmail('')
          }}
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-title font-semibold text-primary">
          {copy[mode].title}
        </h1>
        <p className="text-body text-secondary">{copy[mode].subtitle}</p>
      </div>

      {(error || callbackFailed) && (
        <p className="text-body-small text-critical" role="alert">
          {error ?? 'That sign in link did not work. Request a new one below.'}
        </p>
      )}

      <div className="flex w-full flex-col gap-5">
        <Button
          type="button"
          className="h-12 w-full rounded-md border-[#3b9255] text-body-small"
          isLoading={googleLoading}
          onClick={handleGoogle}
        >
          Continue with Google
        </Button>

        <div className="flex items-center gap-5 px-3" aria-hidden="true">
          <span className="flex-1 border-t border-dashed border-[rgba(17,17,17,0.2)]" />
          <span className="text-body-small text-secondary">or</span>
          <span className="flex-1 border-t border-dashed border-[rgba(17,17,17,0.2)]" />
        </div>

        <form
          onSubmit={handleMagicLink}
          className="flex h-12 w-full items-center gap-2 rounded-md bg-gray-0 py-2 pl-3 pr-2 focus-within:ring-2 focus-within:ring-focus"
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
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="min-w-0 flex-1 bg-transparent text-body-small font-medium text-primary placeholder:text-[rgba(17,17,17,0.2)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!hasEmail || status === 'sending'}
            aria-label="Send me a sign in link"
            className={cn(
              'flex h-full shrink-0 items-center rounded-sm border border-[#3b9255] bg-accent px-2 text-body-small font-medium text-on-accent',
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
              Send me a sign in link
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
        </form>
      </div>

      <p className="flex items-center gap-tight-gap text-body-small text-secondary">
        {copy[mode].footerQuestion}
        <button
          type="button"
          className="font-semibold hover:text-primary"
          onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
        >
          {copy[mode].footerAction}
        </button>
      </p>
    </div>
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
