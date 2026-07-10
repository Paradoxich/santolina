// Server Supabase client — for Server Components, Server Actions, and Route
// Handlers. Reads the auth session from request cookies (via @supabase/ssr)
// so queries run as the signed-in user and Row Level Security applies.
//
// This is the client that palette/diary/garden server actions will move onto
// (replacing the service-role shim) once auth is wired — see docs/architecture.md §24.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function readPublicEnv() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase environment variables. Check your .env.local file.'
    )
  }

  return { url, anonKey }
}

// A fresh client per call — never memoize a request-scoped client across
// requests, or one user's session could leak into another's.
export async function createSupabaseServerClient() {
  const { url, anonKey } = readPublicEnv()
  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // `setAll` was called from a Server Component, where writing cookies
          // is disallowed. Safe to ignore — the middleware refreshes the
          // session cookie on every request, so tokens stay current.
        }
      },
    },
  })
}
