import { ComponentType } from '../ecs/types'
import { createCharacterEntity } from '../entities'
import { createGroundOmniboxEntity } from '../omnibox'
import { isInBounds } from '../position'
import { createGameState } from '../state'
import { TileType } from '../types'

import type { Entity } from '../ecs/types'
import type { CharacterBehavior, GameState, Zone } from '../types'

/**
 * Creates a minimal game state for testing — empty backpack, no entities,
 * no shooting stars. Tests should explicitly add only what they need.
 *
 * Wraps createGameState to stay in sync with the state shape, then clears
 * gameplay-specific content.
 */
export const createTestState = (opts?: { viewportWidth?: number; viewportHeight?: number }): GameState => {
  const state = createGameState('Test', opts?.viewportWidth ?? 20, opts?.viewportHeight ?? 20)
  state.backpack.items = []
  // Destroy all ground omnibox ECS entities
  for (const eid of state.world.query(ComponentType.OmniboxLink, ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'groundOmnibox') {
      state.world.destroyEntity(eid)
    }
  }
  // Destroy all character ECS entities (ghosts, gron, etc.)
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    state.world.destroyEntity(eid)
  }
  state.openContainer = null
  state.playerFacing = 'down'
  state.facingEntityPos = null
  state.omniboxContainers = new Map()
  state.nextOmniboxNumber = 1
  state.discoveredRecipes = new Set()
  state.manualDiscoveries = new Set()
  state.manualState = { activeCategory: null, searchQuery: '', revealedHints: new Set() }
  state.activeDialog = null
  state.previewFn = null
  state.path = null
  state.pathWaypoints = []
  state.pendingAction = null
  state.cloverGrowthPreviews = new Set()
  state.cloverLifecycle = new Map()
  state.soilHealth = new Map()
  return state
}

/**
 * Clears terrain to dirt in a radius around a position.
 */
export const clearArea = (state: GameState, cx: number, cy: number, radius: number): void => {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const ny = cy + dy
      const nx = cx + dx
      if (isInBounds(nx, ny, state.mapWidth, state.mapHeight)) {
        state.map[ny][nx] = { type: TileType.Dirt }
      }
    }
  }
}

/**
 * Clears terrain to dirt around the player.
 */
export const clearAroundPlayer = (state: GameState, radius = 2): void => {
  clearArea(state, state.player.x, state.player.y, radius)
}

/**
 * Creates a meteorite ECS entity at the given position.
 */
export const createMeteoriteEntity = (state: GameState, x: number, y: number, fromChain = false): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.Pickupable, { definitionId: 'meteorite' })
  state.world.addComponent(e, ComponentType.EntityTag, 'meteorite')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })
  if (fromChain) {
    state.world.addComponent(e, ComponentType.ChainSource, { fromChain: true })
  }
  return e
}

/**
 * Queries all meteorite ECS entities in the world.
 */
export const getMeteoriteEntities = (state: GameState): Entity[] =>
  state.world
    .query(ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')

/**
 * Creates a bee ECS entity at the given position.
 */
export const createBeeEntity = (state: GameState, x: number, y: number, zone?: Zone): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.EntityTag, 'bee')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: zone ?? state.currentZone })
  return e
}

/**
 * Queries all bee ECS entities in the world.
 */
export const getBeeEntities = (state: GameState): Entity[] =>
  state.world
    .query(ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'bee')

/**
 * Creates a ground item ECS entity at the given position.
 */
export const createGroundItemEntity = (state: GameState, definitionId: string, x: number, y: number): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.ItemDrop, { definitionId })
  state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })
  return e
}

/**
 * Queries all ground item ECS entities in the world.
 */
export const getGroundItemEntities = (state: GameState): Entity[] =>
  state.world
    .query(ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem')

/**
 * Creates a character ECS entity at the given position.
 * Returns the entity id.
 */
export const createCharacterTestEntity = (
  state: GameState,
  definitionId: string,
  x: number,
  y: number,
  opts?: { aura?: string; behavior?: CharacterBehavior }
): Entity => createCharacterEntity(state, definitionId, { x, y }, opts)

/**
 * Queries all character ECS entities in the world.
 * Returns an array of { eid, definitionId, pos, behavior?, aura? }.
 */
export const getCharacterEntities = (state: GameState) =>
  state.world.query(ComponentType.CharacterIdentity, ComponentType.Position).map(eid => {
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const behavior = state.world.getComponent(eid, ComponentType.Behavior)
    const aura = state.world.getComponent(eid, ComponentType.Aura)
    return {
      eid,
      definitionId: identity?.definitionId ?? '',
      pos: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
      behavior: behavior ?? undefined,
      aura: aura ?? undefined,
    }
  })

/**
 * Destroys all character ECS entities in the world.
 */
export const destroyAllCharacterEntities = (state: GameState): void => {
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    state.world.destroyEntity(eid)
  }
}

/**
 * Creates a ground omnibox ECS entity at the given position.
 */
export const createGroundOmniboxTestEntity = (state: GameState, uid: string, x: number, y: number): Entity =>
  createGroundOmniboxEntity(state, uid, x, y)

/**
 * Queries all ground omnibox ECS entities in the world.
 */
export const getGroundOmniboxEntities = (state: GameState): Entity[] =>
  state.world
    .query(ComponentType.OmniboxLink, ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundOmnibox')

/**
 * Creates a beehive ECS entity at the given position.
 */
export const createBeehiveEntity = (state: GameState, x: number, y: number): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.EntityTag, 'beehive')
  state.world.addComponent(e, ComponentType.Blocking, { blockMovement: true })
  state.world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })
  return e
}

/**
 * Queries all beehive ECS entities in the world.
 */
export const getBeehiveEntities = (state: GameState): Entity[] =>
  state.world
    .query(ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'beehive')
