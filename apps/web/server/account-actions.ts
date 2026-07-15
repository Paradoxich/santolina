'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionGarden } from '@/lib/session-garden'
import { removeDiaryPhotos } from '@/lib/diary-photos'

/** Ends the session (clears the auth cookies) and returns to the sign-in page. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}

/**
 * Reset garden (option A): clears the palette, diary, and uploaded diary
 * photos for the signed-in user's garden, keeping the garden row and its
 * location. The easy "start over / wipe test data" path. RLS scopes both
 * deletes to the user's own garden; photo removal is best-effort after the
 * rows are gone (see removeDiaryPhotos).
 */
export async function resetGarden(): Promise<void> {
  const { supabase, garden } = await requireSessionGarden()

  const { error: paletteError } = await supabase
    .from('palette_plants')
    .delete()
    .eq('garden_id', garden.id)
  if (paletteError)
    throw new Error(`Failed to clear palette: ${paletteError.message}`)

  const { data: diaryRows, error: diaryError } = await supabase
    .from('diary_entries')
    .delete()
    .eq('garden_id', garden.id)
    .select('photo_urls')
  if (diaryError)
    throw new Error(`Failed to clear diary: ${diaryError.message}`)

  await removeDiaryPhotos(
    supabase,
    (diaryRows ?? []).map((row) => row.photo_urls ?? [])
  )
}

/**
 * Permanently deletes the signed-in user and everything they own. Deleting the
 * auth.users row cascades to public.users -> gardens -> palette_plants /
 * diary_entries. This is the one request-path use of the service-role client:
 * a user cannot delete their own auth row through the session client. The
 * session id is resolved from the cookie first, so a caller can only ever
 * delete themselves. Diary photos are removed via the session client first
 * (the DB cascade can't reach storage), best-effort so a storage hiccup
 * never blocks account deletion.
 */
export async function deleteAccount(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  // While the session is still valid: RLS scopes this select to the user's
  // own entries, and the storage delete policy lets them remove the objects.
  const { data: diaryRows } = await supabase
    .from('diary_entries')
    .select('photo_urls')
  await removeDiaryPhotos(
    supabase,
    (diaryRows ?? []).map((row) => row.photo_urls ?? [])
  )

  // Clear the session cookie while it's still valid, then delete the user.
  await supabase.auth.signOut()

  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(user.id)
  if (error) throw new Error(`Failed to delete account: ${error.message}`)

  redirect('/')
}
