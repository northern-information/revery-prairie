import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { ComponentType } from '../ecs/types'
import { createCharacterEntity } from '../entities'
import { createEmptyFloraGrowthPreviews } from '../floraGrowthPreviews'
import { completeGenesis, createGenesisState, GENESIS_EPOCHS, nameToSeed, precomputeGenesis } from '../genesis'
import { isInBounds } from '../position'
import { createGameState, enterHouseAtTenureStart } from '../state'
import { Season, Sky, TileType, Zone } from '../types'

import type { Entity } from '../ecs/types'
import type { GenesisSimState } from '../genesisTypes'
import type { CharacterBehavior, GameState } from '../types'

// Run genesis once at module load — 174ms amortized across all tests in a file.
const _cachedSim = (() => {
  const seed = nameToSeed('Test')
  const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, seed)
  precomputeGenesis(sim, GENESIS_EPOCHS)
  return sim
})()

// Clone the mutable parts of the cached genesis result (~1.8ms vs ~174ms).
const cloneGenesis = (): GenesisSimState => ({
  ..._cachedSim,
  grid: _cachedSim.grid.map(row => row.map(t => ({ ...t }))),
  soilHealth: new Map(_cachedSim.soilHealth),
  elevation: new Map(_cachedSim.elevation),
  ponds: new Set(_cachedSim.ponds),
  riverPaths: new Set(_cachedSim.riverPaths),
  burnScars: new Set(_cachedSim.burnScars),
  ruins: _cachedSim.ruins.map(r => ({
    ...r,
    aqueductPaths: r.aqueductPaths.map(p => [...p]),
    buildingFootprints: [...r.buildingFootprints],
  })),
})

/**
 * Creates a minimal game state for testing — empty backpack, no entities,
 * no shooting stars. Tests should explicitly add only what they need.
 *
 * Wraps createGameState to stay in sync with the state shape, then clears
 * gameplay-specific content. Reuses a cached genesis result to avoid
 * running the expensive geological simulation on every call.
 */
export const createTestState = (opts?: {
  viewportWidth?: number
  viewportHeight?: number
  keepHouseSpawn?: boolean
}): GameState => {
  const state = createGameState('Test', opts?.viewportWidth ?? 20, opts?.viewportHeight ?? 20, cloneGenesis())
  // Complete genesis immediately so tests start in normal gameplay mode.
  // skipTitleCard so isInputGated returns false — tests expect input to
  // work in their state setups, not be blocked by a boot title card.
  completeGenesis(state, { skipTitleCard: true })
  state.backpack.items = []
  // Destroy all character ECS entities (ghosts, gron, etc.)
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    state.world.destroyEntity(eid)
  }
  // Destroy all ground item ECS entities (coins, acorns, etc.)
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem') {
      state.world.destroyEntity(eid)
    }
  }
  // Destroy all oak entities seeded at genesis handoff so tests start with
  // a clear overworld. Tests that need oaks call spawnOak / seedOaks
  // explicitly.
  for (const eid of state.world.query(ComponentType.OakData)) {
    state.world.destroyEntity(eid)
  }
  state.glintingCoins = new Set()
  state.coinGlintPopTimes = new Map()
  state.divinedHexagrams = new Set()
  state.glintZones = new Set()
  state.glintPatches = []
  state.glintOpacity = new Map()
  state.lastGlintSpawnTime = 0
  state.playerFacing = 'down'
  state.facingEntityPos = null
  state.discoveredRecipes = new Set()
  state.manualDiscoveries = new Set()
  state.manualState = { activeCategory: null, searchQuery: '', revealedHints: new Set() }
  state.activeDialog = null
  state.previewFn = null
  state.path = null
  state.pathWaypoints = []
  state.pendingAction = null
  state.floraGrowthPreviews = createEmptyFloraGrowthPreviews()
  state.floraLifecycle = new Map()
  state.soilHealth = new Map()
  state.tileWater = new Map()
  // Ensure no rain so spawnBeeOrMonarch always creates bees in existing tests
  state.weather.sky = Sky.Sun
  // Default to a benign spring day so flora lifecycle tests don't accidentally
  // run into winter dormancy. Tests that exercise winter behavior override this.
  // (RP-2)
  state.weather.season = Season.Spring
  state.weather.temperatureF = 65
  // Phase 0.125 = mid-spring (halfway between spring equinox at 0.0 and
  // summer solstice at 0.25). With mid-range temp, deriveSeason returns
  // Spring. Don't use 0.25 here — that's now the summer-solstice anchor.
  state.seasonalPhase = 0.125
  // RP-33 — createGameState now defaults to overworld start;
  // production paths opt into the house spawn via enterHouseAtTenureStart.
  // The keepHouseSpawn option lets a test exercise the production house
  // start.
  if (opts?.keepHouseSpawn === true) {
    enterHouseAtTenureStart(state)
  }
  return state
}

/**
 * RP-33 — production createGameState now spawns the player inside
 * the little house. Tests that use createGameState directly (not via
 * createTestState) and assume the legacy overworld context should call
 * this helper to swap state.map back to the overworld and place the
 * player at the cave-adjacent default position.
 */
export const swapToOverworldForTest = (state: GameState): void => {
  state.map = state.overworldMap
  state.mapWidth = state.overworldMapWidth
  state.mapHeight = state.overworldMapHeight
  state.currentZone = Zone.Overworld
  state.player = { x: Math.floor(state.overworldMapWidth / 2) - 1, y: Math.floor(state.overworldMapHeight / 2) }
  state.playerFacing = 'down'
  state.camera = {
    x: state.player.x - Math.floor(state.viewportWidth / 2),
    y: state.player.y - Math.floor(state.viewportHeight / 2),
  }
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
export const createMeteoriteEntity = (state: GameState, x: number, y: number): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.Pickupable, { definitionId: 'meteorite' })
  state.world.addComponent(e, ComponentType.EntityTag, 'meteorite')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })
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
  state.world.addComponent(e, ComponentType.HungerTimer, { hungerMs: 0 })
  // RP-17 — bees carry an empty PollenBag at creation. Tests that
  // exercise bee-mediated pollination read this component directly.
  state.world.addComponent(e, ComponentType.PollenBag, { loads: [] })
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
