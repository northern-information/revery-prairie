import { CHARACTER_DEFINITIONS } from './characters'
import { transitionCoyoteToZone } from './coyote'
import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { posKey, tileHash } from './position'
import { RuinArchetype, TileType, Zone } from './types'

import type { CivilizationRuin } from './genesisTypes'
import type {
  DormantGardenData,
  GameState,
  GhostFormation,
  HauntedThresholdData,
  Position,
  RuinInterior,
  SubsidenceData,
  Tile,
} from './types'

// ---------------------------------------------------------------------------
// PRNG (same mulberry32 used in genesis.ts)
// ---------------------------------------------------------------------------

const mulberry32 = (seed: number): (() => number) => {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const carveRect = (
  map: Tile[][],
  x: number,
  y: number,
  w: number,
  h: number,
  tileType: TileType = TileType.RuinFloor,
): void => {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const row = map[y + dy]
      if (row && x + dx >= 0 && x + dx < map[0].length) {
        row[x + dx] = { type: tileType }
      }
    }
  }
}

const carveCorridor = (
  map: Tile[][],
  from: Position,
  to: Position,
  width: number,
  tileType: TileType = TileType.RuinFloor,
): void => {
  const halfW = Math.floor(width / 2)

  // Horizontal segment
  const minX = Math.min(from.x, to.x)
  const maxX = Math.max(from.x, to.x)
  for (let x = minX; x <= maxX; x++) {
    for (let dy = -halfW; dy <= halfW; dy++) {
      const row = map[from.y + dy]
      if (row && x >= 0 && x < map[0].length) {
        row[x] = { type: tileType }
      }
    }
  }

  // Vertical segment
  const minY = Math.min(from.y, to.y)
  const maxY = Math.max(from.y, to.y)
  for (let y = minY; y <= maxY; y++) {
    for (let dx = -halfW; dx <= halfW; dx++) {
      const row = map[y]
      if (row && to.x + dx >= 0 && to.x + dx < map[0].length) {
        row[to.x + dx] = { type: tileType }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Archetype assignment
// ---------------------------------------------------------------------------

export const assignArchetype = (ruin: CivilizationRuin, _ruinIndex: number, rng: () => number): RuinArchetype => {
  const area = Math.PI * ruin.radius * ruin.radius
  const footprintDensity = ruin.buildingFootprints.length / Math.max(area, 1)
  const aqueductComplexity = ruin.aqueductPaths.length

  // Score each archetype based on ruin properties
  const scores: Record<RuinArchetype, number> = {
    [RuinArchetype.Subsidence]: ruin.radius * 2 + ruin.age / 1000,
    [RuinArchetype.DormantGarden]: aqueductComplexity * 3 + ruin.radius,
    [RuinArchetype.HauntedThreshold]: (6 - ruin.radius) * 2 + (ruin.age > 2000 && ruin.age < 4500 ? 3 : 0),
    [RuinArchetype.Resonance]: ruin.radius * 2 + (footprintDensity < 0.5 ? 4 : 0),
  }

  // Add noise to break ties and create variety
  const archetypes = Object.values(RuinArchetype)
  let best = archetypes[0]
  let bestScore = -Infinity
  for (const a of archetypes) {
    const noised = scores[a] + rng() * 4
    if (noised > bestScore) {
      bestScore = noised
      best = a
    }
  }

  return best
}

// ---------------------------------------------------------------------------
// Ruin interior generation
// ---------------------------------------------------------------------------

const MARGIN = 2

// Subsidence constants
const SUBSIDENCE_MIN_FIRST_WAVE_MS = 10_000
const SUBSIDENCE_MAX_COLLAPSE_THRESHOLD = 80
const SUBSIDENCE_COLLAPSE_DURATION_MS = 90_000

const createBaseMap = (
  mapWidth: number,
  mapHeight: number,
): { map: Tile[][]; entranceX: number; entranceY: number; entranceInterior: Position } => {
  const map: Tile[][] = Array.from({ length: mapHeight }, () =>
    Array.from({ length: mapWidth }, () => ({ type: TileType.RuinWall })),
  )

  const entranceX = Math.floor(mapWidth / 2)
  const entranceY = mapHeight - 2
  map[entranceY][entranceX] = { type: TileType.RuinEntrance }

  // Landing area (3 wide, 2 tall)
  carveRect(map, entranceX - 1, entranceY - 2, 3, 2)

  const entranceInterior: Position = { x: entranceX, y: entranceY - 1 }
  return { map, entranceX, entranceY, entranceInterior }
}

// ---------------------------------------------------------------------------
// Subsidence generator
// ---------------------------------------------------------------------------

const generateSubsidence = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  entranceX: number,
  entranceY: number,
  ruin: CivilizationRuin,
  rng: () => number,
): SubsidenceData => {
  // Carve a large central hall with noise-perturbed edges
  const hallW = Math.floor(mapWidth * 0.7)
  const hallH = Math.floor(mapHeight * 0.6)
  const hallX = Math.floor((mapWidth - hallW) / 2)
  const hallY = Math.max(MARGIN, Math.floor((mapHeight - hallH) / 2) - 1)

  // Carve the hall with irregular edges using noise
  for (let dy = 0; dy < hallH; dy++) {
    for (let dx = 0; dx < hallW; dx++) {
      const wx = hallX + dx
      const wy = hallY + dy
      if (wy >= mapHeight - 2) continue // don't overwrite entrance row
      const row = map[wy]
      if (!row || wx < 0 || wx >= mapWidth) continue

      // Noise-based edge erosion — tiles near the border have a chance of staying wall
      const distFromEdge = Math.min(dx, hallW - 1 - dx, dy, hallH - 1 - dy)
      if (distFromEdge <= 1 && rng() < 0.3) continue // ragged edges

      row[wx] = { type: TileType.RuinFloor }
    }
  }

  // Carve corridor from landing to hall (in case hall doesn't reach entrance)
  carveCorridor(map, { x: entranceX, y: entranceY - 2 }, { x: entranceX, y: hallY + hallH - 1 }, 3)

  // Scatter stone pillar clusters (2x2 RuinWall) inside the hall
  const pillarCount = 3 + Math.floor(rng() * 4)
  for (let p = 0; p < pillarCount; p++) {
    const px = hallX + 2 + Math.floor(rng() * (hallW - 4))
    const py = hallY + 2 + Math.floor(rng() * (hallH - 4))
    // Don't place pillars near the entrance corridor
    if (Math.abs(px - entranceX) <= 2 && py >= hallY + hallH - 3) continue
    carveRect(map, px, py, 2, 2, TileType.RuinWall)
  }

  // Calculate structural integrity for perimeter floor tiles
  const structuralIntegrity = new Map<string, number>()

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const tile = map[y][x]
      if (tile.type !== TileType.RuinFloor) continue

      // Check if this is a perimeter tile (adjacent to at least one wall)
      let isPerimeter = false
      for (const [ddx, ddy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + ddx
        const ny = y + ddy
        if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) {
          isPerimeter = true
          break
        }
        if (map[ny][nx].type === TileType.RuinWall) {
          isPerimeter = true
          break
        }
      }

      if (!isPerimeter) continue

      // Distance from entrance determines base integrity
      const dist = Math.abs(x - entranceX) + Math.abs(y - entranceY)
      const maxDist = mapWidth + mapHeight
      const normalizedDist = dist / maxDist

      // Near entrance = high integrity, far = low integrity + noise
      const baseIntegrity = 90 - normalizedDist * 70
      const noise = (rng() - 0.5) * 20
      const integrity = Math.max(5, Math.min(100, baseIntegrity + noise))

      // Older ruins have more low-integrity tiles (scale down further ones)
      const ageFactor = 1 - (ruin.age / 6000) * 0.3
      const finalIntegrity = Math.max(5, integrity * ageFactor)

      structuralIntegrity.set(posKey(x, y), finalIntegrity)

      // Mark low-integrity tiles as unstable
      if (finalIntegrity < 50) {
        map[y][x] = { type: TileType.RuinUnstable }
      }
    }
  }

  // Place seed positions — biased toward outer edges of the hall
  const seedPositions: Position[] = []
  const seedCount = 4 + Math.floor(rng() * 5)
  let seedAttempts = 0
  while (seedPositions.length < seedCount && seedAttempts < 200) {
    seedAttempts++
    const sx = hallX + Math.floor(rng() * hallW)
    const sy = hallY + Math.floor(rng() * hallH)
    if (sy >= mapHeight || sx >= mapWidth) continue
    const tile = map[sy]?.[sx]
    if (!tile) continue
    if (tile.type !== TileType.RuinFloor && tile.type !== TileType.RuinUnstable) continue
    // Bias toward edges: prefer tiles with high distance from center
    const distFromCenter = Math.abs(sx - entranceX) + Math.abs(sy - (hallY + Math.floor(hallH / 2)))
    if (distFromCenter < hallW * 0.2 && rng() < 0.6) continue // reject central tiles 60% of the time
    // Don't place too close to other seeds
    const tooClose = seedPositions.some((s) => Math.abs(s.x - sx) + Math.abs(s.y - sy) < 3)
    if (tooClose) continue
    seedPositions.push({ x: sx, y: sy })
  }

  // Collapse rate: older ruins collapse faster (shorter interval between waves)
  // Range: 3000ms (young, age=1000) to 1500ms (old, age=6000)
  const collapseRate = Math.max(1500, 3000 - (ruin.age / 6000) * 1500)

  return {
    structuralIntegrity,
    collapseTimer: 0,
    collapseRate,
    seedPositions,
    collapsed: false,
  }
}

// ---------------------------------------------------------------------------
// Dormant garden generator
// ---------------------------------------------------------------------------

const SEED_DECAY_BASE_MS = 90_000
const SEED_DECAY_MIN_MS = 45_000

const generateDormantGarden = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  entranceX: number,
  entranceY: number,
  ruin: CivilizationRuin,
  rng: () => number,
): DormantGardenData => {
  // Number of turns in the corridor (1-3, based on aqueduct complexity)
  const turnCount = Math.min(3, Math.max(1, ruin.aqueductPaths.length))
  const corridorWidth = 3

  // Build waypoints for the L/Z-shaped corridor
  const waypoints: Position[] = [{ x: entranceX, y: entranceY - 2 }]
  for (let i = 0; i < turnCount; i++) {
    const wx = MARGIN + 3 + Math.floor(rng() * (mapWidth - MARGIN * 2 - 6))
    const wy = MARGIN + 2 + Math.floor(rng() * Math.floor((mapHeight - MARGIN * 2 - 6) * ((turnCount - i) / (turnCount + 1))))
    waypoints.push({ x: wx, y: wy })
  }

  // Carve corridors between waypoints
  for (let i = 0; i < waypoints.length - 1; i++) {
    carveCorridor(map, waypoints[i], waypoints[i + 1], corridorWidth)
  }

  // Carve seed vault chamber at the terminus (before laying aqueduct so vault floor exists)
  const lastWaypoint = waypoints[waypoints.length - 1]
  const vaultW = 5
  const vaultH = 4
  const vaultX = Math.max(MARGIN, Math.min(mapWidth - MARGIN - vaultW, lastWaypoint.x - Math.floor(vaultW / 2)))
  const vaultY = Math.max(MARGIN, lastWaypoint.y - vaultH - 1)
  carveRect(map, vaultX, vaultY, vaultW, vaultH)
  const vaultCenter: Position = { x: vaultX + Math.floor(vaultW / 2), y: vaultY + Math.floor(vaultH / 2) }
  carveCorridor(map, lastWaypoint, vaultCenter, 2)

  // Lay aqueduct channel (1 tile wide) down the center of the corridor path
  const aqueductTiles = new Set<string>()
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]
    const to = waypoints[i + 1]
    // Horizontal segment
    const minX = Math.min(from.x, to.x)
    const maxX = Math.max(from.x, to.x)
    for (let x = minX; x <= maxX; x++) {
      const tile = map[from.y]?.[x]
      if (tile && tile.type !== TileType.RuinWall && tile.type !== TileType.RuinEntrance) {
        map[from.y][x] = { type: TileType.RuinAqueduct }
        aqueductTiles.add(posKey(x, from.y))
      }
    }
    // Vertical segment
    const minY = Math.min(from.y, to.y)
    const maxY = Math.max(from.y, to.y)
    for (let y = minY; y <= maxY; y++) {
      const tile = map[y]?.[to.x]
      if (tile && tile.type !== TileType.RuinWall && tile.type !== TileType.RuinEntrance) {
        map[y][to.x] = { type: TileType.RuinAqueduct }
        aqueductTiles.add(posKey(to.x, y))
      }
    }
  }

  // Place break points along the aqueduct
  const breakCount = 2 + Math.floor(rng() * 3)
  const aqueductArray = [...aqueductTiles]
  const breakPoints: Position[] = []
  for (let i = 0; i < breakCount && aqueductArray.length > 2; i++) {
    // Pick from the middle portion of the aqueduct (not near endpoints)
    const startIdx = Math.floor(aqueductArray.length * 0.15)
    const endIdx = Math.floor(aqueductArray.length * 0.85)
    const idx = startIdx + Math.floor(rng() * (endIdx - startIdx))
    const key = aqueductArray[idx]
    if (!key) continue
    const parts = key.split(',')
    const bx = Number(parts[0])
    const by = Number(parts[1])
    // Don't place breaks too close to each other
    const tooClose = breakPoints.some((bp) => Math.abs(bp.x - bx) + Math.abs(bp.y - by) < 4)
    if (tooClose) continue
    map[by][bx] = { type: TileType.RuinAqueductBroken }
    breakPoints.push({ x: bx, y: by })
    aqueductTiles.delete(key)
  }

  // Place debris at corridor intersections
  const debrisCount = 3 + Math.floor(rng() * 3)
  const debrisPositions: Position[] = []
  let debrisAttempts = 0
  while (debrisPositions.length < debrisCount && debrisAttempts < 100) {
    debrisAttempts++
    const dx = MARGIN + Math.floor(rng() * (mapWidth - MARGIN * 2))
    const dy = MARGIN + Math.floor(rng() * (mapHeight - MARGIN * 2))
    if (map[dy]?.[dx]?.type !== TileType.RuinFloor) continue
    // Don't block the aqueduct
    if (aqueductTiles.has(posKey(dx, dy))) continue
    // Don't block the entrance
    if (Math.abs(dx - entranceX) <= 1 && dy >= entranceY - 3) continue
    map[dy][dx] = { type: TileType.RuinDebris }
    debrisPositions.push({ x: dx, y: dy })
  }

  // Seed decay timers — scaled by ruin age (older = faster decay = shorter timer)
  const ageFactor = ruin.age / 6000
  const baseDecay = SEED_DECAY_BASE_MS - ageFactor * (SEED_DECAY_BASE_MS - SEED_DECAY_MIN_MS)

  // Place seed positions in the vault
  const seedDecayTimers = new Map<string, number>()
  const seedCount = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < seedCount; i++) {
    const sx = vaultX + 1 + Math.floor(rng() * (vaultW - 2))
    const sy = vaultY + 1 + Math.floor(rng() * (vaultH - 2))
    const key = posKey(sx, sy)
    if (seedDecayTimers.has(key)) continue
    if (map[sy]?.[sx]?.type !== TileType.RuinFloor) continue
    // Each seed gets a slightly different timer
    seedDecayTimers.set(key, baseDecay + (rng() - 0.5) * 10_000)
  }

  return {
    aqueductTiles,
    breakPoints,
    repairedBreaks: new Set<string>(),
    debrisPositions,
    seedVault: vaultCenter,
    seedDecayTimers,
    seedDecayAcceleration: 1,
    waterFlowing: false,
  }
}

// ---------------------------------------------------------------------------
// Haunted threshold generator
// ---------------------------------------------------------------------------

// Dialog hints mapped to wanted items — each ghost gets a memory fragment
const GUARDIAN_DIALOG_HINTS: { itemId: string; dialog: string[]; postDialog: string[] }[] = [
  {
    itemId: 'clover',
    dialog: ['...', 'I remember fields of green...', '...the smell after rain...'],
    postDialog: ['...thank you. I had forgotten the smell of growing things.'],
  },
  {
    itemId: 'honey',
    dialog: ['...', 'the sweetness... I can almost taste it...', '...we kept hives on the roof...'],
    postDialog: ['...how long has it been? thank you.'],
  },
  {
    itemId: 'coin',
    dialog: ['...', 'we counted everything... measured everything...', '...kept ledgers of every transaction...'],
    postDialog: ['...the weight of it. yes. I remember now.'],
  },
  {
    itemId: 'meteorite',
    dialog: ['...', 'we measured the heavens for signs...', '...the night a star fell into the square...'],
    postDialog: ['...it still burns cold. thank you, steward.'],
  },
  {
    itemId: 'bee',
    dialog: ['...', 'they hummed in the walls...', '...we built our city around them...'],
    postDialog: ['...I can hear them again. thank you.'],
  },
]

const generateHauntedThreshold = (
  map: Tile[][],
  mapWidth: number,
  _mapHeight: number,
  entranceX: number,
  entranceY: number,
  ruin: CivilizationRuin,
  ruinIndex: number,
  rng: () => number,
): HauntedThresholdData => {
  // Number of rooms scales with radius (3-5)
  const roomCount = Math.min(5, Math.max(3, ruin.radius))
  const rooms: { center: Position; width: number; height: number }[] = []
  const ghostFormations: GhostFormation[] = []

  // Generate rooms arranged roughly northward from entrance
  let prevCenter: Position = { x: entranceX, y: entranceY - 3 }
  for (let i = 0; i < roomCount; i++) {
    const roomW = 5 + Math.floor(rng() * 3) // 5-7
    const roomH = 5 + Math.floor(rng() * 3) // 5-7
    // Place room above previous, with lateral offset
    const lateralOffset = Math.floor((rng() - 0.5) * 6)
    const cx = Math.max(MARGIN + Math.floor(roomW / 2) + 1, Math.min(mapWidth - MARGIN - Math.floor(roomW / 2) - 1, prevCenter.x + lateralOffset))
    const cy = Math.max(MARGIN + Math.floor(roomH / 2) + 1, prevCenter.y - roomH - 3 - Math.floor(rng() * 2))
    const center: Position = { x: cx, y: cy }

    // Carve the room
    const rx = cx - Math.floor(roomW / 2)
    const ry = cy - Math.floor(roomH / 2)
    carveRect(map, rx, ry, roomW, roomH)

    rooms.push({ center, width: roomW, height: roomH })

    // Carve corridor from previous center to this room
    if (i === 0) {
      carveCorridor(map, { x: entranceX, y: entranceY - 2 }, center, 2)
    } else {
      carveCorridor(map, prevCenter, center, 2)
    }

    // Place ghost formation in the corridor between rooms (except before first room)
    if (i > 0) {
      const corridorMidX = Math.floor((prevCenter.x + center.x) / 2)
      const corridorMidY = Math.floor((prevCenter.y + center.y) / 2)
      const ghostCount = 2 + Math.floor(rng() * 2) // 2-3
      const positions: Position[] = []
      const wantedItems: string[] = []

      for (let g = 0; g < ghostCount; g++) {
        // Spread ghosts across the corridor width
        const gx = corridorMidX + (g - Math.floor(ghostCount / 2))
        const gy = corridorMidY
        if (map[gy]?.[gx]?.type === TileType.RuinFloor) {
          positions.push({ x: gx, y: gy })
          // Pick a dialog/item from the pool, seeded by position
          const hintIdx = (tileHash(gx, gy) + ruinIndex * 7) % GUARDIAN_DIALOG_HINTS.length
          const hint = GUARDIAN_DIALOG_HINTS[hintIdx]
          wantedItems.push(hint.itemId)

          // Register ghost character definition
          const ghostId = `ruin-guardian-${String(ruinIndex)}-${String(i)}-${String(g)}`
          CHARACTER_DEFINITIONS[ghostId] = {
            id: ghostId,
            name: `Guardian Spirit`,
            glyph: 'ö',
            glyphColor: '#8888CC',
            dialog: hint.dialog,
            postGiftDialog: hint.postDialog,
          }
        }
      }

      if (positions.length > 0) {
        ghostFormations.push({
          positions,
          wantedItems,
          satisfied: positions.map(() => false),
        })
      }
    }

    prevCenter = center
  }

  // Carve inner chamber behind the last room (6x4, single 1-wide doorway)
  const lastRoom = rooms[rooms.length - 1]
  const chamberW = 6
  const chamberH = 4
  const chamberX = Math.max(MARGIN, Math.min(mapWidth - MARGIN - chamberW, lastRoom.center.x - Math.floor(chamberW / 2)))
  const chamberY = Math.max(MARGIN, lastRoom.center.y - lastRoom.height - chamberH)
  carveRect(map, chamberX, chamberY, chamberW, chamberH)

  // Single 1-wide doorway connecting chamber to last room
  const doorX = chamberX + Math.floor(chamberW / 2)
  const doorY = chamberY + chamberH
  for (let y = doorY; y <= lastRoom.center.y - Math.floor(lastRoom.height / 2); y++) {
    if (map[y]?.[doorX]) {
      map[y][doorX] = { type: TileType.RuinFloor }
    }
  }

  // Collect inner chamber floor positions
  const innerChamber: Position[] = []
  for (let dy = 0; dy < chamberH; dy++) {
    for (let dx = 0; dx < chamberW; dx++) {
      const cx = chamberX + dx
      const cy = chamberY + dy
      if (map[cy]?.[cx]?.type === TileType.RuinFloor) {
        innerChamber.push({ x: cx, y: cy })
      }
    }
  }

  // Place artifact in the inner chamber center
  const artifactPosition: Position = {
    x: chamberX + Math.floor(chamberW / 2),
    y: chamberY + Math.floor(chamberH / 2),
  }

  return {
    rooms,
    ghostFormations,
    innerChamber,
    artifactPosition,
  }
}

// ---------------------------------------------------------------------------
// Generic ruin interior generation (dispatches to archetype-specific)
// ---------------------------------------------------------------------------

export const generateRuinInterior = (
  ruin: CivilizationRuin,
  ruinIndex: number,
  archetype: RuinArchetype,
  rng: () => number,
): Omit<RuinInterior, 'entranceOverworld'> => {
  const mapWidth = ruin.radius * 8 + 10
  const mapHeight = ruin.radius * 6 + 8
  const { map, entranceX, entranceY, entranceInterior } = createBaseMap(mapWidth, mapHeight)

  let subsidenceData: SubsidenceData | null = null
  let dormantGardenData: DormantGardenData | null = null
  let hauntedThresholdData: HauntedThresholdData | null = null

  if (archetype === RuinArchetype.Subsidence) {
    subsidenceData = generateSubsidence(map, mapWidth, mapHeight, entranceX, entranceY, ruin, rng)
  } else if (archetype === RuinArchetype.DormantGarden) {
    dormantGardenData = generateDormantGarden(map, mapWidth, mapHeight, entranceX, entranceY, ruin, rng)
  } else if (archetype === RuinArchetype.HauntedThreshold) {
    hauntedThresholdData = generateHauntedThreshold(map, mapWidth, mapHeight, entranceX, entranceY, ruin, ruinIndex, rng)
  } else {
    // Fallback: generic corridors for Resonance (placeholder)
    const waypointCount = 2 + Math.floor(rng() * 2)
    let prevPos: Position = { x: entranceX, y: entranceY - 2 }
    for (let i = 0; i < waypointCount; i++) {
      const wx = MARGIN + 2 + Math.floor(rng() * (mapWidth - MARGIN * 2 - 4))
      const wy = MARGIN + 2 + Math.floor(rng() * (mapHeight - MARGIN * 2 - 8))
      carveCorridor(map, prevPos, { x: wx, y: wy }, 2 + Math.floor(rng() * 2))
      prevPos = { x: wx, y: wy }
    }
  }

  return {
    ruinIndex,
    archetype,
    name: ruin.name,
    map,
    mapWidth,
    mapHeight,
    entranceInterior,
    explored: false,
    cleared: false,
    subsidence: subsidenceData,
    dormantGarden: dormantGardenData,
    hauntedThreshold: hauntedThresholdData,
  }
}

// ---------------------------------------------------------------------------
// Generate all ruin interiors from genesis data
// ---------------------------------------------------------------------------

export const generateAllRuinInteriors = (ruins: CivilizationRuin[]): RuinInterior[] => {
  const interiors: RuinInterior[] = []

  for (let i = 0; i < ruins.length; i++) {
    const ruin = ruins[i]
    const seed = tileHash(ruin.position.x, ruin.position.y)
    const rng = mulberry32(seed)
    const archetype = assignArchetype(ruin, i, rng)
    const interior = generateRuinInterior(ruin, i, archetype, rng)

    interiors.push({
      ...interior,
      entranceOverworld: { x: ruin.position.x, y: ruin.position.y },
    })
  }

  return interiors
}

// ---------------------------------------------------------------------------
// Zone transitions
// ---------------------------------------------------------------------------

const clearNavigationState = (state: GameState): void => {
  state.path = null
  state.pathWaypoints = []
  state.pendingAction = null
  state.pendingInteractionTarget = null
  state.heldDirection = null
  state.previewFn = null
  state.facingEntityPos = null
  state.activeDialog = null
  state.trail = []
  state.cloverGrowthPreviews = new Set<string>()
}

export const enterRuin = (state: GameState, ruinIndex: number): void => {
  const interior = state.ruinInteriors[ruinIndex]
  if (!interior) return

  // Swap to ruin map
  state.map = interior.map
  state.mapWidth = interior.mapWidth
  state.mapHeight = interior.mapHeight

  // Place player one tile above the ruin entrance
  state.player = {
    x: interior.entranceInterior.x,
    y: interior.entranceInterior.y,
  }
  state.currentZone = Zone.Ruin
  state.currentRuinIndex = ruinIndex

  // Subsidence: reset collapse timer and spawn seeds on first entry
  if (interior.subsidence && !interior.subsidence.collapsed) {
    interior.subsidence.collapseTimer = 0
    if (!interior.explored) {
      spawnSubsidenceSeeds(state, ruinIndex)
    }
  }

  // Dormant garden: spawn seeds on first entry
  if (interior.dormantGarden && !interior.explored) {
    spawnDormantGardenSeeds(state, ruinIndex)
  }

  // Haunted threshold: spawn ghosts and artifact on first entry
  if (interior.hauntedThreshold && !interior.explored) {
    spawnHauntedThresholdEntities(state, ruinIndex)
  }

  // Mark as explored (after first-entry logic)
  interior.explored = true

  clearNavigationState(state)

  // Teleport coyote to ruin
  transitionCoyoteToZone(state, Zone.Ruin)

  recordDiscovery(state, `zone:ruin-${String(ruinIndex)}`)
}

export const exitRuin = (state: GameState): void => {
  if (state.currentRuinIndex === null) return
  const interior = state.ruinInteriors[state.currentRuinIndex]
  if (!interior) return

  // Swap to overworld map
  state.map = state.overworldMap
  state.mapWidth = state.overworldMapWidth
  state.mapHeight = state.overworldMapHeight
  state.currentZone = Zone.Overworld

  // Place player one tile south of the overworld entrance to avoid re-entry loop
  state.player = {
    x: interior.entranceOverworld.x,
    y: interior.entranceOverworld.y + 1,
  }

  state.currentRuinIndex = null

  clearNavigationState(state)

  // Teleport coyote to overworld
  transitionCoyoteToZone(state, Zone.Overworld)

}

export const checkRuinTransition = (state: GameState): boolean => {
  const tile = state.map[state.player.y]?.[state.player.x]
  if (tile?.type !== TileType.RuinEntrance) return false

  if (state.currentZone === Zone.Overworld) {
    // Find which ruin this entrance belongs to
    const ruinIndex = state.ruinInteriors.findIndex(
      (r) => r.entranceOverworld.x === state.player.x && r.entranceOverworld.y === state.player.y,
    )
    if (ruinIndex === -1) return false
    enterRuin(state, ruinIndex)
    return true
  } else if (state.currentZone === Zone.Ruin) {
    exitRuin(state)
    return true
  }

  return false
}

// ---------------------------------------------------------------------------
// EntityZone helper
// ---------------------------------------------------------------------------

export const isInCurrentZone = (state: GameState, entityZone: { zone: Zone; ruinIndex?: number }): boolean => {
  if (entityZone.zone !== state.currentZone) return false
  if (state.currentZone === Zone.Ruin) {
    return entityZone.ruinIndex === state.currentRuinIndex
  }
  return true
}

// ---------------------------------------------------------------------------
// Place ruin entrances on overworld map
// ---------------------------------------------------------------------------

export const placeRuinEntrances = (
  map: Tile[][],
  ruinInteriors: RuinInterior[],
): void => {
  for (const interior of ruinInteriors) {
    const { x, y } = interior.entranceOverworld
    const row = map[y]
    if (!row) continue
    const tile = row[x]
    if (!tile) continue
    // Don't overwrite cave entrances
    if (tile.type === TileType.CaveEntrance) continue
    row[x] = { type: TileType.RuinEntrance }
  }
}

// ---------------------------------------------------------------------------
// Subsidence collapse tick
// ---------------------------------------------------------------------------

const CARDINAL_DELTAS: readonly [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]

const findNearestWalkable = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  x: number,
  y: number,
): Position | null => {
  // BFS for nearest walkable tile
  const visited = new Set<string>()
  const queue: Position[] = [{ x, y }]
  visited.add(posKey(x, y))

  while (queue.length > 0) {
    const pos = queue.shift()
    if (!pos) break
    const tile = map[pos.y]?.[pos.x]
    if (tile && tile.type !== TileType.RuinWall && tile.type !== TileType.RuinEntrance && pos !== queue[0]) {
      // Found a walkable non-entrance tile that isn't the starting point
      if (pos.x !== x || pos.y !== y) return pos
    }
    for (const [dx, dy] of CARDINAL_DELTAS) {
      const nx = pos.x + dx
      const ny = pos.y + dy
      const key = posKey(nx, ny)
      if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight && !visited.has(key)) {
        visited.add(key)
        queue.push({ x: nx, y: ny })
      }
    }
  }
  return null
}

export const tickSubsidenceCollapse = (state: GameState, dt: number): void => {
  if (state.currentRuinIndex === null) return
  const interior = state.ruinInteriors[state.currentRuinIndex]
  if (!interior?.subsidence) return
  if (interior.subsidence.collapsed) return

  const sub = interior.subsidence
  sub.collapseTimer += dt

  // Don't collapse for the first N ms to give the player time to orient
  if (sub.collapseTimer < SUBSIDENCE_MIN_FIRST_WAVE_MS) return

  // Calculate current threshold — rises from 20 to 80 over the collapse duration
  const elapsed = sub.collapseTimer - SUBSIDENCE_MIN_FIRST_WAVE_MS
  const progress = Math.min(1, elapsed / SUBSIDENCE_COLLAPSE_DURATION_MS)
  const threshold = 20 + progress * (SUBSIDENCE_MAX_COLLAPSE_THRESHOLD - 20)

  // Check if it's time for a collapse wave
  const waveIndex = Math.floor(elapsed / sub.collapseRate)
  const lastWaveIndex = Math.floor(Math.max(0, elapsed - dt) / sub.collapseRate)
  if (waveIndex <= lastWaveIndex) return // not time for a new wave

  // Collapse tiles below the current threshold
  let playerDisplaced = false
  const { map, mapWidth, mapHeight } = interior

  for (const [key, integrity] of sub.structuralIntegrity) {
    if (integrity >= threshold) continue

    const parts = key.split(',')
    const tx = Number(parts[0])
    const ty = Number(parts[1])
    const tile = map[ty]?.[tx]
    if (!tile) continue
    if (tile.type !== TileType.RuinFloor && tile.type !== TileType.RuinUnstable) continue

    // Collapse this tile to rubble
    map[ty][tx] = { type: TileType.RuinWall }
    sub.structuralIntegrity.delete(key)

    // Destroy any seed entities at this position
    // (seed spawning will be wired in when ECS ground items are placed)

    // Check if player is on this tile
    if (state.player.x === tx && state.player.y === ty) {
      playerDisplaced = true
    }
  }

  // Push displaced player to nearest walkable tile
  if (playerDisplaced) {
    const safe = findNearestWalkable(map, mapWidth, mapHeight, state.player.x, state.player.y)
    if (safe) {
      state.player.x = safe.x
      state.player.y = safe.y
    } else {
      // No walkable tile found — eject to overworld
      exitRuin(state)
      return
    }
  }

  // Check if entrance is threatened (adjacent tiles have collapsed)
  const entranceX = interior.entranceInterior.x
  const entranceY = interior.entranceInterior.y + 1 // the actual entrance tile
  let entranceThreatened = false
  for (const [dx, dy] of CARDINAL_DELTAS) {
    const nx = entranceX + dx
    const ny = entranceY + dy
    const tile = map[ny]?.[nx]
    if (tile?.type === TileType.RuinWall) {
      // Check if this was recently a floor tile (it's in our integrity map no more)
      // A wall tile adjacent to the entrance means collapse is closing in
      entranceThreatened = true
    }
  }

  // Once entrance is fully surrounded by walls (all 4 adjacent are walls), eject
  if (entranceThreatened) {
    let wallCount = 0
    for (const [dx, dy] of CARDINAL_DELTAS) {
      const nx = entranceX + dx
      const ny = entranceY + dy
      if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) {
        wallCount++
        continue
      }
      if (map[ny][nx].type === TileType.RuinWall) wallCount++
    }
    if (wallCount >= 3) {
      // Entrance is nearly closed — eject player
      sub.collapsed = true
      exitRuin(state)
    }
  }
}

// ---------------------------------------------------------------------------
// Spawn seed ground items for subsidence ruins
// ---------------------------------------------------------------------------

export const spawnSubsidenceSeeds = (state: GameState, ruinIndex: number): void => {
  const interior = state.ruinInteriors[ruinIndex]
  if (!interior?.subsidence) return

  const seedTypes = ['wildflowerSeeds', 'tallGrassSeeds', 'milkweedSeeds']
  for (const pos of interior.subsidence.seedPositions) {
    const seedType = seedTypes[Math.floor(Math.random() * seedTypes.length)]
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: pos.x, y: pos.y })
    state.world.addComponent(e, ComponentType.ItemDrop, { definitionId: seedType })
    state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
    state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Ruin, ruinIndex })
  }
}

// ---------------------------------------------------------------------------
// Dormant garden seed spawning
// ---------------------------------------------------------------------------

export const spawnDormantGardenSeeds = (state: GameState, ruinIndex: number): void => {
  const interior = state.ruinInteriors[ruinIndex]
  if (!interior?.dormantGarden) return

  const seedTypes = ['wildflowerSeeds', 'tallGrassSeeds', 'milkweedSeeds']
  for (const [key] of interior.dormantGarden.seedDecayTimers) {
    const parts = key.split(',')
    const x = Number(parts[0])
    const y = Number(parts[1])
    const seedType = seedTypes[Math.floor(Math.random() * seedTypes.length)]
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x, y })
    state.world.addComponent(e, ComponentType.ItemDrop, { definitionId: seedType })
    state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
    state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Ruin, ruinIndex })
  }
}

// ---------------------------------------------------------------------------
// Dormant garden seed decay tick
// ---------------------------------------------------------------------------

const SOIL_HEALTH_ENRICHMENT = 10

export const tickDormantGardenDecay = (state: GameState, dt: number): void => {
  if (state.currentRuinIndex === null) return
  const interior = state.ruinInteriors[state.currentRuinIndex]
  if (!interior?.dormantGarden) return

  const garden = interior.dormantGarden

  // If water is flowing, seeds are stabilized — reverse brown ones to healthy
  if (garden.waterFlowing) {
    for (const [key, timer] of garden.seedDecayTimers) {
      const maxTimer = SEED_DECAY_BASE_MS
      // Brown stage = below 66% — reverse to full
      if (timer > maxTimer * 0.33 && timer < maxTimer * 0.66) {
        garden.seedDecayTimers.set(key, maxTimer)
      }
    }
    return
  }

  // Tick each seed's decay timer
  const toRemove: string[] = []
  for (const [key, timer] of garden.seedDecayTimers) {
    const newTimer = timer - dt * garden.seedDecayAcceleration
    if (newTimer <= 0) {
      // Seed decomposed — remove entity, enrich soil
      toRemove.push(key)
      const parts = key.split(',')
      const sx = Number(parts[0])
      const sy = Number(parts[1])

      // Destroy the ground item entity at this position
      for (const eid of state.world.query(ComponentType.Position, ComponentType.EntityTag)) {
        const pos = state.world.getComponent(eid, ComponentType.Position)
        const tag = state.world.getComponent(eid, ComponentType.EntityTag)
        if (pos?.x === sx && pos?.y === sy && tag === 'groundItem') {
          state.world.destroyEntity(eid)
          break
        }
      }

      // Enrich soil at this position
      const soilKey = posKey(sx, sy)
      const current = state.soilHealth.get(soilKey) ?? 50
      state.soilHealth.set(soilKey, Math.min(100, current + SOIL_HEALTH_ENRICHMENT))
    } else {
      garden.seedDecayTimers.set(key, newTimer)
    }
  }

  for (const key of toRemove) {
    garden.seedDecayTimers.delete(key)
  }

  // If all seeds are gone, mark as cleared
  if (garden.seedDecayTimers.size === 0) {
    interior.cleared = true
  }
}

// ---------------------------------------------------------------------------
// Dormant garden aqueduct repair
// ---------------------------------------------------------------------------

export const repairAqueductBreak = (state: GameState, x: number, y: number): boolean => {
  if (state.currentRuinIndex === null) return false
  const interior = state.ruinInteriors[state.currentRuinIndex]
  if (!interior?.dormantGarden) return false

  const tile = interior.map[y]?.[x]
  if (tile?.type !== TileType.RuinAqueductBroken) return false

  const garden = interior.dormantGarden
  interior.map[y][x] = { type: TileType.RuinAqueduct }
  garden.repairedBreaks.add(posKey(x, y))
  garden.aqueductTiles.add(posKey(x, y))

  // Check if all breaks are now repaired
  const allRepaired = garden.breakPoints.every((bp) => garden.repairedBreaks.has(posKey(bp.x, bp.y)))
  if (allRepaired) {
    garden.waterFlowing = true
  }

  return true
}

// ---------------------------------------------------------------------------
// Dormant garden fire interaction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Haunted threshold ghost spawning
// ---------------------------------------------------------------------------

export const spawnHauntedThresholdEntities = (state: GameState, ruinIndex: number): void => {
  const interior = state.ruinInteriors[ruinIndex]
  if (!interior?.hauntedThreshold) return

  const ht = interior.hauntedThreshold

  // Spawn guardian ghosts at each formation position
  for (let fi = 0; fi < ht.ghostFormations.length; fi++) {
    const formation = ht.ghostFormations[fi]
    for (let gi = 0; gi < formation.positions.length; gi++) {
      if (formation.satisfied[gi]) continue // already satisfied from previous visit
      const pos = formation.positions[gi]
      const ghostId = `ruin-guardian-${String(ruinIndex)}-${String(fi + 1)}-${String(gi)}`

      // Skip if definition wasn't registered (edge case)
      if (!CHARACTER_DEFINITIONS[ghostId]) continue

      const e = state.world.createEntity()
      state.world.addComponent(e, ComponentType.Position, { x: pos.x, y: pos.y })
      state.world.addComponent(e, ComponentType.CharacterIdentity, { definitionId: ghostId })
      state.world.addComponent(e, ComponentType.Blocking, { blockMovement: true })
      state.world.addComponent(e, ComponentType.EntityTag, 'character')
      state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Ruin, ruinIndex })
      state.world.addComponent(e, ComponentType.Behavior, {
        type: 'drift' as const,
        moveChance: 0.03,
        freezeOnDialog: true,
      })
    }
  }

  // Spawn artifact in inner chamber
  const seedTypes = ['stoneTablet', 'aqueductKey']
  const artifactType = seedTypes[tileHash(ht.artifactPosition.x, ht.artifactPosition.y) % seedTypes.length]
  const ae = state.world.createEntity()
  state.world.addComponent(ae, ComponentType.Position, { x: ht.artifactPosition.x, y: ht.artifactPosition.y })
  state.world.addComponent(ae, ComponentType.ItemDrop, { definitionId: artifactType })
  state.world.addComponent(ae, ComponentType.EntityTag, 'groundItem')
  state.world.addComponent(ae, ComponentType.EntityZone, { zone: Zone.Ruin, ruinIndex })
}

// ---------------------------------------------------------------------------
// Haunted threshold offering mechanic
// ---------------------------------------------------------------------------

export const offerItemToGuardian = (
  state: GameState,
  ghostEntityId: number,
  itemDefinitionId: string,
): boolean => {
  if (state.currentRuinIndex === null) return false
  const interior = state.ruinInteriors[state.currentRuinIndex]
  if (!interior?.hauntedThreshold) return false

  const identity = state.world.getComponent(ghostEntityId, ComponentType.CharacterIdentity)
  if (!identity) return false

  // Find which formation this ghost belongs to
  const ghostPos = state.world.getComponent(ghostEntityId, ComponentType.Position)
  if (!ghostPos) return false

  for (const formation of interior.hauntedThreshold.ghostFormations) {
    for (let gi = 0; gi < formation.positions.length; gi++) {
      if (formation.satisfied[gi]) continue
      const fpos = formation.positions[gi]
      if (fpos.x !== ghostPos.x || fpos.y !== ghostPos.y) continue

      // Check if the offered item matches what this ghost wants
      if (formation.wantedItems[gi] !== itemDefinitionId) return false

      // Satisfy the ghost
      formation.satisfied[gi] = true

      // Remove blocking component so the ghost no longer obstructs
      state.world.removeComponent(ghostEntityId, ComponentType.Blocking)

      // Increase drift speed so ghost wanders away
      state.world.addComponent(ghostEntityId, ComponentType.Behavior, {
        type: 'drift' as const,
        moveChance: 0.15,
        freezeOnDialog: true,
      })

      // Mark gift as received for postGiftDialog
      state.giftsReceived.add(identity.definitionId)

      // Check if all ghosts in this formation are satisfied
      if (formation.satisfied.every(Boolean)) {
        recordDiscovery(state, `event:ruin-formation-${String(state.currentRuinIndex)}`)
      }

      return true
    }
  }

  return false
}

// ---------------------------------------------------------------------------
// Dormant garden fire interaction
// ---------------------------------------------------------------------------

export const fireOnRuinTile = (state: GameState, x: number, y: number): boolean => {
  if (state.currentRuinIndex === null) return false
  const interior = state.ruinInteriors[state.currentRuinIndex]
  if (!interior?.dormantGarden) return false

  const tile = interior.map[y]?.[x]
  if (!tile) return false

  // Fire on debris: clear it
  if (tile.type === TileType.RuinDebris) {
    interior.map[y][x] = { type: TileType.RuinFloor }
    return true
  }

  // Fire on aqueduct: accelerate seed decay (if water isn't already flowing)
  if (tile.type === TileType.RuinAqueduct && !interior.dormantGarden.waterFlowing) {
    interior.dormantGarden.seedDecayAcceleration = 1.5
    return true
  }

  return false
}
