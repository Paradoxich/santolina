// Session-refresh helper for Next.js middleware.
//
// Runs on every matched request: reads the auth cookies, refreshes the token
// if needed, and writes the refreshed cookies onto the outgoing response so
// Server Components see a current session.
//
// Scope note: this only refreshes the session today. The full-app auth gate
// (redirect unauthenticated requests, keep the landing public) lands as a
// later step in the auth epic — see docs/architecture.md §24.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase environment variables. Check your .env.local file.'
    )
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // IMPORTANT: refresh the session by calling getUser() immediately, with no
  // code between createServerClient and this call. Reordering here is a common
  // source of hard-to-debug session bugs.
  await supabase.auth.getUser()

  return supabaseResponse
}
