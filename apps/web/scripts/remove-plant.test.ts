/**
 * The refusals that make a catalog removal safe.
 *
 * WHAT MAKES THIS WORTH A TEST rather than a careful script. The foreign keys
 * do not protect user data here — one of them actively endangers it. Measured
 * against production on 2026-08-17:
 *
 *   palette_plants.plant_id          ON DELETE CASCADE
 *   plant_combinations.plant_id_a/b  ON DELETE CASCADE
 *   diary_entries.plant_id           NO ACTION
 *
 * So `delete from plants where id = ...` removes the plant from every user's
 * garden silently, and the database is content. The only thing standing
 * between a duplicate cleanup and somebody's garden losing a plant is
 * `assessRemoval`, which is why it is a pure function with cases rather than
 * three `if` statements inside a 200-line CLI.
 *
 * THE ASYMMETRY IS THE DESIGN: user-owned rows block, derived rows do not.
 * Combinations are regenerable by `curate-combinations` and must NEVER block,
 * or the tool refuses every plant that has companions — which is nearly all of
 * them, and a tool that always refuses is a tool nobody uses.
 *
 * This pins no trap. It guards a capability that did not exist before today,
 * which is the opposite situation: nothing has gone wrong here yet.
 */

import { describe, it, expect } from 'vitest'
import { assessRemoval, type Dependents } from './remove-plant'

const deps = (over: Partial<Dependents> = {}): Dependents => ({
  palette: 0,
  diary: 0,
  combinations: 0,
  ...over,
})

describe('assessRemoval', () => {
  it('allows a plant nothing depends on', () => {
    expect(assessRemoval(deps())).toEqual([])
  })

  it('allows a plant that only has combinations', () => {
    // The Hydrangea case this was built for: 5 combination rows, no user data.
    // Derived rows must not block or the tool is unusable.
    expect(assessRemoval(deps({ combinations: 5 }))).toEqual([])
  })

  it('refuses when a garden holds the plant', () => {
    const refusals = assessRemoval(deps({ palette: 2 }))
    expect(refusals.map((r) => r.table)).toEqual(['palette_plants'])
    // The count belongs in the message: "some gardens" is not actionable.
    expect(refusals[0]!.reason).toContain('2 garden(s)')
    expect(refusals[0]!.reason).toContain('CASCADE')
  })

  it('refuses when a diary entry references the plant', () => {
    const refusals = assessRemoval(deps({ diary: 1 }))
    expect(refusals.map((r) => r.table)).toEqual(['diary_entries'])
  })

  it('reports every blocking dependent, not just the first', () => {
    // Fixing one and re-running to discover the next is how a person ends up
    // deleting the second one impatiently.
    const refusals = assessRemoval(
      deps({ palette: 3, diary: 4, combinations: 9 })
    )
    expect(refusals.map((r) => r.table)).toEqual([
      'palette_plants',
      'diary_entries',
    ])
  })

  it('treats a single dependent row as blocking', () => {
    // Guards against a `> 1` typo, which would make exactly the one-user case
    // — the likeliest real one — pass silently.
    expect(assessRemoval(deps({ palette: 1 }))).toHaveLength(1)
  })
})
