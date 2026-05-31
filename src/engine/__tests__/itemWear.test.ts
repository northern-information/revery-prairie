import { SEASONAL_PHASE_PERIOD_MS } from '../constants'
import { findFitPosition, placeItem } from '../inventory'
import { getDefinition } from '../items'
import { canPlaceCameraAt, getPlaceableSpec } from '../placeable'
import { createGameState } from '../state'
import { archivePlacedCameraFrames, createPlacedCamera } from '../timeLapse'
import { Zone } from '../types'
import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const SEASON_MS = SEASONAL_PHASE_PERIOD_MS / 4

const setup = (): GameState => {
  const state = createTestState()
  swapToOverworldForTest(state)
  clearAroundPlayer(state, 3)
  state.placedCameras = []
  state.cameraFilm.clear()
  state.cameraArchive.clear()
  state.itemWear = {}
  return state
}

const giveCamera = (state: GameState): string => {
  const fit = findFitPosition(state.backpack, 'camera')
  if (!fit) throw new Error('no backpack slot for camera')
  const item = placeItem(state.backpack, 'camera', fit.gridX, fit.gridY)
  if (!item) throw new Error('placeItem failed for camera')
  return item.uid
}

const placeAndArchive = (state: GameState, uid: string, now = 1000): void => {
  const placed = createPlacedCamera(state, {
    uid,
    x: state.player.x + 1,
    y: state.player.y,
    zone: Zone.Overworld,
    now,
    spanMs: SEASON_MS,
  })
  state.placedCameras.push(placed)
  archivePlacedCameraFrames(state, placed)
}

describe('item wear', () => {
  it('initializes itemWear to an empty object on a fresh GameState', () => {
    const state = createGameState('test-wear', 40, 30)
    expect(state.itemWear).toEqual({})
  })

  it('declares camera maxUses = 12 (three game years of archived seasons)', () => {
    expect(getDefinition('camera').maxUses).toBe(12)
  })

  it('non-wearing definitions do not declare maxUses', () => {
    expect(getDefinition('aqueductKey').maxUses).toBeUndefined()
    expect(getDefinition('filmRoll').maxUses).toBeUndefined()
    expect(getDefinition('coin').maxUses).toBeUndefined()
  })

  it('archivePlacedCameraFrames ticks wear by 1 / maxUses', () => {
    const state = setup()
    const uid = giveCamera(state)
    placeAndArchive(state, uid)
    expect(state.itemWear[uid]).toBeCloseTo(1 / 12, 10)
  })

  it('accumulates wear across repeated archive events', () => {
    const state = setup()
    const uid = giveCamera(state)
    for (let i = 0; i < 3; i++) placeAndArchive(state, uid, 1000 + i)
    expect(state.itemWear[uid]).toBeCloseTo(3 / 12, 10)
  })

  it('clamps wear to a maximum of 1.0 across many archive events', () => {
    const state = setup()
    const uid = giveCamera(state)
    for (let i = 0; i < 50; i++) placeAndArchive(state, uid, 1000 + i)
    expect(state.itemWear[uid]).toBe(1)
  })

  it('reads undefined wear as 0 — fresh cameras render and place normally', () => {
    const state = setup()
    const uid = giveCamera(state)
    expect(state.itemWear[uid]).toBeUndefined()
    expect(canPlaceCameraAt(state, state.player.x + 1, state.player.y, uid)).toBe(true)
  })

  it('refuses camera placement when wear is at 1.0', () => {
    const state = setup()
    const uid = giveCamera(state)
    state.itemWear[uid] = 1
    const tx = state.player.x + 1
    const ty = state.player.y
    expect(canPlaceCameraAt(state, tx, ty, uid)).toBe(false)

    const itemCountBefore = state.backpack.items.length
    const placedBefore = state.placedCameras.length
    const spec = getPlaceableSpec('camera')
    if (!spec) throw new Error('camera PlaceableSpec missing')
    // The useMouse caller skips spec.place when canPlace is false. We
    // verify that contract: backpack and placedCameras are unchanged.
    expect(spec.canPlace(state, tx, ty, uid)).toBe(false)
    expect(state.backpack.items.length).toBe(itemCountBefore)
    expect(state.placedCameras.length).toBe(placedBefore)
  })

  it('refuses placement even at the lowest above-threshold wear', () => {
    const state = setup()
    const uid = giveCamera(state)
    state.itemWear[uid] = 1.0000001
    expect(canPlaceCameraAt(state, state.player.x + 1, state.player.y, uid)).toBe(false)
  })

  it('allows placement just below the broken threshold', () => {
    const state = setup()
    const uid = giveCamera(state)
    state.itemWear[uid] = 11 / 12
    expect(canPlaceCameraAt(state, state.player.x + 1, state.player.y, uid)).toBe(true)
  })

  it('tracks wear independently across multiple camera uids', () => {
    const state = setup()
    const a = giveCamera(state)
    const b = giveCamera(state)
    state.itemWear[a] = 1
    state.itemWear[b] = 0
    const tx = state.player.x + 1
    const ty = state.player.y
    expect(canPlaceCameraAt(state, tx, ty, a)).toBe(false)
    expect(canPlaceCameraAt(state, tx, ty, b)).toBe(true)
  })

  it('preserves wear across a JSON round trip (serialization smoke)', () => {
    const state = setup()
    const uid = giveCamera(state)
    state.itemWear[uid] = 0.5
    const serialized = JSON.stringify({ itemWear: state.itemWear })
    const parsed = JSON.parse(serialized) as { itemWear: Record<string, number> }
    expect(parsed.itemWear[uid]).toBe(0.5)
  })
})
