import { advanceInHand, clearInHandIfRemoved, getInHandItem, releaseInHand, takeInHand } from '../inHand'
import { autoSort, findFitPosition, placeItem } from '../inventory'
import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

// RP-59 — the in-hand layer owns state.equippedItemUid. In-hand is a uid
// reference into the backpack (never a move), so it must survive autoSort and
// clear cleanly when the item leaves the bag.

const give = (state: GameState, defId: string): string => {
  const fit = findFitPosition(state.backpack, defId)
  if (!fit) throw new Error(`no backpack slot for ${defId}`)
  const item = placeItem(state.backpack, defId, fit.gridX, fit.gridY)
  if (!item) throw new Error(`placeItem failed for ${defId}`)
  return item.uid
}

const setup = (): GameState => {
  const state = createTestState()
  swapToOverworldForTest(state)
  clearAroundPlayer(state, 2)
  return state
}

describe('in-hand layer', () => {
  it('takes and releases an item by uid', () => {
    const state = setup()
    const uid = give(state, 'meteorite')

    takeInHand(state, uid)
    expect(state.equippedItemUid).toBe(uid)
    expect(getInHandItem(state)?.uid).toBe(uid)

    releaseInHand(state)
    expect(state.equippedItemUid).toBeNull()
    expect(getInHandItem(state)).toBeNull()
  })

  it('getInHandItem self-heals a dangling reference', () => {
    const state = setup()
    state.equippedItemUid = 'no-such-uid'
    expect(getInHandItem(state)).toBeNull()
    expect(state.equippedItemUid).toBeNull()
  })

  it('advanceInHand moves to another instance of the same definition', () => {
    const state = setup()
    const first = give(state, 'meteorite')
    const second = give(state, 'meteorite')
    takeInHand(state, first)

    advanceInHand(state, 'meteorite', first)
    expect(state.equippedItemUid).toBe(second)
  })

  it('advanceInHand clears to null when no like item remains', () => {
    const state = setup()
    const only = give(state, 'meteorite')
    takeInHand(state, only)

    advanceInHand(state, 'meteorite', only)
    expect(state.equippedItemUid).toBeNull()
  })

  it('advanceInHand picks the lowest gridY then gridX deterministically', () => {
    const state = setup()
    const held = placeItem(state.backpack, 'meteorite', 3, 3)
    const lower = placeItem(state.backpack, 'meteorite', 2, 1)
    placeItem(state.backpack, 'meteorite', 5, 1)
    if (!held || !lower) throw new Error('test setup failed')
    takeInHand(state, held.uid)

    advanceInHand(state, 'meteorite', held.uid)
    // (2,1) and (5,1) share the lowest gridY; the lower gridX wins.
    expect(state.equippedItemUid).toBe(lower.uid)
  })

  it('survives autoSort — the uid reference is preserved across the sort', () => {
    const state = setup()
    give(state, 'coin')
    const uid = give(state, 'meteorite')
    give(state, 'coin')
    takeInHand(state, uid)

    autoSort(state.backpack)

    // The instance still exists under the same uid, so in-hand still resolves.
    expect(state.equippedItemUid).toBe(uid)
    expect(getInHandItem(state)?.uid).toBe(uid)
  })

  it('clearInHandIfRemoved clears only when the removed uid matches', () => {
    const state = setup()
    const a = give(state, 'meteorite')
    const b = give(state, 'meteorite')
    takeInHand(state, a)

    clearInHandIfRemoved(state, b)
    expect(state.equippedItemUid).toBe(a)

    clearInHandIfRemoved(state, a)
    expect(state.equippedItemUid).toBeNull()
  })
})
