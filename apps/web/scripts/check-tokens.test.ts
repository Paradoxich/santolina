/**
 * Pins check E of the token guard: no component re-types a token's channels.
 *
 * The incident (2026-08-17, type-colour audit). Rule 6 has said since July
 * that a token must not re-type another token's channels, and check B
 * enforced it — but only inside packages/tokens/index.css, because that is
 * the only file it reads. Three copies were living in components the whole
 * time and the guard was structurally unable to see them:
 *
 *   ExploreBrowse.tsx / ExplorePhotoPicker.tsx   rgba(17,20,17,0.8) = sage-950
 *   ExploreBrowse.tsx                            rgba(255,255,255,0.2) = white
 *
 * Every case below is written against the ACTUAL pre-fix source lines. They
 * fail against a guard that only reads index.css, which is the point: check
 * B's first version went green against a faithful reproduction of the defect
 * it was written for, and that is the mistake this file exists not to repeat.
 */

import { describe, expect, it } from 'vitest'
import {
  CHANNEL_COPY_EXEMPT,
  findComponentChannelCopies,
  primitivesByChannels,
} from './check-tokens'

/** The real tokens the copies below were copies OF. */
const TOKENS = [
  { name: '--color-sage-950', value: '#111411' },
  { name: '--color-white', value: '#ffffff' },
  { name: '--color-fern-700', value: '#2b6e3f' },
  { name: '--color-scrim', value: 'rgb(0 0 0 / 0.5)' },
  // A derived token: must never be mistaken for a primitive.
  {
    name: '--color-surface-field',
    value: 'rgb(from var(--color-white) r g b / 0.6)',
  },
]

const primitives = () => primitivesByChannels(TOKENS)

describe('check E — components may not re-type a token', () => {
  it('catches the scrim copy that shipped in two files', () => {
    // Verbatim from ExploreBrowse.tsx:150 before the fix.
    const preFix =
      "const SCRIM =\n  'pointer-events-none absolute inset-0 bg-gradient-to-t " +
      "from-[rgba(17,20,17,0.8)] to-[rgba(17,20,17,0)] to-70%'"

    const { copies } = findComponentChannelCopies(primitives(), [
      { path: 'apps/web/components/ExploreBrowse.tsx', text: preFix },
      { path: 'apps/web/components/ExplorePhotoPicker.tsx', text: preFix },
    ])

    expect(copies.length).toBeGreaterThanOrEqual(2)
    expect(copies.every((c) => c.token === '--color-sage-950')).toBe(true)
    expect(new Set(copies.map((c) => c.file)).size).toBe(2)
  })

  it('catches the invented translucent white', () => {
    // Verbatim from ExploreBrowse.tsx:262 before the fix.
    const preFix =
      'className="rounded-card-dashboard border border-card-translucent ' +
      'bg-[rgba(255,255,255,0.2)] p-card-padding"'

    const { copies } = findComponentChannelCopies(primitives(), [
      { path: 'apps/web/components/ExploreBrowse.tsx', text: preFix },
    ])

    expect(copies).toHaveLength(1)
    expect(copies[0]!.token).toBe('--color-white')
  })

  it('passes the fixed code — the token reference is not a copy', () => {
    const fixed =
      "const SCRIM = 'absolute inset-0 bg-[image:var(--photo-tile-scrim)]'\n" +
      'className="bg-surface-card"'

    const { copies } = findComponentChannelCopies(primitives(), [
      { path: 'apps/web/components/ExploreBrowse.tsx', text: fixed },
    ])

    expect(copies).toEqual([])
  })

  it('does not flag relative colour syntax, which derives rather than copies', () => {
    const derived = '--x: rgb(from var(--color-sage-950) r g b / 0.8);'

    const { copies } = findComponentChannelCopies(primitives(), [
      { path: 'apps/web/styles/x.css', text: derived },
    ])

    expect(copies).toEqual([])
  })

  it('excepts black, which is --color-scrim’s own value and composes masks', () => {
    // CareTipsCard's fade mask. Not a colour choice at all.
    const mask =
      'const maskImage = `linear-gradient(to bottom, #000 0, #000 calc(100% - ${FADE}), transparent)`'

    const { copies } = findComponentChannelCopies(primitives(), [
      { path: 'apps/web/components/dashboard/CareTipsCard.tsx', text: mask },
    ])

    expect(copies).toEqual([])
  })

  it('leaves content colours alone — they match no token', () => {
    // A bloom swatch depicts a flower. There is no magenta in the palette and
    // there should not be; this must never become an exemption.
    const content = "{ value: 'magenta', label: 'Magenta', swatch: '#c2367e' }"

    const { copies } = findComponentChannelCopies(primitives(), [
      { path: 'apps/web/lib/bloom-colors.ts', text: content },
    ])

    expect(copies).toEqual([])
  })

  it('honours an exemption, and reports it as used', () => {
    const logo =
      '<path fill="#fff" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9z" />'

    const { copies, unusedExemptions } = findComponentChannelCopies(
      primitives(),
      [{ path: 'apps/web/components/AuthOptions.tsx', text: logo }]
    )

    expect(copies).toEqual([])
    expect(unusedExemptions).not.toContain(
      'apps/web/components/AuthOptions.tsx'
    )
  })

  it('fails an exemption that no longer waives anything', () => {
    // The ratchet half. A waiver that matches nothing is a claim about the
    // code that has stopped being true, so it has to fail rather than idle.
    const { unusedExemptions } = findComponentChannelCopies(primitives(), [
      { path: 'apps/web/components/Unrelated.tsx', text: 'const x = 1' },
    ])

    expect(unusedExemptions).toEqual(CHANNEL_COPY_EXEMPT.map((e) => e.prefix))
  })
})
