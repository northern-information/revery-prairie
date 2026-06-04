import { SEASONAL_PHASE_PERIOD_MS } from './constants'
import { ComponentType } from './ecs/types'
import { canPlaceMeteoriteAt, placeMeteoriteAt } from './entities'
import { advanceInHand, releaseInHand } from './inHand'
import { removeItem } from './inventory'
import { isInBounds, isWalkableTile } from './position'
import { createPlacedCamera } from './timeLapse'

import type { GameState, ItemUid } from './types'

// RP-70 — total Geodetic Markers in a tenure (GM-1..GM-10). The cap is
// physical: 10 marker items exist (7 cellar + 3 ruins), so this only
// bounds the label space, never gates placement on its own.
const MAX_GEODETIC_MARKERS = 10

// RP-70 — lowest free GM-N label in 1..MAX. Scans currently-placed
// markers; a retrieved marker frees its number for reuse, so labels
// stay compact by reusing the first gap. Pure — exported for testing.
export const nextFreeMarkerLabel = (state: GameState): string => {
  const used = new Set(state.placedMarkers.map(m => m.label))
  for (let n = 1; n <= MAX_GEODETIC_MARKERS; n++) {
    const label = `GM-${String(n)}`
    if (!used.has(label)) return label
  }
  // All MAX labels in use — unreachable in practice (only MAX markers
  // exist). Fall back to the next ordinal rather than collide.
  return `GM-${String(state.placedMarkers.length + 1)}`
}

// RP-59 — placement is a distinct verb from drop. Each placeable item
// registers a PlaceableSpec; left-click while in hand routes through
// spec.place(state, cursorX, cursorY, uid). Drop via [x] still creates a
// generic ground item for these items — drop disowns, place dedicates.
export interface PlaceableSpec {
  // Player-facing verb. Read by hover hints / prose, never a uniform substrate.
  verb: 'set' | 'set up' | 'sow' | 'lay' | 'place'
  // RP-15 — canPlace receives the held item's uid so wear-bearing
  // placeables (currently only the camera) can refuse placement at
  // wear ≥ 1.0. Wear-free placeables ignore the uid arg.
  canPlace: (state: GameState, x: number, y: number, uid: ItemUid) => boolean
  place: (state: GameState, x: number, y: number, uid: ItemUid) => void
}

// RP-59 — a Field Camera can be set up on any walkable, unoccupied tile in
// bounds. Mirrors canPlaceMeteoriteAt's shape; cameras are not restricted to
// Dirt/Flora since they sit on the surface rather than mark hallowed ground.
// RP-15 — refuses placement when the camera's body wear has reached 1.0.
export const canPlaceCameraAt = (state: GameState, x: number, y: number, uid: ItemUid): boolean => {
  if ((state.itemWear[uid] ?? 0) >= 1) return false
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return false
  if (!isWalkableTile(state.map[y][x].type)) return false
  if (x === state.player.x && y === state.player.y) return false
  return state.world.spatial.at(x, y).every(eid => {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    return tag !== 'groundItem' && tag !== 'placedCamera'
  })
}

// RP-70 — a Geodetic Marker lays on any walkable, unoccupied, in-bounds
// tile that is not the player's own tile. Wear-free (markers have no
// maxUses). Rejects tiles already holding a ground item, placed camera,
// or placed marker so two marks never stack.
export const canPlaceMarkerAt = (state: GameState, x: number, y: number): boolean => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return false
  if (!isWalkableTile(state.map[y][x].type)) return false
  if (x === state.player.x && y === state.player.y) return false
  return state.world.spatial.at(x, y).every(eid => {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    return tag !== 'groundItem' && tag !== 'placedCamera' && tag !== 'placedMarker'
  })
}

const PLACEABLE_SPECS = {
  meteorite: {
    verb: 'place',
    canPlace: (state, x, y, _uid) => canPlaceMeteoriteAt(state, x, y),
    place: (state, x, y, uid) => {
      const container = state.backpack
      placeMeteoriteAt(state, x, y, performance.now())
      removeItem(container, uid)
      advanceInHand(state, 'meteorite', uid)
    },
  },
  camera: {
    verb: 'set up',
    canPlace: canPlaceCameraAt,
    place: (state, x, y, uid) => {
      const container = state.backpack
      const placed = createPlacedCamera(state, {
        uid,
        x,
        y,
        zone: state.currentZone,
        now: performance.now(),
        spanMs: SEASONAL_PHASE_PERIOD_MS / 4,
      })
      state.placedCameras.push(placed)
      // Re-use the ItemDrop component purely as the renderer hook so the
      // existing pass shows the camera glyph; proximity-pickup filters on
      // EntityTag === 'groundItem', so a 'placedCamera' tag is skipped.
      const ce = state.world.createEntity()
      state.world.addComponent(ce, ComponentType.Position, { x, y })
      state.world.addComponent(ce, ComponentType.EntityTag, 'placedCamera')
      state.world.addComponent(ce, ComponentType.ItemDrop, { definitionId: 'camera' })
      removeItem(container, uid)
      // The camera is a unique artifact — never auto-advance, just clear.
      releaseInHand(state)
    },
  },
  // RP-70 — lay a Geodetic Marker. Records a PlacedMarker (read by the
  // map tab) and an ItemDrop-bearing 'placedMarker' entity as the world
  // render hook. proximity-pickup filters on 'groundItem', so a placed
  // marker is not walk-over collected — it is recovered via the facing
  // interaction in interaction.ts. advanceInHand keeps the next marker
  // in the stack ready to lay.
  geodeticMarker: {
    verb: 'lay',
    canPlace: (state, x, y, _uid) => canPlaceMarkerAt(state, x, y),
    place: (state, x, y, uid) => {
      const container = state.backpack
      state.placedMarkers.push({
        uid,
        x,
        y,
        zone: state.currentZone,
        label: nextFreeMarkerLabel(state),
      })
      const me = state.world.createEntity()
      state.world.addComponent(me, ComponentType.Position, { x, y })
      state.world.addComponent(me, ComponentType.EntityTag, 'placedMarker')
      state.world.addComponent(me, ComponentType.ItemDrop, { definitionId: 'geodeticMarker' })
      removeItem(container, uid)
      advanceInHand(state, 'geodeticMarker', uid)
    },
  },
} as const satisfies Record<string, PlaceableSpec>

export const getPlaceableSpec = (definitionId: string): PlaceableSpec | undefined =>
  (PLACEABLE_SPECS as Record<string, PlaceableSpec>)[definitionId]

export const isPlaceable = (definitionId: string): boolean => getPlaceableSpec(definitionId) !== undefined
