import {
  BEEHIVE_MIN_DISTANCE,
  CLOVER_BASE_GROWTH_CHANCE,
  CLOVER_BEE_GROWTH_BONUS,
  CLOVER_HIVE_RATIO,
  CLOVER_HONEY_BASE_CHANCE,
  CLOVER_HONEY_BEE_BONUS,
  CLOVER_MAX_GROWTH_PER_TICK,
} from './constants'
import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { setMapTile } from './map'
import { CARDINAL, isInBounds, posKey, tileHash } from './position'
import { TileType, Zone } from './types'
import { spatialAtInCurrentZone } from './zone'

import type { GameState, Position } from './types'

// --- Patch data ---

interface GrowthFront {
  angle: number
  angularStep: number
}

export interface CloverPatch {
  tiles: Set<string>
  centroid: Position
  beeCount: number
  hiveCount: number
  maxHives: number
}

// Module-scoped spiral state keyed by patch seed (smallest posKey)
const spiralState = new Map<string, GrowthFront>()

// --- Flood-fill patch detection ---

export const floodFillCloverPatches = (state: GameState): CloverPatch[] => {
  const visited = new Set<string>()
  const patches: CloverPatch[] = []
  const map = state.map
  const w = state.mapWidth
  const h = state.mapHeight

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (map[y][x].type !== TileType.Flora) continue
      const startKey = posKey(x, y)
      if (visited.has(startKey)) continue

      // BFS flood-fill using CARDINAL adjacency
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
          if (map[ny][nx].type !== TileType.Flora) continue
          const nk = posKey(nx, ny)
          if (!visited.has(nk)) {
            queue.push({ x: nx, y: ny })
          }
        }
      }

      const centroid = {
        x: sumX / tiles.size,
        y: sumY / tiles.size,
      }

      patches.push({
        tiles,
        centroid,
        beeCount: 0,
        hiveCount: 0,
        maxHives: tiles.size >= CLOVER_HIVE_RATIO ? Math.ceil(tiles.size / CLOVER_HIVE_RATIO) : 0,
      })
    }
  }

  return patches
}

// --- Count bees on a patch ---

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

// --- Count hives on a patch ---

export const countHivesOnPatch = (patch: CloverPatch, state: GameState): number => {
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

// --- Growth front computation ---

export const computeGrowthFront = (patch: CloverPatch, state: GameState): Position[] => {
  const candidates = new Set<string>()
  const map = state.map
  const w = state.mapWidth
  const h = state.mapHeight

  for (const key of patch.tiles) {
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr)
    const y = Number(yStr)
    for (const d of CARDINAL) {
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

// --- Spiral growth selection ---

const angleDifference = (a: number, b: number): number => {
  let d = Math.abs(a - b) % (2 * Math.PI)
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

const getPatchSeed = (patch: CloverPatch): string => {
  let minKey = ''
  for (const key of patch.tiles) {
    if (minKey === '' || key < minKey) minKey = key
  }
  return minKey
}

const getOrCreateSpiralState = (seed: string): GrowthFront => {
  const existing = spiralState.get(seed)
  if (existing) return existing

  const [xStr, yStr] = seed.split(',')
  const h = tileHash(Number(xStr), Number(yStr))

  const front: GrowthFront = {
    angle: ((h >> 8) % 628) / 100,
    angularStep: 0.3 + (h % 500) / 1000,
  }
  spiralState.set(seed, front)
  return front
}

export const selectSpiralGrowth = (patch: CloverPatch, candidates: Position[]): Position[] => {
  if (candidates.length === 0 || patch.beeCount === 0) return []

  const seed = getPatchSeed(patch)
  const front = getOrCreateSpiralState(seed)

  const scored = candidates.map(pos => {
    const angle = Math.atan2(pos.y - patch.centroid.y, pos.x - patch.centroid.x)
    const diff = angleDifference(angle, front.angle)
    const score = 1.0 - diff / Math.PI
    return { pos, score }
  })

  const growthChance = CLOVER_BASE_GROWTH_CHANCE + patch.beeCount * CLOVER_BEE_GROWTH_BONUS

  scored.sort((a, b) => b.score - a.score)

  const selected: Position[] = []
  for (const { pos, score } of scored) {
    if (selected.length >= CLOVER_MAX_GROWTH_PER_TICK) break
    const effectiveChance = growthChance * score
    if (Math.random() < effectiveChance) {
      selected.push(pos)
    }
  }

  front.angle = (front.angle + front.angularStep) % (2 * Math.PI)

  return selected
}

// --- Main growth tick ---

export const tickCloverGrowth = (state: GameState): void => {
  // Phase 1: convert previous previews to actual clover
  for (const key of state.floraGrowthPreviews) {
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr)
    const y = Number(yStr)
    if (isInBounds(x, y, state.mapWidth, state.mapHeight) && state.map[y][x].type === TileType.Dirt) {
      setMapTile(state, x, y, { type: TileType.Flora })
      state.floraLifecycle.delete(key)
    }
  }

  const grewClover = state.floraGrowthPreviews.size > 0
  state.floraGrowthPreviews = new Set<string>()

  // Phase 2: detect patches and compute new previews
  const patches = floodFillCloverPatches(state)

  // Clean stale spiral state
  const activeSeedKeys = new Set<string>()
  for (const patch of patches) {
    activeSeedKeys.add(getPatchSeed(patch))
  }
  for (const key of spiralState.keys()) {
    if (!activeSeedKeys.has(key)) {
      spiralState.delete(key)
    }
  }

  for (const patch of patches) {
    patch.beeCount = countBeesOnPatch(patch, state)
    if (patch.beeCount === 0) continue

    const candidates = computeGrowthFront(patch, state)
    const selected = selectSpiralGrowth(patch, candidates)

    for (const pos of selected) {
      state.floraGrowthPreviews.add(posKey(pos.x, pos.y))
    }
  }

  if (grewClover) {
    recordDiscovery(state, 'event:clover-growth')
  }
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

// --- Reset spiral state (for testing) ---

export const resetSpiralState = (): void => {
  spiralState.clear()
}
