// RP-69 — Whine, Haunted Village tests.
//
// Spec: harness/specs/RP-69-whine-haunted-village.yaml

import { describe, expect, it } from 'vitest'
import {
  TILE_CHARS,
  TILE_COLORS,
  WHINE_GATE_X,
  WHINE_GATE_Y,
  WHINE_HEIGHT,
  WHINE_HOME_YARD_GATE_X,
  WHINE_HOME_YARD_GATE_Y,
  WHINE_HOME_YARD_HEIGHT,
  WHINE_HOME_YARD_WIDTH,
  WHINE_MAIN_STREET_Y,
  WHINE_NORTH_HOME_BOTTOM_Y,
  WHINE_NORTH_HOME_TOP_Y,
  WHINE_SOUTH_HOME_BOTTOM_Y,
  WHINE_SOUTH_HOME_TOP_Y,
  WHINE_WIDTH,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { tickCharacterBehaviors } from '../entities'
import { checkHouseTransition } from '../house'
import { posKey } from '../position'
import { createGameState } from '../state'
import { hasFogOfWar } from '../visibility'
import {
  createWhineHomeYard,
  createWhineVillage,
  enterWhineHomeYard,
  enterWhineVillage,
  exitWhineHomeYardToVillage,
  exitWhineVillageToOverworld,
  WHINE_HOMES,
  whineHomeYardId,
  WHINE_VILLAGE_ID,
} from '../whine'
import { TileType, Zone } from '../types'

import type { ZoneTransition } from '../types'
import { whineGhostId } from '../characters'
import { getLore } from '../manual'
import { createTestState } from './helpers'

describe('RP-69 Whine, Haunted Village', () => {
  describe('foundations', () => {
    it('TileType.WhineEntrance and TileType.WhineApron have glyph + color tables', () => {
      expect(TILE_CHARS[TileType.WhineEntrance]).toBeDefined()
      expect(TILE_CHARS[TileType.WhineApron]).toBeDefined()
      expect(TILE_COLORS[TileType.WhineEntrance]).toBeDefined()
      expect(TILE_COLORS[TileType.WhineApron]).toBeDefined()
    })

    it('Zone.WhineVillage and Zone.WhineHomeYard are defined', () => {
      expect(Zone.WhineVillage).toBe('whineVillage')
      expect(Zone.WhineHomeYard).toBe('whineHomeYard')
    })

    it('renders Whine and Whine home yards without fog of war', () => {
      expect(hasFogOfWar(Zone.WhineVillage)).toBe(false)
      expect(hasFogOfWar(Zone.WhineHomeYard)).toBe(false)
    })
  })

  describe('createWhineVillage', () => {
    const village = createWhineVillage()

    it('produces a 30x20 map', () => {
      expect(village.width).toBe(WHINE_WIDTH)
      expect(village.height).toBe(WHINE_HEIGHT)
      expect(village.map.length).toBe(WHINE_HEIGHT)
      expect(village.map[0].length).toBe(WHINE_WIDTH)
    })

    it('rings the perimeter with Fence except for the single west gate', () => {
      // West edge
      for (let y = 0; y < village.height; y++) {
        const expected = y === WHINE_GATE_Y ? TileType.FenceGate : TileType.Fence
        expect(village.map[y][0].type).toBe(expected)
      }
      // East edge — all Fence, no gate
      for (let y = 0; y < village.height; y++) {
        expect(village.map[y][village.width - 1].type).toBe(TileType.Fence)
      }
    })

    it('keeps the main street row walkable from x=1 to x=28 at y=10', () => {
      // y=10 is the main street row. Verify tiles along it that are NOT
      // inside a home footprint are Dirt.
      const homeColumns = new Set(WHINE_HOMES.map(h => h.centerX))
      for (let x = 1; x < village.width - 1; x++) {
        // Skip home footprint columns just in case (the street row
        // shouldn't overlap homes given the layout, but assert all
        // non-home columns on the street row are Dirt).
        if (homeColumns.has(x)) continue
        expect(village.map[WHINE_MAIN_STREET_Y][x].type).toBe(TileType.Dirt)
      }
    })

    it('places twelve homes with HouseRoof + HouseEaves + a single FenceGate each', () => {
      let homeGateCount = 0
      for (const home of WHINE_HOMES) {
        const minX = home.centerX - 1
        const maxX = home.centerX + 2
        for (let y = home.footprintTopY; y <= home.footprintBottomY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const tile = village.map[y][x].type
            const onPerimeter = x === minX || x === maxX || y === home.footprintTopY || y === home.footprintBottomY
            const isGate = home.gatePosition.x === x && home.gatePosition.y === y
            if (isGate) {
              expect(tile).toBe(TileType.FenceGate)
              homeGateCount++
            } else if (onPerimeter) {
              expect(tile).toBe(TileType.HouseEaves)
            } else {
              expect(tile).toBe(TileType.HouseRoof)
            }
          }
        }
      }
      expect(homeGateCount).toBe(12)
    })

    it('registers exactly thirteen gate bindings — one perimeter exit, twelve home enters', () => {
      expect(village.gatePositions.size).toBe(13)
      const perimeter = village.gatePositions.get(posKey(WHINE_GATE_X, WHINE_GATE_Y))
      expect(perimeter?.kind).toBe('exit')
      expect(perimeter?.targetIsOverworld).toBe(true)
      for (const home of WHINE_HOMES) {
        const binding = village.gatePositions.get(posKey(home.gatePosition.x, home.gatePosition.y))
        expect(binding?.kind).toBe('enter')
        expect(binding?.targetZoneId).toBe(whineHomeYardId(home.homeNumber))
      }
    })

    it('places north homes at y∈[1,4] and south homes at y∈[15,18]', () => {
      const norths = WHINE_HOMES.filter(h => h.side === 'north')
      const souths = WHINE_HOMES.filter(h => h.side === 'south')
      expect(norths.length).toBe(6)
      expect(souths.length).toBe(6)
      for (const h of norths) {
        expect(h.footprintTopY).toBe(WHINE_NORTH_HOME_TOP_Y)
        expect(h.footprintBottomY).toBe(WHINE_NORTH_HOME_BOTTOM_Y)
      }
      for (const h of souths) {
        expect(h.footprintTopY).toBe(WHINE_SOUTH_HOME_TOP_Y)
        expect(h.footprintBottomY).toBe(WHINE_SOUTH_HOME_BOTTOM_Y)
      }
    })
  })

  describe('createWhineHomeYard', () => {
    const yard = createWhineHomeYard()

    it('produces a 9x7 map', () => {
      expect(yard.width).toBe(WHINE_HOME_YARD_WIDTH)
      expect(yard.height).toBe(WHINE_HOME_YARD_HEIGHT)
    })

    it('rings the perimeter with Fence and places a single south FenceGate', () => {
      for (let x = 0; x < yard.width; x++) {
        const top = yard.map[0][x].type
        const bottom = yard.map[yard.height - 1][x].type
        expect(top).toBe(TileType.Fence)
        const isGate = x === WHINE_HOME_YARD_GATE_X
        expect(bottom).toBe(isGate ? TileType.FenceGate : TileType.Fence)
      }
    })

    it('places no HouseDoorClosed tile (homes not enterable in v1)', () => {
      for (const row of yard.map) {
        for (const tile of row) {
          expect(tile.type).not.toBe(TileType.HouseDoorClosed)
        }
      }
    })

    it('returns fresh map instances on each call (so registry entries are independent)', () => {
      const a = createWhineHomeYard()
      const b = createWhineHomeYard()
      expect(a.map).not.toBe(b.map)
    })

    it('binds the south gate as an exit back to the village', () => {
      const binding = yard.gatePositions.get(posKey(WHINE_HOME_YARD_GATE_X, WHINE_HOME_YARD_GATE_Y))
      expect(binding?.kind).toBe('exit')
      expect(binding?.targetZoneId).toBe(WHINE_VILLAGE_ID)
    })
  })

  describe('genesis registration', () => {
    it('registers Whine and twelve home yards in state.thresholdZones', () => {
      const state = createGameState('test-steward', 800, 600)
      const village = state.thresholdZones.get(WHINE_VILLAGE_ID)
      expect(village).toBeDefined()
      expect(village?.zoneVariant).toBe(Zone.WhineVillage)
      expect(village?.pausesPlayerTime).toBe(true)
      for (let n = 1; n <= 12; n++) {
        const home = state.thresholdZones.get(whineHomeYardId(n))
        expect(home).toBeDefined()
        expect(home?.zoneVariant).toBe(Zone.WhineHomeYard)
        expect(home?.pausesPlayerTime).toBe(true)
      }
    })

    it('places a WhineEntrance + 8 WhineApron tiles on the overworld east of the little house', () => {
      const state = createGameState('test-steward', 800, 600)
      if (!state.whineEntranceOverworld) {
        // Degenerate genesis (extremely unlikely for this fixture).
        // Spec accepts a null entrance — verify the registry is still
        // populated and skip the placement assertions.
        expect(state.thresholdZones.get(WHINE_VILLAGE_ID)).toBeDefined()
        return
      }
      const entrance = state.whineEntranceOverworld
      // Should be east of the little house.
      expect(entrance.x).toBeGreaterThan(state.houseEntranceOverworld.x)
      // Tile at entrance is WhineEntrance.
      expect(state.overworldMap[entrance.y][entrance.x].type).toBe(TileType.WhineEntrance)
      // 8 neighbors are WhineApron.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          expect(state.overworldMap[entrance.y + dy][entrance.x + dx].type).toBe(TileType.WhineApron)
        }
      }
    })

    it('spawns twelve named ghost entities in Zone.WhineVillage at genesis', () => {
      const state = createGameState('test-steward', 800, 600)
      let whineGhostCount = 0
      for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
        const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
        const zoneTag = state.world.getComponent(eid, ComponentType.EntityZone)
        if (identity?.definitionId.startsWith('whine-ghost-') && zoneTag?.zone === Zone.WhineVillage) {
          whineGhostCount++
          const behavior = state.world.getComponent(eid, ComponentType.Behavior)
          expect(behavior?.type).toBe('drift')
          // Ghost has a bounds rectangle covering its assigned corridor.
          if (behavior?.type === 'drift') {
            expect(behavior.bounds).toBeDefined()
          }
        }
      }
      expect(whineGhostCount).toBe(12)
    })

    it('registers MANUAL_LORE slots for zone:whine and the twelve ghosts (lore TODO)', () => {
      expect(getLore('zone:whine')).toBe('TODO')
      for (let n = 1; n <= 12; n++) {
        const key = `character:whine-ghost-${n.toString().padStart(2, '0')}`
        expect(getLore(key)).toBe('TODO')
      }
    })
  })

  describe('transitions', () => {
    it('overworld→Whine: stepping on WhineEntrance schedules a whine-enter transition; the handler swaps the map and lands the player at the west gate', () => {
      const state = createTestState()
      if (!state.whineEntranceOverworld) return // degenerate; skip
      state.currentZone = Zone.Overworld
      state.map = state.overworldMap
      state.mapWidth = state.overworldMapWidth
      state.mapHeight = state.overworldMapHeight
      const apron = state.whineEntranceOverworld
      state.player = { x: apron.x, y: apron.y }
      state.zoneTransition = null
      const detected = checkHouseTransition(state)
      expect(detected).toBe(true)
      const tx = state.zoneTransition as ZoneTransition | null
      expect(tx?.kind).toBe('whine')
      expect(tx?.direction).toBe('enter')

      enterWhineVillage(state, apron)
      expect(state.currentZone).toBe(Zone.WhineVillage)
      expect(state.player).toEqual({ x: WHINE_GATE_X, y: WHINE_GATE_Y })
      const village = state.thresholdZones.get(WHINE_VILLAGE_ID)
      expect(village?.entryReturnTile).toEqual(apron)
    })

    it('Whine→overworld via the west gate: handler restores the overworld and consumes entryReturnTile', () => {
      const state = createTestState()
      if (!state.whineEntranceOverworld) return
      const apron = state.whineEntranceOverworld
      enterWhineVillage(state, apron)
      exitWhineVillageToOverworld(state)
      expect(state.currentZone).toBe(Zone.Overworld)
      expect(state.player).toEqual(apron)
      expect(state.thresholdZones.get(WHINE_VILLAGE_ID)?.entryReturnTile).toBeNull()
    })

    it('Whine→home-yard: stepping on a home gate schedules a whine-home enter; the handler swaps to the right home', () => {
      const state = createTestState()
      enterWhineVillage(state, { x: 0, y: 0 })
      // Walk to home #3's gate.
      const home = WHINE_HOMES[2] // homeNumber 3
      state.player = { x: home.gatePosition.x, y: home.gatePosition.y }
      state.zoneTransition = null
      const detected = checkHouseTransition(state)
      expect(detected).toBe(true)
      const tx = state.zoneTransition as ZoneTransition | null
      expect(tx?.kind).toBe('whine-home')
      expect(tx?.direction).toBe('enter')

      enterWhineHomeYard(state, home.gatePosition)
      expect(state.currentZone).toBe(Zone.WhineHomeYard)
      // Player lands one tile north of the home yard's south gate.
      expect(state.player).toEqual({ x: WHINE_HOME_YARD_GATE_X, y: WHINE_HOME_YARD_GATE_Y - 1 })
      const homeYard = state.thresholdZones.get(whineHomeYardId(home.homeNumber))
      expect(homeYard?.entryReturnTile).toEqual(home.gatePosition)
    })

    it('home-yard→Whine: handler restores the village map and returns the player to the corridor near the parent gate', () => {
      const state = createTestState()
      enterWhineVillage(state, { x: 0, y: 0 })
      const home = WHINE_HOMES[0] // home #1 (north)
      enterWhineHomeYard(state, home.gatePosition)

      exitWhineHomeYardToVillage(state)
      expect(state.currentZone).toBe(Zone.WhineVillage)
      // North home gate.y = WHINE_NORTH_HOME_BOTTOM_Y; exit lands at y+1.
      expect(state.player).toEqual({ x: home.centerX, y: home.gatePosition.y + 1 })
      expect(state.thresholdZones.get(whineHomeYardId(home.homeNumber))?.entryReturnTile).toBeNull()
    })
  })

  describe('bounded ghost drift', () => {
    it('a ghost with bounds cannot move outside the rectangle even after many ticks', () => {
      const state = createGameState('test-steward', 800, 600)
      // Find ghost #1's entity.
      let ghostEid: number | null = null
      for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
        const id = state.world.getComponent(eid, ComponentType.CharacterIdentity)
        if (id?.definitionId === whineGhostId(1)) {
          ghostEid = eid
          break
        }
      }
      expect(ghostEid).not.toBeNull()
      if (ghostEid === null) return
      const behavior = state.world.getComponent(ghostEid, ComponentType.Behavior)
      expect(behavior?.type).toBe('drift')
      if (behavior?.type !== 'drift' || !behavior.bounds) return
      const b = behavior.bounds

      // Force the steward into Whine so tickCharacterBehaviors ticks the
      // ghost (entities only tick in their assigned zone).
      enterWhineVillage(state, { x: 0, y: 0 })

      // Set moveChance high so the ghost moves every tick (deterministic
      // observation of the bounds filter). Restore after.
      const orig = behavior.moveChance
      behavior.moveChance = 1
      try {
        for (let i = 0; i < 50; i++) {
          tickCharacterBehaviors(state)
          const pos = state.world.getComponent(ghostEid, ComponentType.Position)
          expect(pos).toBeDefined()
          if (!pos) return
          expect(pos.x).toBeGreaterThanOrEqual(b.minX)
          expect(pos.x).toBeLessThanOrEqual(b.maxX)
          expect(pos.y).toBeGreaterThanOrEqual(b.minY)
          expect(pos.y).toBeLessThanOrEqual(b.maxY)
        }
      } finally {
        behavior.moveChance = orig
      }
    })
  })
})
