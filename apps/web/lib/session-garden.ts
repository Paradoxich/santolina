// SERVER-ONLY — session-scoped garden lookup for the authenticated user.
//
// This is the auth-era replacement for the single-tenant `current-garden.ts`
// shim. During the transition both exist: the shim still powers the
// palette/diary/dashboard reads until the RLS cutover (item 5), while this
// helper backs the first-run location gate (item 4). See docs/architecture.md §24.
import { createSupabaseServerClient } from './supabase-server'
import type { Garden } from '@/types/garden'

export interface SessionGardenContext {
  userId: string
  garden: Garden | null
}

/**
 * Returns the signed-in user and their garden, or null when there is no
 * session. Reads through the session client, so the gardens RLS policy
 * (`auth.uid() = user_id`) is what scopes the row — not application code.
 */
export async function getSessionGardenContext(): Promise<SessionGardenContext | null> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('gardens')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load garden: ${error.message}`)

  return { userId: user.id, garden: (data as Garden) ?? null }
}
