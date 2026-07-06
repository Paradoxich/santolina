import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function createSupabaseClient() {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Check your .env.local file.'
    )
  }

  return createClient(supabaseUrl, supabaseAnonKey)
}

// Lazily created so the throw only happens at call-time in server contexts,
// not at module load time during next build.
let _client: SupabaseClient | null = null

export function getSupabase() {
  if (!_client) _client = createSupabaseClient()
  return _client
}
