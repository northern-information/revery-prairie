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
import { createFloraLifecycleEntry } from '../floraLifecycleEntry'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { checkHouseTransition, enterHouse } from '../house'
import { isWalkableTile, posKey } from '../position'
import { createGameState } from '../state'
import { FloraSpecies, TileType, Zone } from '../types'
import {
  createLittleHouseYard,
  enterLittleHouseYardFromApron,
  enterLittleHouseYardFromHouse,
  exitLittleHouseYardToOverworld,
  sampleYardFlora,
} from '../yard'
import { hasFogOfWar } from '../visibility'
import { tickWeather } from '../weather'
import { isReentryLocked } from '../zoneTransition'
import { createTestState } from './helpers'

import type { ZoneTransition } from '../types'

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

    it('rings the perimeter with Fence, except for the 3-tile gate', () => {
      // top + bottom rows
      for (let x = 0; x < yard.width; x++) {
        const expectedTop = TileType.Fence
        const onGate = Math.abs(x - YARD_GATE_X) <= 1
        const expectedBottom = onGate ? TileType.FenceGate : TileType.Fence
        expect(yard.map[0][x].type).toBe(expectedTop)
        expect(yard.map[yard.height - 1][x].type).toBe(expectedBottom)
      }
      // left + right columns (skip the corners already tested)
      for (let y = 1; y < yard.height - 1; y++) {
        expect(yard.map[y][0].type).toBe(TileType.Fence)
        expect(yard.map[y][yard.width - 1].type).toBe(TileType.Fence)
      }
    })

    it('places exactly three FenceGate tiles, centered on the south fence edge', () => {
      let gateCount = 0
      for (const row of yard.map) {
        for (const tile of row) {
          if (tile.type === TileType.FenceGate) gateCount++
        }
      }
      expect(gateCount).toBe(3)
      expect(yard.gatePosition).toEqual({ x: YARD_GATE_X, y: YARD_GATE_Y })
      expect(yard.map[YARD_GATE_Y][YARD_GATE_X - 1].type).toBe(TileType.FenceGate)
      expect(yard.map[YARD_GATE_Y][YARD_GATE_X].type).toBe(TileType.FenceGate)
      expect(yard.map[YARD_GATE_Y][YARD_GATE_X + 1].type).toBe(TileType.FenceGate)
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
  describe('transitions', () => {
    it('apron→yard: stepping on a HouseApron tile schedules a yard-enter transition; the enter handler places the player at the gate and stashes the apron', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.map = state.overworldMap
      state.mapWidth = state.overworldMapWidth
      state.mapHeight = state.overworldMapHeight
      const px = state.player.x
      const py = state.player.y
      state.map[py][px] = { type: TileType.HouseApron }
      state.zoneTransition = null

      const detected = checkHouseTransition(state)
      expect(detected).toBe(true)
      const transition = state.zoneTransition as ZoneTransition | null
      if (transition === null) throw new Error('no transition')
      expect(transition.kind).toBe('yard')
      expect(transition.direction).toBe('enter')
      expect(transition.irisCenter).toEqual({ x: px, y: py })

      // Run the enter handler directly (simulating the deferred swap).
      enterLittleHouseYardFromApron(state, transition.irisCenter)
      expect(state.currentZone).toBe(Zone.LittleHouseYard)
      expect(state.map).toBe(state.yardMap)
      expect(state.player).toEqual(state.yardGatePosition)
      expect(state.yardEntryApron).toEqual({ x: px, y: py })
    })

    it('gate→overworld: stepping on the FenceGate schedules a yard-exit; the exit handler returns the player to yardEntryApron and arms the re-entry lock', () => {
      const state = createTestState()
      const apron: { x: number; y: number } = { x: state.player.x, y: state.player.y }
      enterLittleHouseYardFromApron(state, apron)
      // Player is at the gate; this tile triggers the exit transition.
      state.zoneTransition = null
      const detected = checkHouseTransition(state)
      expect(detected).toBe(true)
      const transition = state.zoneTransition as ZoneTransition | null
      if (transition === null) throw new Error('no transition')
      expect(transition.kind).toBe('yard')
      expect(transition.direction).toBe('exit')

      exitLittleHouseYardToOverworld(state)
      expect(state.currentZone).toBe(Zone.Overworld)
      expect(state.map).toBe(state.overworldMap)
      expect(state.player).toEqual(apron)
      expect(isReentryLocked(state, apron)).toBe(true)
      expect(state.yardEntryApron).toBeNull()
    })

    it('yard→house: stepping on a HouseDoorClosed tile schedules a house-enter transition', () => {
      const state = createTestState()
      enterLittleHouseYardFromApron(state, { x: state.player.x, y: state.player.y })
      // Walk to the front door (center HouseDoorClosed tile).
      state.player = { x: state.yardFrontDoorPosition.x, y: state.yardFrontDoorPosition.y }
      state.zoneTransition = null

      const detected = checkHouseTransition(state)
      expect(detected).toBe(true)
      const transition = state.zoneTransition as ZoneTransition | null
      if (transition === null) throw new Error('no transition')
      expect(transition.kind).toBe('house')
      expect(transition.direction).toBe('enter')

      // Existing enterHouse handler runs and places the player inside the house.
      enterHouse(state)
      expect(state.currentZone).toBe(Zone.HouseInterior)
      expect(state.player).toEqual(state.houseEntranceInterior)
    })

    it('house→yard: stepping on HouseExit schedules a house-to-yard exit; the handler places the player south of the front door', () => {
      const state = createTestState()
      enterHouse(state)
      // Move to the HouseExit row at the south of the interior.
      state.player = { x: 7, y: 8 }
      state.zoneTransition = null

      const detected = checkHouseTransition(state)
      expect(detected).toBe(true)
      const transition = state.zoneTransition as ZoneTransition | null
      if (transition === null) throw new Error('no transition')
      expect(transition.kind).toBe('house-to-yard')
      expect(transition.direction).toBe('exit')

      enterLittleHouseYardFromHouse(state)
      expect(state.currentZone).toBe(Zone.LittleHouseYard)
      expect(state.player).toEqual({
        x: state.yardFrontDoorPosition.x,
        y: state.yardFrontDoorPosition.y + 1,
      })
      // yardEntryApron is untouched by the house→yard path.
      expect(state.yardEntryApron).toBeNull()
    })

    it('re-entry lock: after gate exit, stepping back onto the same apron does not re-trigger yard enter until the lock clears', () => {
      const state = createTestState()
      const apron: { x: number; y: number } = { x: state.player.x, y: state.player.y }
      state.currentZone = Zone.Overworld
      state.map = state.overworldMap
      state.mapWidth = state.overworldMapWidth
      state.mapHeight = state.overworldMapHeight
      state.map[apron.y][apron.x] = { type: TileType.HouseApron }
      // Enter the yard, then exit via gate (handler arms lock on the apron).
      enterLittleHouseYardFromApron(state, apron)
      exitLittleHouseYardToOverworld(state)
      expect(isReentryLocked(state, apron)).toBe(true)

      // Player is now on the apron. The check must NOT schedule a new transition.
      state.zoneTransition = null
      const detected = checkHouseTransition(state)
      expect(detected).toBe(false)
      expect(state.zoneTransition).toBeNull()
    })
  })
describe('flora sampling', () => {
    const seedApron = (
      state: ReturnType<typeof createTestState>,
      mix: Partial<Record<FloraSpecies, number>>
    ): void => {
      // Walk the 8 apron neighbors of houseEntranceOverworld, dropping
      // flora lifecycle entries one per tile until each species' quota
      // from `mix` is met. Order is fixed (deterministic test setup).
      const center = state.houseEntranceOverworld
      const offsets: (readonly [number, number])[] = [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]
      let i = 0
      for (const species of [FloraSpecies.Clover, FloraSpecies.TallGrass, FloraSpecies.Wildflower]) {
        const want = mix[species] ?? 0
        for (let n = 0; n < want; n++, i++) {
          const [dx, dy] = offsets[i]
          const x = center.x + dx
          const y = center.y + dy
          const identity = generateGenesisIdentity(species, 0, posKey(x, y))
          const traits = generateTraitBag(identity)
          state.floraLifecycle.set(
            posKey(x, y),
            createFloraLifecycleEntry({
              time: 0,
              hasLight: true,
              species,
              identity,
              traits,
            })
          )
        }
      }
    }

    it('tallies species on the 8 HouseApron neighbors and scatters proportionally onto yard-interior tiles', () => {
      const state = createTestState()
      seedApron(state, { [FloraSpecies.Clover]: 2, [FloraSpecies.Wildflower]: 1 })
      enterLittleHouseYardFromApron(state, { x: state.player.x, y: state.player.y })

      // 2 clover + 1 wildflower = 3 flora placed.
      expect(state.yardFlora.size).toBe(3)
      const speciesCounts = { clover: 0, wildflower: 0, tallGrass: 0 }
      for (const s of state.yardFlora.values()) {
        if (s === FloraSpecies.Clover) speciesCounts.clover++
        else if (s === FloraSpecies.Wildflower) speciesCounts.wildflower++
        else if (s === FloraSpecies.TallGrass) speciesCounts.tallGrass++
      }
      expect(speciesCounts.clover).toBe(2)
      expect(speciesCounts.wildflower).toBe(1)
      expect(speciesCounts.tallGrass).toBe(0)
    })

    it('mutates yard map tiles to TileType.Flora at each sampled position', () => {
      const state = createTestState()
      seedApron(state, { [FloraSpecies.Clover]: 1, [FloraSpecies.TallGrass]: 1 })
      enterLittleHouseYardFromApron(state, { x: state.player.x, y: state.player.y })

      for (const key of state.yardFlora.keys()) {
        const [xs, ys] = key.split(',')
        const x = Number(xs)
        const y = Number(ys)
        expect(state.yardMap[y][x].type).toBe(TileType.Flora)
      }
    })

    it('places species in alphabetical order on the (y, x)-sorted walkable interior', () => {
      // With 1 of each species placed, the first walkable Dirt tile gets
      // clover, the second gets tall grass, the third gets wildflower.
      const state = createTestState()
      seedApron(state, {
        [FloraSpecies.Clover]: 1,
        [FloraSpecies.TallGrass]: 1,
        [FloraSpecies.Wildflower]: 1,
      })
      // Compute the first three walkable Dirt tiles in (y, x) order
      // from the yard map BEFORE sampling so the assertion isn't
      // tautological.
      const expectedSlots: { x: number; y: number }[] = []
      outer: for (let y = 0; y < state.yardMapHeight; y++) {
        for (let x = 0; x < state.yardMapWidth; x++) {
          if (state.yardMap[y][x].type === TileType.Dirt) {
            expectedSlots.push({ x, y })
            if (expectedSlots.length === 3) break outer
          }
        }
      }
      enterLittleHouseYardFromApron(state, { x: state.player.x, y: state.player.y })

      expect(state.yardFlora.get(posKey(expectedSlots[0].x, expectedSlots[0].y))).toBe(FloraSpecies.Clover)
      expect(state.yardFlora.get(posKey(expectedSlots[1].x, expectedSlots[1].y))).toBe(FloraSpecies.TallGrass)
      expect(state.yardFlora.get(posKey(expectedSlots[2].x, expectedSlots[2].y))).toBe(FloraSpecies.Wildflower)
    })

    it('clears stale samples and re-runs on every yard enter event', () => {
      const state = createTestState()
      seedApron(state, { [FloraSpecies.Clover]: 3 })
      enterLittleHouseYardFromApron(state, { x: state.player.x, y: state.player.y })
      expect(state.yardFlora.size).toBe(3)
      const firstSamplePositions = Array.from(state.yardFlora.keys())

      // Wipe the apron flora and re-enter: previous samples should clear,
      // and an empty apron should produce an empty yard.
      for (const key of Array.from(state.floraLifecycle.keys())) {
        state.floraLifecycle.delete(key)
      }
      sampleYardFlora(state)
      expect(state.yardFlora.size).toBe(0)
      // The yardMap tiles that previously held Flora should be back to Dirt.
      for (const key of firstSamplePositions) {
        const [xs, ys] = key.split(',')
        const x = Number(xs)
        const y = Number(ys)
        expect(state.yardMap[y][x].type).toBe(TileType.Dirt)
      }
    })

    it('produces an empty yard when the apron has no flora', () => {
      const state = createTestState()
      // Defensive: clear any genesis flora that may have landed on the apron.
      const center = state.houseEntranceOverworld
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          state.floraLifecycle.delete(posKey(center.x + dx, center.y + dy))
        }
      }
      enterLittleHouseYardFromApron(state, { x: state.player.x, y: state.player.y })
      expect(state.yardFlora.size).toBe(0)
    })

    it('samples on the house→yard path too (HouseExit transition fires the same pass)', () => {
      const state = createTestState()
      seedApron(state, { [FloraSpecies.Wildflower]: 2 })
      enterLittleHouseYardFromHouse(state)
      expect(state.yardFlora.size).toBe(2)
      for (const s of state.yardFlora.values()) {
        expect(s).toBe(FloraSpecies.Wildflower)
      }
    })
  })
  describe('clocks, camera, and visibility', () => {
    it('pauses state.seasonalPhase advancement while in the yard (RP-51 substrate)', () => {
      const state = createTestState()
      // Reset to a known baseline.
      state.seasonalPhase = 0.1
      // Confirm overworld advances.
      tickWeather(state, 5000)
      expect(state.seasonalPhase).toBeGreaterThan(0.1)

      // Now enter the yard and tick again — phase should freeze.
      enterLittleHouseYardFromApron(state, { x: state.player.x, y: state.player.y })
      const frozenPhase = state.seasonalPhase
      tickWeather(state, 5000)
      expect(state.seasonalPhase).toBe(frozenPhase)
    })

    it('renders the yard without fog of war', () => {
      // hasFogOfWar covers Cave, Ruin, Overworld. The yard zone is
      // intentionally NOT in that list — full visibility inside the
      // claim, per the v11 R8 lock.
      expect(hasFogOfWar(Zone.LittleHouseYard)).toBe(false)
    })

    it('keeps camera bounds consistent with the active yard map after a swap', () => {
      const state = createTestState()
      enterLittleHouseYardFromApron(state, { x: state.player.x, y: state.player.y })
      // The swap copies yardMapWidth/Height into state.mapWidth/Height.
      // The camera reads those when computing offsets in updateCamera.
      expect(state.mapWidth).toBe(state.yardMapWidth)
      expect(state.mapHeight).toBe(state.yardMapHeight)
    })
  })
})
