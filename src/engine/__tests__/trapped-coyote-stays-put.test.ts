import { describe, expect, it } from 'vitest'

import { transitionCoyoteToZone } from '../coyote'
import { ComponentType } from '../ecs/types'
import { CoyoteMode, MainQuestPhase, TileType, Zone } from '../types'

import { clearAroundPlayer, createCharacterTestEntity, createTestState } from './helpers'

import type { GameState } from '../types'

const requireValue = <T>(val: T | null | undefined): T => {
  expect(val).toBeTruthy()
  return val as T
}

interface CoyoteSnapshot {
  x: number
  y: number
  zone: Zone
  ruinIndex: number | undefined
}

const findCoyote = (state: GameState): number | null => {
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (identity?.definitionId === 'coyote') return eid
  }
  return null
}

const getCoyote = (state: GameState): CoyoteSnapshot => {
  const eid = requireValue(findCoyote(state))
  const pos = requireValue(state.world.getComponent(eid, ComponentType.Position))
  const ez = requireValue(state.world.getComponent(eid, ComponentType.EntityZone))
  return { x: pos.x, y: pos.y, zone: ez.zone, ruinIndex: ez.ruinIndex }
}

describe('trapped coyote stays put on ruin entry', () => {
  it('does not teleport the trapped coyote adjacent to the player when awaiting-coyote', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    state.mainQuestPhase = MainQuestPhase.AwaitingCoyote
    state.currentZone = Zone.Ruin
    state.currentRuinIndex = 0

    // Trapped coyote spawned past the (notional) rubble — 5 tiles away.
    const trappedX = state.player.x + 5
    const trappedY = state.player.y
    state.map[trappedY][trappedX] = { type: TileType.RuinFloor }
    createCharacterTestEntity(state, 'coyote', trappedX, trappedY)

    transitionCoyoteToZone(state, Zone.Ruin)

    const coyote = getCoyote(state)
    expect(coyote.x).toBe(trappedX)
    expect(coyote.y).toBe(trappedY)
    // Not cardinally adjacent.
    const dx = Math.abs(coyote.x - state.player.x)
    const dy = Math.abs(coyote.y - state.player.y)
    expect(dx + dy).toBeGreaterThan(1)
    // Quest phase unchanged.
    expect(state.mainQuestPhase).toBe(MainQuestPhase.AwaitingCoyote)
  })

  it('does not drag the trapped coyote out to the overworld on ruin exit while awaiting-coyote', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    state.mainQuestPhase = MainQuestPhase.AwaitingCoyote
    // Caller (exitRuin) sets state.currentZone to Overworld before calling
    // transitionCoyoteToZone(state, Zone.Overworld). Coyote still has
    // EntityZone Ruin from its trapped spawn.
    state.currentZone = Zone.Overworld
    state.currentRuinIndex = null

    const trappedX = state.player.x + 5
    const trappedY = state.player.y
    createCharacterTestEntity(state, 'coyote', trappedX, trappedY)
    // Tag coyote as in the ruin (matching what spawnDormantGardenItems does).
    const eid = requireValue(findCoyote(state))
    state.world.addComponent(eid, ComponentType.EntityZone, {
      zone: Zone.Ruin,
      ruinIndex: 0,
    })

    transitionCoyoteToZone(state, Zone.Overworld)

    const coyote = getCoyote(state)
    expect(coyote.x).toBe(trappedX)
    expect(coyote.y).toBe(trappedY)
    expect(coyote.zone).toBe(Zone.Ruin)
    expect(coyote.ruinIndex).toBe(0)
  })

  it('still teleports a rescued coyote adjacent to the player across zone transitions', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    // Post-rescue: phase has advanced past AwaitingCoyote.
    state.mainQuestPhase = MainQuestPhase.Gathering
    state.coyoteMode = CoyoteMode.Follow
    state.currentZone = Zone.Cave
    state.currentRuinIndex = null

    // Companion coyote starts 8 tiles east of player.
    const startX = state.player.x + 8
    const startY = state.player.y
    createCharacterTestEntity(state, 'coyote', startX, startY, {
      behavior: { type: 'follow' },
    })

    transitionCoyoteToZone(state, Zone.Cave)

    const coyote = getCoyote(state)
    const dx = Math.abs(coyote.x - state.player.x)
    const dy = Math.abs(coyote.y - state.player.y)
    // Cardinally adjacent to player after the follow-transition.
    expect(dx + dy).toBe(1)
  })
})
