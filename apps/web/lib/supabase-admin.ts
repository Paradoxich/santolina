// SERVER-ONLY — never import this file in client components.
// Uses the service role key which bypasses Row Level Security.
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']

  if (!url || !serviceKey) {
    throw new Error(
      'Missing Supabase admin env vars: NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY must both be set'
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Lazily created so the throw only happens at call-time in server contexts,
// not at module load time in the browser.
let _adminClient: ReturnType<typeof createAdminClient> | null = null

export function getSupabaseAdmin() {
  if (!_adminClient) _adminClient = createAdminClient()
  return _adminClient
}
