// Session-refresh + auth gate for Next.js middleware.
//
// Runs on every matched request: refreshes the auth token, writes the refreshed
// cookies onto the response, and redirects unauthenticated requests away from
// protected routes. The santolina.app landing and the auth routes stay public.
// See docs/architecture.md#auth.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes reachable without a session. Everything else requires auth.
// `/` is the public landing; `/auth/*` completes sign-in; `/design-system` is
// the component showcase, not user data.
function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/login') return true
  if (pathname.startsWith('/auth')) return true
  if (pathname.startsWith('/design-system')) return true
  return false
}

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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Gate: send unauthenticated requests for protected routes to /login,
  // preserving where they were headed so the callback can return them there.
  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}
