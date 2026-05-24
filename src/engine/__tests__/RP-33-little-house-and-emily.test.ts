// Acceptance suite for RP-33 — the little house and Emily.
// Detailed branch coverage lives in house-interior.test.ts,
// emily-invitation.test.ts, and revery-house-scene.test.ts. This file
// asserts the high-level shape of the feature.
import { ComponentType } from '../ecs/types'
import { createHouseInterior } from '../house'
import { isWalkableTile } from '../position'
import { createGameState, enterHouseAtTenureStart } from '../state'
import { TileType, Zone } from '../types'
import { describe, expect, it } from 'vitest'

const setup = () => {
  const state = createGameState('Test', 20, 20)
  enterHouseAtTenureStart(state)
  return state
}

describe('RP-33 — the little house and Emily', () => {
  it('player starts inside the house with currentZone = HouseInterior', () => {
    const state = setup()
    expect(state.currentZone).toBe(Zone.HouseInterior)
    expect(state.player).toEqual(state.houseEntranceInterior)
    expect(state.playerFacing).toBe('left')
  })

  it('GameState shape includes the new house + Emily fields; playerSpawn is gone', () => {
    const state = setup()
    expect(state.houseMap.length).toBe(state.houseMapHeight)
    expect(state.houseEntranceOverworld).toBeDefined()
    expect(state.houseEntranceInterior).toBeDefined()
    expect(state.houseBedInterior).toEqual({ x: 13, y: 4 })
    expect(state.houseChairInterior).toEqual({ x: 1, y: 4 })
    expect(state.emilyInvitation).toBe('unoffered')
    expect(state.emilyReveryReturn).toBe(null)
    // playerSpawn must NOT exist on the state shape.
    expect((state as unknown as { playerSpawn?: unknown }).playerSpawn).toBeUndefined()
  })

  it('Emily entity exists at house-interior {5, 2} (by the hearth, west of the fire)', () => {
    const state = setup()
    let found = false
    for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
      const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
      if (ident?.definitionId !== 'emily') continue
      const pos = state.world.getComponent(eid, ComponentType.Position)
      expect(pos?.x).toBe(5)
      expect(pos?.y).toBe(2)
      found = true
    }
    expect(found).toBe(true)
  })

  it('HouseEntrance tile is placed on the overworld west of Gron', () => {
    const state = setup()
    const overworld = state.overworldMap
    const door = state.houseEntranceOverworld
    expect(overworld[door.y][door.x].type).toBe(TileType.HouseEntrance)
    // West of map center.
    const gronX = Math.floor(state.overworldMapWidth / 2)
    expect(door.x).toBeLessThanOrEqual(gronX)
  })

  it('walkability: floor walkable; wall + bed + fireplace not; chair walkable; entrance + exit walkable', () => {
    expect(isWalkableTile(TileType.HouseFloor)).toBe(true)
    expect(isWalkableTile(TileType.HouseWall)).toBe(false)
    expect(isWalkableTile(TileType.HouseBed)).toBe(false)
    expect(isWalkableTile(TileType.Fireplace)).toBe(false)
    expect(isWalkableTile(TileType.HouseChair)).toBe(true)
    expect(isWalkableTile(TileType.HouseEntrance)).toBe(true)
    expect(isWalkableTile(TileType.HouseExit)).toBe(true)
    expect(isWalkableTile(TileType.HouseApron)).toBe(true)
  })

  it('interior layout is deterministic — pink door is 3 wide', () => {
    const r = createHouseInterior()
    expect(r.map[8][6].type).toBe(TileType.HouseExit)
    expect(r.map[8][7].type).toBe(TileType.HouseExit)
    expect(r.map[8][8].type).toBe(TileType.HouseExit)
    // Adjacent south-wall tiles are HouseWall.
    expect(r.map[8][5].type).toBe(TileType.HouseWall)
    expect(r.map[8][9].type).toBe(TileType.HouseWall)
  })
})
