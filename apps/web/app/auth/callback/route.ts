import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Completes sign in for both flows:
//  - OAuth (Google) and PKCE magic links arrive with `?code=` -> exchange it.
//  - Email OTP links arrive with `?token_hash=&type=` -> verify it.
// On success we drop the user at `next`, defaulting to /overview (the app's
// entry point) rather than the marketing landing page at `/`; the first-run
// location gate takes over from there once it exists (docs/architecture.md §24).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  // Only allow same-site relative redirects, never an attacker-supplied URL.
  const rawNext = searchParams.get('next')
  const next =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/overview'

  const supabase = await createSupabaseServerClient()

  let signedIn = false
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    signedIn = !error
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })
    signedIn = !error
  }

  if (!signedIn) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  // Respect the proxy host on Vercel so the redirect lands on the real domain.
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocal = process.env.NODE_ENV === 'development'
  const base = isLocal || !forwardedHost ? origin : `https://${forwardedHost}`
  return NextResponse.redirect(`${base}${next}`)
}
