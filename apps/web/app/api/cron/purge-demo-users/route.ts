/**
 * Vercel Cron entry point for lib/purge-demo-users.ts — the only reason this
 * app has an API route instead of a server action (nothing in the browser
 * ever calls this). Schedule lives in vercel.json at the repo root.
 *
 * Vercel signs cron requests with a bearer token equal to CRON_SECRET, sent
 * as `Authorization: Bearer <CRON_SECRET>`. Reject anything else so this
 * endpoint can't be used to mass-delete anonymous accounts by a third party
 * who finds the URL.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { purgeExpiredDemoUsers } from '@/lib/purge-demo-users'

export async function GET(request: NextRequest) {
  const secret = process.env['CRON_SECRET']
  const authHeader = request.headers.get('authorization')

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await purgeExpiredDemoUsers({ apply: true })

  return NextResponse.json({
    cutoff: result.cutoff,
    maxAgeDays: result.maxAgeDays,
    found: result.expired.length,
    deleted: result.deleted,
    photosRemoved: result.photosRemoved,
    failures: result.failures,
  })
}
