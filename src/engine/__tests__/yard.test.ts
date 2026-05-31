import { describe, expect, it } from 'vitest'
import {
  HOUSE_HEIGHT,
  HOUSE_WIDTH,
  TILE_CHARS,
  TILE_COLORS,
  YARD_BACK_MARGIN,
  YARD_FRONT_DOOR_X,
  YARD_FRONT_DOOR_Y,
  YARD_FRONT_MARGIN,
  YARD_GATE_X,
  YARD_GATE_Y,
  YARD_HEIGHT,
  YARD_HOUSE_OFFSET_X,
  YARD_HOUSE_OFFSET_Y,
  YARD_SIDE_MARGIN,
  YARD_WIDTH,
} from '../constants'
import { isWalkableTile } from '../position'
import { createGameState } from '../state'
import { TileType, Zone } from '../types'

describe('RP-67 yard zone', () => {
  describe('foundations', () => {
    it('exports five new TileType variants for the yard exterior', () => {
      expect(TileType.HouseRoof).toBe('houseRoof')
      expect(TileType.HouseEaves).toBe('houseEaves')
      expect(TileType.HouseDoorClosed).toBe('houseDoorClosed')
      expect(TileType.Fence).toBe('fence')
      expect(TileType.FenceGate).toBe('fenceGate')
    })

    it('exports Zone.LittleHouseYard', () => {
      expect(Zone.LittleHouseYard).toBe('littleHouseYard')
    })

    it('locks yard dimensions to a 23x32 asymmetric footprint', () => {
      expect(HOUSE_WIDTH).toBe(15)
      expect(HOUSE_HEIGHT).toBe(9)
      expect(YARD_BACK_MARGIN).toBe(3)
      expect(YARD_SIDE_MARGIN).toBe(3)
      expect(YARD_FRONT_MARGIN).toBe(18)
      expect(YARD_WIDTH).toBe(23)
      expect(YARD_HEIGHT).toBe(32)
      // Front margin is 15 tiles longer than the back — the front-yard
      // axiom from v11 R8.
      expect(YARD_FRONT_MARGIN - YARD_BACK_MARGIN).toBe(15)
    })

    it('places the house footprint inside the yard with a 3-tile back/side margin', () => {
      expect(YARD_HOUSE_OFFSET_X).toBe(4)
      expect(YARD_HOUSE_OFFSET_Y).toBe(4)
    })

    it('locks the gate at the south fence center and the front door at the house south face center', () => {
      expect(YARD_GATE_X).toBe(11)
      expect(YARD_GATE_Y).toBe(31)
      expect(YARD_FRONT_DOOR_X).toBe(11)
      expect(YARD_FRONT_DOOR_Y).toBe(12)
    })

    it('marks HouseDoorClosed and FenceGate walkable; HouseRoof, HouseEaves, Fence non-walkable', () => {
      expect(isWalkableTile(TileType.HouseDoorClosed)).toBe(true)
      expect(isWalkableTile(TileType.FenceGate)).toBe(true)
      expect(isWalkableTile(TileType.HouseRoof)).toBe(false)
      expect(isWalkableTile(TileType.HouseEaves)).toBe(false)
      expect(isWalkableTile(TileType.Fence)).toBe(false)
    })

    it('registers glyph + color for each new tile type', () => {
      for (const t of [
        TileType.HouseRoof,
        TileType.HouseEaves,
        TileType.HouseDoorClosed,
        TileType.Fence,
        TileType.FenceGate,
      ]) {
        expect(TILE_CHARS[t]).toBeTruthy()
        expect(TILE_COLORS[t]).toMatch(/^#/)
      }
    })

    it('uses the hot-pink user-action color for FenceGate (matches the exit-tile idiom)', () => {
      expect(TILE_COLORS[TileType.FenceGate]).toBe('#ff69b4')
    })

    it('initializes the five new GameState yard fields at genesis', () => {
      const state = createGameState('test-steward', 800, 600)
      expect(state.yardMap).toBeDefined()
      expect(state.yardMapWidth).toBeDefined()
      expect(state.yardMapHeight).toBeDefined()
      expect(state.yardGatePosition).toBeDefined()
      expect(state.yardFrontDoorPosition).toBeDefined()
    })
  })

  it.todo('createLittleHouseYard produces a 23x32 map with the locked layout')
  it.todo('stepping on an overworld HouseApron triggers yard enter at the gate')
  it.todo('stepping on a FenceGate exits yard back to the apron entered from')
  it.todo('stepping on HouseDoorClosed enters the house interior')
  it.todo('HouseExit in the house interior routes to the yard, not the overworld')
  it.todo('yard enter samples the 8 HouseApron tiles deterministically')
  it.todo('yard pauses state.timeOfDay and state.season')
  it.todo('yard re-entry lock prevents immediate yo-yo loop')
})
