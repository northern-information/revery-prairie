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
import { createLittleHouseYard } from '../yard'

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

  describe('createLittleHouseYard', () => {
    const yard = createLittleHouseYard()

    it('produces a 23x32 map', () => {
      expect(yard.width).toBe(23)
      expect(yard.height).toBe(32)
      expect(yard.map.length).toBe(32)
      expect(yard.map[0].length).toBe(23)
    })

    it('rings the perimeter with Fence, except for the gate', () => {
      // top + bottom rows
      for (let x = 0; x < yard.width; x++) {
        const expectedTop = TileType.Fence
        const expectedBottom = x === YARD_GATE_X ? TileType.FenceGate : TileType.Fence
        expect(yard.map[0][x].type).toBe(expectedTop)
        expect(yard.map[yard.height - 1][x].type).toBe(expectedBottom)
      }
      // left + right columns (skip the corners already tested)
      for (let y = 1; y < yard.height - 1; y++) {
        expect(yard.map[y][0].type).toBe(TileType.Fence)
        expect(yard.map[y][yard.width - 1].type).toBe(TileType.Fence)
      }
    })

    it('places exactly one FenceGate, at the south-edge center', () => {
      let gateCount = 0
      for (const row of yard.map) {
        for (const tile of row) {
          if (tile.type === TileType.FenceGate) gateCount++
        }
      }
      expect(gateCount).toBe(1)
      expect(yard.gatePosition).toEqual({ x: YARD_GATE_X, y: YARD_GATE_Y })
      expect(yard.map[YARD_GATE_Y][YARD_GATE_X].type).toBe(TileType.FenceGate)
    })

    it('frames the house with HouseEaves and fills the interior with HouseRoof', () => {
      const houseEastX = YARD_HOUSE_OFFSET_X + HOUSE_WIDTH - 1
      const houseSouthY = YARD_HOUSE_OFFSET_Y + HOUSE_HEIGHT - 1
      for (let y = YARD_HOUSE_OFFSET_Y; y <= houseSouthY; y++) {
        for (let x = YARD_HOUSE_OFFSET_X; x <= houseEastX; x++) {
          const tile = yard.map[y][x].type
          const onPerimeter = x === YARD_HOUSE_OFFSET_X || x === houseEastX || y === YARD_HOUSE_OFFSET_Y || y === houseSouthY
          const isFrontDoorCell = y === houseSouthY && Math.abs(x - YARD_FRONT_DOOR_X) <= 1
          if (isFrontDoorCell) {
            expect(tile).toBe(TileType.HouseDoorClosed)
          } else if (onPerimeter) {
            expect(tile).toBe(TileType.HouseEaves)
          } else {
            expect(tile).toBe(TileType.HouseRoof)
          }
        }
      }
    })

    it('places exactly three HouseDoorClosed tiles, on the south face of the house roof', () => {
      let doorCount = 0
      for (const row of yard.map) {
        for (const tile of row) {
          if (tile.type === TileType.HouseDoorClosed) doorCount++
        }
      }
      expect(doorCount).toBe(3)
      expect(yard.map[YARD_FRONT_DOOR_Y][YARD_FRONT_DOOR_X - 1].type).toBe(TileType.HouseDoorClosed)
      expect(yard.map[YARD_FRONT_DOOR_Y][YARD_FRONT_DOOR_X].type).toBe(TileType.HouseDoorClosed)
      expect(yard.map[YARD_FRONT_DOOR_Y][YARD_FRONT_DOOR_X + 1].type).toBe(TileType.HouseDoorClosed)
      expect(yard.frontDoorPosition).toEqual({ x: YARD_FRONT_DOOR_X, y: YARD_FRONT_DOOR_Y })
    })

    it('fills the walkable yard interior (everything not house, not fence) with Dirt', () => {
      const houseEastX = YARD_HOUSE_OFFSET_X + HOUSE_WIDTH - 1
      const houseSouthY = YARD_HOUSE_OFFSET_Y + HOUSE_HEIGHT - 1
      // Spot-check: a tile north of the house, west of the house, south of the house, east of the house.
      const sampleCoords = [
        { x: 11, y: 1 }, // north of house, inside fence
        { x: 1, y: 8 }, // west of house, inside fence
        { x: 11, y: 13 }, // immediately south of house (will host the bulkhead when RP-37 lands)
        { x: 21, y: 8 }, // east of house, inside fence
        { x: 11, y: 25 }, // deep front yard
      ]
      for (const c of sampleCoords) {
        expect(yard.map[c.y][c.x].type).toBe(TileType.Dirt)
      }
      // Sanity: house bounding box is not Dirt anywhere
      for (let y = YARD_HOUSE_OFFSET_Y; y <= houseSouthY; y++) {
        for (let x = YARD_HOUSE_OFFSET_X; x <= houseEastX; x++) {
          expect(yard.map[y][x].type).not.toBe(TileType.Dirt)
        }
      }
    })

    it('exposes the yard via state at genesis', () => {
      const state = createGameState('test-steward', 800, 600)
      expect(state.yardMapWidth).toBe(23)
      expect(state.yardMapHeight).toBe(32)
      expect(state.yardGatePosition).toEqual({ x: YARD_GATE_X, y: YARD_GATE_Y })
      expect(state.yardFrontDoorPosition).toEqual({ x: YARD_FRONT_DOOR_X, y: YARD_FRONT_DOOR_Y })
      expect(state.yardMap[YARD_GATE_Y][YARD_GATE_X].type).toBe(TileType.FenceGate)
    })
  })
  it.todo('stepping on an overworld HouseApron triggers yard enter at the gate')
  it.todo('stepping on a FenceGate exits yard back to the apron entered from')
  it.todo('stepping on HouseDoorClosed enters the house interior')
  it.todo('HouseExit in the house interior routes to the yard, not the overworld')
  it.todo('yard enter samples the 8 HouseApron tiles deterministically')
  it.todo('yard pauses state.timeOfDay and state.season')
  it.todo('yard re-entry lock prevents immediate yo-yo loop')
})
