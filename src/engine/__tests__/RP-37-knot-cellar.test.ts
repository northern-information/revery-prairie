import { createKnotCellar, enterKnotCellar, exitKnotCellarToYard, getAlcoveFacing, getAlcovePosition } from '../cellar'
import {
  CELLAR_ALCOVE_SPACING,
  CELLAR_HEIGHT,
  CELLAR_ROOM_CAP,
  CELLAR_WIDTH,
  YARD_BULKHEAD_X,
  YARD_BULKHEAD_Y,
} from '../constants'
import { checkHouseTransition } from '../house'
import { initiateRevery, tickRevery } from '../revery'
import { OmenKind, ReveryPhase, TileType, Zone } from '../types'
import {
  registerZoneSwapHandler as _ensureRegistered,
  getZoneTransitionProgress,
  tickZoneTransition,
} from '../zoneTransition'
import { createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

// Ensure side-effect imports run so the 'knot-cellar' handler is
// registered. createKnotCellar's module already registers the handler at
// module load.
void _ensureRegistered

const advanceTransition = (state: ReturnType<typeof createTestState>, startTime: number): void => {
  if (!state.zoneTransition) return
  // Tick at the swap moment, then at duration to clear.
  tickZoneTransition(state, startTime + state.zoneTransition.duration / 2)
  tickZoneTransition(state, startTime + state.zoneTransition.duration + 1)
}

describe('RP-37 — the Knot Cellar', () => {
  describe('createKnotCellar layout', () => {
    it('builds a 7x770 grid with door spawn and bulkhead interior at canonical positions', () => {
      const cellar = createKnotCellar()
      expect(cellar.width).toBe(CELLAR_WIDTH)
      expect(cellar.width).toBe(7)
      expect(cellar.height).toBe(CELLAR_HEIGHT)
      expect(cellar.height).toBe(2 + CELLAR_ROOM_CAP * CELLAR_ALCOVE_SPACING)
      expect(cellar.doorSpawn).toEqual({ x: 3, y: 1 })
      expect(cellar.bulkheadInterior).toEqual({ x: 3, y: 0 })
    })

    it('places the bulkhead-interior staircase at the top center; the rest of y=0 is wall', () => {
      const { map } = createKnotCellar()
      expect(map[0][3].type).toBe(TileType.CellarBulkheadInterior)
      for (const x of [0, 1, 2, 4, 5, 6]) {
        expect(map[0][x].type).toBe(TileType.CellarWall)
      }
    })

    it('renders a 3-wide central corridor of CellarFloor on every interior row', () => {
      const { map } = createKnotCellar()
      // Sample a few non-alcove rows below the door row.
      for (const y of [1, 4, 7, 10]) {
        expect(map[y][2].type).toBe(TileType.CellarFloor)
        expect(map[y][3].type).toBe(TileType.CellarFloor)
        expect(map[y][4].type).toBe(TileType.CellarFloor)
      }
    })

    it('alternates alcoves left/right by parity at y = 2 + i * spacing', () => {
      const { map } = createKnotCellar()
      // Index 0 — left side at y=2
      expect(map[2][1].type).toBe(TileType.CellarAlcoveFloor)
      expect(map[2][5].type).toBe(TileType.CellarWall)
      // Index 1 — right side at y=5
      expect(map[5][5].type).toBe(TileType.CellarAlcoveFloor)
      expect(map[5][1].type).toBe(TileType.CellarWall)
      // Index 2 — left side at y=8
      expect(map[8][1].type).toBe(TileType.CellarAlcoveFloor)
      // Index 3 — right side at y=11
      expect(map[11][5].type).toBe(TileType.CellarAlcoveFloor)
    })

    it('no two alcoves share a y-coordinate (the steward never sees two knots framing them)', () => {
      const { map } = createKnotCellar()
      const alcoveRows = new Set<number>()
      for (const [y, row] of map.entries()) {
        for (const tile of row) {
          if (tile.type === TileType.CellarAlcoveFloor) {
            expect(alcoveRows.has(y)).toBe(false)
            alcoveRows.add(y)
          }
        }
      }
      expect(alcoveRows.size).toBe(CELLAR_ROOM_CAP)
    })
  })

  describe('alcove helpers', () => {
    it('getAlcovePosition matches the layout formula', () => {
      expect(getAlcovePosition(0)).toEqual({ x: 1, y: 2 })
      expect(getAlcovePosition(1)).toEqual({ x: 5, y: 5 })
      expect(getAlcovePosition(2)).toEqual({ x: 1, y: 8 })
      expect(getAlcovePosition(3)).toEqual({ x: 5, y: 11 })
    })

    it('getAlcovePosition clamps over-cap indices to the last alcove', () => {
      expect(getAlcovePosition(CELLAR_ROOM_CAP)).toEqual(getAlcovePosition(CELLAR_ROOM_CAP - 1))
      expect(getAlcovePosition(CELLAR_ROOM_CAP + 10)).toEqual(getAlcovePosition(CELLAR_ROOM_CAP - 1))
    })

    it('getAlcovePosition clamps negative or non-integer indices defensively', () => {
      expect(getAlcovePosition(-1)).toEqual({ x: 1, y: 2 })
      expect(getAlcovePosition(2.7)).toEqual(getAlcovePosition(2))
    })

    it('getAlcoveFacing turns the steward toward the corridor centerline', () => {
      expect(getAlcoveFacing(0)).toBe('right')
      expect(getAlcoveFacing(1)).toBe('left')
      expect(getAlcoveFacing(2)).toBe('right')
    })
  })

  describe('back-yard bulkhead placement', () => {
    it('places a CellarBulkhead tile at YARD_BULKHEAD_X/Y in the back yard', () => {
      const state = createTestState()
      expect(state.yardMap[YARD_BULKHEAD_Y][YARD_BULKHEAD_X].type).toBe(TileType.CellarBulkhead)
      expect(state.cellarBulkheadYard).toEqual({ x: YARD_BULKHEAD_X, y: YARD_BULKHEAD_Y })
    })

    it('initializes the cellar map and anchors at genesis', () => {
      const state = createTestState()
      expect(state.cellarMapWidth).toBe(CELLAR_WIDTH)
      expect(state.cellarMapHeight).toBe(CELLAR_HEIGHT)
      expect(state.cellarDoorSpawn).toEqual({ x: 3, y: 1 })
      expect(state.cellarBulkheadInterior).toEqual({ x: 3, y: 0 })
    })
  })

  describe('zone transitions', () => {
    it('stepping on the yard bulkhead schedules a yard→cellar enter transition', () => {
      const state = createTestState()
      // Set up: steward in yard standing on the bulkhead tile.
      state.map = state.yardMap
      state.mapWidth = state.yardMapWidth
      state.mapHeight = state.yardMapHeight
      state.currentZone = Zone.LittleHouseYard
      state.player = { x: state.cellarBulkheadYard.x, y: state.cellarBulkheadYard.y }
      state.reentryLock = null
      const triggered = checkHouseTransition(state)
      expect(triggered).toBe(true)
      expect(state.zoneTransition).not.toBeNull()
      expect(state.zoneTransition?.kind).toBe('knot-cellar')
      expect(state.zoneTransition?.direction).toBe('enter')
    })

    it('on enter, the steward lands at cellarDoorSpawn facing down the corridor', () => {
      const state = createTestState()
      state.map = state.yardMap
      state.mapWidth = state.yardMapWidth
      state.mapHeight = state.yardMapHeight
      state.currentZone = Zone.LittleHouseYard
      state.player = { x: state.cellarBulkheadYard.x, y: state.cellarBulkheadYard.y }
      state.reentryLock = null
      checkHouseTransition(state)
      const startTime = state.zoneTransition?.startTime ?? 0
      advanceTransition(state, startTime)
      expect(state.currentZone).toBe(Zone.KnotCellar)
      expect(state.player).toEqual(state.cellarDoorSpawn)
      expect(state.playerFacing).toBe('down')
      expect(state.manualDiscoveries.has('zone:knotCellar')).toBe(true)
    })

    it('stepping on the cellar-side staircase schedules a cellar→yard exit', () => {
      const state = createTestState()
      enterKnotCellar(state)
      state.player = { x: state.cellarBulkheadInterior.x, y: state.cellarBulkheadInterior.y }
      const triggered = checkHouseTransition(state)
      expect(triggered).toBe(true)
      expect(state.zoneTransition?.kind).toBe('knot-cellar')
      expect(state.zoneTransition?.direction).toBe('exit')
    })

    it('exiting the cellar lands the steward one tile south of the yard bulkhead and arms the re-entry lock', () => {
      const state = createTestState()
      enterKnotCellar(state)
      exitKnotCellarToYard(state)
      expect(state.currentZone).toBe(Zone.LittleHouseYard)
      expect(state.player).toEqual({ x: state.cellarBulkheadYard.x, y: state.cellarBulkheadYard.y + 1 })
      expect(state.reentryLock?.entrance).toEqual(state.cellarBulkheadYard)
    })

    it('the cellar re-entry lock suppresses immediate re-trigger on the bulkhead tile', () => {
      const state = createTestState()
      enterKnotCellar(state)
      exitKnotCellarToYard(state)
      // Standing one south of bulkhead; step north onto it.
      state.player = { x: state.cellarBulkheadYard.x, y: state.cellarBulkheadYard.y }
      const triggered = checkHouseTransition(state)
      expect(triggered).toBe(false)
      expect(state.zoneTransition).toBeNull()
    })
  })

  describe('post-Revery awaken', () => {
    const runReveryToClosing = (state: ReturnType<typeof createTestState>, time: number): void => {
      // Force an in-house Revery.
      state.map = state.houseMap
      state.mapWidth = state.houseMapWidth
      state.mapHeight = state.houseMapHeight
      state.currentZone = Zone.HouseInterior
      state.player = { x: state.houseEntranceInterior.x, y: state.houseEntranceInterior.y }
      initiateRevery(state, time, OmenKind.ReveryKnot)
      if (state.revery) {
        ;(state.revery as { summons?: boolean }).summons = false
        state.revery.phase = ReveryPhase.Closing
      }
      tickRevery(state, 0, time)
    }

    it('first Revery awakens the steward at alcove index 0 — left, closest to the door', () => {
      const state = createTestState()
      expect(state.archivedKnots).toHaveLength(0)
      runReveryToClosing(state, 1000)
      expect(state.currentZone).toBe(Zone.KnotCellar)
      expect(state.player).toEqual({ x: 1, y: 2 })
      expect(state.playerFacing).toBe('right')
    })

    it('with one archived knot, the awaken hook places the steward at alcove index 1 — right, three rows deeper', () => {
      const state = createTestState()
      state.archivedKnots = [{ pickedUpAt: 0, pickedUpTile: { x: 0, y: 0 }, archivedAt: 0, harvestYear: 0 }]
      runReveryToClosing(state, 2000)
      expect(state.player).toEqual({ x: 5, y: 5 })
      expect(state.playerFacing).toBe('left')
    })

    it('records the manual discovery on first awaken even without ever using the bulkhead', () => {
      const state = createTestState()
      expect(state.manualDiscoveries.has('zone:knotCellar')).toBe(false)
      runReveryToClosing(state, 3000)
      expect(state.manualDiscoveries.has('zone:knotCellar')).toBe(true)
    })

    it('clamps the spawn to the last alcove when archivedKnots exceeds the room cap', () => {
      const state = createTestState()
      // Forge an archive list past the cap.
      state.archivedKnots = Array.from({ length: CELLAR_ROOM_CAP + 5 }, (_, i) => ({
        pickedUpAt: 0,
        pickedUpTile: { x: 0, y: 0 },
        archivedAt: 0,
        harvestYear: i,
      }))
      runReveryToClosing(state, 4000)
      expect(state.player).toEqual(getAlcovePosition(CELLAR_ROOM_CAP - 1))
    })
  })

  // Silence the unused import for getZoneTransitionProgress (kept for
  // documentation of available helpers in this test surface).
  void getZoneTransitionProgress
})
