import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { UserFacingError, failureMessage } from './failure'

// A source scan, not a behaviour test, because the defect it pins is a shape:
// 26 call sites across 11 components rendered a thrown Error's own message to
// the user, with friendly copy sitting beside it as an `instanceof Error`
// fallback that could never fire. Postgres text and internal row language
// ("Palette row not found in the current garden") reached the UI for months.
// Fixing the 26 closes the incident; only a scan keeps the 27th from arriving,
// since the wrong version is shorter to write than the right one.
//
// Every exemption is listed with its reason. A new one is a decision someone
// has to defend in review, which is the point.

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIRS = ['components', 'app', 'hooks']

/** Reading a thrown message is fine; only PUTTING it in front of a reader is not. */
const BANNED =
  /(?:err|error)\s+instanceof\s+Error\s*\?\s*(?:err|error)\.message|\((?:err|error) as Error\)\.message/

const ALLOWED: Record<string, string> = {
  // Inspects Supabase's message to CHOOSE its own copy; never displays it.
  'components/DemoConvertModal.tsx':
    'matches on error.message to pick between two written sentences',
}

function sourceFiles(dir: string): string[] {
  const abs = join(ROOT, dir)
  let entries: string[]
  try {
    entries = readdirSync(abs)
  } catch {
    return []
  }
  return entries.flatMap((name) => {
    const rel = join(dir, name)
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel)
    return /\.tsx?$/.test(name) ? [rel] : []
  })
}

describe('no component shows a thrown error to the user', () => {
  it('finds the banned shape nowhere outside the listed exemptions', () => {
    const offenders = sourceFiles('.')
      .filter((f) => DIRS.some((d) => f.startsWith(`${d}/`)))
      .filter((f) => !(f in ALLOWED))
      .filter((f) => BANNED.test(readFileSync(join(ROOT, f), 'utf8')))

    expect(offenders).toEqual([])
  })

  it('has no stale exemption', () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(
        src.includes('error.message') || src.includes('err.message'),
        `${file} no longer reads a thrown message, so its exemption (${reason}) is stale — delete it`
      ).toBe(true)
    }
  })
})

describe('failureMessage', () => {
  it('returns the caller copy, never what was thrown', () => {
    const shown = failureMessage(
      new Error('duplicate key value violates unique constraint'),
      'Could not save your note. Try again.'
    )
    expect(shown).toBe('Could not save your note. Try again.')
  })

  it('is copy-only for a non-Error throw too', () => {
    expect(failureMessage('offline', 'Could not save. Try again.')).toBe(
      'Could not save. Try again.'
    )
  })
})

describe('UserFacingError', () => {
  it('is distinguishable from an ordinary Error', () => {
    expect(new UserFacingError('Written for a reader.')).toBeInstanceOf(
      UserFacingError
    )
    expect(new Error('Failed to add diary entry: …')).not.toBeInstanceOf(
      UserFacingError
    )
  })
})
