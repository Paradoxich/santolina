/**
 * Pins OPEN_FINDINGS['demo-purge-swallows-storage-failure'] (schema design
 * review 2026-08-14 section 6b, confirmed 2026-08-16): the purge discarded
 * the Storage deletion error and then deleted the user, cascading away the
 * `diary_entries` rows whose `photo_urls` were the only pointer to those
 * objects. The run reported `photosRemoved: 0` with an empty `failures`
 * list, which is what a clean purge also reports.
 *
 * The witness is the RECORD, not a downstream symptom: after a failed
 * removal the exact paths must be on the result, captured while the rows
 * still existed. Against the pre-fix code these tests do not compile —
 * `orphanedPhotos` did not exist and `removeDiaryPhotos` returned void.
 *
 * A fake client rather than a mocked module, matching the rest of the
 * suite: `purgeExpiredDemoUsers` takes the client as a parameter.
 */

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { purgeExpiredDemoUsers } from './purge-demo-users'

const USER = '11111111-1111-4111-8111-111111111111'
const GARDEN = '22222222-2222-4222-8222-222222222222'
const PATHS = [
  `${GARDEN}/plant-a/1720000000000-rose.jpg`,
  `${GARDEN}/garden/1720000001000-frost.jpg`,
]

/**
 * Just enough of the service-role client for this function: the RPC that
 * lists expired demo accounts, the two reads that collect photo paths, the
 * storage removal, and the delete. `calls` records the order so the test can
 * assert that the paths were read before the delete that would destroy them.
 */
function fakeAdmin({ storageError }: { storageError: string | null }) {
  const calls: string[] = []

  const client = {
    rpc: async (name: string) => {
      calls.push(`rpc:${name}`)
      return {
        data: [{ user_id: USER, created_at: '2026-08-01T00:00:00.000Z' }],
        error: null,
      }
    },
    from: (table: string) => ({
      select: () => {
        calls.push(`select:${table}`)
        const rows =
          table === 'gardens'
            ? [{ id: GARDEN }]
            : [{ photo_urls: [PATHS[0]] }, { photo_urls: [PATHS[1]] }]
        const result = { data: rows, error: null }
        return {
          eq: async () => result,
          in: async () => result,
        }
      },
    }),
    storage: {
      from: () => ({
        remove: async () => {
          calls.push('storage:remove')
          return storageError
            ? { data: null, error: { message: storageError } }
            : { data: [], error: null }
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async () => {
          calls.push('auth:deleteUser')
          return { data: null, error: null }
        },
      },
    },
  }

  return { client: client as unknown as SupabaseClient, calls }
}

describe('purgeExpiredDemoUsers, when Storage removal fails', () => {
  it('records the orphaned paths on the result', async () => {
    const { client } = fakeAdmin({ storageError: 'bucket unavailable' })

    const result = await purgeExpiredDemoUsers({ apply: true, client })

    expect(result.orphanedPhotos).toHaveLength(1)
    expect(result.orphanedPhotos[0]?.id).toBe(USER)
    expect(result.orphanedPhotos[0]?.paths).toEqual(PATHS)
    expect(result.orphanedPhotos[0]?.message).toBe('bucket unavailable')
  })

  it('still deletes the account, so one bad object cannot stall the purge', async () => {
    const { client } = fakeAdmin({ storageError: 'bucket unavailable' })

    const result = await purgeExpiredDemoUsers({ apply: true, client })

    expect(result.deleted).toBe(1)
    expect(result.failures).toEqual([])
  })

  it('reads the paths before the delete that destroys the rows holding them', async () => {
    const { client, calls } = fakeAdmin({ storageError: 'bucket unavailable' })

    await purgeExpiredDemoUsers({ apply: true, client })

    expect(calls.indexOf('select:diary_entries')).toBeLessThan(
      calls.indexOf('auth:deleteUser')
    )
  })

  it('does not count a failed removal as photos removed', async () => {
    const { client } = fakeAdmin({ storageError: 'bucket unavailable' })

    const result = await purgeExpiredDemoUsers({ apply: true, client })

    // The defect: this was also 0 on the failure path, which is exactly what
    // a clean purge reports. `orphanedPhotos` is what now separates them.
    expect(result.photosRemoved).toBe(0)
    expect(result.orphanedPhotos).not.toEqual([])
  })
})

describe('purgeExpiredDemoUsers, when Storage removal succeeds', () => {
  it('reports no orphans and counts the submitted paths', async () => {
    const { client } = fakeAdmin({ storageError: null })

    const result = await purgeExpiredDemoUsers({ apply: true, client })

    expect(result.orphanedPhotos).toEqual([])
    expect(result.photosRemoved).toBe(PATHS.length)
    expect(result.deleted).toBe(1)
  })

  it('deletes nothing on a dry run', async () => {
    const { client, calls } = fakeAdmin({ storageError: null })

    const result = await purgeExpiredDemoUsers({ apply: false, client })

    expect(result.expired).toHaveLength(1)
    expect(result.deleted).toBe(0)
    expect(calls).not.toContain('auth:deleteUser')
    expect(calls).not.toContain('storage:remove')
  })
})
