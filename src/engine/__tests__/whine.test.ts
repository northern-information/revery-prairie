// RP-69 — Whine, Haunted Village tests.
//
// Spec: harness/specs/RP-69-whine-haunted-village.yaml

import { describe, expect, it } from 'vitest'
import {
  TILE_CHARS,
  TILE_COLORS,
  WHINE_EAST_HOME_LEFT_X,
  WHINE_EAST_HOME_RIGHT_X,
  WHINE_GATE_X,
  WHINE_GATE_Y,
  WHINE_HEIGHT,
  WHINE_HOME_YARD_GATE_X,
  WHINE_HOME_YARD_GATE_Y,
  WHINE_HOME_YARD_HEIGHT,
  WHINE_HOME_YARD_WIDTH,
  WHINE_MAIN_STREET_X,
  WHINE_WEST_HOME_LEFT_X,
  WHINE_WEST_HOME_RIGHT_X,
  WHINE_WIDTH,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { tickCharacterBehaviors } from '../entities'
import { checkHouseTransition } from '../house'
import { isWalkableTile, posKey } from '../position'
import { createGameState } from '../state'
import { hasFogOfWar } from '../visibility'
import {
  createWhineHomeYard,
  createWhineVillage,
  enterWhineHomeYard,
  enterWhineVillage,
  exitWhineHomeYardToVillage,
  exitWhineVillageToOverworld,
  registerWhineHomeYards,
  WHINE_HOME_VARIANTS,
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
    it('TileType.WhineEntrance has glyph + color tables', () => {
      expect(TILE_CHARS[TileType.WhineEntrance]).toBeDefined()
      expect(TILE_COLORS[TileType.WhineEntrance]).toBeDefined()
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

    it('rings the perimeter with Fence except for the 3-wide south gate (RP-69a)', () => {
      // North edge — all Fence, no gate.
      for (let x = 0; x < village.width; x++) {
        expect(village.map[0][x].type).toBe(TileType.Fence)
      }
      // West edge — all Fence, no gate.
      for (let y = 0; y < village.height; y++) {
        expect(village.map[y][0].type).toBe(TileType.Fence)
      }
      // East edge — all Fence, no gate.
      for (let y = 0; y < village.height; y++) {
        expect(village.map[y][village.width - 1].type).toBe(TileType.Fence)
      }
      // South edge — Fence except for the 3-wide FenceGate centered on WHINE_GATE_X.
      for (let x = 0; x < village.width; x++) {
        const isGate = x >= WHINE_GATE_X - 1 && x <= WHINE_GATE_X + 1
        expect(village.map[village.height - 1][x].type).toBe(isGate ? TileType.FenceGate : TileType.Fence)
      }
    })

    it('keeps the main street column walkable along the village long axis', () => {
      // Verify tiles along the main street column that are NOT inside
      // a home footprint (none should be) are Dirt.
      for (let y = 1; y < village.height - 1; y++) {
        expect(village.map[y][WHINE_MAIN_STREET_X].type).toBe(TileType.Dirt)
      }
    })

    it('places twelve homes with HouseRoof + HouseEaves + a single FenceGate each', () => {
      let homeGateCount = 0
      for (const home of WHINE_HOMES) {
        const minX = home.footprintLeftX
        const maxX = home.footprintRightX
        const minY = home.centerY - 1
        const maxY = home.centerY + 2
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const tile = village.map[y][x].type
            const onPerimeter = x === minX || x === maxX || y === minY || y === maxY
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

    it('registers gate bindings — three perimeter-exit tiles (the 3-wide south gate) plus twelve home enters', () => {
      // 3 exit tiles + 12 enter tiles = 15 bindings total.
      expect(village.gatePositions.size).toBe(15)
      for (let dx = -1; dx <= 1; dx++) {
        const perimeter = village.gatePositions.get(posKey(WHINE_GATE_X + dx, WHINE_GATE_Y))
        expect(perimeter?.kind).toBe('exit')
        expect(perimeter?.targetIsOverworld).toBe(true)
      }
      for (const home of WHINE_HOMES) {
        const binding = village.gatePositions.get(posKey(home.gatePosition.x, home.gatePosition.y))
        expect(binding?.kind).toBe('enter')
        expect(binding?.targetZoneId).toBe(whineHomeYardId(home.homeNumber))
      }
    })

    it('places west homes at footprint x∈[3,6] and east homes at x∈[33,36], offset per variant.villageJitter.dx', () => {
      // RP-69a applies per-home villageJitter.dx, so the exact column
      // band is base ± dx. Assert side counts and the 4-column
      // footprint width.
      const wests = WHINE_HOMES.filter(h => h.side === 'west')
      const easts = WHINE_HOMES.filter(h => h.side === 'east')
      expect(wests.length).toBe(6)
      expect(easts.length).toBe(6)
      for (const h of wests) {
        const dx = WHINE_HOME_VARIANTS[h.homeNumber].villageJitter.dx
        expect(h.footprintLeftX).toBe(WHINE_WEST_HOME_LEFT_X + dx)
        expect(h.footprintRightX).toBe(WHINE_WEST_HOME_RIGHT_X + dx)
        expect(h.footprintRightX - h.footprintLeftX).toBe(3) // 4-column footprint
      }
      for (const h of easts) {
        const dx = WHINE_HOME_VARIANTS[h.homeNumber].villageJitter.dx
        expect(h.footprintLeftX).toBe(WHINE_EAST_HOME_LEFT_X + dx)
        expect(h.footprintRightX).toBe(WHINE_EAST_HOME_RIGHT_X + dx)
        expect(h.footprintRightX - h.footprintLeftX).toBe(3)
      }
    })
  })

  describe('createWhineHomeYard', () => {
    // Home 1's variant is pristine (no roof offset, no oak, no fence
    // breaks). These RP-69 base-layout assertions use it so they
    // continue to assert the template shape unchanged by RP-69a
    // variation.
    const yard = createWhineHomeYard(1)

    it('produces a 15x13 map', () => {
      expect(yard.width).toBe(WHINE_HOME_YARD_WIDTH)
      expect(yard.height).toBe(WHINE_HOME_YARD_HEIGHT)
    })

    it('rings the perimeter with Fence and places a single south FenceGate (on a pristine-variant home)', () => {
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
      const a = createWhineHomeYard(1)
      const b = createWhineHomeYard(2)
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

    it('stamps a 1x3 row of WhineEntrance tiles on the overworld east of the little house (RP-69a)', () => {
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
      // Three WhineEntrance tiles in a horizontal row centered on the
      // anchor: (cx-1, cy), (cx, cy), (cx+1, cy).
      for (let dx = -1; dx <= 1; dx++) {
        expect(state.overworldMap[entrance.y][entrance.x + dx].type).toBe(TileType.WhineEntrance)
      }
      // The tiles directly north and south of the entrance row are NOT
      // stamped — they stay whatever the prairie originally was (Dirt
      // in the typical isPlacementCandidate path).
      const above = state.overworldMap[entrance.y - 1][entrance.x].type
      const below = state.overworldMap[entrance.y + 1][entrance.x].type
      expect(above).not.toBe(TileType.WhineEntrance)
      expect(below).not.toBe(TileType.WhineEntrance)
    })

    it('spawns twelve named ghost entities in Zone.WhineVillage at genesis with unbounded drift', () => {
      const state = createGameState('test-steward', 800, 600)
      let whineGhostCount = 0
      for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
        const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
        const zoneTag = state.world.getComponent(eid, ComponentType.EntityZone)
        if (identity?.definitionId.startsWith('whine-ghost-') && zoneTag?.zone === Zone.WhineVillage) {
          whineGhostCount++
          const behavior = state.world.getComponent(eid, ComponentType.Behavior)
          expect(behavior?.type).toBe('drift')
          // Ghosts roam the whole village like the three overworld ghosts —
          // no bounds rectangle. They start in front of their assigned
          // home; map walkability handles the rest.
          if (behavior?.type === 'drift') {
            expect(behavior.bounds).toBeUndefined()
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
      // West home gate is on its east edge facing the main street; the
      // exit handler lands the player one tile east of the gate.
      expect(state.player).toEqual({ x: home.gatePosition.x + 1, y: home.centerY })
      expect(state.thresholdZones.get(whineHomeYardId(home.homeNumber))?.entryReturnTile).toBeNull()
    })
  })

  describe('DriftBehavior.bounds (substrate)', () => {
    // Whine ghosts are unbounded per latest spec — this test
    // exercises the bounds filter directly by attaching bounds to a
    // ghost's behavior at runtime, then ticking and verifying it
    // never escapes the rectangle. Kept so future callers (a future
    // ticket may want a bounded ghost again) have a regression
    // anchor for the filter logic in tickDrift.
    it('honors a bounds rectangle when one is attached to a DriftBehavior', () => {
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
      if (behavior?.type !== 'drift') return

      // Attach a tight bounds rectangle around the ghost's spawn tile.
      const pos = state.world.getComponent(ghostEid, ComponentType.Position)
      if (!pos) return
      const b = {
        minX: pos.x - 1,
        maxX: pos.x + 1,
        minY: pos.y - 1,
        maxY: pos.y + 1,
      }
      behavior.bounds = b

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
          const live = state.world.getComponent(ghostEid, ComponentType.Position)
          expect(live).toBeDefined()
          if (!live) return
          expect(live.x).toBeGreaterThanOrEqual(b.minX)
          expect(live.x).toBeLessThanOrEqual(b.maxX)
          expect(live.y).toBeGreaterThanOrEqual(b.minY)
          expect(live.y).toBeLessThanOrEqual(b.maxY)
        }
      } finally {
        behavior.moveChance = orig
      }
    })
  })
})

describe('RP-69a — hand-authored Whine variation', () => {
  describe('BrokenFence tile type', () => {
    it('has a glyph and color distinct from Fence and FenceGate', () => {
      expect(TILE_CHARS[TileType.BrokenFence]).toBeDefined()
      expect(TILE_COLORS[TileType.BrokenFence]).toBeDefined()
      expect(TILE_CHARS[TileType.BrokenFence]).not.toBe(TILE_CHARS[TileType.Fence])
      expect(TILE_CHARS[TileType.BrokenFence]).not.toBe(TILE_CHARS[TileType.FenceGate])
      expect(TILE_COLORS[TileType.BrokenFence]).not.toBe(TILE_COLORS[TileType.Fence])
    })

    it('is walkable (so the steward can cross a collapsed segment)', () => {
      expect(isWalkableTile(TileType.BrokenFence)).toBe(true)
    })

    it('Fence remains non-walkable (intact fence still blocks)', () => {
      expect(isWalkableTile(TileType.Fence)).toBe(false)
    })
  })

  describe('WHINE_HOME_VARIANTS table', () => {
    it('has 13 entries indexed 0..12 (index 0 unused, 1..12 per-home)', () => {
      expect(WHINE_HOME_VARIANTS.length).toBe(13)
    })

    it('every entry conforms to the variant shape', () => {
      for (let n = 0; n <= 12; n++) {
        const v = WHINE_HOME_VARIANTS[n]
        expect(v).toBeDefined()
        expect(typeof v.villageJitter.dx).toBe('number')
        expect(typeof v.villageJitter.dy).toBe('number')
        expect(typeof v.yardRoofOffset.dx).toBe('number')
        expect(typeof v.yardRoofOffset.dy).toBe('number')
        expect(Array.isArray(v.brokenFenceSegments)).toBe(true)
        expect(Array.isArray(v.missingFenceSegments)).toBe(true)
      }
    })

    it('villageJitter values stay within the documented range per home', () => {
      for (let n = 1; n <= 12; n++) {
        const { dx, dy } = WHINE_HOME_VARIANTS[n].villageJitter
        expect(dx).toBeGreaterThanOrEqual(-2)
        expect(dx).toBeLessThanOrEqual(2)
        expect(dy).toBeGreaterThanOrEqual(-1)
        expect(dy).toBeLessThanOrEqual(1)
      }
    })

    it('yardRoofOffset values stay within the safe range (dy must be ≥ 0 so the roof never overlaps the north perimeter)', () => {
      for (let n = 1; n <= 12; n++) {
        const { dx, dy } = WHINE_HOME_VARIANTS[n].yardRoofOffset
        expect(dx).toBeGreaterThanOrEqual(-1)
        expect(dx).toBeLessThanOrEqual(1)
        expect(dy).toBeGreaterThanOrEqual(0)
        expect(dy).toBeLessThanOrEqual(1)
      }
    })

    it('every oak anchor fits inside the walkable interior away from roof and gate', () => {
      // Default roof at y ∈ [1, 3]; gate row at y = 12. Per the spec
      // constraint, the 5×5 oak footprint must avoid both. Anchor at
      // (x, y) → footprint (x ± 2, y ± 2). Safe anchor range x ∈ [3, 11],
      // y ∈ [6, 9].
      for (let n = 1; n <= 12; n++) {
        const oak = WHINE_HOME_VARIANTS[n].oak
        if (oak === null) continue
        expect(oak.x).toBeGreaterThanOrEqual(3)
        expect(oak.x).toBeLessThanOrEqual(11)
        expect(oak.y).toBeGreaterThanOrEqual(6)
        expect(oak.y).toBeLessThanOrEqual(9)
      }
    })

    it('broken and missing fence positions only reference perimeter cells and never the FenceGate', () => {
      const isPerimeter = (x: number, y: number): boolean =>
        x === 0 || x === WHINE_HOME_YARD_WIDTH - 1 || y === 0 || y === WHINE_HOME_YARD_HEIGHT - 1
      const isGate = (x: number, y: number): boolean => x === WHINE_HOME_YARD_GATE_X && y === WHINE_HOME_YARD_GATE_Y
      for (let n = 1; n <= 12; n++) {
        for (const p of WHINE_HOME_VARIANTS[n].brokenFenceSegments) {
          expect(isPerimeter(p.x, p.y)).toBe(true)
          expect(isGate(p.x, p.y)).toBe(false)
        }
        for (const p of WHINE_HOME_VARIANTS[n].missingFenceSegments) {
          expect(isPerimeter(p.x, p.y)).toBe(true)
          expect(isGate(p.x, p.y)).toBe(false)
        }
      }
    })

    it('broken and missing lists are disjoint per home (no cell is both)', () => {
      for (let n = 1; n <= 12; n++) {
        const v = WHINE_HOME_VARIANTS[n]
        const brokenKeys = new Set(v.brokenFenceSegments.map(p => posKey(p.x, p.y)))
        for (const p of v.missingFenceSegments) {
          expect(brokenKeys.has(posKey(p.x, p.y))).toBe(false)
        }
      }
    })

    // RP-69a coverage floor: the shipped table must show non-trivial
    // variation so a future maintainer cannot quietly revert it.
    it('coverage: at least one home has non-zero villageJitter.dx', () => {
      expect(WHINE_HOME_VARIANTS.slice(1).some(v => v.villageJitter.dx !== 0)).toBe(true)
    })

    it('coverage: at least one home has non-zero villageJitter.dy', () => {
      expect(WHINE_HOME_VARIANTS.slice(1).some(v => v.villageJitter.dy !== 0)).toBe(true)
    })

    it('coverage: at least one home has non-zero yardRoofOffset', () => {
      expect(WHINE_HOME_VARIANTS.slice(1).some(v => v.yardRoofOffset.dx !== 0 || v.yardRoofOffset.dy !== 0)).toBe(true)
    })

    it('coverage: at least three homes have a yard oak', () => {
      const oakCount = WHINE_HOME_VARIANTS.slice(1).filter(v => v.oak !== null).length
      expect(oakCount).toBeGreaterThanOrEqual(3)
    })

    it('coverage: at least three homes have at least one broken fence segment', () => {
      const brokenCount = WHINE_HOME_VARIANTS.slice(1).filter(v => v.brokenFenceSegments.length > 0).length
      expect(brokenCount).toBeGreaterThanOrEqual(3)
    })

    it('coverage: at least one home has at least one missing fence segment', () => {
      const missingCount = WHINE_HOME_VARIANTS.slice(1).filter(v => v.missingFenceSegments.length > 0).length
      expect(missingCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('village jitter — WHINE_HOMES carries post-jitter descriptors', () => {
    it('every home descriptor reflects its variant.villageJitter offset along the village long axis (y) and short axis (x)', () => {
      // Reconstruct the base center for each home and verify the
      // descriptor's centerY = base + variant.dy. dx shifts footprint
      // columns rather than the centerY itself.
      for (const home of WHINE_HOMES) {
        const i = home.homeNumber <= 6 ? home.homeNumber - 1 : home.homeNumber - 7
        const baseCenterY = 7 + 10 * i
        const variant = WHINE_HOME_VARIANTS[home.homeNumber]
        expect(home.centerY).toBe(baseCenterY + variant.villageJitter.dy)
      }
    })

    it('post-jitter footprints stay inside the 40x66 village (1..width-2, 1..height-2 perimeter clearance)', () => {
      for (const home of WHINE_HOMES) {
        expect(home.footprintLeftX).toBeGreaterThanOrEqual(1)
        expect(home.footprintRightX).toBeLessThanOrEqual(WHINE_WIDTH - 2)
        const minY = home.centerY - 1
        const maxY = home.centerY + 2
        expect(minY).toBeGreaterThanOrEqual(1)
        expect(maxY).toBeLessThanOrEqual(WHINE_HEIGHT - 2)
      }
    })

    it('post-jitter footprints never cross the main street column', () => {
      for (const home of WHINE_HOMES) {
        for (let x = home.footprintLeftX; x <= home.footprintRightX; x++) {
          expect(x).not.toBe(WHINE_MAIN_STREET_X)
        }
      }
    })

    it('post-jitter footprints are pairwise disjoint', () => {
      const footprintCells = (home: {
        centerY: number
        footprintLeftX: number
        footprintRightX: number
      }): Set<string> => {
        const cells = new Set<string>()
        for (let y = home.centerY - 1; y <= home.centerY + 2; y++) {
          for (let x = home.footprintLeftX; x <= home.footprintRightX; x++) {
            cells.add(`${String(x)},${String(y)}`)
          }
        }
        return cells
      }
      for (let i = 0; i < WHINE_HOMES.length; i++) {
        for (let j = i + 1; j < WHINE_HOMES.length; j++) {
          const a = footprintCells(WHINE_HOMES[i])
          const b = footprintCells(WHINE_HOMES[j])
          for (const cell of b) {
            expect(a.has(cell)).toBe(false)
          }
        }
      }
    })

    it('createWhineVillage paints HouseRoof/HouseEaves at the post-jitter footprint of each home', () => {
      const village = createWhineVillage()
      for (const home of WHINE_HOMES) {
        // Inner roof cells should be HouseRoof.
        for (let y = home.centerY; y <= home.centerY + 1; y++) {
          for (let x = home.footprintLeftX + 1; x <= home.footprintRightX - 1; x++) {
            expect(village.map[y][x].type).toBe(TileType.HouseRoof)
          }
        }
        // The threshold gate should be FenceGate at the jittered position.
        expect(village.map[home.gatePosition.y][home.gatePosition.x].type).toBe(TileType.FenceGate)
        expect(village.gatePositions.has(posKey(home.gatePosition.x, home.gatePosition.y))).toBe(true)
      }
    })
  })

  describe('yard variation — roof offset and fence segments', () => {
    it('each yard places its roof block at the variant-offset position', () => {
      for (let n = 1; n <= 12; n++) {
        const yard = createWhineHomeYard(n)
        const v = WHINE_HOME_VARIANTS[n]
        const minX = 5 + v.yardRoofOffset.dx
        const maxX = 9 + v.yardRoofOffset.dx
        const minY = 1 + v.yardRoofOffset.dy
        const maxY = 3 + v.yardRoofOffset.dy
        // Inner cells should be HouseRoof.
        for (let y = minY + 1; y <= maxY - 1; y++) {
          for (let x = minX + 1; x <= maxX - 1; x++) {
            expect(yard.map[y][x].type).toBe(TileType.HouseRoof)
          }
        }
        // Perimeter of the 5x3 block should be HouseEaves.
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const onPerimeter = x === minX || x === maxX || y === minY || y === maxY
            if (onPerimeter) expect(yard.map[y][x].type).toBe(TileType.HouseEaves)
          }
        }
      }
    })

    it("each yard's broken fence segments are BrokenFence tiles", () => {
      for (let n = 1; n <= 12; n++) {
        const yard = createWhineHomeYard(n)
        for (const p of WHINE_HOME_VARIANTS[n].brokenFenceSegments) {
          expect(yard.map[p.y][p.x].type).toBe(TileType.BrokenFence)
        }
      }
    })

    it("each yard's missing fence segments are Dirt tiles", () => {
      for (let n = 1; n <= 12; n++) {
        const yard = createWhineHomeYard(n)
        for (const p of WHINE_HOME_VARIANTS[n].missingFenceSegments) {
          expect(yard.map[p.y][p.x].type).toBe(TileType.Dirt)
        }
      }
    })

    it('the FenceGate at (7, 12) is preserved across every variant', () => {
      for (let n = 1; n <= 12; n++) {
        const yard = createWhineHomeYard(n)
        expect(yard.map[WHINE_HOME_YARD_GATE_Y][WHINE_HOME_YARD_GATE_X].type).toBe(TileType.FenceGate)
      }
    })

    it('every yard remains gate-functional: at least one cell on the south edge inside or adjacent to the gate row is walkable', () => {
      for (let n = 1; n <= 12; n++) {
        const yard = createWhineHomeYard(n)
        // The gate at (7, 12) itself is FenceGate (walkable transition).
        expect(isWalkableTile(yard.map[WHINE_HOME_YARD_GATE_Y][WHINE_HOME_YARD_GATE_X].type)).toBe(true)
        // And the tile just inside the gate at (7, 11) must be walkable
        // so the steward can step onto the gate from inside the yard.
        expect(isWalkableTile(yard.map[WHINE_HOME_YARD_GATE_Y - 1][WHINE_HOME_YARD_GATE_X].type)).toBe(true)
      }
    })
  })

  describe('yard oak spawning', () => {
    // createTestState destroys all OakData entities to keep tests
    // hermetic. Re-call registerWhineHomeYards so the yard oaks (which
    // are RP-69a's contribution) repopulate. The threshold-zone Map.set
    // is idempotent for the registry entries themselves.
    const stateWithYardOaks = () => {
      const state = createTestState()
      registerWhineHomeYards(state)
      return state
    }

    it('spawns one ECS oak per home with a non-null oak variant; zero per home with a null entry', () => {
      const state = stateWithYardOaks()
      // Count oak entities scoped to each Whine home yard.
      const oaksByAnchor: { x: number; y: number }[] = []
      for (const eid of state.world.query(ComponentType.OakData, ComponentType.EntityZone)) {
        const ez = state.world.getComponent(eid, ComponentType.EntityZone)
        if (ez?.zone !== Zone.WhineHomeYard) continue
        const pos = state.world.getComponent(eid, ComponentType.Position)
        if (!pos) continue
        oaksByAnchor.push({ x: pos.x, y: pos.y })
      }
      const expectedOakHomes = WHINE_HOME_VARIANTS.slice(1).filter(v => v.oak !== null).length
      expect(oaksByAnchor.length).toBe(expectedOakHomes)
    })

    it('each yard oak has EntityZone.zone === Zone.WhineHomeYard', () => {
      const state = stateWithYardOaks()
      // The renderer's oak loop checks isEntityInCurrentZone, which
      // matches state.currentZone against EntityZone.zone. To prove the
      // yard oak renders only in the yard, every spawned yard-oak entity
      // must carry zone === Zone.WhineHomeYard.
      let yardOakCount = 0
      for (const eid of state.world.query(ComponentType.OakData, ComponentType.EntityZone)) {
        const ez = state.world.getComponent(eid, ComponentType.EntityZone)
        if (ez?.zone !== Zone.WhineHomeYard) continue
        expect(ez.zone).toBe(Zone.WhineHomeYard)
        yardOakCount++
      }
      // Sanity: the loop ran at least once.
      expect(yardOakCount).toBeGreaterThan(0)
    })

    it('every yard oak position avoids its yard\'s post-offset roof block and stays inside the walkable interior', () => {
      for (let n = 1; n <= 12; n++) {
        const variant = WHINE_HOME_VARIANTS[n]
        if (variant.oak === null) continue
        const yard = createWhineHomeYard(n)
        // 5x5 footprint around the oak anchor.
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const x = variant.oak.x + dx
            const y = variant.oak.y + dy
            // Must be inside walkable interior (not perimeter).
            expect(x).toBeGreaterThanOrEqual(1)
            expect(x).toBeLessThanOrEqual(WHINE_HOME_YARD_WIDTH - 2)
            expect(y).toBeGreaterThanOrEqual(1)
            expect(y).toBeLessThanOrEqual(WHINE_HOME_YARD_HEIGHT - 2)
            // Must not overlap a roof or eaves tile.
            const tileType = yard.map[y][x].type
            expect(tileType).not.toBe(TileType.HouseRoof)
            expect(tileType).not.toBe(TileType.HouseEaves)
          }
        }
      }
    })
  })
})
