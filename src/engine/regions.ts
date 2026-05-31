// RP-22 — Named regions.
//
// Genesis-time pass that scans terrain features (ponds, ruins, cave
// entrance, the village/Gron-center, satellite-crash craters, tectonic
// ridges) and produces a stable, deterministic array of NamedRegion
// objects bound to state.namedRegions. Single writer: detectNamedRegions
// called once from createGameState. Stable across the lifetime of the
// tenure — never mutated by any tick handler.

import { posKey } from './position'
import { NamedRegionKind, TileType } from './types'

import type { CivilizationRuin, TectonicAxis } from './genesisTypes'
import type { NamedRegion, Position, Tile } from './types'

export interface DetectRegionsInput {
  mapWidth: number
  mapHeight: number
  map: Tile[][]
  ponds: Set<string>
  ruins: CivilizationRuin[]
  craters: Set<string>
  tectonicAxes: TectonicAxis[]
  caveEntranceOverworld: Position
  villageCenter: Position
}

// Quadrant-derived screen-cardinal name. Uses the rotated diamond frame
// described in types.ts WindDirection — N is the top tip of the diamond
// on screen and corresponds to storage (-x, -y); E is (+x, -y); S is
// (+x, +y); W is (-x, +y). Diamond tips dominate over edges so the four
// names partition the plane cleanly.
type ScreenCardinal = 'north' | 'east' | 'south' | 'west'

const directionFromQuadrant = (pos: Position, center: Position): ScreenCardinal => {
  const dx = pos.x - center.x
  const dy = pos.y - center.y
  // Screen-space deltas in the rotated frame: sx grows toward the east
  // tip, sy grows toward the south tip.
  const sx = dx - dy
  const sy = dx + dy
  if (Math.abs(sy) >= Math.abs(sx)) {
    return sy >= 0 ? 'south' : 'north'
  }
  return sx >= 0 ? 'east' : 'west'
}

const parsePosKey = (key: string): Position => {
  const [xs, ys] = key.split(',')
  return { x: Number(xs), y: Number(ys) }
}

const floodFillClusters = (tiles: Set<string>): Set<string>[] => {
  const visited = new Set<string>()
  const clusters: Set<string>[] = []
  for (const start of tiles) {
    if (visited.has(start)) continue
    const cluster = new Set<string>()
    const stack: string[] = [start]
    while (stack.length > 0) {
      const k = stack.pop()
      if (k === undefined) continue
      if (visited.has(k)) continue
      if (!tiles.has(k)) continue
      visited.add(k)
      cluster.add(k)
      const { x, y } = parsePosKey(k)
      const neighbors = [posKey(x - 1, y), posKey(x + 1, y), posKey(x, y - 1), posKey(x, y + 1)]
      for (const n of neighbors) {
        if (!visited.has(n) && tiles.has(n)) stack.push(n)
      }
    }
    if (cluster.size > 0) clusters.push(cluster)
  }
  return clusters
}

const centroidOf = (tiles: Set<string>): Position => {
  let sx = 0
  let sy = 0
  let count = 0
  for (const key of tiles) {
    const { x, y } = parsePosKey(key)
    sx += x
    sy += y
    count += 1
  }
  if (count === 0) return { x: 0, y: 0 }
  return { x: Math.round(sx / count), y: Math.round(sy / count) }
}

const generateFootprint = (center: Position, r: number): string[] => {
  const out: string[] = []
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      out.push(posKey(center.x + dx, center.y + dy))
    }
  }
  return out
}

// Pick a unique label from a base + auto-suffix counter. Mutates the
// `used` set. Determinism — call order matters; the detection function
// orders its inputs the same way every run.
const claimLabel = (base: string, used: Set<string>): string => {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  let counter = 2
  while (used.has(`${base}-${String(counter)}`)) counter += 1
  const label = `${base}-${String(counter)}`
  used.add(label)
  return label
}

export const detectNamedRegions = (input: DetectRegionsInput): NamedRegion[] => {
  const { mapWidth, mapHeight, map, ponds, ruins, craters, tectonicAxes, caveEntranceOverworld, villageCenter } = input

  const regions: NamedRegion[] = []
  const usedIds = new Set<string>()

  // 1. The village — Gron's tile + a small footprint. Always present.
  {
    const id = claimLabel('the-village', usedIds)
    regions.push({
      id,
      name: 'the village',
      kind: NamedRegionKind.Village,
      anchor: { x: villageCenter.x, y: villageCenter.y },
      tiles: new Set(generateFootprint(villageCenter, 2)),
    })
  }

  // 2. The cave mouth — single overworld tile + a small apron footprint.
  {
    const id = claimLabel('cave-mouth', usedIds)
    regions.push({
      id,
      name: 'the cave mouth',
      kind: NamedRegionKind.CaveMouth,
      anchor: { x: caveEntranceOverworld.x, y: caveEntranceOverworld.y },
      tiles: new Set(generateFootprint(caveEntranceOverworld, 2)),
    })
  }

  // 3. Ruins — one region per CivilizationRuin, directional name from
  // its quadrant relative to the village center. The ruin's radius
  // defines its footprint.
  for (const ruin of ruins) {
    const direction = directionFromQuadrant(ruin.position, villageCenter)
    const id = claimLabel(`${direction}-ruin`, usedIds)
    regions.push({
      id,
      name: `the ${direction} ruin`,
      kind: NamedRegionKind.Ruin,
      anchor: { x: ruin.position.x, y: ruin.position.y },
      tiles: new Set(generateFootprint(ruin.position, Math.max(2, Math.floor(ruin.radius)))),
    })
  }

  // 4. Pond clusters — flood-fill the genesis ponds set into disjoint
  // groups. One named region per cluster, directional name from the
  // cluster centroid.
  for (const cluster of floodFillClusters(ponds)) {
    const center = centroidOf(cluster)
    const direction = directionFromQuadrant(center, villageCenter)
    const id = claimLabel(`${direction}-pond`, usedIds)
    regions.push({
      id,
      name: `the ${direction} pond`,
      kind: NamedRegionKind.Pond,
      anchor: center,
      tiles: cluster,
    })
  }

  // 5. Meteorite-circle craters — flood-fill the genesis craters set
  // into disjoint groups. Player-placed stone circles (RP-18) are not
  // detected as regions here; they emit chronicle events from within
  // whichever region contains their anchor.
  for (const cluster of floodFillClusters(craters)) {
    const center = centroidOf(cluster)
    const direction = directionFromQuadrant(center, villageCenter)
    const id = claimLabel(`${direction}-meteorite-circle`, usedIds)
    regions.push({
      id,
      name: `the ${direction} meteorite circle`,
      kind: NamedRegionKind.MeteoriteCircle,
      anchor: center,
      tiles: cluster,
    })
  }

  // 6. Ridges — one region per tectonic axis polyline, directional name
  // from the midpoint of the polyline.
  for (const axis of tectonicAxes) {
    if (axis.polyline.length === 0) continue
    const mid = axis.polyline[Math.floor(axis.polyline.length / 2)]
    const direction = directionFromQuadrant(mid, villageCenter)
    const id = claimLabel(`${direction}-ridge`, usedIds)
    const tiles = new Set<string>()
    for (const pt of axis.polyline) {
      tiles.add(posKey(pt.x, pt.y))
    }
    regions.push({
      id,
      name: `the ${direction} ridge`,
      kind: NamedRegionKind.Ridge,
      anchor: { x: mid.x, y: mid.y },
      tiles,
    })
  }

  // 7. Prairie fallback — covers every walkable Dirt+Flora tile not
  // claimed by a more specific region. Always present, even when zero
  // other features exist on the map (pathological seeds).
  const claimedTiles = new Set<string>()
  for (const r of regions) {
    for (const t of r.tiles) claimedTiles.add(t)
  }
  const prairieTiles = new Set<string>()
  for (let y = 0; y < mapHeight; y++) {
    const row = map[y]
    if (!row) continue
    for (let x = 0; x < mapWidth; x++) {
      const t = row[x]
      if (!t) continue
      if (t.type !== TileType.Dirt && t.type !== TileType.Flora) continue
      const k = posKey(x, y)
      if (claimedTiles.has(k)) continue
      prairieTiles.add(k)
    }
  }
  regions.push({
    id: claimLabel('prairie', usedIds),
    name: 'the prairie',
    kind: NamedRegionKind.Prairie,
    anchor: { x: villageCenter.x, y: villageCenter.y },
    tiles: prairieTiles,
  })

  return regions
}
