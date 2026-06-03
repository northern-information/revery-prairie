import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { ComponentType } from '../ecs/types'
import { createCharacterEntity } from '../entities'
import { createEmptyFloraGrowthPreviews } from '../floraGrowthPreviews'
import { completeGenesis, createGenesisState, GENESIS_EPOCHS, nameToSeed, precomputeGenesis } from '../genesis'
import { isInBounds, posKey } from '../position'
import { createGameState, enterHouseAtTenureStart } from '../state'
import { Season, Sky, TileType, Zone } from '../types'
import { getWorldForZone, queryAllZones } from '../zone'

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
  // Per-zone worlds: characters/items/oaks now live in their target
  // zone's world, not the active state.world. Iterate every world to
  // ensure tests start with a clean slate across all zones.
  for (const world of state.worlds.values()) {
    for (const eid of world.query(ComponentType.CharacterIdentity)) {
      world.destroyEntity(eid)
    }
    for (const eid of world.query(ComponentType.EntityTag)) {
      if (world.getComponent(eid, ComponentType.EntityTag) === 'groundItem') {
        world.destroyEntity(eid)
      }
    }
    for (const eid of world.query(ComponentType.OakData)) {
      world.destroyEntity(eid)
    }
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
  // RP-41 — clear the genesis-derived elevation so tests are not
  // accidentally blocked by isClimbableStep on natural cliff
  // gradients near the test spawn. Tests that exercise cliffs/
  // verticality (cliffsVerticality.test.ts) set elevation
  // explicitly per scenario.
  state.elevation = new Map()
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
 * Clears terrain to dirt in a radius around a position. Also prunes any
 * water entries (`state.ponds`, `state.rivers`, `state.tileWater`) at the
 * cleared positions — those Sets/Maps are populated at genesis and are
 * not derived from `state.map`, so a tile overwrite alone leaves stale
 * water references that `isWaterTile` will still report as true.
 */
export const clearArea = (state: GameState, cx: number, cy: number, radius: number): void => {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const ny = cy + dy
      const nx = cx + dx
      if (isInBounds(nx, ny, state.mapWidth, state.mapHeight)) {
        state.map[ny][nx] = { type: TileType.Dirt }
        const key = posKey(nx, ny)
        state.ponds.delete(key)
        state.rivers.delete(key)
        state.tileWater.delete(key)
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
 * Drops every water reference from the state. Use when a test overwrites
 * the entire `state.map` directly — the ponds/rivers/tileWater
 * collections are inherited from genesis and must be cleared explicitly,
 * or `isWaterTile` will still flag the overwritten positions as water.
 */
export const clearAllWater = (state: GameState): void => {
  state.ponds.clear()
  state.rivers.clear()
  state.tileWater = new Map()
}

/**
 * Creates a meteorite ECS entity at the given position.
 */
export const createMeteoriteEntity = (state: GameState, x: number, y: number): Entity => {
  const world = getWorldForZone(state, state.currentZone)
  const e = world.createEntity()
  world.addComponent(e, ComponentType.Position, { x, y })
  world.addComponent(e, ComponentType.Pickupable, { definitionId: 'meteorite' })
  world.addComponent(e, ComponentType.EntityTag, 'meteorite')
  world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })
  return e
}

/**
 * Queries all meteorite ECS entities across every zone world.
 */
export const getMeteoriteEntities = (state: GameState): Entity[] => {
  const hits = queryAllZones(state, ComponentType.EntityTag)
  return hits
    .filter(({ world, eid }) => world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')
    .map(({ eid }) => eid)
}

/**
 * Creates a bee ECS entity at the given position.
 */
export const createBeeEntity = (state: GameState, x: number, y: number, zone?: Zone): Entity => {
  const targetZone = zone ?? state.currentZone
  const world = getWorldForZone(state, targetZone)
  const e = world.createEntity()
  world.addComponent(e, ComponentType.Position, { x, y })
  world.addComponent(e, ComponentType.EntityTag, 'bee')
  world.addComponent(e, ComponentType.EntityZone, { zone: targetZone })
  world.addComponent(e, ComponentType.HungerTimer, { hungerMs: 0 })
  // RP-17 — bees carry an empty PollenBag at creation. Tests that
  // exercise bee-mediated pollination read this component directly.
  world.addComponent(e, ComponentType.PollenBag, { loads: [] })
  return e
}

/**
 * Queries all bee ECS entities across every zone world. Tests that
 * created bees in one zone and then enter another still see the
 * original bees (per-zone worlds segregate them by world, not destroy
 * them).
 */
export const getBeeEntities = (state: GameState): Entity[] => {
  const hits = queryAllZones(state, ComponentType.EntityTag)
  return hits
    .filter(({ world, eid }) => world.getComponent(eid, ComponentType.EntityTag) === 'bee')
    .map(({ eid }) => eid)
}

/**
 * Creates a ground item ECS entity at the given position.
 */
export const createGroundItemEntity = (state: GameState, definitionId: string, x: number, y: number): Entity => {
  const world = getWorldForZone(state, state.currentZone)
  const e = world.createEntity()
  world.addComponent(e, ComponentType.Position, { x, y })
  world.addComponent(e, ComponentType.ItemDrop, { definitionId })
  world.addComponent(e, ComponentType.EntityTag, 'groundItem')
  world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })
  return e
}

/**
 * Queries all ground item ECS entities across every zone world.
 */
export const getGroundItemEntities = (state: GameState): Entity[] => {
  const hits = queryAllZones(state, ComponentType.EntityTag)
  return hits
    .filter(({ world, eid }) => world.getComponent(eid, ComponentType.EntityTag) === 'groundItem')
    .map(({ eid }) => eid)
}

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
 * Queries all character ECS entities across every zone world.
 * Returns an array of { eid, definitionId, pos, behavior?, aura? }.
 * Cross-zone iteration is correct here: tests want the steward roster
 * regardless of which zone the player is currently observing.
 */
export const getCharacterEntities = (state: GameState) =>
  queryAllZones(state, ComponentType.CharacterIdentity, ComponentType.Position).map(({ world, eid }) => {
    const identity = world.getComponent(eid, ComponentType.CharacterIdentity)
    const pos = world.getComponent(eid, ComponentType.Position)
    const behavior = world.getComponent(eid, ComponentType.Behavior)
    const aura = world.getComponent(eid, ComponentType.Aura)
    return {
      eid,
      definitionId: identity?.definitionId ?? '',
      pos: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
      behavior: behavior ?? undefined,
      aura: aura ?? undefined,
    }
  })

/**
 * Destroys all character ECS entities across every zone world.
 */
export const destroyAllCharacterEntities = (state: GameState): void => {
  for (const world of state.worlds.values()) {
    for (const eid of world.query(ComponentType.CharacterIdentity)) {
      world.destroyEntity(eid)
    }
  }
}

/**
 * Creates a beehive ECS entity at the given position in the current zone's world.
 */
export const createBeehiveEntity = (state: GameState, x: number, y: number): Entity => {
  const world = getWorldForZone(state, state.currentZone)
  const e = world.createEntity()
  world.addComponent(e, ComponentType.Position, { x, y })
  world.addComponent(e, ComponentType.EntityTag, 'beehive')
  world.addComponent(e, ComponentType.Blocking, { blockMovement: true })
  world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })
  return e
}

/**
 * Queries all beehive ECS entities across every zone world.
 */
export const getBeehiveEntities = (state: GameState): Entity[] => {
  const hits = queryAllZones(state, ComponentType.EntityTag)
  return hits
    .filter(({ world, eid }) => world.getComponent(eid, ComponentType.EntityTag) === 'beehive')
    .map(({ eid }) => eid)
}
