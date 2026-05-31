import { checkHouseTransition, createHouseInterior, enterHouse, exitHouse } from '../house'
import { TileType, Zone } from '../types'
import { createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ZoneTransition } from '../types'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RP-33 — house interior layout', () => {
  it('returns a 15 x 9 map with the deterministic furniture layout', () => {
    const r = createHouseInterior()
    expect(r.width).toBe(15)
    expect(r.height).toBe(9)
    expect(r.map.length).toBe(9)
    expect(r.map[0].length).toBe(15)
    expect(r.spawnInterior).toEqual({ x: 9, y: 2 })
    expect(r.exitInterior).toEqual({ x: 7, y: 8 })
  })

  it('has an unbroken HouseWall perimeter except the 3-wide south door', () => {
    const r = createHouseInterior()
    // North wall: fully intact (fireplace stands in row 1, not in the wall).
    for (let x = 0; x < r.width; x++) {
      expect(r.map[0][x].type).toBe(TileType.HouseWall)
    }
    // South wall: 3-wide HouseExit gap at x = 6, 7, 8.
    for (let x = 0; x < r.width; x++) {
      const expected = x === 6 || x === 7 || x === 8 ? TileType.HouseExit : TileType.HouseWall
      expect(r.map[r.height - 1][x].type).toBe(expected)
    }
    // Corners.
    expect(r.map[0][0].type).toBe(TileType.HouseWall)
    expect(r.map[0][14].type).toBe(TileType.HouseWall)
    expect(r.map[8][0].type).toBe(TileType.HouseWall)
    expect(r.map[8][14].type).toBe(TileType.HouseWall)
  })

  it('places a 3-wide fireplace in row 1 with a 3-wide hearth in row 2', () => {
    const r = createHouseInterior()
    expect(r.map[1][6].type).toBe(TileType.Fireplace)
    expect(r.map[1][7].type).toBe(TileType.Fireplace)
    expect(r.map[1][8].type).toBe(TileType.Fireplace)
    expect(r.map[2][6].type).toBe(TileType.HouseHearth)
    expect(r.map[2][7].type).toBe(TileType.HouseHearth)
    expect(r.map[2][8].type).toBe(TileType.HouseHearth)
  })

  it('fills the interior with HouseFloor outside the fireplace/hearth row', () => {
    const r = createHouseInterior()
    // v11 R7 — bed and chair were dropped. The interior is now floor.
    expect(r.map[4][13].type).toBe(TileType.HouseFloor)
    expect(r.map[4][1].type).toBe(TileType.HouseFloor)
  })
})

describe('RP-33 — enter/exitHouse swap handlers', () => {
  it('enterHouse swaps active map to houseMap and sets currentZone', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.map = state.overworldMap
    state.mapWidth = state.overworldMapWidth
    state.mapHeight = state.overworldMapHeight

    enterHouse(state)

    expect(state.currentZone).toBe(Zone.HouseInterior)
    expect(state.map).toBe(state.houseMap)
    expect(state.player).toEqual(state.houseEntranceInterior)
  })

  it('exitHouse swaps back to overworldMap and finds a safe exit position', () => {
    const state = createTestState()
    // Move to house first
    enterHouse(state)
    expect(state.currentZone).toBe(Zone.HouseInterior)
    // Now exit
    exitHouse(state)
    expect(state.currentZone).toBe(Zone.Overworld)
    expect(state.map).toBe(state.overworldMap)
  })
})

describe('RP-33 — checkHouseTransition detection', () => {
  it('schedules a yard-enter transition when the player steps onto HouseEntrance (RP-67 amendment)', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.map = state.overworldMap
    state.mapWidth = state.overworldMapWidth
    state.mapHeight = state.overworldMapHeight
    // RP-67 amendment: the overworld 3x3 around the house no longer
    // enters the house directly — it enters the yard. The player must
    // be ON the entrance or apron tile, not adjacent.
    const px = state.player.x
    const py = state.player.y
    state.map[py][px] = { type: TileType.HouseEntrance }
    state.zoneTransition = null

    const detected = checkHouseTransition(state)
    expect(detected).toBe(true)
    const transition = state.zoneTransition as ZoneTransition | null
    if (transition === null) throw new Error('no transition')
    expect(transition.kind).toBe('yard')
    expect(transition.direction).toBe('enter')
  })

  it('schedules a house-to-yard exit transition when the player steps on a HouseExit tile (RP-67 amendment)', () => {
    const state = createTestState()
    enterHouse(state)
    // Player is at houseEntranceInterior (7, 7); step south onto the exit row.
    state.player = { x: 7, y: 8 }
    state.zoneTransition = null

    const detected = checkHouseTransition(state)
    expect(detected).toBe(true)
    const transition = state.zoneTransition as ZoneTransition | null
    if (transition === null) throw new Error('no transition')
    // RP-67 amendment: HouseExit routes to the yard, not the overworld.
    expect(transition.kind).toBe('house-to-yard')
    expect(transition.direction).toBe('exit')
  })
})
