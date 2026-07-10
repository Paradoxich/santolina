// Browser Supabase client — for use in Client Components only.
// Reads/writes the auth session from cookies (via @supabase/ssr) so the
// server can see the same session. Subject to Row Level Security.
import { createBrowserClient } from '@supabase/ssr'

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

export function createSupabaseBrowserClient() {
  const { url, anonKey } = readPublicEnv()
  return createBrowserClient(url, anonKey)
}
