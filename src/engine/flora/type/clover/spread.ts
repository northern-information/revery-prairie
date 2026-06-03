// RP-17 — clover spread config.
//
// Extracted from src/engine/clover.ts. The spiral-front growth pattern
// is unique to clover (bee-mediated, rotating angular front centered
// on the patch centroid). Wildflower and tall grass have their own
// selectors under their own type/<species>/spread.ts files; species
// modules never import from each other — the engine in
// src/engine/flora/spread.ts is the only shared substrate.
//
// Clover-specific behavior preserved verbatim from the legacy
// implementation: per-patch spiral state keyed by the smallest posKey,
// angle differencing with growthChance scaled by patch beeCount and
// per-candidate angular score, max growth per tick capped by
// CLOVER_MAX_GROWTH_PER_TICK. Tests in src/engine/__tests__/clover.test.ts
// continue to exercise this path through tickCloverGrowth (now a thin
// wrapper over tickSpeciesSpread).

import { CLOVER_BASE_GROWTH_CHANCE, CLOVER_BEE_GROWTH_BONUS, CLOVER_MAX_GROWTH_PER_TICK } from '@/engine/constants'
import { ComponentType } from '@/engine/ecs/types'
import { CARDINAL, isInBounds, posKey, tileHash } from '@/engine/position'
import { FloraSpecies, TileType } from '@/engine/types'
import type { FloraPatch, SelectGrowthTargets, SpeciesSpreadConfig } from '@/engine/flora/spreadConfig'
import type { GameState, Position } from '@/engine/types'

// --- Spiral front state ---

interface GrowthFront {
  angle: number
  angularStep: number
}

// Module-scoped mutable map keyed by patch seed (smallest posKey of the
// patch's tiles). Survives across spread ticks so the spiral continues
// rotating in the same direction; cleaned up each tick when its patch
// is no longer detected.
const spiralState = new Map<string, GrowthFront>()

export const resetSpiralState = (): void => {
  spiralState.clear()
}

// --- Pure helpers ---

const angleDifference = (a: number, b: number): number => {
  let d = Math.abs(a - b) % (2 * Math.PI)
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

const getPatchSeed = (patch: FloraPatch): string => {
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

// --- Bee counting (clover-specific) ---

const countBeesOnPatch = (patch: FloraPatch, state: GameState): number => {
  let count = 0
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'bee') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos && patch.tiles.has(posKey(pos.x, pos.y))) {
      count++
    }
  }
  return count
}

// --- Growth-front candidate computation ---

const computeGrowthFront = (patch: FloraPatch, state: GameState): Position[] => {
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

// --- Selector: rotating spiral front ---

// Public for legacy clover.test.ts which imports it directly. Future
// refactors can inline this into selectCloverGrowthTargets and drop
// the export.
export const selectSpiralGrowth = (patch: FloraPatch, candidates: Position[]): Position[] => {
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

// SelectGrowthTargets adapter. Mutates patch.beeCount and prunes stale
// spiral state so the spiral keeps rotating coherently across ticks.
const selectCloverGrowthTargets: SelectGrowthTargets = (state, patches) => {
  const result = new Map<string, Position[]>()

  // Prune spiral state for patches no longer present.
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
    if (selected.length > 0) {
      result.set(getPatchSeed(patch), selected)
    }
  }

  return result
}

export const CLOVER_SPREAD_CONFIG: SpeciesSpreadConfig = {
  species: FloraSpecies.Clover,
  selectGrowthTargets: selectCloverGrowthTargets,
  requiresPollinatorAdjacency: true,
  baseGrowthChance: CLOVER_BASE_GROWTH_CHANCE,
  winterDormant: true,
  discoveryEventOnGrowth: 'event:clover-growth',
}
