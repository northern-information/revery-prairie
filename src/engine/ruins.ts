import { CHARACTER_DEFINITIONS } from './characters'
import {
  BUILDING_CHARS,
  CIV_COLORS,
  RUIN_EJECTION_FADE_MS,
  RUIN_EJECTION_HOLD_MS,
  RUIN_EJECTION_NOTIFICATION_MS,
  RUIN_EJECTION_SHAKE_MS,
  RUIN_ENTRY_TOASTS,
  TILE_CHARS,
  TILE_COLORS,
} from './constants'
import { findCoyoteEntity, transitionCoyoteToZone } from './coyote'
import { ComponentType } from './ecs/types'
import { getDefinition } from './items'
import { recordDiscovery } from './manual'
import { findSafeExitPosition, isWalkableTile, posKey, tileHash } from './position'
import { deselectAll } from './selection'
import { clearAllUnitCommands } from './unitCommands'
import { RuinArchetype, RuinEjectionPhase, TileType, Zone } from './types'

import type { CivilizationRuin } from './genesisTypes'
import type {
  DormantGardenData,
  GameState,
  GhostFormation,
  HauntedThresholdData,
  LostItemSummary,
  Position,
  ResonanceData,
  RuinEjectionReason,
  RuinInterior,
  SubsidenceData,
  Tile,
} from './types'

const queueToast = (
  state: GameState,
  text: string,
  icon: string,
  iconColor: string,
): void => {
  state.queuedToasts.push({
    text,
    icon,
    iconColor,
    worldX: state.player.x,
    worldY: state.player.y,
  })
}

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

  // Score each archetype based on ruin properties. Coefficients are tuned so
  // each archetype claims ~19-28% of assignments across the genesis parameter
  // ranges (radius 3-5, age 1000-5999, aqueductPaths 0-9, density ~1.0).
  const scores: Record<RuinArchetype, number> = {
    [RuinArchetype.Subsidence]: ruin.radius * 1.0 + ruin.age / 1300,
    [RuinArchetype.DormantGarden]: aqueductComplexity * 0.9 + ruin.radius * 0.7,
    [RuinArchetype.HauntedThreshold]: (8 - ruin.radius) * 1.3 + (ruin.age > 2500 ? 1.5 : 0),
    [RuinArchetype.Resonance]: ruin.radius * 1.2 + (footprintDensity < 0.8 ? 2.5 : 0) + (aqueductComplexity < 4 ? 2 : 0),
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
// Resonance generator
// ---------------------------------------------------------------------------

const RESONANCE_ACTIVATION_MS = 8000

const generateResonance = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  entranceX: number,
  entranceY: number,
  ruin: CivilizationRuin,
  rng: () => number,
): ResonanceData => {
  // Main chamber dimensions scale with radius (10x10 to 14x14)
  const chamberW = Math.min(14, 10 + ruin.radius - 3)
  const chamberH = Math.min(14, 10 + ruin.radius - 3)
  const chamberX = Math.floor((mapWidth - chamberW) / 2)
  const chamberY = Math.max(MARGIN + 1, Math.floor((mapHeight - chamberH) / 2) - 2)

  // Carve main chamber
  carveRect(map, chamberX, chamberY, chamberW, chamberH)

  // Carve corridor from entrance to chamber
  carveCorridor(map, { x: entranceX, y: entranceY - 2 }, { x: chamberX + Math.floor(chamberW / 2), y: chamberY + chamberH - 1 }, 2)

  // Place machines in chamber walls (adjacent to floor tiles)
  const machineCount = 3 + Math.floor(rng() * 3) // 3-5
  const machinePositions: Position[] = []
  let machineAttempts = 0

  while (machinePositions.length < machineCount && machineAttempts < 200) {
    machineAttempts++
    // Pick a wall tile adjacent to the chamber
    const side = Math.floor(rng() * 4) // 0=top, 1=bottom, 2=left, 3=right
    let mx: number
    let my: number
    if (side === 0) {
      mx = chamberX + 1 + Math.floor(rng() * (chamberW - 2))
      my = chamberY - 1
    } else if (side === 1) {
      mx = chamberX + 1 + Math.floor(rng() * (chamberW - 2))
      my = chamberY + chamberH
    } else if (side === 2) {
      mx = chamberX - 1
      my = chamberY + 1 + Math.floor(rng() * (chamberH - 2))
    } else {
      mx = chamberX + chamberW
      my = chamberY + 1 + Math.floor(rng() * (chamberH - 2))
    }

    if (mx < 0 || mx >= mapWidth || my < 0 || my >= mapHeight) continue
    if (map[my][mx].type !== TileType.RuinWall) continue

    // Check Manhattan distance from other machines (4-8 tiles apart)
    const tooClose = machinePositions.some((mp) => Math.abs(mp.x - mx) + Math.abs(mp.y - my) < 4)
    if (tooClose) continue

    map[my][mx] = { type: TileType.RuinMachine }
    machinePositions.push({ x: mx, y: my })
  }

  // Carve 2-3 hidden passages branching from the chamber
  const passageCount = 2 + Math.floor(rng() * 2)
  const hiddenTiles = new Set<string>()
  let vaultPosition: Position = { x: chamberX + Math.floor(chamberW / 2), y: chamberY }

  for (let p = 0; p < passageCount; p++) {
    // Pick a direction from the chamber
    const side = Math.floor(rng() * 4)
    let startX: number
    let startY: number
    let dx: number
    let dy: number

    if (side === 0) { // north
      startX = chamberX + 2 + Math.floor(rng() * (chamberW - 4))
      startY = chamberY - 1
      dx = 0
      dy = -1
    } else if (side === 1) { // south — skip if it conflicts with entrance
      startX = chamberX + 2 + Math.floor(rng() * (chamberW - 4))
      startY = chamberY + chamberH
      dx = 0
      dy = 1
    } else if (side === 2) { // west
      startX = chamberX - 1
      startY = chamberY + 2 + Math.floor(rng() * (chamberH - 4))
      dx = -1
      dy = 0
    } else { // east
      startX = chamberX + chamberW
      startY = chamberY + 2 + Math.floor(rng() * (chamberH - 4))
      dx = 1
      dy = 0
    }

    // Carve a short passage (3-5 tiles) using RuinHiddenFloor
    const passageLen = 3 + Math.floor(rng() * 3)
    for (let i = 1; i <= passageLen; i++) {
      const px = startX + dx * i
      const py = startY + dy * i
      if (px < MARGIN || px >= mapWidth - MARGIN || py < MARGIN || py >= mapHeight - MARGIN) break
      if (map[py][px].type === TileType.RuinFloor || map[py][px].type === TileType.RuinEntrance) break
      map[py][px] = { type: TileType.RuinHiddenFloor }
      hiddenTiles.add(posKey(px, py))
    }

    // First passage gets a vault room at the end
    if (p === 0) {
      const vaultEndX = startX + dx * (passageLen + 1)
      const vaultEndY = startY + dy * (passageLen + 1)
      const vaultW = 4
      const vaultH = 4
      const vx = Math.max(MARGIN, Math.min(mapWidth - MARGIN - vaultW, vaultEndX - Math.floor(vaultW / 2)))
      const vy = Math.max(MARGIN, Math.min(mapHeight - MARGIN - vaultH, vaultEndY - Math.floor(vaultH / 2)))
      for (let vdy = 0; vdy < vaultH; vdy++) {
        for (let vdx = 0; vdx < vaultW; vdx++) {
          const tx = vx + vdx
          const ty = vy + vdy
          if (tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight) {
            map[ty][tx] = { type: TileType.RuinHiddenFloor }
            hiddenTiles.add(posKey(tx, ty))
          }
        }
      }
      vaultPosition = { x: vx + Math.floor(vaultW / 2), y: vy + Math.floor(vaultH / 2) }
    }
  }

  return {
    machinePositions,
    machineActiveUntil: new Map<string, number>(),
    activationDurationMs: RESONANCE_ACTIVATION_MS,
    hiddenTiles,
    vaultPosition,
    vaultRevealed: false,
    revealedTiles: new Set<string>(),
  }
}

// ---------------------------------------------------------------------------
// Astral void pond generation
// ---------------------------------------------------------------------------

/** Flood-fill from a start position, returning all reachable walkable posKeys. */
const floodFillReachable = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  start: Position,
): Set<string> => {
  const reachable = new Set<string>()
  const queue: Position[] = [start]
  const startKey = posKey(start.x, start.y)
  reachable.add(startKey)

  while (queue.length > 0) {
    const pos = queue.shift()
    if (!pos) break
    for (const [dx, dy] of CARDINAL_DELTAS) {
      const nx = pos.x + dx
      const ny = pos.y + dy
      if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
      const key = posKey(nx, ny)
      if (reachable.has(key)) continue
      if (!isWalkableTile(map[ny][nx].type)) continue
      reachable.add(key)
      queue.push({ x: nx, y: ny })
    }
  }
  return reachable
}

/** Collect critical positions that must remain reachable from the entrance. */
const getCriticalPositions = (
  entranceInterior: Position,
  subsidence: SubsidenceData | null,
  dormantGarden: DormantGardenData | null,
  hauntedThreshold: HauntedThresholdData | null,
  resonance: ResonanceData | null,
): Set<string> => {
  const critical = new Set<string>()
  // Entrance + corridor
  critical.add(posKey(entranceInterior.x, entranceInterior.y))
  for (const [dx, dy] of CARDINAL_DELTAS) {
    critical.add(posKey(entranceInterior.x + dx, entranceInterior.y + dy))
  }
  // 3 tiles below entrance (corridor)
  for (let dy = 1; dy <= 3; dy++) {
    critical.add(posKey(entranceInterior.x, entranceInterior.y + dy))
  }
  if (subsidence) {
    for (const p of subsidence.seedPositions) critical.add(posKey(p.x, p.y))
  }
  if (dormantGarden) {
    critical.add(posKey(dormantGarden.seedVault.x, dormantGarden.seedVault.y))
    for (const p of dormantGarden.breakPoints) critical.add(posKey(p.x, p.y))
    for (const key of dormantGarden.aqueductTiles) critical.add(key)
    for (const p of dormantGarden.debrisPositions) critical.add(posKey(p.x, p.y))
  }
  if (hauntedThreshold) {
    critical.add(posKey(hauntedThreshold.artifactPosition.x, hauntedThreshold.artifactPosition.y))
    for (const f of hauntedThreshold.ghostFormations) {
      for (const p of f.positions) critical.add(posKey(p.x, p.y))
    }
  }
  if (resonance) {
    for (const p of resonance.machinePositions) critical.add(posKey(p.x, p.y))
    critical.add(posKey(resonance.vaultPosition.x, resonance.vaultPosition.y))
  }
  return critical
}

/**
 * Place contiguous void ponds (Space tiles) on a ruin interior map.
 * 0-10% of walkable floor is converted. Ponds that break reachability
 * to critical positions are rejected.
 */
export const placeVoidPonds = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  entranceInterior: Position,
  subsidence: SubsidenceData | null,
  dormantGarden: DormantGardenData | null,
  hauntedThreshold: HauntedThresholdData | null,
  resonance: ResonanceData | null,
  rng: () => number,
): void => {
  // Count plain floor tiles eligible for void conversion
  let walkableCount = 0
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const t = map[y][x].type
      if (t === TileType.RuinFloor || t === TileType.RuinUnstable) walkableCount++
    }
  }
  if (walkableCount === 0) return

  // Target 0-10% coverage
  const coveragePct = rng() * 0.1
  const targetTiles = Math.floor(walkableCount * coveragePct)
  if (targetTiles < 3) return // not enough for a meaningful pond

  const critical = getCriticalPositions(entranceInterior, subsidence, dormantGarden, hauntedThreshold, resonance)

  // Generate 1-4 ponds
  const pondCount = 1 + Math.floor(rng() * 4)
  const tilesPerPond = Math.max(3, Math.floor(targetTiles / pondCount))
  let totalPlaced = 0

  for (let p = 0; p < pondCount && totalPlaced < targetTiles; p++) {
    // Pick a random walkable non-critical seed tile
    let seedX = -1
    let seedY = -1
    let attempts = 0
    while (attempts < 100) {
      attempts++
      const x = Math.floor(rng() * mapWidth)
      const y = Math.floor(rng() * mapHeight)
      const seedType = map[y][x].type
      if (seedType !== TileType.RuinFloor && seedType !== TileType.RuinUnstable) continue
      if (critical.has(posKey(x, y))) continue
      seedX = x
      seedY = y
      break
    }
    if (seedX < 0) continue // couldn't find a seed

    // Grow blob from seed using random walk
    const pondTiles: Position[] = [{ x: seedX, y: seedY }]
    const pondSet = new Set<string>([posKey(seedX, seedY)])
    const maxSize = Math.min(tilesPerPond, targetTiles - totalPlaced)
    let growAttempts = 0
    const maxGrowAttempts = maxSize * 10

    while (pondTiles.length < maxSize && growAttempts < maxGrowAttempts) {
      growAttempts++
      // Pick a random tile from the pond and try to expand in a random direction
      const base = pondTiles[Math.floor(rng() * pondTiles.length)]
      const dirIdx = Math.floor(rng() * 4)
      const [dx, dy] = CARDINAL_DELTAS[dirIdx]
      const nx = base.x + dx
      const ny = base.y + dy
      if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
      const key = posKey(nx, ny)
      if (pondSet.has(key)) continue
      const nType = map[ny][nx].type
      if (nType !== TileType.RuinFloor && nType !== TileType.RuinUnstable) continue
      if (critical.has(key)) continue
      pondTiles.push({ x: nx, y: ny })
      pondSet.add(key)
    }

    // Skip tiny ponds that would appear as isolated specks
    if (pondTiles.length < 3) continue

    // Tentatively place the pond
    for (const t of pondTiles) {
      map[t.y][t.x] = { type: TileType.Space }
    }

    // Reachability check — all critical tiles must still be reachable from entrance
    const reachable = floodFillReachable(map, mapWidth, mapHeight, entranceInterior)
    let valid = true
    for (const key of critical) {
      // Only check critical tiles that are actually walkable (some may be on walls/special tiles)
      const parts = key.split(',')
      const cx = Number(parts[0])
      const cy = Number(parts[1])
      if (cx < 0 || cx >= mapWidth || cy < 0 || cy >= mapHeight) continue
      if (!isWalkableTile(map[cy][cx].type)) continue
      if (!reachable.has(key)) {
        valid = false
        break
      }
    }

    if (valid) {
      totalPlaced += pondTiles.length
    } else {
      // Revert — restore floor tiles
      for (const t of pondTiles) {
        map[t.y][t.x] = { type: TileType.RuinFloor }
      }
    }
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
  let resonanceData: ResonanceData | null = null

  if (archetype === RuinArchetype.Subsidence) {
    subsidenceData = generateSubsidence(map, mapWidth, mapHeight, entranceX, entranceY, ruin, rng)
  } else if (archetype === RuinArchetype.DormantGarden) {
    dormantGardenData = generateDormantGarden(map, mapWidth, mapHeight, entranceX, entranceY, ruin, rng)
  } else if (archetype === RuinArchetype.HauntedThreshold) {
    hauntedThresholdData = generateHauntedThreshold(map, mapWidth, mapHeight, entranceX, entranceY, ruin, ruinIndex, rng)
  } else if (archetype === RuinArchetype.Resonance) {
    resonanceData = generateResonance(map, mapWidth, mapHeight, entranceX, entranceY, ruin, rng)
  }

  // Place astral void ponds after archetype generation
  placeVoidPonds(map, mapWidth, mapHeight, entranceInterior, subsidenceData, dormantGardenData, hauntedThresholdData, resonanceData, rng)

  // Revalidate seed positions — void ponds and debris may have overwritten floor tiles
  if (subsidenceData) {
    subsidenceData.seedPositions = subsidenceData.seedPositions.filter((pos) => {
      const tile = map[pos.y]?.[pos.x]
      return tile != null && isWalkableTile(tile.type)
    })
  }
  if (dormantGardenData) {
    for (const key of [...dormantGardenData.seedDecayTimers.keys()]) {
      const [sx, sy] = key.split(',').map(Number) as [number, number]
      const tile = map[sy]?.[sx]
      if (!tile || !isWalkableTile(tile.type)) {
        dormantGardenData.seedDecayTimers.delete(key)
      }
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
    resonance: resonanceData,
    fogExplored: new Set<string>(),
    fogDiscovered: new Set<string>(),
    fogIllumination: new Map<string, number>(),
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
  deselectAll(state)
  clearAllUnitCommands(state)
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

  // Record archetype-specific discovery for manual entries
  const archetypeDiscoveryKey: Record<string, string> = {
    [RuinArchetype.Subsidence]: 'zone:ruin-subsidence',
    [RuinArchetype.DormantGarden]: 'zone:ruin-dormant-garden',
    [RuinArchetype.HauntedThreshold]: 'zone:ruin-haunted-threshold',
    [RuinArchetype.Resonance]: 'zone:ruin-resonance',
  }
  const discoveryKey = archetypeDiscoveryKey[interior.archetype]
  if (discoveryKey) {
    recordDiscovery(state, discoveryKey)
  }

  const entryToast = RUIN_ENTRY_TOASTS[interior.archetype]
  if (entryToast) {
    const glyph = interior.archetype === RuinArchetype.Subsidence ? '!' : '☒'
    const color = interior.archetype === RuinArchetype.Subsidence ? '#ff4422' : '#d8a860'
    queueToast(state, entryToast, glyph, color)
  }
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

  // Place player on nearest walkable tile adjacent to entrance
  state.player = findSafeExitPosition(
    interior.entranceOverworld,
    state.map,
    state.mapWidth,
    state.mapHeight,
  )

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
  const mapHeight = map.length
  const mapWidth = map[0]?.length ?? 0
  for (const interior of ruinInteriors) {
    const { x, y } = interior.entranceOverworld
    const row = map[y]
    if (!row) continue
    const tile = row[x]
    if (!tile) continue
    // Don't overwrite cave entrances
    if (tile.type === TileType.CaveEntrance) continue
    row[x] = { type: TileType.RuinEntrance }

    // Ensure all adjacent tiles are walkable so the entrance is reachable
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
        const neighbor = map[ny][nx]
        if (!neighbor) continue
        if (!isWalkableTile(neighbor.type)) {
          map[ny][nx] = { type: TileType.Dirt }
        }
      }
    }
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

const isRuinWalkable = (tileType: TileType): boolean =>
  tileType === TileType.RuinFloor ||
  tileType === TileType.RuinUnstable ||
  tileType === TileType.RuinEntrance

const canReachEntrance = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  from: Position,
  target: Position,
): boolean => {
  if (from.x === target.x && from.y === target.y) return true
  const startTile = map[from.y]?.[from.x]
  if (!startTile || !isRuinWalkable(startTile.type)) return false
  const visited = new Set<string>()
  const queue: Position[] = [from]
  visited.add(posKey(from.x, from.y))
  while (queue.length > 0) {
    const pos = queue.shift()
    if (!pos) break
    if (pos.x === target.x && pos.y === target.y) return true
    for (const [dx, dy] of CARDINAL_DELTAS) {
      const nx = pos.x + dx
      const ny = pos.y + dy
      if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
      const key = posKey(nx, ny)
      if (visited.has(key)) continue
      const tile = map[ny]?.[nx]
      if (!tile || !isRuinWalkable(tile.type)) continue
      visited.add(key)
      queue.push({ x: nx, y: ny })
    }
  }
  return false
}

export const tickSubsidenceCollapse = (state: GameState, dt: number, time: number): 'ejected' | null => {
  if (state.ruinEjection) return null
  if (state.currentRuinIndex === null) return null
  const interior = state.ruinInteriors[state.currentRuinIndex]
  if (!interior?.subsidence) return null
  if (interior.subsidence.collapsed) return null

  const sub = interior.subsidence
  sub.collapseTimer += dt

  // Don't collapse for the first N ms to give the player time to orient
  if (sub.collapseTimer < SUBSIDENCE_MIN_FIRST_WAVE_MS) return null

  // Calculate current threshold — rises from 20 to 80 over the collapse duration
  const elapsed = sub.collapseTimer - SUBSIDENCE_MIN_FIRST_WAVE_MS
  const progress = Math.min(1, elapsed / SUBSIDENCE_COLLAPSE_DURATION_MS)
  const threshold = 20 + progress * (SUBSIDENCE_MAX_COLLAPSE_THRESHOLD - 20)

  // Check if it's time for a collapse wave
  const waveIndex = Math.floor(elapsed / sub.collapseRate)
  const lastWaveIndex = Math.floor(Math.max(0, elapsed - dt) / sub.collapseRate)
  if (waveIndex <= lastWaveIndex) return null // not time for a new wave

  // Collapse tiles below the current threshold
  const collapsedPositions = new Set<string>()
  const { map, mapWidth, mapHeight } = interior

  for (const [key, integrity] of sub.structuralIntegrity) {
    if (integrity >= threshold) continue

    const parts = key.split(',')
    const tx = Number(parts[0])
    const ty = Number(parts[1])
    const tile = map[ty]?.[tx]
    if (!tile) continue
    if (tile.type !== TileType.RuinFloor && tile.type !== TileType.RuinUnstable) continue

    // Collapse this tile to astral void
    map[ty][tx] = { type: TileType.Space }
    sub.structuralIntegrity.delete(key)
    collapsedPositions.add(key)

    // Player standing on a collapsing tile — begin ejection sequence
    if (state.player.x === tx && state.player.y === ty) {
      sub.collapsed = true
      beginRuinEjection(state, 'floor-collapse', time)
      return 'ejected' as const
    }
  }

  // Displace coyote if standing on a collapsed tile
  const coyoteEid = findCoyoteEntity(state)
  if (coyoteEid !== null) {
    const coyotePos = state.world.getComponent(coyoteEid, ComponentType.Position)
    if (coyotePos && collapsedPositions.has(posKey(coyotePos.x, coyotePos.y))) {
      const safe = findNearestWalkable(map, mapWidth, mapHeight, coyotePos.x, coyotePos.y)
      if (safe) {
        state.world.moveEntity(coyoteEid, safe.x, safe.y)
      }
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
    if (tile?.type === TileType.RuinWall || tile?.type === TileType.Space) {
      // A wall or void tile adjacent to the entrance means collapse is closing in
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
      const t = map[ny][nx].type
      if (t === TileType.RuinWall || t === TileType.Space) wallCount++
    }
    if (wallCount >= 3) {
      // Entrance is nearly closed — eject player
      sub.collapsed = true
      beginRuinEjection(state, 'entrance-collapse', time)
      return 'ejected' as const
    }
  }

  // Reachability trap: player cannot reach entrance from current position
  const entrancePos: Position = { x: entranceX, y: entranceY }
  if (!canReachEntrance(map, mapWidth, mapHeight, state.player, entrancePos)) {
    beginRuinEjection(state, 'sealed-in', time)
    queueToast(state, 'sealed in by rubble!', '!', '#ff4422')
    return 'ejected' as const
  }

  return null
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

// ---------------------------------------------------------------------------
// Resonance machine activation
// ---------------------------------------------------------------------------

export const activateMachine = (state: GameState, x: number, y: number, time: number): boolean => {
  if (state.currentRuinIndex === null) return false
  const interior = state.ruinInteriors[state.currentRuinIndex]
  if (!interior?.resonance) return false
  if (interior.resonance.vaultRevealed) return false

  const tile = interior.map[y]?.[x]
  if (tile?.type !== TileType.RuinMachine) return false

  const res = interior.resonance

  // Activate the machine
  interior.map[y][x] = { type: TileType.RuinMachineActive }
  res.machineActiveUntil.set(posKey(x, y), time + res.activationDurationMs)

  // Check if all machines are now simultaneously active
  const allActive = res.machinePositions.every((mp) => {
    const key = posKey(mp.x, mp.y)
    const until = res.machineActiveUntil.get(key)
    return until !== undefined && until > time
  })

  if (allActive) {
    // Vault revealed — permanently reveal all hidden tiles
    res.vaultRevealed = true
    for (const key of res.hiddenTiles) {
      res.revealedTiles.add(key)
    }
    recordDiscovery(state, `event:ruin-resonance-vault`)
  }

  return true
}

// ---------------------------------------------------------------------------
// Resonance deactivation tick
// ---------------------------------------------------------------------------

export const tickResonanceDeactivation = (state: GameState, time: number): void => {
  if (state.currentRuinIndex === null) return
  const interior = state.ruinInteriors[state.currentRuinIndex]
  if (!interior?.resonance) return
  if (interior.resonance.vaultRevealed) return

  const res = interior.resonance

  for (const [key, until] of res.machineActiveUntil) {
    if (time <= until) continue

    // Deactivate this machine
    const parts = key.split(',')
    const mx = Number(parts[0])
    const my = Number(parts[1])
    if (interior.map[my]?.[mx]?.type === TileType.RuinMachineActive) {
      interior.map[my][mx] = { type: TileType.RuinMachine }
    }
    res.machineActiveUntil.delete(key)
  }
}

// ---------------------------------------------------------------------------
// Resonance: get temporarily visible tiles (near active machines)
// ---------------------------------------------------------------------------

const MACHINE_REVEAL_RADIUS = 4

export const getTemporarilyVisibleTiles = (interior: RuinInterior): Set<string> => {
  if (!interior.resonance) return new Set()
  const res = interior.resonance
  const visible = new Set<string>()

  for (const [machineKey] of res.machineActiveUntil) {
    const parts = machineKey.split(',')
    const mx = Number(parts[0])
    const my = Number(parts[1])
    for (const hiddenKey of res.hiddenTiles) {
      if (res.revealedTiles.has(hiddenKey)) continue
      const hParts = hiddenKey.split(',')
      const hx = Number(hParts[0])
      const hy = Number(hParts[1])
      if (Math.abs(hx - mx) + Math.abs(hy - my) <= MACHINE_REVEAL_RADIUS) {
        visible.add(hiddenKey)
      }
    }
  }

  return visible
}

// ---------------------------------------------------------------------------
// Resonance: check if a tile is currently hidden
// ---------------------------------------------------------------------------

export const isHiddenTile = (interior: RuinInterior, x: number, y: number, time: number): boolean => {
  if (!interior.resonance) return false
  const res = interior.resonance
  const key = posKey(x, y)
  if (!res.hiddenTiles.has(key)) return false
  if (res.revealedTiles.has(key)) return false
  if (res.vaultRevealed) return false

  // Check if temporarily visible (near an active machine)
  for (const [machineKey, until] of res.machineActiveUntil) {
    if (time <= until) {
      const parts = machineKey.split(',')
      const mx = Number(parts[0])
      const my = Number(parts[1])
      if (Math.abs(x - mx) + Math.abs(y - my) <= MACHINE_REVEAL_RADIUS) {
        return false
      }
    }
  }

  return true
}

// ---------------------------------------------------------------------------
// Multilayer ruin tile rendering
// ---------------------------------------------------------------------------

export interface RuinTileLayer {
  char: string
  color: string
  dx: number
  dy: number
}

const BOX_HORIZONTAL = '─'
const BOX_VERTICAL = '│'

export interface RuinMultilayerArgs {
  zone: Zone
  tileType: TileType | undefined
  isPlayer: boolean
  isEntity: boolean
  hasPreview: boolean
  isHighlighted: boolean
  hasOverlay: boolean
}

export const shouldRenderRuinMultilayer = (args: RuinMultilayerArgs): boolean => {
  return (
    args.zone === Zone.Ruin &&
    !args.isPlayer &&
    !args.isEntity &&
    !args.hasPreview &&
    !args.isHighlighted &&
    !args.hasOverlay &&
    (args.tileType?.startsWith('ruin') ?? false)
  )
}

export const getRuinTileLayers = (tileType: TileType, x: number, y: number, time: number): RuinTileLayer[] => {
  const h = tileHash(x, y)

  switch (tileType) {
    case TileType.RuinWall: {
      // 2-3 dense building char layers in grays — thick, cluttered, ancient
      const layers: RuinTileLayer[] = [
        { char: BUILDING_CHARS[h % BUILDING_CHARS.length], color: CIV_COLORS[h % CIV_COLORS.length], dx: 0, dy: 0 },
        {
          char: BUILDING_CHARS[(h + 3) % BUILDING_CHARS.length],
          color: CIV_COLORS[(h + 2) % CIV_COLORS.length],
          dx: 1,
          dy: 1,
        },
      ]
      // ~60% of wall tiles get a third layer
      if (h % 5 < 3) {
        layers.push({ char: '·', color: CIV_COLORS[(h + 4) % CIV_COLORS.length], dx: -1, dy: 0 })
      }
      return layers
    }

    case TileType.RuinFloor:
    case TileType.RuinHiddenFloor: {
      // 1-2 sparse layers — floor char + optional debris dot
      const layers: RuinTileLayer[] = [
        { char: h % 3 === 0 ? '·' : '.', color: TILE_COLORS[TileType.RuinFloor], dx: 0, dy: 0 },
      ]
      // ~40% of floor tiles get a debris dot
      if (h % 5 < 2) {
        layers.push({
          char: '·',
          color: CIV_COLORS[(h + 1) % CIV_COLORS.length],
          dx: h % 2 === 0 ? 1 : -1,
          dy: 0,
        })
      }
      return layers
    }

    case TileType.RuinEntrance:
      return [
        { char: 'O', color: TILE_COLORS[TileType.RuinEntrance], dx: 0, dy: 0 },
        { char: '·', color: CIV_COLORS[h % CIV_COLORS.length], dx: 1, dy: 0 },
      ]

    case TileType.RuinUnstable: {
      // Floor with reddish tint that blinks to signal danger
      const red = Math.floor(0x8b + (h % 30))
      const green = Math.floor(0x5e - (h % 20))
      const blue = Math.floor(0x4e - (h % 15))
      // Each tile blinks at its own phase offset based on hash
      const blinkPhase = (time * 0.002 + h * 0.7) % 1
      const blinking = blinkPhase > 0.7 // blink on ~30% of the cycle
      const blinkChar = blinking ? '!' : '.'
      const blinkRed = blinking ? Math.min(255, red + 80) : red
      const blinkGreen = blinking ? Math.max(0, green - 30) : green
      const blinkBlue = blinking ? Math.max(0, blue - 20) : blue
      return [
        { char: blinkChar, color: `rgb(${String(blinkRed)},${String(blinkGreen)},${String(blinkBlue)})`, dx: 0, dy: 0 },
      ]
    }

    case TileType.RuinAqueduct: {
      // Box-drawing chars with overlay dots — matching genesis aqueduct style
      const aqChars = [BOX_HORIZONTAL, BOX_VERTICAL, '~']
      const layers: RuinTileLayer[] = [
        { char: aqChars[h % aqChars.length], color: TILE_COLORS[TileType.RuinAqueduct], dx: 0, dy: 0 },
      ]
      if (h % 3 < 2) {
        const overlayChars = [BOX_HORIZONTAL, BOX_VERTICAL, '·', '.']
        layers.push({
          char: overlayChars[h % overlayChars.length],
          color: CIV_COLORS[(h + 1) % CIV_COLORS.length],
          dx: h % 2 === 0 ? 1 : -1,
          dy: h % 3 === 0 ? 1 : 0,
        })
      }
      return layers
    }

    case TileType.RuinAqueductBroken: {
      // Fragmenting chars in fading brown
      const breakChars = ['+', '.', '·']
      return [
        { char: breakChars[h % breakChars.length], color: TILE_COLORS[TileType.RuinAqueductBroken], dx: 0, dy: 0 },
      ]
    }

    case TileType.RuinDebris: {
      // Crumble chars in browns — 2 layers
      const crumbleChars = ['▒', '░', '▓']
      return [
        { char: crumbleChars[h % crumbleChars.length], color: TILE_COLORS[TileType.RuinDebris], dx: 0, dy: 0 },
        { char: '·', color: CIV_COLORS[(h + 2) % CIV_COLORS.length], dx: 1, dy: 1 },
      ]
    }

    case TileType.RuinMachine: {
      // Copper glyph with faint secondary layer
      return [
        { char: TILE_CHARS[TileType.RuinMachine], color: TILE_COLORS[TileType.RuinMachine], dx: 0, dy: 0 },
        { char: '·', color: '#996644', dx: -1, dy: 0 },
      ]
    }

    case TileType.RuinMachineActive: {
      // Pulsing gold glyph — secondary layer alternates based on time
      const pulseChars = ['*', '·', '+', '·']
      const pulseIdx = Math.floor(time * 0.004 + h) % pulseChars.length
      return [
        { char: TILE_CHARS[TileType.RuinMachineActive], color: TILE_COLORS[TileType.RuinMachineActive], dx: 0, dy: 0 },
        { char: pulseChars[pulseIdx], color: '#FFAA00', dx: 1, dy: 0 },
      ]
    }

    default:
      // Non-ruin tiles: single layer using standard chars/colors
      return [{ char: TILE_CHARS[tileType] ?? '.', color: TILE_COLORS[tileType] ?? '#666', dx: 0, dy: 0 }]
  }
}

// ---------------------------------------------------------------------------
// Ruin ejection sequence
// ---------------------------------------------------------------------------

const buildLostItemSummary = (state: GameState, ruinIndex: number): LostItemSummary => {
  const interior = state.ruinInteriors[ruinIndex]
  const ruinName = interior ? interior.name : ''
  const archetype = interior ? interior.archetype : RuinArchetype.Subsidence
  const counts = new Map<string, number>()
  for (const eid of state.world.query(ComponentType.ItemDrop, ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'groundItem') continue
    const zone = state.world.getComponent(eid, ComponentType.EntityZone)
    if (!zone) continue
    if (zone.zone !== Zone.Ruin) continue
    if (zone.ruinIndex !== ruinIndex) continue
    const drop = state.world.getComponent(eid, ComponentType.ItemDrop)
    if (!drop) continue
    counts.set(drop.definitionId, (counts.get(drop.definitionId) ?? 0) + 1)
  }
  const items = [...counts.entries()].map(([definitionId, count]) => ({ definitionId, count }))
  return { ruinName, archetype, items }
}

export const beginRuinEjection = (
  state: GameState,
  reason: RuinEjectionReason,
  time: number,
): void => {
  if (state.ruinEjection) return
  if (state.currentRuinIndex === null) return
  const ruinIndex = state.currentRuinIndex
  const lostItems = buildLostItemSummary(state, ruinIndex)
  state.ruinEjection = {
    startTime: time,
    phase: RuinEjectionPhase.Shake,
    reason,
    ruinIndex,
    lostItems,
    exited: false,
  }
}

const formatLostItemsText = (summary: LostItemSummary): string => {
  if (summary.items.length === 0) {
    return `${summary.ruinName} ruins collapsed behind you.`
  }
  const parts = summary.items.map(({ definitionId, count }) => {
    const def = getDefinition(definitionId)
    const name = def ? def.name.toLowerCase() : definitionId
    return count > 1 ? `${name} x${String(count)}` : name
  })
  return `lost items in ${summary.ruinName} ruins: ${parts.join(', ')}`
}

export const tickRuinEjection = (state: GameState, time: number): void => {
  const ej = state.ruinEjection
  if (!ej) return

  const elapsed = time - ej.startTime
  const shakeEnd = RUIN_EJECTION_SHAKE_MS
  const fadeEnd = shakeEnd + RUIN_EJECTION_FADE_MS
  const holdEnd = fadeEnd + RUIN_EJECTION_HOLD_MS

  if (!ej.exited) {
    if (elapsed < shakeEnd) {
      ej.phase = RuinEjectionPhase.Shake
    } else if (elapsed < fadeEnd) {
      ej.phase = RuinEjectionPhase.Fade
    } else if (elapsed < holdEnd) {
      ej.phase = RuinEjectionPhase.Hold
    } else {
      exitRuin(state)
      ej.exited = true
      ej.phase = RuinEjectionPhase.Notification
      ej.startTime = time
      const toast = formatLostItemsText(ej.lostItems)
      queueToast(state, toast, '!', '#d8a860')
    }
  } else if (time - ej.startTime >= RUIN_EJECTION_NOTIFICATION_MS) {
    state.ruinEjection = null
  }

  state.heldDirection = null
  state.path = null
  state.pathWaypoints = []
}
