// Shared structure registry. Encapsulates the visual identity of each
// "structure" in the world (ruins, caves, future shrines, etc.) so the
// renderer, bg-cache, and tile-layer modules read from one place.
//
// See harness/specs/structure-registry.yaml.

import { BUILDING_CHARS, CAVE_BUILDING_CHARS, CAVE_WALL_COLORS, CIV_COLORS } from './constants'
import { TileType } from './types'

export type StructureId = 'ruin' | 'cave'

export interface StructureDef {
  id: StructureId
  entranceTile: TileType
  apronTile: TileType
  entranceLiftPx: number
  apronLiftPx: number
  palette: readonly string[]
  chars: readonly string[]
  multilayerTiles: readonly TileType[]
}

export const STRUCTURE_REGISTRY = {
  ruin: {
    id: 'ruin',
    entranceTile: TileType.RuinEntrance,
    apronTile: TileType.RuinApron,
    entranceLiftPx: 9,
    apronLiftPx: 3,
    palette: CIV_COLORS,
    chars: BUILDING_CHARS,
    multilayerTiles: [TileType.RuinWall, TileType.RuinFloor],
  },
  cave: {
    id: 'cave',
    entranceTile: TileType.CaveEntrance,
    apronTile: TileType.CaveApron,
    entranceLiftPx: 9,
    apronLiftPx: 3,
    palette: CAVE_WALL_COLORS,
    chars: CAVE_BUILDING_CHARS,
    multilayerTiles: [TileType.CaveWall, TileType.CaveFloor],
  },
} as const satisfies Record<StructureId, StructureDef>

// Negative pixel lift applied to entrance and apron tiles on the
// overworld. Returns 0 for any tile that is not an entrance or apron in
// the registry, so the caller can add it unconditionally. Callers are
// responsible for gating on Zone.Overworld.
export const getStructurePlatformLift = (tileType: TileType): number => {
  for (const entry of Object.values(STRUCTURE_REGISTRY)) {
    if (tileType === entry.entranceTile) return -entry.entranceLiftPx
    if (tileType === entry.apronTile) return -entry.apronLiftPx
  }
  return 0
}
