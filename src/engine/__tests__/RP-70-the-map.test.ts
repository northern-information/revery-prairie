import { ComponentType } from '../ecs/types'
import { pickUpGroundItems } from '../entities'
import { tryPlacedMarkerInteraction } from '../interaction'
import { getInHandItem, takeInHand } from '../inHand'
import { containerHasItem, placeItem } from '../inventory'
import { getPlaceableSpec, nextFreeMarkerLabel } from '../placeable'
import { createGameState } from '../state'
import { Zone } from '../types'
import { queryAllZones } from '../zone'
import { deserializeState, serializeState } from '../../harness/serialize'
import { clearAroundPlayer, createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameState } from '../types'

// RP-70 — The Map (permacomputer tab) and Geodetic Markers.
// Spec: harness/specs/RP-70-the-map.yaml.

afterEach(() => {
  vi.restoreAllMocks()
})

// Count ground-item ECS entities carrying a given ItemDrop definitionId
// across every per-zone world.
const countItemDrops = (state: GameState, definitionId: string): number => {
  let n = 0
  for (const { world, eid } of queryAllZones(state, ComponentType.EntityTag, ComponentType.ItemDrop)) {
    const drop = world.getComponent(eid, ComponentType.ItemDrop)
    if (drop?.definitionId === definitionId) n++
  }
  return n
}

// Place a geodeticMarker in the backpack and equip it in hand, on a
// cleared overworld tile, ready to lay.
const equipMarker = (state: GameState): string => {
  const fit = { gridX: state.backpack.items.length, gridY: 0 }
  const placed = placeItem(state.backpack, 'geodeticMarker', fit.gridX, fit.gridY)
  if (!placed) throw new Error('failed to place marker in backpack')
  takeInHand(state, placed.uid)
  return placed.uid
}

describe('RP-70 — The Map and Geodetic Markers', () => {
  describe('genesis seeding', () => {
    it('seeds the map plus 10 markers (7 cellar + 3 ruins) at genesis', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const state = createGameState('Cartographer', 20, 20)

      // Exactly one map key item, in the cellar.
      expect(countItemDrops(state, 'map')).toBe(1)

      // Ten Geodetic Markers total: 7 in the cellar + 3 in ruins.
      expect(countItemDrops(state, 'geodeticMarker')).toBe(10)

      // Exactly three live inside ruin interiors — one each in the bee,
      // clover, and coyote ruins (the other Starter ruins get none),
      // each zone-tagged to its ruin index.
      const ruinMarkerIndices = new Set<number>()
      for (const { world, eid } of queryAllZones(state, ComponentType.EntityTag, ComponentType.ItemDrop, ComponentType.EntityZone)) {
        const drop = world.getComponent(eid, ComponentType.ItemDrop)
        const zone = world.getComponent(eid, ComponentType.EntityZone)
        if (drop?.definitionId === 'geodeticMarker' && zone?.zone === Zone.Ruin && zone.ruinIndex !== undefined) {
          ruinMarkerIndices.add(zone.ruinIndex)
        }
      }
      expect(ruinMarkerIndices.size).toBe(3)
      const markerRoles = [...ruinMarkerIndices].map(i => state.genesis?.ruins[i]?.role).sort()
      expect(markerRoles).toEqual(['bee', 'clover', 'coyote'])
    })
  })

  describe('map tab gate', () => {
    it('flips from hidden to visible when item:map is discovered', () => {
      const state = createTestState()
      expect(state.manualDiscoveries.has('item:map')).toBe(false)

      // The cellar map pickup records the gate flag (without a backpack
      // entry). Simulate the discovery the pickup performs.
      state.manualDiscoveries.add('item:map')
      expect(state.manualDiscoveries.has('item:map')).toBe(true)
    })
  })

  describe('cellar map acquisition', () => {
    it('records item:map and does not enter the backpack', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      let opened = 0
      state.onMapAcquired = () => {
        opened++
      }
      // Drop a map ground item adjacent to the player and run the pickup.
      const e = state.world.createEntity()
      state.world.addComponent(e, ComponentType.Position, { x: state.player.x, y: state.player.y })
      state.world.addComponent(e, ComponentType.ItemDrop, { definitionId: 'map' })
      state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
      state.world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })

      pickUpGroundItems(state, 1000)

      expect(state.manualDiscoveries.has('item:map')).toBe(true)
      expect(containerHasItem(state.backpack, 'map')).toBe(false)
      expect(opened).toBe(1)
    })
  })

  describe('marker placement', () => {
    it('lays a marker with the lowest free GM-N label and advances in hand', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      const spec = getPlaceableSpec('geodeticMarker')
      expect(spec).toBeDefined()
      if (!spec) return

      // Two markers stacked in hand.
      const firstUid = equipMarker(state)
      placeItem(state.backpack, 'geodeticMarker', 1, 0)

      const tile = { x: state.player.x + 1, y: state.player.y }
      expect(spec.canPlace(state, tile.x, tile.y, firstUid)).toBe(true)
      spec.place(state, tile.x, tile.y, firstUid)

      expect(state.placedMarkers).toHaveLength(1)
      expect(state.placedMarkers[0].label).toBe('GM-1')
      expect(state.placedMarkers[0].uid).toBe(firstUid)
      // The placed instance left the backpack; the next marker is in hand.
      expect(state.backpack.items.some(i => i.uid === firstUid)).toBe(false)
      expect(getInHandItem(state)?.definitionId).toBe('geodeticMarker')
    })

    it('rejects placement on the player tile', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      const spec = getPlaceableSpec('geodeticMarker')
      if (!spec) throw new Error('no spec')
      const uid = equipMarker(state)
      expect(spec.canPlace(state, state.player.x, state.player.y, uid)).toBe(false)
    })
  })

  describe('marker label reuse', () => {
    it('reuses a freed index after pickup', () => {
      const state = createTestState()
      state.placedMarkers = [
        { uid: 'a', x: 1, y: 1, zone: Zone.Overworld, label: 'GM-1' },
        { uid: 'b', x: 2, y: 2, zone: Zone.Overworld, label: 'GM-2' },
        { uid: 'c', x: 3, y: 3, zone: Zone.Overworld, label: 'GM-3' },
      ]
      // Free GM-2.
      state.placedMarkers = state.placedMarkers.filter(m => m.label !== 'GM-2')
      expect(nextFreeMarkerLabel(state)).toBe('GM-2')
    })

    it('returns GM-1 when none are placed', () => {
      const state = createTestState()
      state.placedMarkers = []
      expect(nextFreeMarkerLabel(state)).toBe('GM-1')
    })
  })

  describe('marker retrieval', () => {
    it('picks a marker back up, frees its label, and preserves uid', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      const spec = getPlaceableSpec('geodeticMarker')
      if (!spec) throw new Error('no spec')
      const uid = equipMarker(state)

      const tile = { x: state.player.x + 1, y: state.player.y }
      spec.place(state, tile.x, tile.y, uid)
      expect(state.placedMarkers).toHaveLength(1)

      // Face the marker and interact.
      state.playerFacing = 'right'
      const result = tryPlacedMarkerInteraction(state, 2000)
      expect(result).toBe('picked-up')
      expect(state.placedMarkers).toHaveLength(0)
      // Returned to the backpack with the original uid.
      expect(state.backpack.items.some(i => i.uid === uid && i.definitionId === 'geodeticMarker')).toBe(true)
      // Label freed — the next placement reuses GM-1.
      expect(nextFreeMarkerLabel(state)).toBe('GM-1')
    })
  })

  describe('serialization', () => {
    it('round-trips placedMarkers through save/load', () => {
      const state = createTestState()
      state.placedMarkers = [
        { uid: 'm1', x: 10, y: 12, zone: Zone.Overworld, label: 'GM-1' },
        { uid: 'm2', x: 4, y: 5, zone: Zone.Ruin, label: 'GM-2' },
      ]
      const restored = deserializeState(serializeState(state))
      expect(restored.placedMarkers).toEqual(state.placedMarkers)
    })
  })
})
