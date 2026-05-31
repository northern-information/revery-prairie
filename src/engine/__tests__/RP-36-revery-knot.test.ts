// RP-36 — the Revery Knot. Spec acceptance suite.
// See harness/specs/RP-36-revery-knot.yaml.
//
// The harvest year encloses autumn equinox to autumn equinox. Emily ties
// what the grass remembers; the coyote brings it to the steward; the
// pickup contributes a bounded scalar to dormancyPressure. _The first
// knot is not yours._
import { afterEach, describe, expect, it, vi } from 'vitest'

import { tickCoyote } from '../coyote'
import { ComponentType } from '../ecs/types'
import { pickUpGroundItems } from '../entities'
import { ITEM_DEFINITIONS } from '../items'
import { findFitPosition, placeItem } from '../inventory'
import { MANUAL_ENTRIES } from '../manual'
import { onReveryKnotEntered } from '../reveryKnot'
import { ItemCategory, OmenKind, TileType, Zone } from '../types'
import { KNOT_PRESSURE_AMOUNT, POOL_INITIAL_KNOTS } from '../constants'
import { clearAroundPlayer, createCharacterTestEntity, createTestState } from './helpers'

import type { GameState, Position } from '../types'

afterEach(() => {
  vi.restoreAllMocks()
})

const requireValue = <T>(val: T | null | undefined): T => {
  if (val === null || val === undefined) throw new Error('expected value, got null/undefined')
  return val
}

const setHouseEntrance = (state: GameState, pos: Position): void => {
  // Place the entrance somewhere walkable and clear the apron tile
  // (one south of the entrance) so the coyote can arrive.
  state.houseEntranceOverworld = pos
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = pos.x + dx
      const y = pos.y + dy
      if (x >= 0 && y >= 0 && x < state.mapWidth && y < state.mapHeight) {
        state.map[y][x] = { type: TileType.Dirt }
      }
    }
  }
}

const createRP36State = () => {
  const state = createTestState()
  clearAroundPlayer(state, 12)
  state.currentZone = Zone.Overworld
  return state
}

describe('RP-36 — the Revery Knot', () => {
  describe('reveryknot-item-definition', () => {
    it('registers the reveryKnot definition with glyph § and Artifact category', () => {
      const def = ITEM_DEFINITIONS.reveryKnot
      expect(def).toBeDefined()
      expect(def.name).toBe('Revery Knot')
      expect(def.glyph).toBe('§')
      expect(def.glyphColor).toBe('#D4B58A')
      expect(def.category).toBe(ItemCategory.Artifact)
    })

    it('surfaces a manual entry with TODO lore', () => {
      const entry = MANUAL_ENTRIES['item:reveryKnot']
      expect(entry).toBeDefined()
      expect(entry.lore).toBe('TODO')
    })
  })

  describe('knot-delivery-state-fields', () => {
    it('initializes all ten new fields on createGameState', () => {
      const state = createTestState()
      expect(state.knotDelivery).toBeNull()
      expect(state.bedKnotPresent).toBe(false)
      expect(state.archivedKnots).toEqual([])
      expect(state.lastKnotDeliveryArmed).toBe(false)
      expect(state.lastKnotPickupAt).toBe(0)
      expect(state.lastKnotPickupTile).toBeNull()
      expect(state.lastKnotPickupHarvestYear).toBe(0)
      expect(state.lastArchiveReveryCount).toBe(0)
      expect(state.knotHarvestYearCounter).toBe(1 - POOL_INITIAL_KNOTS)
      expect(state.knotHarvestYears).toBeInstanceOf(Map)
      expect(state.knotHarvestYears.size).toBe(0)
    })
  })

  describe('retire-omenkind-triplet', () => {
    it('exposes exactly one OmenKind value: ReveryKnot', () => {
      expect(Object.keys(OmenKind)).toEqual(['ReveryKnot'])
      expect(OmenKind.ReveryKnot).toBe('revery-knot')
    })
  })

  describe('coyote-scripted-route', () => {
    it('does not accept cargo while too far from the apron tile (walkingToHouse stage)', () => {
      const state = createRP36State()
      setHouseEntrance(state, { x: state.player.x + 6, y: state.player.y })
      createCharacterTestEntity(state, 'coyote', state.player.x - 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      state.knotDelivery = { stage: 'walkingToHouse', dispatchedAt: 0, harvestYear: 5 }

      tickCoyote(state, 1000)

      // The coyote may or may not have stepped this tick (pathfinding
      // depends on terrain), but the cargo transfer is gated on
      // Chebyshev-1 of apronTile — which the coyote is not yet within.
      expect(state.coyoteCargo).toBeNull()
      expect(state.knotDelivery?.stage).toBe('walkingToHouse')
    })

    it('accepts cargo and flips to enroute when coyote reaches Chebyshev-1 of apronTile', () => {
      const state = createRP36State()
      const entrance = { x: state.player.x + 4, y: state.player.y }
      setHouseEntrance(state, entrance)
      const apron = { x: entrance.x, y: entrance.y + 1 }
      createCharacterTestEntity(state, 'coyote', apron.x, apron.y, { behavior: { type: 'follow' } })
      state.knotDelivery = { stage: 'walkingToHouse', dispatchedAt: 0, harvestYear: 3 }

      tickCoyote(state, 1000)
      expect(state.coyoteCargo).toBe('reveryKnot')
      expect(state.knotDelivery?.stage).toBe('enroute')
      expect(state.knotDelivery?.harvestYear).toBe(3)
    })

    it('clears knotDelivery once the cargo is delivered to the player', () => {
      const state = createRP36State()
      // Spawn coyote adjacent to the player carrying the Knot enroute.
      createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      state.coyoteCargo = 'reveryKnot'
      state.knotDelivery = { stage: 'enroute', dispatchedAt: 0, harvestYear: 2 }
      // Make backpack accept the Knot
      state.backpack.items = []

      tickCoyote(state, 5000)

      expect(state.coyoteCargo).toBeNull()
      expect(state.knotDelivery).toBeNull()
      expect(state.bedKnotPresent).toBe(true)
      const knot = state.backpack.items.find(i => i.definitionId === 'reveryKnot')
      expect(knot).toBeDefined()
      expect(state.knotHarvestYears.get(requireValue(knot).uid)).toBe(2)
    })
  })

  describe('knot-pickup-contributes-pressure', () => {
    it('adds KNOT_PRESSURE_AMOUNT to dormancyPressure on pickup, clamped to 1', () => {
      const state = createRP36State()
      state.dormancyPressure = 0.2
      state.lastKnotPickupHarvestYear = 0 // pre-play
      // Simulate a Knot ItemInstance entering the backpack.
      const fit = requireValue(findFitPosition(state.backpack, 'reveryKnot'))
      const placed = requireValue(placeItem(state.backpack, 'reveryKnot', fit.gridX, fit.gridY))
      onReveryKnotEntered(state, placed.uid, 1000)
      expect(state.dormancyPressure).toBeCloseTo(0.2 + KNOT_PRESSURE_AMOUNT, 5)
      expect(state.bedKnotPresent).toBe(true)
      expect(state.lastKnotPickupAt).toBe(1000)
      expect(state.lastKnotPickupTile).toEqual({ x: state.player.x, y: state.player.y })
      expect(state.lastKnotPickupHarvestYear).toBe(0)
    })

    it('clamps pressure to 1.0 when contribution would exceed ceiling (knot-pickup-pushes-to-ceiling)', () => {
      const state = createRP36State()
      state.dormancyPressure = 0.6
      const fit = requireValue(findFitPosition(state.backpack, 'reveryKnot'))
      const placed = requireValue(placeItem(state.backpack, 'reveryKnot', fit.gridX, fit.gridY))
      onReveryKnotEntered(state, placed.uid, 1000)
      expect(state.dormancyPressure).toBe(1)
    })

    it('records the harvestYear on knotHarvestYears keyed by uid', () => {
      const state = createRP36State()
      state.knotDelivery = { stage: 'enroute', dispatchedAt: 0, harvestYear: 7 }
      const fit = requireValue(findFitPosition(state.backpack, 'reveryKnot'))
      const placed = requireValue(placeItem(state.backpack, 'reveryKnot', fit.gridX, fit.gridY))
      onReveryKnotEntered(state, placed.uid, 2000)
      expect(state.knotHarvestYears.get(placed.uid)).toBe(7)
    })
  })

  describe('ground-item pickup path (backpack-full fallback)', () => {
    it('fires the contribution helper when player walks over a reveryKnot ground item', () => {
      const state = createRP36State()
      state.lastKnotPickupHarvestYear = 4
      // Spawn a Knot ground item one tile from the player.
      const ge = state.world.createEntity()
      state.world.addComponent(ge, ComponentType.Position, { x: state.player.x + 1, y: state.player.y })
      state.world.addComponent(ge, ComponentType.ItemDrop, { definitionId: 'reveryKnot' })
      state.world.addComponent(ge, ComponentType.EntityTag, 'groundItem')
      state.world.addComponent(ge, ComponentType.EntityZone, { zone: Zone.Overworld })

      pickUpGroundItems(state, 3000)

      expect(state.bedKnotPresent).toBe(true)
      expect(state.dormancyPressure).toBeCloseTo(KNOT_PRESSURE_AMOUNT, 5)
      const knot = state.backpack.items.find(i => i.definitionId === 'reveryKnot')
      expect(knot).toBeDefined()
      expect(state.knotHarvestYears.get(requireValue(knot).uid)).toBe(4)
    })
  })

  describe('first-knot-harvest-year-is-pre-play (v11 R6)', () => {
    it('with POOL_INITIAL_KNOTS = 1, the counter starts at 0 so the first delivery stamps harvestYear 0', () => {
      const state = createTestState()
      expect(state.knotHarvestYearCounter).toBe(0)
    })

    it('the helper reads harvestYear from knotDelivery first, then falls back to bookkeeping', () => {
      const state = createRP36State()
      state.knotDelivery = { stage: 'enroute', dispatchedAt: 0, harvestYear: 0 }
      const fit = requireValue(findFitPosition(state.backpack, 'reveryKnot'))
      const placed = requireValue(placeItem(state.backpack, 'reveryKnot', fit.gridX, fit.gridY))
      onReveryKnotEntered(state, placed.uid, 1000)
      expect(state.lastKnotPickupHarvestYear).toBe(0)
      expect(state.knotHarvestYears.get(placed.uid)).toBe(0)
    })
  })
})
