'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FormError } from '@paradoxui/ui'
import { UserFacingError } from '@/lib/failure'
import { AuthOptions } from '@/components/AuthOptions'
import { createSupabaseBrowserClient } from '@/lib/supabase-client'

// Layout matches the Figma sign up screen (node 636:1811). The log in variant
// and sent state copy are drafts awaiting the editorial voice pass. The Google and
// email controls live in AuthOptions, shared with the demo conversion modal.

function callbackUrl(next: string) {
  const target = `${window.location.origin}/auth/callback`
  return next && next !== '/'
    ? `${target}?next=${encodeURIComponent(next)}`
    : target
}

const copy = {
  signup: {
    title: 'Santolina',
    footerQuestion: 'Already have an account?',
    footerAction: 'Log in',
  },
  login: {
    title: 'Welcome back',
    footerQuestion: 'New to Santolina?',
    footerAction: 'Sign up',
  },
}

export function LoginForm() {
  const searchParams = useSearchParams()
  const rawNext = searchParams.get('next')
  const next = rawNext && rawNext.startsWith('/') ? rawNext : '/overview'
  const errorParam = searchParams.get('error')
  const callbackFailed = errorParam === 'auth'
  const demoFailed = errorParam === 'demo'

  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function sendMagicLink(email: string) {
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(next) },
    })
    if (error)
      throw new UserFacingError(
        'We could not send the link. Check the address and try again.'
      )
  }

  async function continueWithGoogle() {
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(next) },
    })
    if (error)
      throw new UserFacingError('Google sign in is not available right now.')
  }

  if (sentTo) {
    return (
      <div className="flex w-full flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-title font-semibold text-primary">
            Check your email
          </h1>
          <p className="text-body text-secondary">
            We sent a sign in link to {sentTo}. Open it on this device to
            continue.
          </p>
        </div>
        <button
          type="button"
          className="text-body-small font-semibold text-secondary hover:text-primary"
          onClick={() => setSentTo(null)}
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-title font-semibold text-primary">
          {copy[mode].title}
        </h1>
      </div>

      {/* The card's single failure slot: one place, whether the failure came
          back from Supabase in this session or arrived as ?error on the
          callback. A malformed address is not shown here — it belongs under
          the field, and AuthOptions renders it there. */}
      {(error || callbackFailed || demoFailed) && (
        <FormError align="center">
          {error ??
            (demoFailed
              ? 'The demo garden could not be opened. Sign in to get your own.'
              : 'That sign in link did not work. Request a new one below.')}
        </FormError>
      )}

      <AuthOptions
        onGoogle={continueWithGoogle}
        onEmail={sendMagicLink}
        onSent={setSentTo}
        onError={setError}
      />

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

      {/* Demo entry point, last: it is the way past the account question above,
          not a third way to sign in. A plain form POST rather than a click
          handler, so it works before hydration and can't be triggered by a
          prefetch. The route signs the visitor in anonymously and seeds them a
          garden. */}
      <form action="/auth/demo" method="post" className="w-full">
        <button
          type="submit"
          className="w-full text-body-small font-semibold text-secondary hover:text-primary"
        >
          Look around first
        </button>
      </form>
    </div>
  )
}
