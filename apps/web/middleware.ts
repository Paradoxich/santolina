import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase-middleware'

// Keeps the Supabase auth session fresh on every request and gates protected
// routes — updateSession redirects unauthenticated requests to /login; the
// landing and auth routes stay public. See docs/architecture.md#auth.
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Run on everything except Next.js internals and static assets, so the
    // session cookie is refreshed wherever the user navigates.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm)$).*)',
  ],
}
