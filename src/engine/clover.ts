import {
  BEEHIVE_MIN_DISTANCE,
  CLOVER_HIVE_RATIO,
  CLOVER_HONEY_BASE_CHANCE,
  CLOVER_HONEY_BEE_BONUS,
} from './constants'
import { ComponentType } from './ecs/types'
import { CLOVER_SPREAD_CONFIG } from './flora/type/clover/spread'
import { tickSpeciesSpread } from './flora/spread'
import { recordDiscovery } from './manual'
import { CARDINAL, isInBounds, posKey } from './position'
import { FloraSpecies, TileType, Zone } from './types'
import { spatialAtInCurrentZone } from './zone'

import type { GameState, Position } from './types'

// Clover-specific tile check. Flora tiles of other species (wildflower,
// tall grass) share TileType.Flora but do not participate in clover patch
// detection for beehive placement or honey production.
const isCloverTile = (state: GameState, x: number, y: number): boolean => {
  if (state.map[y]?.[x]?.type !== TileType.Flora) return false
  return state.floraLifecycle.get(posKey(x, y))?.species === FloraSpecies.Clover
}

// --- Patch data for hive/honey logic ---

// Clover-specific patch shape — includes hive accounting that the
// species-agnostic FloraPatch doesn't carry. Used by tickCloverHives
// and by the legacy test surface that pre-dates the spread extraction.
export interface CloverPatch {
  tiles: Set<string>
  centroid: Position
  beeCount: number
  hiveCount: number
  maxHives: number
}

export const floodFillCloverPatches = (state: GameState): CloverPatch[] => {
  const visited = new Set<string>()
  const patches: CloverPatch[] = []
  const w = state.mapWidth
  const h = state.mapHeight

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isCloverTile(state, x, y)) continue
      const startKey = posKey(x, y)
      if (visited.has(startKey)) continue

      const tiles = new Set<string>()
      const queue: Position[] = [{ x, y }]
      let sumX = 0
      let sumY = 0

      while (queue.length > 0) {
        const pos = queue.shift()
        if (!pos) continue
        const key = posKey(pos.x, pos.y)
        if (visited.has(key)) continue
        visited.add(key)
        tiles.add(key)
        sumX += pos.x
        sumY += pos.y

        for (const d of CARDINAL) {
          const nx = pos.x + d.x
          const ny = pos.y + d.y
          if (!isInBounds(nx, ny, w, h)) continue
          if (!isCloverTile(state, nx, ny)) continue
          const nk = posKey(nx, ny)
          if (!visited.has(nk)) {
            queue.push({ x: nx, y: ny })
          }
        }
      }

      patches.push({
        tiles,
        centroid: { x: sumX / tiles.size, y: sumY / tiles.size },
        beeCount: 0,
        hiveCount: 0,
        maxHives: tiles.size >= CLOVER_HIVE_RATIO ? Math.ceil(tiles.size / CLOVER_HIVE_RATIO) : 0,
      })
    }
  }

  return patches
}

export const countBeesOnPatch = (patch: CloverPatch, state: GameState): number => {
  let count = 0
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'bee') continue
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== Zone.Overworld) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos && patch.tiles.has(posKey(pos.x, pos.y))) {
      count++
    }
  }
  return count
}

const countHivesOnPatch = (patch: CloverPatch, state: GameState): number => {
  let count = 0
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'beehive') continue
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== Zone.Overworld) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos && patch.tiles.has(posKey(pos.x, pos.y))) {
      count++
    }
  }
  return count
}

// --- Main growth tick (thin wrapper) ---

// Precis #17 — clover growth now routes through the species-agnostic
// spread engine. The wrapper preserves the existing call signature
// (tickCloverGrowth(state)) so gameLoop.ts and tests don't need to
// change. Future call sites can call tickSpeciesSpread directly with
// CLOVER_SPREAD_CONFIG.
export const tickCloverGrowth = (state: GameState): void => {
  tickSpeciesSpread(state, Date.now(), CLOVER_SPREAD_CONFIG)
}

// --- Beehive spawning ---

const spawnBeehive = (state: GameState, pos: Position): void => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x: pos.x, y: pos.y })
  state.world.addComponent(e, ComponentType.EntityTag, 'beehive')
  state.world.addComponent(e, ComponentType.Blocking, { blockMovement: true })
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
  recordDiscovery(state, 'event:beehive-built')
}

// --- Honey production ---

const spawnHoney = (state: GameState, pos: Position): void => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x: pos.x, y: pos.y })
  state.world.addComponent(e, ComponentType.ItemDrop, { definitionId: 'honey' })
  state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
}

// --- Beehive + honey tick ---

export const tickCloverHives = (state: GameState): void => {
  const patches = floodFillCloverPatches(state)

  // Collect all existing overworld beehive positions for minimum distance enforcement
  const existingHivePositions: Position[] = []
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'beehive') continue
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== Zone.Overworld) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos) existingHivePositions.push({ x: pos.x, y: pos.y })
  }

  const isTooCloseToHive = (pos: Position): boolean =>
    existingHivePositions.some(hp => Math.abs(pos.x - hp.x) + Math.abs(pos.y - hp.y) < BEEHIVE_MIN_DISTANCE)

  for (const patch of patches) {
    patch.beeCount = countBeesOnPatch(patch, state)
    patch.hiveCount = countHivesOnPatch(patch, state)

    // --- Beehive spawning ---
    if (patch.beeCount > 0 && patch.hiveCount < patch.maxHives) {
      const buildChance = 0.02 * patch.beeCount
      if (Math.random() < buildChance) {
        const interiorTiles: Position[] = []
        const allTiles: Position[] = []

        for (const key of patch.tiles) {
          const [xStr, yStr] = key.split(',')
          const x = Number(xStr)
          const y = Number(yStr)
          const pos = { x, y }

          if (x === state.player.x && y === state.player.y) continue
          if (spatialAtInCurrentZone(state, x, y).length > 0) continue

          allTiles.push(pos)

          const isInterior = CARDINAL.every(d => patch.tiles.has(posKey(x + d.x, y + d.y)))
          if (isInterior) interiorTiles.push(pos)
        }

        const candidates = (interiorTiles.length > 0 ? interiorTiles : allTiles).filter(pos => !isTooCloseToHive(pos))
        if (candidates.length > 0) {
          const target = candidates[Math.floor(Math.random() * candidates.length)]
          spawnBeehive(state, target)
        }
      }
    }

    // --- Honey production (requires bees) ---
    if (patch.beeCount === 0) continue
    for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'beehive') continue
      if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== Zone.Overworld) continue
      const hivePos = state.world.getComponent(eid, ComponentType.Position)
      if (!hivePos || !patch.tiles.has(posKey(hivePos.x, hivePos.y))) continue

      let honeyChance = CLOVER_HONEY_BASE_CHANCE + patch.beeCount * CLOVER_HONEY_BEE_BONUS
      honeyChance = Math.min(honeyChance, 0.8)
      if (Math.random() > honeyChance) continue

      const shuffled = [...CARDINAL].sort(() => Math.random() - 0.5)
      for (const d of shuffled) {
        const nx = hivePos.x + d.x
        const ny = hivePos.y + d.y
        if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
        const tile = state.map[ny][nx]
        if (tile.type === TileType.Space || tile.type === TileType.Sand) continue
        if (tile.type === TileType.CaveWall || tile.type === TileType.CaveBreakableWall) continue
        if (spatialAtInCurrentZone(state, nx, ny).length > 0) continue
        spawnHoney(state, { x: nx, y: ny })
        break
      }
    }
  }
}

// --- Legacy spread surface (precis-17 thin-wrapper exports) ---

// The spread/spiral implementation moved to flora/type/clover/spread.ts.
// These re-exports keep the legacy test imports working without
// updating every site. computeGrowthFront is reimplemented here over
// the local CloverPatch shape because the spread module's helper is
// internal (selectGrowthTargets handles the same job behind the engine).
import { CARDINAL as _CARDINAL } from './position'

export const computeGrowthFront = (patch: CloverPatch, state: GameState): Position[] => {
  const candidates = new Set<string>()
  const map = state.map
  const w = state.mapWidth
  const h = state.mapHeight

  for (const key of patch.tiles) {
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr)
    const y = Number(yStr)
    for (const d of _CARDINAL) {
      const nx = x + d.x
      const ny = y + d.y
      if (!isInBounds(nx, ny, w, h)) continue
      const nk = posKey(nx, ny)
      if (patch.tiles.has(nk)) continue
      if (candidates.has(nk)) continue
      if (map[ny][nx].type !== TileType.Dirt) continue
      candidates.add(nk)
    }
  }

  return [...candidates].map(k => {
    const [xStr, yStr] = k.split(',')
    return { x: Number(xStr), y: Number(yStr) }
  })
}

export { resetSpiralState, selectSpiralGrowth } from './flora/type/clover/spread'
