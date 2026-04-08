import { describe, expect, it } from 'vitest'

import {
  activateActionBarSlot,
  assignActionBarSlot,
  autoAssignRevery,
  clearActionBarSlot,
  getFacingTile,
  getSlotCooldownFraction,
} from '../actionBar'
import { ComponentType } from '../ecs/types'
import { createGameState } from '../state'
import { TileType } from '../types'

import type { GameState } from '../types'

const makeState = (): GameState => {
  const state = createGameState('test', 40, 30)
  // Ensure the facing tile is walkable dirt
  const target = getFacingTile(state)
  if (state.map[target.y]?.[target.x]) {
    state.map[target.y][target.x] = { type: TileType.Dirt }
  }
  return state
}

describe('assignActionBarSlot', () => {
  it('sets a slot with revery', () => {
    const state = makeState()
    assignActionBarSlot(state, 0, 'revery', 'fire')

    expect(state.actionBar[0]).toEqual({
      kind: 'revery',
      id: 'fire',
      cooldownEndTime: 0,
      cooldownDurationMs: 0,
    })
  })

  it('sets a slot with item', () => {
    const state = makeState()
    assignActionBarSlot(state, 2, 'item', 'bee')

    expect(state.actionBar[2]?.kind).toBe('item')
    expect(state.actionBar[2]?.id).toBe('bee')
  })

  it('ignores out-of-range indices', () => {
    const state = makeState()
    // Clear pre-assigned earth revery for this test
    state.actionBar[0] = null
    assignActionBarSlot(state, -1, 'revery', 'fire')
    assignActionBarSlot(state, 4, 'revery', 'fire')

    expect(state.actionBar.every((s) => s === null)).toBe(true)
  })
})

describe('clearActionBarSlot', () => {
  it('clears a filled slot', () => {
    const state = makeState()
    assignActionBarSlot(state, 1, 'revery', 'water')
    clearActionBarSlot(state, 1)

    expect(state.actionBar[1]).toBeNull()
  })
})

describe('activateActionBarSlot', () => {
  it('returns false for empty slot', () => {
    const state = makeState()
    // Slot 3 is empty (slot 0 has pre-assigned earth)
    expect(activateActionBarSlot(state, 3, 1000)).toBe(false)
  })

  it('returns true and sets cooldown for revery slot', () => {
    const state = makeState()
    assignActionBarSlot(state, 0, 'revery', 'fire')

    const now = 5000
    const result = activateActionBarSlot(state, 0, now)

    expect(result).toBe(true)
    expect(state.actionBar[0]?.cooldownEndTime).toBe(now + 12000)
    expect(state.actionBar[0]?.cooldownDurationMs).toBe(12000)
  })

  it('returns false while on cooldown', () => {
    const state = makeState()
    assignActionBarSlot(state, 0, 'revery', 'fire')

    activateActionBarSlot(state, 0, 5000)
    const result = activateActionBarSlot(state, 0, 6000)

    expect(result).toBe(false)
  })

  it('allows re-activation after cooldown expires', () => {
    const state = makeState()
    assignActionBarSlot(state, 0, 'revery', 'fire')

    activateActionBarSlot(state, 0, 5000)
    const result = activateActionBarSlot(state, 0, 18000)

    expect(result).toBe(true)
  })

  it('returns false for item slots (deferred)', () => {
    const state = makeState()
    assignActionBarSlot(state, 0, 'item', 'bee')

    expect(activateActionBarSlot(state, 0, 1000)).toBe(false)
  })

  it('activates scan-style revery from player position', () => {
    const state = makeState()
    assignActionBarSlot(state, 1, 'revery', 'earth')

    const now = 5000
    const result = activateActionBarSlot(state, 1, now)

    expect(result).toBe(true)
    expect(state.actionBar[1]?.cooldownEndTime).toBe(now + 12000)
    expect(state.actionBar[1]?.cooldownDurationMs).toBe(12000)

    // Should create ECS entity with Position (player pos), not MultiPosition
    const entities = state.world
      .query(ComponentType.TimedEffect, ComponentType.EntityTag)
      .filter(eid => {
        const tag = state.world.getComponent(eid, ComponentType.EntityTag)
        const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
        return tag === 'reveryCast' && effect?.reveryId === 'earth'
      })
    expect(entities).toHaveLength(1)

    const eid = entities[0]
    const pos = state.world.getComponent(eid, ComponentType.Position)
    expect(pos).toEqual({ x: state.player.x, y: state.player.y })
  })

  it('records earth-revery discovery on scan activation', () => {
    const state = makeState()
    assignActionBarSlot(state, 1, 'revery', 'earth')

    activateActionBarSlot(state, 1, 5000)

    expect(state.manualDiscoveries.has('event:earth-revery')).toBe(true)
  })
})

describe('getSlotCooldownFraction', () => {
  it('returns 0 when no cooldown', () => {
    const slot = { kind: 'revery' as const, id: 'fire', cooldownEndTime: 0, cooldownDurationMs: 0 }
    expect(getSlotCooldownFraction(slot, 1000)).toBe(0)
  })

  it('returns 1 at start of cooldown', () => {
    const slot = { kind: 'revery' as const, id: 'fire', cooldownEndTime: 8000, cooldownDurationMs: 3000 }
    expect(getSlotCooldownFraction(slot, 5000)).toBe(1)
  })

  it('returns 0.5 at midpoint', () => {
    const slot = { kind: 'revery' as const, id: 'fire', cooldownEndTime: 8000, cooldownDurationMs: 3000 }
    expect(getSlotCooldownFraction(slot, 6500)).toBeCloseTo(0.5)
  })

  it('returns 0 after cooldown expires', () => {
    const slot = { kind: 'revery' as const, id: 'fire', cooldownEndTime: 8000, cooldownDurationMs: 3000 }
    expect(getSlotCooldownFraction(slot, 9000)).toBe(0)
  })
})

describe('autoAssignRevery', () => {
  it('assigns to first empty slot', () => {
    const state = makeState()
    // Slot 0 has earth pre-assigned, so fire goes to slot 1
    autoAssignRevery(state, 'fire')

    expect(state.actionBar[1]?.kind).toBe('revery')
    expect(state.actionBar[1]?.id).toBe('fire')
  })

  it('skips filled slots', () => {
    const state = makeState()
    // Slot 0 = earth (pre-assigned), slot 1 = fire
    assignActionBarSlot(state, 1, 'revery', 'fire')
    autoAssignRevery(state, 'water')

    expect(state.actionBar[2]?.id).toBe('water')
  })

  it('does nothing when all slots are full', () => {
    const state = makeState()
    for (let i = 0; i < 4; i++) {
      assignActionBarSlot(state, i, 'revery', 'fire')
    }
    autoAssignRevery(state, 'water')

    expect(state.actionBar.every((s) => s?.id === 'fire')).toBe(true)
  })
})
