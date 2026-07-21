import { describe, expect, it } from 'vitest'
import { parseRevertList } from './image-reverts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('parseRevertList', () => {
  it('takes the leading id from an export line, ignoring the inline name comment', () => {
    expect(parseRevertList(`${A}  # Absinthe`)).toEqual([A])
  })

  it('skips full-comment lines — the export folds other verdicts in as comments', () => {
    const text = [
      '# REVERT TO PREVIOUS PHOTO (1):',
      `${A}  # Absinthe`,
      '# NEEDS A NEW PHOTO SOURCED (1):',
      '#   Verbascum olympicum',
      '# CONFIRMED GOOD (1):',
      '#   Adam’s-needle',
    ].join('\n')
    // Only the one un-commented id line is acted on; a name sitting in a
    // comment must never be mistaken for something to change.
    expect(parseRevertList(text)).toEqual([A])
  })

  it('dedupes repeated ids', () => {
    expect(parseRevertList(`${A}\n${A}\n${B}`)).toEqual([A, B])
  })

  it('is case-insensitive and normalises to lowercase', () => {
    expect(parseRevertList(A.toUpperCase())).toEqual([A])
  })

  it('ignores blank lines and lines with no id', () => {
    expect(parseRevertList(`\n\n${A}\njust some prose\n\n`)).toEqual([A])
  })

  it('returns nothing for an all-comment file', () => {
    expect(parseRevertList('# nothing here\n#   Foo\n')).toEqual([])
  })
})
