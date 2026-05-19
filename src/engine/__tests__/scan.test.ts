import { commitScan, selectScanTarget } from '../scan'
import { ComponentType } from '../ecs/types'
import { posKey } from '../position'
import { FloraSpecies, TileType } from '../types'

import { createTestFloraEntry } from './helpers/createTestFloraEntry'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

const countPickupBlooms = (state: ReturnType<typeof createTestState>): number =>
  state.world
    .query(ComponentType.TimedEffect, ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'pickupBloom').length

// Place a flora tile of the given species at (x, y) and return the identity.
const placeFlora = (state: ReturnType<typeof createTestState>, x: number, y: number, species: FloraSpecies): string => {
  state.map[y][x] = { type: TileType.Flora }
  const key = posKey(x, y)
  const entry = createTestFloraEntry({ posKey: key, species })
  state.floraLifecycle.set(key, entry)
  return entry.identity
}

describe('selectScanTarget', () => {
  it('returns null when no flora is on or adjacent to the player', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    expect(selectScanTarget(state)).toBeNull()
  })

  it('selects the on-tile flora when the player stands on a flora tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    const id = placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    const target = selectScanTarget(state)
    expect(target).not.toBeNull()
    expect(target?.position).toEqual({ x: state.player.x, y: state.player.y })
    expect(target?.species).toBe(FloraSpecies.Clover)
    expect(target?.identity).toBe(id)
  })

  it('prefers the tile in playerFacing direction over other neighbors', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    state.playerFacing = 'right'
    // Place flora on left, right, and below. Right should win.
    placeFlora(state, state.player.x - 1, state.player.y, FloraSpecies.Wildflower)
    const facingId = placeFlora(state, state.player.x + 1, state.player.y, FloraSpecies.Clover)
    placeFlora(state, state.player.x, state.player.y + 1, FloraSpecies.TallGrass)
    const target = selectScanTarget(state)
    expect(target?.identity).toBe(facingId)
    expect(target?.species).toBe(FloraSpecies.Clover)
  })

  it('falls back to CARDINAL order when no flora is in the facing direction', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    state.playerFacing = 'right' // east — no flora there
    // Place flora only to the north and south. CARDINAL order is N, S, W, E,
    // so north should win.
    const northId = placeFlora(state, state.player.x, state.player.y - 1, FloraSpecies.Clover)
    placeFlora(state, state.player.x, state.player.y + 1, FloraSpecies.Wildflower)
    const target = selectScanTarget(state)
    expect(target?.identity).toBe(northId)
  })

  it('ignores a diagonal facing (no diagonal flora picked over cardinal)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    state.playerFacing = 'upRight'
    // Place flora only to the north — diagonal facing should fall through
    // to CARDINAL order (N wins).
    const northId = placeFlora(state, state.player.x, state.player.y - 1, FloraSpecies.Clover)
    const target = selectScanTarget(state)
    expect(target?.identity).toBe(northId)
  })

  it('returns null when adjacent tiles are non-flora', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    // No flora anywhere near the player
    expect(selectScanTarget(state)).toBeNull()
  })
})

describe('commitScan', () => {
  it('is a no-op when scanInProgress is null', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    const id = placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    state.scanInProgress = null
    commitScan(state, 1000)
    expect(state.scannedSpecimens.has(FloraSpecies.Clover)).toBe(false)
    expect(state.manualDiscoveries.has('flora:clover')).toBe(false)
    // Reference id to satisfy lint (id is used to document intent — same
    // identity should still be present on the tile, untouched).
    expect(state.floraLifecycle.get(posKey(state.player.x, state.player.y))?.identity).toBe(id)
  })

  it('records the discovery and caches the specimen on first scan', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    const id = placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    state.scanInProgress = { target: { x: state.player.x, y: state.player.y }, species: FloraSpecies.Clover, startTime: 0 }
    commitScan(state, 1500)
    expect(state.manualDiscoveries.has('flora:clover')).toBe(true)
    expect(state.scannedSpecimens.get(FloraSpecies.Clover)).toBe(id)
  })

  it('preserves the cached identity when scanning a second plant of the same species', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const firstId = placeFlora(state, state.player.x, state.player.y, FloraSpecies.Wildflower)
    state.scanInProgress = {
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Wildflower,
      startTime: 0,
    }
    commitScan(state, 1500)
    expect(state.scannedSpecimens.get(FloraSpecies.Wildflower)).toBe(firstId)

    // Move player to a new tile and place a different wildflower there.
    // Different posKey → different identity.
    state.map[state.player.y][state.player.x] = { type: TileType.Dirt }
    state.floraLifecycle.delete(posKey(state.player.x, state.player.y))
    state.player = { x: state.player.x + 2, y: state.player.y }
    const secondId = placeFlora(state, state.player.x, state.player.y, FloraSpecies.Wildflower)
    expect(secondId).not.toBe(firstId)
    state.scanInProgress = {
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Wildflower,
      startTime: 0,
    }
    commitScan(state, 3000)
    // Cached identity is still the first one.
    expect(state.scannedSpecimens.get(FloraSpecies.Wildflower)).toBe(firstId)
  })

  it('aborts the commit when the target species no longer matches', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    // Player started scanning a wildflower, but only clover is here on commit
    state.scanInProgress = { target: { x: state.player.x, y: state.player.y }, species: FloraSpecies.Wildflower, startTime: 0 }
    commitScan(state, 1500)
    expect(state.manualDiscoveries.has('flora:wildflower')).toBe(false)
    expect(state.manualDiscoveries.has('flora:clover')).toBe(false)
    expect(state.scannedSpecimens.size).toBe(0)
  })

  it('aborts the commit when the target tile no longer holds a flora', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    // No flora placed — selectScanTarget returns null
    state.scanInProgress = { target: { x: state.player.x, y: state.player.y }, species: FloraSpecies.Clover, startTime: 0 }
    commitScan(state, 1500)
    expect(state.manualDiscoveries.has('flora:clover')).toBe(false)
    expect(state.scannedSpecimens.size).toBe(0)
  })

  it('spawns a pickup bloom at the target tile on successful commit', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
    const bloomsBefore = countPickupBlooms(state)
    state.scanInProgress = { target: { x: state.player.x, y: state.player.y }, species: FloraSpecies.Clover, startTime: 0 }
    commitScan(state, 1500)
    expect(countPickupBlooms(state)).toBe(bloomsBefore + 1)
  })

  it('sets manualHighlightEntryId to flora:<species> on success and returns true', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    placeFlora(state, state.player.x, state.player.y, FloraSpecies.Wildflower)
    state.scanInProgress = {
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Wildflower,
      startTime: 0,
    }
    const result = commitScan(state, 1500)
    expect(result).toBe(true)
    expect(state.manualHighlightEntryId).toBe('flora:wildflower')
  })

  it('leaves manualHighlightEntryId untouched on aborted commit and returns false', () => {
    const state = createTestState()
    clearAroundPlayer(state, 2)
    // No flora here — commit aborts
    state.scanInProgress = {
      target: { x: state.player.x, y: state.player.y },
      species: FloraSpecies.Clover,
      startTime: 0,
    }
    state.manualHighlightEntryId = null
    const result = commitScan(state, 1500)
    expect(result).toBe(false)
    expect(state.manualHighlightEntryId).toBeNull()
  })
})
