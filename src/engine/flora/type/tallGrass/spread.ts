// Precis #17 — tall grass spread config.
//
// Andropogon gerardii spreads by rhizome — the slowest of the three
// species and the only one that doesn't need pollinators. A tall-grass
// patch will quietly extend outward in any season except winter so
// long as Dirt neighbors exist. The slow rate keeps the prairie a
// mixed mosaic: without the pollinator cap that limits wildflower and
// the bee gate that limits clover, tall grass would otherwise dominate.
// Cross-species isolation: this module must not import from
// flora/type/clover/ or flora/type/wildflower/.

import {
  TALLGRASS_BASE_GROWTH_CHANCE,
  TALLGRASS_MAX_GROWTH_PER_TICK,
} from '@/engine/constants'
import type { SelectGrowthTargets, SpeciesSpreadConfig } from '@/engine/flora/spreadConfig'
import { CARDINAL, isInBounds, posKey } from '@/engine/position'
import { FloraSpecies, TileType } from '@/engine/types'

import type { Position } from '@/engine/types'

const getPatchSeed = (tiles: Set<string>): string => {
  let minKey = ''
  for (const key of tiles) {
    if (minKey === '' || key < minKey) minKey = key
  }
  return minKey
}

const selectTallGrassGrowthTargets: SelectGrowthTargets = (state, patches) => {
  const result = new Map<string, Position[]>()
  const w = state.mapWidth
  const h = state.mapHeight
  const map = state.map

  for (const patch of patches) {
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
        seen.add(nk)
        candidates.push({ x: nx, y: ny })
      }
    }

    if (candidates.length === 0) continue

    const selected: Position[] = []
    for (const c of candidates) {
      if (selected.length >= TALLGRASS_MAX_GROWTH_PER_TICK) break
      if (Math.random() < TALLGRASS_BASE_GROWTH_CHANCE) {
        selected.push(c)
      }
    }

    if (selected.length > 0) {
      result.set(getPatchSeed(patch.tiles), selected)
    }
  }

  return result
}

export const TALLGRASS_SPREAD_CONFIG: SpeciesSpreadConfig = {
  species: FloraSpecies.TallGrass,
  selectGrowthTargets: selectTallGrassGrowthTargets,
  requiresPollinatorAdjacency: false,
  baseGrowthChance: TALLGRASS_BASE_GROWTH_CHANCE,
  winterDormant: true,
  discoveryEventOnGrowth: 'event:tallgrass-growth',
}
