// RP-8b — shared position helpers for the egregoric biome.
//
// Extracted from src/engine/revery.ts (RP-4) so both the stewardship-
// winter spread tick and the Revery-time advance can share the same
// candidate-enumeration logic. The trailCentroid + Manhattan-sort logic
// stays in revery.ts since it's revery-specific.

import { isInBounds, ORDINAL, posKey } from '@/engine/position'
import { getStoneCircleGraph, segmentCrossesAnyMeteoriteEdge } from '@/engine/stoneCircles'
import { TileType } from '@/engine/types'

import type { GameState, Position } from '@/engine/types'

// 8-neighbor (ordinal) walk over every existing egregore tile. Returns
// positions of adjacent Dirt tiles, deduplicated by posKey. The Dirt
// filter ensures we never overwrite water, ruins, cave entrances,
// existing egregore tiles, or any other non-Dirt surface.
export const candidateDirtNeighbors = (state: GameState): Position[] => {
  const seen = new Set<string>()
  const candidates: Position[] = []
  for (const pos of state.egregorePositions) {
    for (const d of ORDINAL) {
      const nx = pos.x + d.x
      const ny = pos.y + d.y
      if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
      if (state.map[ny][nx].type !== TileType.Dirt) continue
      const key = posKey(nx, ny)
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({ x: nx, y: ny })
    }
  }
  return candidates
}

// RP-18 — wall-crossing containment filter for egregoric spread.
//
// A candidate dirt tile is accepted iff at least one of its egregoric
// 8-neighbors can reach it without crossing any meteorite-pair edge in
// the proximity graph. Two-meteorite "walls" block spread the same way
// closed polygons do — the test is purely local segment intersection,
// no polygon detection required.
//
// When no edges exist (zero or one meteorite, or all out of range),
// output matches candidateDirtNeighbors exactly — legacy behavior is
// preserved.
export const candidateDirtNeighborsContained = (state: GameState): Position[] => {
  const placed = state.placedMeteorites
  const edges = placed.length >= 2 ? getStoneCircleGraph(placed) : []

  if (edges.length === 0) return candidateDirtNeighbors(state)

  const seen = new Set<string>()
  const accepted = new Set<string>()
  const candidates: Position[] = []

  for (const source of state.egregorePositions) {
    for (const d of ORDINAL) {
      const nx = source.x + d.x
      const ny = source.y + d.y
      if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
      if (state.map[ny][nx].type !== TileType.Dirt) continue
      const pk = posKey(nx, ny)
      if (accepted.has(pk)) continue
      if (segmentCrossesAnyMeteoriteEdge(placed, edges, source.x, source.y, nx, ny)) continue
      if (seen.has(pk)) continue
      seen.add(pk)
      accepted.add(pk)
      candidates.push({ x: nx, y: ny })
    }
  }
  return candidates
}
