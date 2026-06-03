// RP-17 — wildflower spread config.
//
// Echinacea purpurea spreads by pollinator-mediated radial expansion.
// Unlike clover's rotating spiral front, wildflower has no directional
// bias — it grows toward whichever Dirt neighbors are within
// Chebyshev-3 of any bee or monarch entity. If no pollinators are
// near a patch, the patch holds steady; it does not expand on its own.
// Cross-species isolation: this module must not import from
// flora/type/clover/ or flora/type/tallGrass/ — the engine in
// flora/spread.ts is the only shared substrate.

import { WILDFLOWER_BASE_GROWTH_CHANCE, WILDFLOWER_MAX_GROWTH_PER_TICK } from '@/engine/constants'
import { ComponentType } from '@/engine/ecs/types'
import { CARDINAL, isInBounds, posKey } from '@/engine/position'
import { FloraSpecies, TileType } from '@/engine/types'
import type { SelectGrowthTargets, SpeciesSpreadConfig } from '@/engine/flora/spreadConfig'
import type { GameState, Position } from '@/engine/types'

const POLLINATOR_RADIUS = 3

const findPollinatorPositions = (state: GameState): Position[] => {
  const positions: Position[] = []
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'bee' && tag !== 'monarch') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos) positions.push({ x: pos.x, y: pos.y })
  }
  return positions
}

const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by))

const hasPollinatorWithinRadius = (x: number, y: number, pollinators: Position[]): boolean => {
  for (const p of pollinators) {
    if (chebyshevDistance(x, y, p.x, p.y) <= POLLINATOR_RADIUS) return true
  }
  return false
}

const getPatchSeed = (tiles: Set<string>): string => {
  let minKey = ''
  for (const key of tiles) {
    if (minKey === '' || key < minKey) minKey = key
  }
  return minKey
}

const selectWildflowerGrowthTargets: SelectGrowthTargets = (state, patches) => {
  const result = new Map<string, Position[]>()
  const pollinators = findPollinatorPositions(state)
  if (pollinators.length === 0) return result

  const w = state.mapWidth
  const h = state.mapHeight
  const map = state.map

  for (const patch of patches) {
    // Gather Dirt neighbors of the patch.
    const candidates: Position[] = []
    const seen = new Set<string>()

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
        if (seen.has(nk)) continue
        if (map[ny][nx].type !== TileType.Dirt) continue
        if (!hasPollinatorWithinRadius(nx, ny, pollinators)) continue
        seen.add(nk)
        candidates.push({ x: nx, y: ny })
      }
    }

    if (candidates.length === 0) continue

    // Per-candidate growth roll, capped per patch per tick.
    const selected: Position[] = []
    for (const c of candidates) {
      if (selected.length >= WILDFLOWER_MAX_GROWTH_PER_TICK) break
      if (Math.random() < WILDFLOWER_BASE_GROWTH_CHANCE) {
        selected.push(c)
      }
    }

    if (selected.length > 0) {
      result.set(getPatchSeed(patch.tiles), selected)
    }
  }

  return result
}

export const WILDFLOWER_SPREAD_CONFIG: SpeciesSpreadConfig = {
  species: FloraSpecies.Wildflower,
  selectGrowthTargets: selectWildflowerGrowthTargets,
  requiresPollinatorAdjacency: true,
  baseGrowthChance: WILDFLOWER_BASE_GROWTH_CHANCE,
  winterDormant: true,
  discoveryEventOnGrowth: 'event:wildflower-growth',
}
