import { initiateRevery, tickRevery } from '../revery'
import { ComponentType } from '../ecs/types'
import { OmenKind, ReveryPhase, TileType, Zone } from '../types'
import { createCharacterTestEntity, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

const findEmilyPos = (state: ReturnType<typeof createTestState>) => {
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (ident?.definitionId !== 'emily') continue
    return state.world.getComponent(eid, ComponentType.Position)
  }
  return null
}

describe('precis #33 — Revery scene transition at Omen → Observing', () => {
  it('repositions the steward to the bed and Emily to the chair when confirm-in-house', () => {
    const state = createTestState()
    // Set up: in the house already, Emily entity at her idle position.
    state.currentZone = Zone.HouseInterior
    state.map = state.houseMap
    state.mapWidth = state.houseMapWidth
    state.mapHeight = state.houseMapHeight
    createCharacterTestEntity(state, 'emily', 5, 2, undefined)

    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000) // Omen → Observing

    expect(state.revery?.phase).toBe(ReveryPhase.Observing)
    expect(state.currentZone).toBe(Zone.HouseInterior)
    expect(state.player).toEqual(state.houseBedInterior)
    expect(state.playerFacing).toBe('left')
    const emilyPos = findEmilyPos(state)
    expect(emilyPos).not.toBeNull()
    expect(emilyPos?.x).toBe(state.houseChairInterior.x)
    expect(emilyPos?.y).toBe(state.houseChairInterior.y)
    expect(state.emilyReveryReturn).toEqual({ x: 5, y: 2 })
  })

  it('swaps Overworld → HouseInterior for field-summons path', () => {
    const state = createTestState()
    // Set up: player out on the overworld; Emily already in the house (created by genesis).
    state.currentZone = Zone.Overworld
    state.map = state.overworldMap
    state.mapWidth = state.overworldMapWidth
    state.mapHeight = state.overworldMapHeight
    createCharacterTestEntity(state, 'emily', 5, 2, undefined)

    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000) // Omen → Observing

    expect(state.currentZone).toBe(Zone.HouseInterior)
    expect(state.map).toBe(state.houseMap)
    expect(state.player).toEqual(state.houseBedInterior)
  })
})

describe('precis #33 — Closing-phase revert', () => {
  it('restores Emily to her idle position and resets emilyInvitation', () => {
    const state = createTestState()
    state.currentZone = Zone.HouseInterior
    state.map = state.houseMap
    state.mapWidth = state.houseMapWidth
    state.mapHeight = state.houseMapHeight
    createCharacterTestEntity(state, 'emily', 5, 2, undefined)

    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000) // Omen → Observing
    state.emilyInvitation = 'confirmed'
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, 2000) // Closing → null

    expect(state.revery).toBeNull()
    expect(state.emilyInvitation).toBe('unoffered')
    expect(state.emilyReveryReturn).toBe(null)
    const emilyPos = findEmilyPos(state)
    expect(emilyPos?.x).toBe(5)
    expect(emilyPos?.y).toBe(2)
  })

  it('skips the overworld egregore commit when collapse tile is interior (confirm path)', () => {
    const state = createTestState()
    state.currentZone = Zone.HouseInterior
    state.map = state.houseMap
    createCharacterTestEntity(state, 'emily', 5, 2, undefined)
    const initialEgregoreCount = state.egregorePositions.length

    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000) // Omen → Observing (captures collapse tile inside house)
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, 2000)

    // No new field egregore — interior tile isn't dirt-eligible.
    expect(state.egregorePositions.length).toBe(initialEgregoreCount)
  })

  it('commits the overworld egregore when collapse tile is field Dirt (field-summons path)', () => {
    const state = createTestState()
    // Player on the overworld at a Dirt tile.
    state.currentZone = Zone.Overworld
    state.map = state.overworldMap
    state.mapWidth = state.overworldMapWidth
    state.mapHeight = state.overworldMapHeight
    // Pick a tile guaranteed to be Dirt: clear the player's standing tile on overworld.
    const px = state.player.x
    const py = state.player.y
    state.overworldMap[py][px] = { type: TileType.Dirt }
    createCharacterTestEntity(state, 'emily', 5, 2, undefined)

    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000) // Omen → Observing captures collapse tile at (px, py) on overworld
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, 2000) // Closing — commit at (px, py) on overworldMap

    // The captured collapse tile should be committed to Egregore on the overworld map.
    expect(state.overworldMap[py][px].type).toBe(TileType.Egregore)
  })
})
