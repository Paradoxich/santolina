/**
 * THE GATE ON RUNBOOK STEP 6a, pinned.
 *
 * WHAT THIS EXISTS TO STOP. The step CLEARS image_checked_at, which is what
 * re-arms a row for the vision pass at 7a. It is an `alwaysRun` book-end, so
 * it runs on every invocation of every round — including the re-run after a
 * later step fails. If its selection were "the round's plants" rather than
 * "the round's plants with nothing to judge", every one of those runs would
 * re-arm rows the pass had already judged and 7a would be re-billed for them.
 * That is round 13's `curate-plants` retry (one bad row, all 33 re-billed) in
 * a step nobody watches, because a book-end prints no cost.
 *
 * The gate is the whole safety argument for `alwaysRun`, so it is asserted
 * here rather than described in the step's comment. `needsWikimediaCandidate`
 * is exported for exactly this: a gate observable only by running a live round
 * is a gate nothing pins.
 */

import { describe, it, expect } from 'vitest'
import {
  needsWikimediaCandidate,
  parseNameList,
} from './feed-wikimedia-candidates'
import type { ImageCandidate } from '../lib/image-shortlist'

const trefle = (
  category: string,
  url = `https://trefle/${category}`
): ImageCandidate => ({
  url,
  category,
})

const wikimedia: ImageCandidate = {
  url: 'https://commons/p18.jpg',
  category: 'wikimedia',
  source: 'wikimedia',
  attribution: { license: 'CC BY-SA 4.0' } as ImageCandidate['attribution'],
}

describe('the step selects only plants with nothing to judge', () => {
  it('selects a plant with no candidates at all', () => {
    // The round-13 case: Trefle returned nothing usable, and until this step
    // was in the runbook the only thing that said so was the placeholder.
    expect(
      needsWikimediaCandidate({ image_url: null, image_candidates: null })
    ).toBe(true)
    expect(
      needsWikimediaCandidate({ image_url: null, image_candidates: [] })
    ).toBe(true)
  })

  it('selects a plant whose candidates the shortlist would never take', () => {
    // Ten candidates and nothing to look at: `seed` is in neither
    // PRIMARY_CATEGORIES nor FALLBACK_CATEGORIES, so shortlist returns empty
    // and the vision pass has as little to judge as it would with none.
    // Asking the pass's own selector is the point — a predicate written from
    // scratch here would drift from the one that decides.
    const row = {
      image_url: null,
      image_candidates: Array.from({ length: 10 }, (_, i) =>
        trefle('seed', `https://trefle/seed-${i}`)
      ),
    }
    expect(needsWikimediaCandidate(row)).toBe(true)
  })

  it('leaves a plant Trefle already covered alone', () => {
    expect(
      needsWikimediaCandidate({
        image_url: null,
        image_candidates: [trefle('flower'), trefle('habit')],
      })
    ).toBe(false)
  })

  it('leaves a plant alone whose only candidate is its incumbent hero', () => {
    // The incumbent always earns a shortlist slot, so this plant has something
    // to judge even though its candidate is filed under a category the
    // round-robin skips. Selecting it would clear a stamp for no new option.
    const hero = 'https://trefle/bark-1'
    expect(
      needsWikimediaCandidate({
        image_url: hero,
        image_candidates: [trefle('bark', hero)],
      })
    ).toBe(false)
  })
})

describe('the gate is what makes an alwaysRun step idempotent', () => {
  it('does not select a plant this step has already widened', () => {
    // THE ASSERTION THE STEP'S SAFETY RESTS ON. After a successful run the row
    // carries a Wikimedia candidate and a NULL image_checked_at. If it were
    // still selected, the next invocation — and every `run-round` re-run makes
    // one, because this is a book-end — would clear the stamp again and re-bill
    // the vision pick for a plant already judged.
    //
    // Note it must hold even though the shortlist is otherwise empty: a plant
    // with no Trefle candidates and one Wikimedia candidate is the exact state
    // a successful run leaves behind, and the empty-shortlist half of the gate
    // reads true for it forever.
    expect(
      needsWikimediaCandidate({
        image_url: null,
        image_candidates: [wikimedia],
      })
    ).toBe(false)
  })

  it('does not select it after the pass has picked the Wikimedia photo', () => {
    expect(
      needsWikimediaCandidate({
        image_url: wikimedia.url,
        image_candidates: [wikimedia],
      })
    ).toBe(false)
  })
})

describe('the human path still reads an explicit list', () => {
  it('drops comments and blanks and keeps the order, once each', () => {
    // --file is the reviewer's path and is deliberately ungated: it re-feeds
    // plants a PERSON rejected, which no candidate-count predicate can see.
    expect(
      parseNameList(
        '# heading\n\nCornelian cherry\nFringed bleeding heart\nCornelian cherry\n'
      )
    ).toEqual(['Cornelian cherry', 'Fringed bleeding heart'])
  })
})
