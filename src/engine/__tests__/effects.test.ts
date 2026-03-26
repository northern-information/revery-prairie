import { describe, expect, it } from 'vitest'

import { AURA_RADIUS, getTileEffects } from '../effects'
import { createGameState } from '../state'

import type { Character } from '../types'

const makeState = () => {
  const state = createGameState('test', 80, 40)
  state.characters = []
  return state
}

describe('getTileEffects', () => {
  it('returns rain when position is within rain aura radius', () => {
    const state = makeState()
    const gron: Character = { definitionId: 'gron', pos: { x: 50, y: 50 }, aura: 'rain' }
    state.characters.push(gron)

    expect(getTileEffects(state, 53, 50)).toEqual(['rain'])
  })

  it('returns empty when position is outside rain aura radius', () => {
    const state = makeState()
    const gron: Character = { definitionId: 'gron', pos: { x: 50, y: 50 }, aura: 'rain' }
    state.characters.push(gron)

    expect(getTileEffects(state, 60, 50)).toEqual([])
  })

  it('includes position at exact boundary (dx²+dy² = r²)', () => {
    const state = makeState()
    const r = AURA_RADIUS['rain']!
    const gron: Character = { definitionId: 'gron', pos: { x: 50, y: 50 }, aura: 'rain' }
    state.characters.push(gron)

    // Place at exactly r tiles east — dx²+dy² = r²
    expect(getTileEffects(state, 50 + r, 50)).toEqual(['rain'])
  })

  it('returns rain when position is on the character tile (distance 0)', () => {
    const state = makeState()
    const gron: Character = { definitionId: 'gron', pos: { x: 50, y: 50 }, aura: 'rain' }
    state.characters.push(gron)

    expect(getTileEffects(state, 50, 50)).toEqual(['rain'])
  })

  it('returns empty when character has no aura', () => {
    const state = makeState()
    const npc: Character = { definitionId: 'gron', pos: { x: 50, y: 50 } }
    state.characters.push(npc)

    expect(getTileEffects(state, 50, 50)).toEqual([])
  })

  it('deduplicates overlapping same-type auras', () => {
    const state = makeState()
    state.characters.push({ definitionId: 'gron', pos: { x: 50, y: 50 }, aura: 'rain' })
    state.characters.push({ definitionId: 'gron', pos: { x: 52, y: 50 }, aura: 'rain' })

    // Position 51,50 is within radius of both
    const effects = getTileEffects(state, 51, 50)
    expect(effects).toEqual(['rain'])
  })

  it('returns empty when no characters exist', () => {
    const state = makeState()
    expect(getTileEffects(state, 50, 50)).toEqual([])
  })
})
