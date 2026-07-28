import { describe, it, expect } from 'vitest'
import { flagValue, parseScope, describeScope } from './scope'

describe('flagValue', () => {
  it('reads a flag value', () => {
    expect(flagValue('--round', ['--round', '9'])).toBe('9')
  })

  it('treats a following flag as a missing value', () => {
    // `--round --apply` means the label was forgotten.
    expect(flagValue('--round', ['--round', '--apply'])).toBeUndefined()
  })

  it('returns undefined for an absent flag', () => {
    expect(flagValue('--round', ['--all'])).toBeUndefined()
  })

  it('returns undefined for a trailing flag with no value', () => {
    expect(flagValue('--round', ['--round'])).toBeUndefined()
  })
})

describe('parseScope', () => {
  it('parses --round', () => {
    expect(parseScope(['--round', '9'])).toEqual({ kind: 'round', label: '9' })
  })

  it('parses --ids, trimming and dropping blanks', () => {
    expect(parseScope(['--ids', 'a, b ,,c'])).toEqual({
      kind: 'ids',
      ids: ['a', 'b', 'c'],
    })
  })

  it('parses --all', () => {
    expect(parseScope(['--all'])).toEqual({ kind: 'all' })
  })

  it('returns null when no scope flag is present', () => {
    expect(parseScope(['--dry-run', '--limit', '3'])).toBeNull()
  })

  it('ignores unrelated flags around the scope', () => {
    expect(parseScope(['--dry-run', '--round', '8', '--limit', '2'])).toEqual({
      kind: 'round',
      label: '8',
    })
  })

  it('throws on an ambiguous pair rather than picking one', () => {
    expect(() => parseScope(['--all', '--round', '9'])).toThrow(/Ambiguous/)
    expect(() => parseScope(['--ids', 'a', '--all'])).toThrow(/Ambiguous/)
  })

  it('throws when --ids parses to nothing', () => {
    expect(() => parseScope(['--ids', ' , ,'])).toThrow(/no ids/)
  })
})

describe('describeScope', () => {
  it('names the manifest for a round', () => {
    const line = describeScope({ kind: 'round', label: '8' }, ['a', 'b'])
    expect(line).toContain('round 8')
    expect(line).toContain('2 plant(s)')
    expect(line).toContain('rounds/8/manifest.json')
  })

  it('says whole catalog for --all', () => {
    expect(describeScope({ kind: 'all' }, null)).toContain('whole catalog')
  })
})
