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
  createWhineVillage,
  enterWhineVillage,
  exitWhineVillageToOverworld,
  registerWhineVillage,
  WHINE_HOME_VARIANTS,
  WHINE_HOMES,
  WHINE_VILLAGE_BROKEN_FENCE,
  WHINE_VILLAGE_ID,
  WHINE_VILLAGE_MISSING_FENCE,
} from '../whine'
import { TileType, Zone } from '../types'

import type { ZoneTransition } from '../types'
import { whineGhostId } from '../characters'
import { getLore } from '../manual'
import { getWorldForZone } from '../zone'
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

    it('rings the perimeter with Fence (or BrokenFence/Dirt where the variant table specifies) except for the 3-wide south gate (RP-69a)', () => {
      const brokenKeys = new Set(WHINE_VILLAGE_BROKEN_FENCE.map(p => posKey(p.x, p.y)))
      const missingKeys = new Set(WHINE_VILLAGE_MISSING_FENCE.map(p => posKey(p.x, p.y)))
      const expectedAt = (x: number, y: number): TileType => {
        if (y === village.height - 1 && x >= WHINE_GATE_X - 1 && x <= WHINE_GATE_X + 1) return TileType.FenceGate
        if (brokenKeys.has(posKey(x, y))) return TileType.BrokenFence
        if (missingKeys.has(posKey(x, y))) return TileType.Dirt
        return TileType.Fence
      }
      // North edge.
      for (let x = 0; x < village.width; x++) {
        expect(village.map[0][x].type).toBe(expectedAt(x, 0))
      }
      // West edge.
      for (let y = 0; y < village.height; y++) {
        expect(village.map[y][0].type).toBe(expectedAt(0, y))
      }
      // East edge.
      for (let y = 0; y < village.height; y++) {
        expect(village.map[y][village.width - 1].type).toBe(expectedAt(village.width - 1, y))
      }
      // South edge.
      for (let x = 0; x < village.width; x++) {
        expect(village.map[village.height - 1][x].type).toBe(expectedAt(x, village.height - 1))
      }
    })

    it('keeps the main street column walkable along the village long axis', () => {
      // Verify tiles along the main street column that are NOT inside
      // a home footprint (none should be) are Dirt.
      for (let y = 1; y < village.height - 1; y++) {
        expect(village.map[y][WHINE_MAIN_STREET_X].type).toBe(TileType.Dirt)
      }
    })

    it('places twelve homes as closed 4×4 HouseEaves+HouseRoof blocks (RP-69a removed per-home gates)', () => {
      for (const home of WHINE_HOMES) {
        const minX = home.footprintLeftX
        const maxX = home.footprintRightX
        const minY = home.centerY - 1
        const maxY = home.centerY + 2
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const tile = village.map[y][x].type
            const onPerimeter = x === minX || x === maxX || y === minY || y === maxY
            expect(tile).toBe(onPerimeter ? TileType.HouseEaves : TileType.HouseRoof)
          }
        }
      }
    })

    it('registers gate bindings — three perimeter-exit tiles (the 3-wide south gate), no per-home gates (RP-69a removed yards)', () => {
      expect(village.gatePositions.size).toBe(3)
      for (let dx = -1; dx <= 1; dx++) {
        const perimeter = village.gatePositions.get(posKey(WHINE_GATE_X + dx, WHINE_GATE_Y))
        expect(perimeter?.kind).toBe('exit')
        expect(perimeter?.targetIsOverworld).toBe(true)
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

  // RP-69a — `createWhineHomeYard` and the per-home yard registry
  // entries were removed; the village itself is the yard.

  describe('genesis registration', () => {
    it('registers Whine in state.thresholdZones (no per-home yards in RP-69a)', () => {
      const state = createGameState('test-steward', 800, 600)
      const village = state.thresholdZones.get(WHINE_VILLAGE_ID)
      expect(village).toBeDefined()
      expect(village?.zoneVariant).toBe(Zone.WhineVillage)
      expect(village?.pausesPlayerTime).toBe(true)
      // No `whine-home-NN` registry entries.
      for (const id of state.thresholdZones.keys()) {
        expect(id.startsWith('whine-home-')).toBe(false)
      }
    })

    it('stamps a 1x3 vertical WhineEntrance strip wrapped by a 3x5 WhineApron footprint, east of the little house (RP-69a)', () => {
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
      // Three WhineEntrance tiles in a vertical column centered on the
      // anchor: (cx, cy-1), (cx, cy), (cx, cy+1).
      for (let dy = -1; dy <= 1; dy++) {
        expect(state.overworldMap[entrance.y + dy][entrance.x].type).toBe(TileType.WhineEntrance)
      }
      // The 12 surrounding cells of the 3x5 footprint are WhineApron.
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy >= -1 && dy <= 1) continue // skip entrance strip
          expect(state.overworldMap[entrance.y + dy][entrance.x + dx].type).toBe(TileType.WhineApron)
        }
      }
    })

    it('spawns twelve named ghost entities in Zone.WhineVillage at genesis with unbounded drift', () => {
      const state = createGameState('test-steward', 800, 600)
      const whineWorld = getWorldForZone(state, Zone.WhineVillage)
      let whineGhostCount = 0
      // Per-zone worlds: the WhineVillage world only contains entities
      // that live in the village.
      for (const eid of whineWorld.query(ComponentType.CharacterIdentity)) {
        const identity = whineWorld.getComponent(eid, ComponentType.CharacterIdentity)
        if (identity?.definitionId.startsWith('whine-ghost-')) {
          whineGhostCount++
          const behavior = whineWorld.getComponent(eid, ComponentType.Behavior)
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

    // RP-69a — per-home yards were removed; the village itself is the
    // yard. Homes are closed 4×4 blocks with no threshold gate, so
    // there is no Whine→home-yard transition path.
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
      const whineWorld = getWorldForZone(state, Zone.WhineVillage)
      // Find ghost #1's entity in the Whine world.
      let ghostEid: number | null = null
      for (const eid of whineWorld.query(ComponentType.CharacterIdentity)) {
        const id = whineWorld.getComponent(eid, ComponentType.CharacterIdentity)
        if (id?.definitionId === whineGhostId(1)) {
          ghostEid = eid
          break
        }
      }
      expect(ghostEid).not.toBeNull()
      if (ghostEid === null) return
      const behavior = whineWorld.getComponent(ghostEid, ComponentType.Behavior)
      expect(behavior?.type).toBe('drift')
      if (behavior?.type !== 'drift') return

      // Attach a tight bounds rectangle around the ghost's spawn tile.
      const pos = whineWorld.getComponent(ghostEid, ComponentType.Position)
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
          const live = whineWorld.getComponent(ghostEid, ComponentType.Position)
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

    it('every entry conforms to the variant shape (villageJitter + oak)', () => {
      for (let n = 0; n <= 12; n++) {
        const v = WHINE_HOME_VARIANTS[n]
        expect(v).toBeDefined()
        expect(typeof v.villageJitter.dx).toBe('number')
        expect(typeof v.villageJitter.dy).toBe('number')
        expect(v.oak === null || (typeof v.oak.x === 'number' && typeof v.oak.y === 'number')).toBe(true)
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

    it('every oak anchor sits inside the village interior away from the perimeter', () => {
      // Village is 40 wide × 66 tall. Safe oak anchor range so the
      // 5×5 footprint stays clear of the perimeter (x ∈ [0, 39] and
      // y ∈ [0, 65] are Fence) is x ∈ [3, 36], y ∈ [3, 62].
      for (let n = 1; n <= 12; n++) {
        const oak = WHINE_HOME_VARIANTS[n].oak
        if (oak === null) continue
        expect(oak.x).toBeGreaterThanOrEqual(3)
        expect(oak.x).toBeLessThanOrEqual(WHINE_WIDTH - 4)
        expect(oak.y).toBeGreaterThanOrEqual(3)
        expect(oak.y).toBeLessThanOrEqual(WHINE_HEIGHT - 4)
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

    it('coverage: at least three homes have an oak in the village', () => {
      const oakCount = WHINE_HOME_VARIANTS.slice(1).filter(v => v.oak !== null).length
      expect(oakCount).toBeGreaterThanOrEqual(3)
    })
  })

  describe('village-perimeter fence variation', () => {
    it('broken and missing fence positions only reference village-perimeter cells and never the south FenceGate', () => {
      const isPerimeter = (x: number, y: number): boolean =>
        x === 0 || x === WHINE_WIDTH - 1 || y === 0 || y === WHINE_HEIGHT - 1
      const isGate = (x: number, y: number): boolean =>
        y === WHINE_HEIGHT - 1 && x >= WHINE_GATE_X - 1 && x <= WHINE_GATE_X + 1
      for (const p of WHINE_VILLAGE_BROKEN_FENCE) {
        expect(isPerimeter(p.x, p.y)).toBe(true)
        expect(isGate(p.x, p.y)).toBe(false)
      }
      for (const p of WHINE_VILLAGE_MISSING_FENCE) {
        expect(isPerimeter(p.x, p.y)).toBe(true)
        expect(isGate(p.x, p.y)).toBe(false)
      }
    })

    it('broken and missing lists are disjoint (no cell is both)', () => {
      const brokenKeys = new Set(WHINE_VILLAGE_BROKEN_FENCE.map(p => posKey(p.x, p.y)))
      for (const p of WHINE_VILLAGE_MISSING_FENCE) {
        expect(brokenKeys.has(posKey(p.x, p.y))).toBe(false)
      }
    })

    it('createWhineVillage stamps BrokenFence at every broken position', () => {
      const village = createWhineVillage()
      for (const p of WHINE_VILLAGE_BROKEN_FENCE) {
        expect(village.map[p.y][p.x].type).toBe(TileType.BrokenFence)
      }
    })

    it('createWhineVillage stamps Dirt at every missing position', () => {
      const village = createWhineVillage()
      for (const p of WHINE_VILLAGE_MISSING_FENCE) {
        expect(village.map[p.y][p.x].type).toBe(TileType.Dirt)
      }
    })

    it('coverage: at least one broken and one missing position are present', () => {
      expect(WHINE_VILLAGE_BROKEN_FENCE.length).toBeGreaterThanOrEqual(1)
      expect(WHINE_VILLAGE_MISSING_FENCE.length).toBeGreaterThanOrEqual(1)
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

    it('createWhineVillage paints HouseRoof/HouseEaves at the post-jitter footprint of each home (no per-home FenceGate)', () => {
      const village = createWhineVillage()
      for (const home of WHINE_HOMES) {
        // Inner roof cells should be HouseRoof.
        for (let y = home.centerY; y <= home.centerY + 1; y++) {
          for (let x = home.footprintLeftX + 1; x <= home.footprintRightX - 1; x++) {
            expect(village.map[y][x].type).toBe(TileType.HouseRoof)
          }
        }
        // Every cell on the 4×4 footprint perimeter is HouseEaves —
        // no FenceGate slot since RP-69a removed per-home yards.
        const minX = home.footprintLeftX
        const maxX = home.footprintRightX
        const minY = home.centerY - 1
        const maxY = home.centerY + 2
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const onPerimeter = x === minX || x === maxX || y === minY || y === maxY
            if (onPerimeter) expect(village.map[y][x].type).toBe(TileType.HouseEaves)
          }
        }
      }
    })
  })

  describe('village oak spawning', () => {
    it('spawns one ECS oak per home with a non-null oak variant, each scoped to Zone.WhineVillage', () => {
      // createTestState destroys all OakData entities to keep tests
      // hermetic — re-register Whine so the variant oaks repopulate.
      const state = createTestState()
      const village = createWhineVillage()
      registerWhineVillage(state, village)

      const whineWorld = getWorldForZone(state, Zone.WhineVillage)
      // Per-zone worlds: WhineVillage world only contains its own entities.
      const villageOakCount = whineWorld.query(ComponentType.OakData).length
      const expectedOakHomes = WHINE_HOME_VARIANTS.slice(1).filter(v => v.oak !== null).length
      expect(villageOakCount).toBe(expectedOakHomes)
    })

    it("every variant oak's 5×5 footprint sits on the village's walkable interior (not the perimeter, not a home roof or eaves)", () => {
      const village = createWhineVillage()
      for (let n = 1; n <= 12; n++) {
        const variant = WHINE_HOME_VARIANTS[n]
        if (variant.oak === null) continue
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const x = variant.oak.x + dx
            const y = variant.oak.y + dy
            // Inside the playable interior (perimeter excluded).
            expect(x).toBeGreaterThanOrEqual(1)
            expect(x).toBeLessThanOrEqual(WHINE_WIDTH - 2)
            expect(y).toBeGreaterThanOrEqual(1)
            expect(y).toBeLessThanOrEqual(WHINE_HEIGHT - 2)
            // Not on a home footprint (HouseRoof or HouseEaves).
            const tileType = village.map[y][x].type
            expect(tileType).not.toBe(TileType.HouseRoof)
            expect(tileType).not.toBe(TileType.HouseEaves)
          }
        }
      }
    })
  })
})
