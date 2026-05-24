import { checkHouseTransition, createHouseInterior, enterHouse, exitHouse } from '../house'
import { TileType, Zone } from '../types'

import type { ZoneTransition } from '../types'
import { createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
    expect(r.bedInterior).toEqual({ x: 13, y: 4 })
    expect(r.chairInterior).toEqual({ x: 1, y: 4 })
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

  it('places furniture tiles at the documented positions', () => {
    const r = createHouseInterior()
    expect(r.map[4][13].type).toBe(TileType.HouseBed)
    expect(r.map[4][1].type).toBe(TileType.HouseChair)
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
  it('schedules an enter transition when the player stands on or beside HouseEntrance', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.map = state.overworldMap
    state.mapWidth = state.overworldMapWidth
    state.mapHeight = state.overworldMapHeight
    // Place a HouseEntrance adjacent to the player so the 3x3 hitbox triggers.
    const px = state.player.x
    const py = state.player.y
    state.map[py][px + 1] = { type: TileType.HouseEntrance }
    state.zoneTransition = null

    const detected = checkHouseTransition(state)
    expect(detected).toBe(true)
    const transition = state.zoneTransition as ZoneTransition | null
    if (transition === null) throw new Error('no transition')
    expect(transition.kind).toBe('house')
    expect(transition.direction).toBe('enter')
  })

  it('schedules an exit transition when the player steps on a HouseExit tile', () => {
    const state = createTestState()
    enterHouse(state)
    // Player is at houseEntranceInterior (7, 7); step south onto the exit row.
    state.player = { x: 7, y: 8 }
    state.zoneTransition = null

    const detected = checkHouseTransition(state)
    expect(detected).toBe(true)
    const transition = state.zoneTransition as ZoneTransition | null
    if (transition === null) throw new Error('no transition')
    expect(transition.kind).toBe('house')
    expect(transition.direction).toBe('exit')
  })
})
