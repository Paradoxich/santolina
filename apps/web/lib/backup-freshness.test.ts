import { describe, expect, it } from 'vitest'

import { assessFreshness, folderDate } from './backup-freshness'

const NOW = new Date('2026-08-18T12:00:00.000Z')
const obj = (folder: string, bytes = 1_600_000) => ({ folder, bytes })

describe('folderDate', () => {
  it('reads the date prefix of a stamp folder', () => {
    expect(folderDate('2026-08-17T03-12-04-123Z')?.toISOString()).toBe(
      '2026-08-17T00:00:00.000Z'
    )
  })

  it('returns null for anything without one', () => {
    expect(folderDate('scratch')).toBeNull()
    expect(folderDate('2026-13-40T00-00-00-000Z')).toBeNull()
  })
})

describe('assessFreshness', () => {
  it('passes a recent non-empty dump', () => {
    const v = assessFreshness([obj('2026-08-17T03-12-04-123Z')], NOW, 10)
    expect(v).toMatchObject({ ok: true, kind: 'fresh', ageDays: 1 })
  })

  it('fails an empty bucket — the silent case a job failure cannot report', () => {
    expect(assessFreshness([], NOW, 10)).toMatchObject({
      ok: false,
      kind: 'none',
    })
  })

  // The 2026-08-03 run failed on a pooler timeout and nobody noticed for 15
  // days. From inside the repo that is indistinguishable from a quiet week;
  // from the bucket it is this.
  it('fails when the newest dump is past the window', () => {
    const v = assessFreshness([obj('2026-08-03T03-12-04-123Z')], NOW, 10)
    expect(v).toMatchObject({ ok: false, kind: 'stale', ageDays: 15 })
  })

  it('holds at the boundary and fails one day past it', () => {
    expect(assessFreshness([obj('2026-08-08T03-12-04-123Z')], NOW, 10).ok).toBe(
      true
    )
    expect(assessFreshness([obj('2026-08-07T03-12-04-123Z')], NOW, 10).ok).toBe(
      false
    )
  })

  it('fails a recent upload that carries no bytes', () => {
    const v = assessFreshness([obj('2026-08-17T03-12-04-123Z', 0)], NOW, 10)
    expect(v).toMatchObject({ ok: false, kind: 'empty', bytes: 0 })
  })

  it('judges the newest folder, and sums the objects inside it', () => {
    const v = assessFreshness(
      [
        obj('2026-06-01T03-12-04-123Z'),
        obj('2026-08-17T03-12-04-123Z', 900),
        obj('2026-08-17T03-12-04-123Z', 100),
      ],
      NOW,
      10
    )
    expect(v).toMatchObject({
      ok: true,
      newest: '2026-08-17T03-12-04-123Z',
      bytes: 1000,
    })
  })

  // An undated folder is reported, never counted: something that cannot be
  // dated cannot be evidence that a backup is recent.
  it('never lets an undated folder stand in for a backup', () => {
    const v = assessFreshness([obj('scratch')], NOW, 10)
    expect(v).toMatchObject({ ok: false, kind: 'none', undated: ['scratch'] })
  })
})
