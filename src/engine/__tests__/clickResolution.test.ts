import { afterEach, describe, expect, it, vi } from 'vitest'

import { expandClickTile, tileHasClickable } from '../clickResolution'

import { clearAroundPlayer, createCharacterTestEntity, createTestState } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tileHasClickable', () => {
  it('returns true for the player tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    expect(tileHasClickable(state, { x: state.player.x, y: state.player.y })).toBe(true)
  })

  it('returns true for a controllable unit tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const cx = state.player.x + 2
    const cy = state.player.y
    createCharacterTestEntity(state, 'coyote', cx, cy, { behavior: { type: 'follow' } })
    expect(tileHasClickable(state, { x: cx, y: cy })).toBe(true)
  })

  it('returns true for a non-controllable character tile (ghost)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const gx = state.player.x + 3
    const gy = state.player.y
    createCharacterTestEntity(state, 'ghost-1', gx, gy, {
      behavior: { type: 'drift', moveChance: 0.15, freezeOnDialog: true },
    })
    expect(tileHasClickable(state, { x: gx, y: gy })).toBe(true)
  })

  it('returns false for empty terrain', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    expect(tileHasClickable(state, { x: state.player.x + 4, y: state.player.y })).toBe(false)
  })

  it('returns false for out-of-bounds tiles', () => {
    const state = createTestState()
    expect(tileHasClickable(state, { x: -1, y: 0 })).toBe(false)
    expect(tileHasClickable(state, { x: 0, y: -1 })).toBe(false)
    expect(tileHasClickable(state, { x: state.mapWidth, y: 0 })).toBe(false)
    expect(tileHasClickable(state, { x: 0, y: state.mapHeight })).toBe(false)
  })
})

describe('expandClickTile', () => {
  it('returns the input tile when it already has a clickable', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const cx = state.player.x + 2
    const cy = state.player.y
    createCharacterTestEntity(state, 'coyote', cx, cy, { behavior: { type: 'follow' } })
    expect(expandClickTile(state, { x: cx, y: cy })).toEqual({ x: cx, y: cy })
  })

  it('snaps north neighbor when click lands one tile south of a unit', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const cx = state.player.x + 2
    const cy = state.player.y - 2
    createCharacterTestEntity(state, 'coyote', cx, cy, { behavior: { type: 'follow' } })
    // Click landed one south of the unit — empty tile.
    const click = { x: cx, y: cy + 1 }
    expect(expandClickTile(state, click)).toEqual({ x: cx, y: cy })
  })

  it('snaps south neighbor when click lands one tile north of a unit', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const cx = state.player.x + 2
    const cy = state.player.y + 2
    createCharacterTestEntity(state, 'coyote', cx, cy, { behavior: { type: 'follow' } })
    const click = { x: cx, y: cy - 1 }
    expect(expandClickTile(state, click)).toEqual({ x: cx, y: cy })
  })

  it('snaps east neighbor when click lands one tile west of a unit', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const cx = state.player.x + 3
    const cy = state.player.y
    createCharacterTestEntity(state, 'coyote', cx, cy, { behavior: { type: 'follow' } })
    const click = { x: cx - 1, y: cy }
    expect(expandClickTile(state, click)).toEqual({ x: cx, y: cy })
  })

  it('snaps west neighbor when click lands one tile east of a unit', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const cx = state.player.x - 3
    const cy = state.player.y
    createCharacterTestEntity(state, 'coyote', cx, cy, { behavior: { type: 'follow' } })
    const click = { x: cx + 1, y: cy }
    expect(expandClickTile(state, click)).toEqual({ x: cx, y: cy })
  })

  it('returns original tile when no cardinal neighbor has a clickable', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const empty = { x: state.player.x + 4, y: state.player.y + 4 }
    expect(expandClickTile(state, empty)).toEqual(empty)
  })

  it('does not snap diagonal neighbors (only cardinal)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const cx = state.player.x + 3
    const cy = state.player.y + 3
    createCharacterTestEntity(state, 'coyote', cx, cy, { behavior: { type: 'follow' } })
    // Diagonal click — neither cardinal neighbor has the unit.
    const diagonal = { x: cx - 1, y: cy - 1 }
    expect(expandClickTile(state, diagonal)).toEqual(diagonal)
  })
})
