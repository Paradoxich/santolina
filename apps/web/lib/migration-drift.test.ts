/**
 * Migration drift comparison.
 *
 * THE FAILURE THIS GUARDS IS TRAP 14, AND IT REACHED REAL USERS.
 * `20260727120000_diary_entries_garden_level.sql` was committed, merged in the
 * PR carrying the feature that needed it, and deployed — and never applied.
 * Saving a garden-level diary note failed in production for a day. It was
 * found by hand, while applying an unrelated migration.
 *
 * The interesting half is the FALSE ALARM, which is what kept a
 * filename-to-remote diff from being written for two days. Trap 13:
 * `apply_migration` stamps its own version, so a file and its remote row
 * routinely share a name and differ in version. A version-only set difference
 * calls that one missing migration plus one unknown one — and at three live
 * drifts on the day this was written, the real "never applied" case would
 * have arrived seventh in a list of noise. A guard nobody can read is a guard
 * nobody acts on.
 *
 * MUTATION-TESTED, per the rule the round-9 rehearsal set: a guard that has
 * never failed has not been tested. Four mutations were run against this file
 * and the counts below are measured, not estimated —
 *   · deleting pass 2 (the name pairing) fails 6: all three trap-13 tests,
 *     the severity-ordering test, and both order-inversion tests, which need
 *     a pairing before there is an order to compare
 *   · pairing ambiguous names by position instead of refusing fails 1
 *   · dropping the `row.name !== null` check fails 1
 *   · comparing order on local versions rather than the reconciled remote
 *     ones fails 1
 *
 * One gap, stated rather than implied: under the ambiguous-pairing mutation
 * the SECOND ambiguity test still passes, because guessing produces two
 * version-drifts and that test only asserts the absence of `not-applied`. It
 * covers a real property and does not cover this mutation.
 *
 * No database, no API key, ~10ms — so `pnpm test` covers it and CI runs it on
 * every PR, including the PRs that carry migrations.
 */

import { describe, it, expect } from 'vitest'
import {
  compareMigrations,
  parseLocalMigrations,
  type RemoteMigration,
} from './migration-drift'

const remote = (version: string, name: string | null): RemoteMigration => ({
  version,
  name,
})

/** The shape of a healthy repo: same version, same name, both sides. */
const CLEAN_LOCAL = [
  '20260706093045_initial_schema.sql',
  '20260708121933_add_diary_entries.sql',
]
const CLEAN_REMOTE = [
  remote('20260706093045', 'initial_schema'),
  remote('20260708121933', 'add_diary_entries'),
]

describe('parseLocalMigrations', () => {
  it('splits version from name and sorts by version', () => {
    const { migrations } = parseLocalMigrations([
      '20260708121933_add_diary_entries.sql',
      '20260706093045_initial_schema.sql',
    ])
    expect(migrations.map((m) => m.version)).toEqual([
      '20260706093045',
      '20260708121933',
    ])
    expect(migrations[0]!.name).toBe('initial_schema')
  })

  it('keeps underscores in the name rather than splitting on the first', () => {
    const { migrations } = parseLocalMigrations([
      '20260716120000_add_guard_checked_at.sql',
    ])
    expect(migrations[0]!.name).toBe('add_guard_checked_at')
  })

  it('reports a misnamed file instead of skipping it', () => {
    const { migrations, malformed } = parseLocalMigrations([
      'fix_the_thing.sql',
      '20260706093045_initial_schema.sql',
    ])
    expect(migrations).toHaveLength(1)
    expect(malformed).toEqual(['fix_the_thing.sql'])
  })
})

describe('a repo that agrees with its remote', () => {
  it('reports nothing', () => {
    const report = compareMigrations(CLEAN_LOCAL, CLEAN_REMOTE)
    expect(report.findings).toEqual([])
    expect(report.matched).toBe(2)
    expect(report.localCount).toBe(2)
    expect(report.remoteCount).toBe(2)
  })

  it('does not care what order the directory listing arrives in', () => {
    const report = compareMigrations([...CLEAN_LOCAL].reverse(), CLEAN_REMOTE)
    expect(report.findings).toEqual([])
  })
})

describe('trap 14 — committed but never applied', () => {
  it('names the file and says the change is not live', () => {
    const report = compareMigrations(
      [...CLEAN_LOCAL, '20260727120000_diary_entries_garden_level.sql'],
      CLEAN_REMOTE
    )
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]!.kind).toBe('not-applied')
    expect(report.findings[0]!.subject).toBe(
      '20260727120000_diary_entries_garden_level.sql'
    )
    expect(report.findings[0]!.detail).toContain('NOT APPLIED')
  })

  it('sorts ahead of every other kind, because it is the dangerous one', () => {
    const report = compareMigrations(
      [
        ...CLEAN_LOCAL,
        '20260727120000_diary_entries_garden_level.sql',
        // A trap-13 drift, which is noisy and harmless by comparison.
        '20260729170000_expired_demo_users.sql',
        'not_a_migration.sql',
      ],
      [...CLEAN_REMOTE, remote('20260729164307', 'expired_demo_users')]
    )
    expect(report.findings[0]!.kind).toBe('not-applied')
    expect(report.findings.map((f) => f.kind)).toEqual([
      'not-applied',
      'version-drift',
      'malformed',
    ])
  })
})

describe('trap 13 — applied under a version the remote generated', () => {
  it('pairs on name and does NOT report it as never applied', () => {
    const report = compareMigrations(
      ['20260729170000_expired_demo_users.sql'],
      [remote('20260729164307', 'expired_demo_users')]
    )
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]!.kind).toBe('version-drift')
    // The whole point: neither of the two false alarms is emitted.
    expect(report.findings.map((f) => f.kind)).not.toContain('not-applied')
    expect(report.findings.map((f) => f.kind)).not.toContain('remote-only')
  })

  it('gives the git mv that fixes it, pointing at the remote version', () => {
    const report = compareMigrations(
      ['20260729170000_expired_demo_users.sql'],
      [remote('20260729164307', 'expired_demo_users')]
    )
    expect(report.findings[0]!.remedy).toBe(
      'git mv supabase/migrations/20260729170000_expired_demo_users.sql ' +
        'supabase/migrations/20260729164307_expired_demo_users.sql'
    )
  })

  // The three drifts this check found on its first live run (2026-07-30) and
  // that the same PR reconciled. Kept as a fixture because it is the exact
  // shape that would otherwise have printed six findings instead of three.
  it('handles those three at once without inventing a fourth', () => {
    const report = compareMigrations(
      [
        '20260729083058_add_image_verified_at.sql',
        '20260729120000_invalidate_editorial_verdict.sql',
        '20260729140000_editorial_verdict_per_criterion.sql',
        '20260729170000_expired_demo_users.sql',
      ],
      [
        remote('20260729083058', 'add_image_verified_at'),
        remote('20260729101133', 'invalidate_editorial_verdict'),
        remote('20260729112046', 'editorial_verdict_per_criterion'),
        remote('20260729164307', 'expired_demo_users'),
      ]
    )
    expect(report.findings.map((f) => f.kind)).toEqual([
      'version-drift',
      'version-drift',
      'version-drift',
    ])
    expect(report.matched).toBe(1)
  })
})

describe('applied with no committed file', () => {
  it('reports a live schema change that has no source', () => {
    const report = compareMigrations(CLEAN_LOCAL, [
      ...CLEAN_REMOTE,
      remote('20260730090000_add_secret_column', 'add_secret_column'),
    ])
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]!.kind).toBe('remote-only')
  })

  it('does not pair a null-named remote row with an arbitrary file', () => {
    const report = compareMigrations(
      ['20260727120000_diary_entries_garden_level.sql'],
      [remote('20260726000000', null)]
    )
    const kinds = report.findings.map((f) => f.kind)
    expect(kinds).toContain('not-applied')
    expect(kinds).toContain('remote-only')
    expect(kinds).not.toContain('version-drift')
  })
})

describe('same version, different name', () => {
  it('reports name drift and not a missing migration', () => {
    const report = compareMigrations(
      ['20260706093045_initial_schema.sql'],
      [remote('20260706093045', 'initial_schema_v2')]
    )
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]!.kind).toBe('name-drift')
    expect(report.matched).toBe(0)
  })

  it('accepts a null remote name rather than calling it a mismatch', () => {
    // Tooling that recorded no name is not evidence the file is wrong. Failing
    // here would make the check cry wolf on rows nobody can fix.
    const report = compareMigrations(
      ['20260706093045_initial_schema.sql'],
      [remote('20260706093045', null)]
    )
    expect(report.findings).toEqual([])
    expect(report.matched).toBe(1)
  })
})

describe('a repeated name', () => {
  it('refuses to guess a pairing instead of printing a confident git mv', () => {
    const report = compareMigrations(
      [
        '20260728100000_add_column.sql',
        '20260728110000_add_column.sql',
        '20260728120000_add_column.sql',
      ],
      [
        remote('20260728100001', 'add_column'),
        remote('20260728110001', 'add_column'),
      ]
    )
    expect(report.findings.every((f) => f.kind === 'ambiguous')).toBe(true)
    expect(report.findings).toHaveLength(3)
    // A wrong `git mv` here would rename a file onto another migration's
    // version, so silence about which is which is the only honest answer.
    // (`.not.toContain(expect.stringContaining(...))` looks like this
    // assertion and is not — toContain matches by identity, so it passes
    // against any array of strings whatsoever.)
    expect(report.findings.some((f) => f.remedy.includes('git mv'))).toBe(false)
  })

  it('does not also report the ambiguous files as never applied', () => {
    const report = compareMigrations(
      ['20260728100000_add_column.sql', '20260728110000_add_column.sql'],
      [remote('20260728100001', 'add_column')]
    )
    expect(report.findings.map((f) => f.kind)).not.toContain('not-applied')
  })
})

describe('order inversion', () => {
  it('fires when reconciling filenames would reorder the directory', () => {
    // b sits after a in the directory, but the remote applied it first.
    const report = compareMigrations(
      ['20260729120000_a.sql', '20260729140000_b.sql'],
      [remote('20260729112046', 'b'), remote('20260729164307', 'a')]
    )
    const inversion = report.findings.find((f) => f.kind === 'order-inversion')
    expect(inversion).toBeDefined()
    expect(inversion?.subject).toBe('20260729140000_b.sql')
  })

  it('stays quiet when a trap-13 rename preserves relative order', () => {
    // The exact case docs/database-log.md says was checked by hand in July:
    // add_is_greenery must still precede add_greenery_checked_at.
    const report = compareMigrations(
      [
        '20260724120000_add_is_greenery.sql',
        '20260724120500_add_greenery_checked_at.sql',
      ],
      [
        remote('20260724120842', 'add_is_greenery'),
        remote('20260724120938', 'add_greenery_checked_at'),
      ]
    )
    expect(report.findings.map((f) => f.kind)).toEqual([
      'version-drift',
      'version-drift',
    ])
  })

  it('ignores unapplied files, which have no remote order to invert', () => {
    const report = compareMigrations(
      [...CLEAN_LOCAL, '20260727120000_never_applied.sql'],
      CLEAN_REMOTE
    )
    expect(report.findings.map((f) => f.kind)).toEqual(['not-applied'])
  })
})

describe('an empty remote', () => {
  it('reports every file rather than reporting success', () => {
    // The vacuous-scope shape from the round-9 rehearsal: 0 === 0 must not
    // read as "nothing to do". An empty ledger means nothing is applied.
    const report = compareMigrations(CLEAN_LOCAL, [])
    expect(report.findings).toHaveLength(2)
    expect(report.findings.every((f) => f.kind === 'not-applied')).toBe(true)
  })
})
