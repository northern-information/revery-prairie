import { checkHouseTransition, createHouseInterior, enterHouse, exitHouse } from '../house'
import { TileType, Zone } from '../types'

import type { ZoneTransition } from '../types'
import { createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('precis #33 — house interior layout', () => {
  it('returns a 30 x 18 map with the deterministic furniture layout', () => {
    const r = createHouseInterior()
    expect(r.width).toBe(30)
    expect(r.height).toBe(18)
    expect(r.map.length).toBe(18)
    expect(r.map[0].length).toBe(30)
    expect(r.spawnInterior).toEqual({ x: 15, y: 16 })
    expect(r.exitInterior).toEqual({ x: 15, y: 17 })
    expect(r.bedInterior).toEqual({ x: 28, y: 8 })
    expect(r.chairInterior).toEqual({ x: 2, y: 8 })
  })

  it('has a HouseWall perimeter', () => {
    const r = createHouseInterior()
    for (let x = 0; x < r.width; x++) {
      // Corners and the 3-wide south door break the perimeter at the
      // bottom edge; check the rest.
      if (x === 14 || x === 15 || x === 16) continue
      expect(r.map[r.height - 1][x].type).toBe(TileType.HouseWall)
    }
    expect(r.map[0][0].type).toBe(TileType.HouseWall)
    expect(r.map[0][29].type).toBe(TileType.HouseWall)
    expect(r.map[17][0].type).toBe(TileType.HouseWall)
    expect(r.map[17][29].type).toBe(TileType.HouseWall)
  })

  it('places the 3-wide HouseExit at south wall center', () => {
    const r = createHouseInterior()
    expect(r.map[17][14].type).toBe(TileType.HouseExit)
    expect(r.map[17][15].type).toBe(TileType.HouseExit)
    expect(r.map[17][16].type).toBe(TileType.HouseExit)
  })

  it('places furniture tiles at the documented positions', () => {
    const r = createHouseInterior()
    expect(r.map[0][15].type).toBe(TileType.Fireplace)
    expect(r.map[8][28].type).toBe(TileType.HouseBed)
    expect(r.map[8][2].type).toBe(TileType.HouseChair)
  })
})

describe('precis #33 — enter/exitHouse swap handlers', () => {
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

describe('precis #33 — checkHouseTransition detection', () => {
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
    // Player is at houseEntranceInterior (15, 16); step south onto the exit row.
    state.player = { x: 15, y: 17 }
    state.zoneTransition = null

    const detected = checkHouseTransition(state)
    expect(detected).toBe(true)
    const transition = state.zoneTransition as ZoneTransition | null
    if (transition === null) throw new Error('no transition')
    expect(transition.kind).toBe('house')
    expect(transition.direction).toBe('exit')
  })
})
