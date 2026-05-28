import { SEASONAL_PHASE_PERIOD_MS } from './constants'
import { ComponentType } from './ecs/types'
import { canPlaceMeteoriteAt, placeMeteoriteAt } from './entities'
import { advanceInHand, releaseInHand } from './inHand'
import { removeItem } from './inventory'
import { isInBounds, isWalkableTile } from './position'
import { createPlacedCamera } from './timeLapse'
import { getCurrentEntityZone, spatialAtInCurrentZone } from './zone'

import type { GameState, ItemUid } from './types'

// RP-59 — placement is a distinct verb from drop. Each placeable item
// registers a PlaceableSpec; left-click while in hand routes through
// spec.place(state, cursorX, cursorY, uid). Drop via [x] still creates a
// generic ground item for these items — drop disowns, place dedicates.
export interface PlaceableSpec {
  // Player-facing verb. Read by hover hints / prose, never a uniform substrate.
  verb: 'set' | 'set up' | 'sow' | 'lay' | 'place'
  canPlace: (state: GameState, x: number, y: number) => boolean
  place: (state: GameState, x: number, y: number, uid: ItemUid) => void
}

// RP-59 — a Field Camera can be set up on any walkable, unoccupied tile in
// bounds. Mirrors canPlaceMeteoriteAt's shape; cameras are not restricted to
// Dirt/Flora since they sit on the surface rather than mark hallowed ground.
export const canPlaceCameraAt = (state: GameState, x: number, y: number): boolean => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return false
  if (!isWalkableTile(state.map[y][x].type)) return false
  if (x === state.player.x && y === state.player.y) return false
  return spatialAtInCurrentZone(state, x, y).every(eid => {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    return tag !== 'groundItem' && tag !== 'placedCamera'
  })
}

const PLACEABLE_SPECS = {
  meteorite: {
    verb: 'place',
    canPlace: canPlaceMeteoriteAt,
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
      state.world.addComponent(ce, ComponentType.EntityZone, getCurrentEntityZone(state))
      state.world.addComponent(ce, ComponentType.ItemDrop, { definitionId: 'camera' })
      removeItem(container, uid)
      // The camera is a unique artifact — never auto-advance, just clear.
      releaseInHand(state)
    },
  },
} as const satisfies Record<string, PlaceableSpec>

export const getPlaceableSpec = (definitionId: string): PlaceableSpec | undefined =>
  (PLACEABLE_SPECS as Record<string, PlaceableSpec>)[definitionId]

export const isPlaceable = (definitionId: string): boolean => getPlaceableSpec(definitionId) !== undefined
