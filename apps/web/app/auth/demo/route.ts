import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { seedDemoGarden } from '@/lib/demo-garden'

// Starts a demo: signs the visitor in anonymously and hands them a seeded
// garden of their own.
//
// An anonymous sign-in creates a real auth.users row (with is_anonymous true),
// so the handle_new_user trigger provisions the profile and empty garden
// exactly as it does for a magic-link signup — from here down the visitor is an
// ordinary authenticated user and every existing RLS policy, server action, and
// page works unchanged. The demo-ness lives in one place only: the JWT's
// is_anonymous claim. No demo column, no demo branch in the data layer.
//
// POST rather than GET so a prefetch or a crawler can't mint accounts.

export async function POST(request: Request) {
  const { origin } = new URL(request.url)
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.auth.signInAnonymously()

  // The most likely cause is anonymous sign-ins being switched off in the
  // project's auth settings; there is nothing the visitor can do about it, so
  // send them back to the real sign-in rather than showing a dead end.
  if (error || !data.user) {
    console.error('Demo sign-in failed:', error?.message)
    return NextResponse.redirect(`${origin}/login?error=demo`, { status: 303 })
  }

  // The signup trigger has already created this; we only need its id.
  const { data: garden, error: gardenError } = await supabase
    .from('gardens')
    .select('id')
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (gardenError || !garden) {
    console.error('Demo garden lookup failed:', gardenError?.message)
    return NextResponse.redirect(`${origin}/login?error=demo`, { status: 303 })
  }

  try {
    const result = await seedDemoGarden(supabase, garden.id)
    if (result.missing.length > 0) {
      // Not fatal — the demo opens with a smaller palette. Worth knowing about,
      // because it means the catalog no longer has a plant the seed names.
      console.warn(
        `Demo seed: no catalog match for ${result.missing.join(', ')}`
      )
    }
  } catch (seedError) {
    // The visitor is signed in at this point, so failing here would strand them
    // in an empty garden at /welcome. Log it and let them in; the location step
    // is a survivable landing.
    console.error('Demo seed failed:', (seedError as Error).message)
  }

  // 303 so the browser follows the redirect with GET rather than re-POSTing.
  return NextResponse.redirect(`${origin}/overview`, { status: 303 })
}
