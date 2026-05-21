import { BUILDING_CHARS, CIV_COLORS, PATINA_CHARS, TILE_CHARS, TILE_COLORS, VERDIGRIS_COLORS } from './constants'
import { transitionCoyoteToZone } from './coyote'
import { ComponentType } from './ecs/types'
import { createCharacterEntity } from './entities'
import { FLORA_SPECIES } from './flora/species'
import { clearAllGrowthPreviews } from './floraGrowthPreviews'
import { generateGenesisIdentity, generateTraitBag } from './genetics'
import { nameToSeed } from './genesis'
import { RuinRole } from './genesisTypes'
import { recordDiscovery } from './manual'
import { setMapTile } from './map'
import { clearMovementTweens } from './movementTween'
import { findSafeExitPosition, isWalkableTile, posKey, tileHash } from './position'
import { deselectAll } from './selection'
import { STRUCTURE_REGISTRY } from './structures'
import { FloraSpecies, RuinArchetype, TileType, Zone } from './types'
import { clearAllUnitCommands } from './unitCommands'
import { registerZoneSwapHandler, scheduleZoneTransition } from './zoneTransition'

import type { FloraGenome } from './genetics'
import type { CivilizationRuin } from './genesisTypes'
import type { DormantGardenData, GameState, Position, RuinInterior, Tile } from './types'

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
  tileType: TileType = TileType.RuinFloor
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

// ---------------------------------------------------------------------------
// Archetype assignment
// ---------------------------------------------------------------------------

export const assignArchetype = (_ruin: CivilizationRuin, _ruinIndex: number, _rng: () => number): RuinArchetype => {
  return RuinArchetype.DormantGarden
}

// ---------------------------------------------------------------------------
// Ruin interior generation
// ---------------------------------------------------------------------------

const MARGIN = 2

const createBaseMap = (
  mapWidth: number,
  mapHeight: number
): { map: Tile[][]; entranceX: number; entranceY: number; entranceInterior: Position } => {
  const map: Tile[][] = Array.from({ length: mapHeight }, () =>
    Array.from({ length: mapWidth }, () => ({ type: TileType.RuinWall }))
  )

  const entranceX = Math.floor(mapWidth / 2)
  // Exit row sits flush with the south map edge so south of the exit is
  // out-of-bounds (rendered as canvas BG_COLOR by the Zone.Ruin OOB branch),
  // not another RuinWall row — the doorway reads as an opening.
  const entranceY = mapHeight - 1

  // Exit row: 5 RuinExit tiles centered on entranceX (hot pink, walkable)
  const EXIT_WIDTH = 5
  const exitMargin = 3
  const exitStartX = Math.max(
    exitMargin,
    Math.min(mapWidth - exitMargin - EXIT_WIDTH, entranceX - Math.floor(EXIT_WIDTH / 2))
  )
  for (let i = 0; i < EXIT_WIDTH; i++) {
    const ex = exitStartX + i
    if (ex >= 0 && ex < mapWidth) map[entranceY][ex] = { type: TileType.RuinExit }
  }

  // Landing area (3 wide, 2 tall) above the center exit tile
  carveRect(map, entranceX - 1, entranceY - 2, 3, 2)

  const entranceInterior: Position = { x: entranceX, y: entranceY - 1 }
  return { map, entranceX, entranceY, entranceInterior }
}

// ---------------------------------------------------------------------------
// Dormant garden generator
// ---------------------------------------------------------------------------

const SEED_DECAY_BASE_MS = 90_000
const SEED_DECAY_MIN_MS = 45_000

/** BFS distance from a starting position over walkable tiles, treating
 * ALL walkable tile types (floor, aqueduct, debris=no, door=no) uniformly.
 * Returns a Map of posKey -> distance.
 */
const bfsDistances = (map: Tile[][], mapWidth: number, mapHeight: number, start: Position): Map<string, number> => {
  const distances = new Map<string, number>()
  const queue: Position[] = [start]
  distances.set(posKey(start.x, start.y), 0)
  while (queue.length > 0) {
    const pos = queue.shift()
    if (!pos) break
    const d = distances.get(posKey(pos.x, pos.y)) ?? 0
    for (const [dx, dy] of CARDINAL_DELTAS) {
      const nx = pos.x + dx
      const ny = pos.y + dy
      if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
      const key = posKey(nx, ny)
      if (distances.has(key)) continue
      if (!isWalkableTile(map[ny][nx].type)) continue
      distances.set(key, d + 1)
      queue.push({ x: nx, y: ny })
    }
  }
  return distances
}

/** Carve a straight corridor of given width along x or y, between two
 * collinear endpoints. (Either from.x === to.x or from.y === to.y.)
 */
const carveStraight = (map: Tile[][], from: Position, to: Position, width: number): void => {
  const halfW = Math.floor(width / 2)
  if (from.x === to.x) {
    const minY = Math.min(from.y, to.y)
    const maxY = Math.max(from.y, to.y)
    for (let y = minY; y <= maxY; y++) {
      for (let dx = -halfW; dx <= halfW; dx++) {
        const row = map[y]
        if (row && from.x + dx >= 0 && from.x + dx < map[0].length) {
          row[from.x + dx] = { type: TileType.RuinFloor }
        }
      }
    }
  } else if (from.y === to.y) {
    const minX = Math.min(from.x, to.x)
    const maxX = Math.max(from.x, to.x)
    for (let x = minX; x <= maxX; x++) {
      for (let dy = -halfW; dy <= halfW; dy++) {
        const row = map[from.y + dy]
        if (row && x >= 0 && x < map[0].length) {
          row[x] = { type: TileType.RuinFloor }
        }
      }
    }
  }
}

const generateDormantGarden = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  entranceX: number,
  entranceY: number,
  ruin: CivilizationRuin,
  rng: () => number
): DormantGardenData => {
  const SPINE_WIDTH = 3
  const BRANCH_WIDTH = 3

  // ---- 1. Carve the spine ----
  // Vertical run from the entrance landing up toward the top of the map.
  const spineTopY = MARGIN + 3
  const spineEntryY = entranceY - 2
  const spineTop: Position = { x: entranceX, y: spineTopY }
  const spineEntry: Position = { x: entranceX, y: spineEntryY }
  carveStraight(map, spineEntry, spineTop, SPINE_WIDTH)

  // ---- 2. Perpendicular branches (2-3) ----
  const branchEnds: Position[] = []
  const branchCount = 2 + Math.floor(rng() * 2)
  const branchSpacing = Math.max(6, Math.floor((spineEntryY - spineTopY) / (branchCount + 1)))
  for (let i = 0; i < branchCount; i++) {
    const branchY = spineTopY + branchSpacing * (i + 1)
    if (branchY <= spineTopY + 1 || branchY >= spineEntryY - 1) continue
    // Alternate left and right
    const goLeft = i % 2 === 0
    const branchLength = 6 + Math.floor(rng() * 8)
    const branchEndX = goLeft
      ? Math.max(MARGIN + 2, entranceX - branchLength)
      : Math.min(mapWidth - MARGIN - 3, entranceX + branchLength)
    const branchStart: Position = { x: entranceX, y: branchY }
    const branchEnd: Position = { x: branchEndX, y: branchY }
    carveStraight(map, branchStart, branchEnd, BRANCH_WIDTH)
    branchEnds.push(branchEnd)
  }

  // ---- 3. Dead-end alcoves (2-4) ----
  const alcoveCount = 2 + Math.floor(rng() * 3)
  for (let i = 0; i < alcoveCount; i++) {
    // Anchor on a random spine cell
    const anchorY = spineTopY + 2 + Math.floor(rng() * Math.max(1, spineEntryY - spineTopY - 4))
    const goLeft = rng() < 0.5
    const alcoveLen = 3 + Math.floor(rng() * 4)
    const alcoveWidth = 1 + Math.floor(rng() * 2) // 1-2 wide
    const startX = goLeft ? entranceX - 2 : entranceX + 2
    const endX = goLeft ? Math.max(MARGIN + 1, startX - alcoveLen) : Math.min(mapWidth - MARGIN - 2, startX + alcoveLen)
    const start: Position = { x: startX, y: anchorY }
    const end: Position = { x: endX, y: anchorY }
    carveStraight(map, start, end, alcoveWidth === 1 ? 1 : 2)
  }

  // ---- 4. Alternate loops (1-2) — a branch endpoint connects back to the spine
  // further along, creating a loop. ----
  const loopCount = 1 + Math.floor(rng() * 2)
  for (let i = 0; i < Math.min(loopCount, branchEnds.length); i++) {
    const branchEnd = branchEnds[i]
    // Vertical jog from the branch endpoint to a different y on the spine
    const jogTargetY = branchEnd.y + (rng() < 0.5 ? -1 : 1) * (4 + Math.floor(rng() * 4))
    const clampedY = Math.max(spineTopY + 1, Math.min(spineEntryY - 1, jogTargetY))
    if (clampedY === branchEnd.y) continue
    const verticalEnd: Position = { x: branchEnd.x, y: clampedY }
    const spineRejoin: Position = { x: entranceX, y: clampedY }
    carveStraight(map, branchEnd, verticalEnd, 1)
    carveStraight(map, verticalEnd, spineRejoin, 1)
  }

  // ---- 5. Vault chamber at the spine terminus ----
  const vaultW = 5
  const vaultH = 4
  const vaultX = Math.max(MARGIN, Math.min(mapWidth - MARGIN - vaultW, spineTop.x - Math.floor(vaultW / 2)))
  const vaultY = Math.max(MARGIN, spineTop.y - vaultH - 1)
  // Carve vault interior (1 tile of wall stays around it for now)
  carveRect(map, vaultX, vaultY, vaultW, vaultH)

  // Re-isolate the vault: turn any non-RuinWall tile within 1 tile around the
  // vault perimeter back into RuinWall, except for one chosen connector cell.
  // This guarantees there is exactly one entry point — where the door goes.
  const vaultCenter: Position = { x: vaultX + Math.floor(vaultW / 2), y: vaultY + Math.floor(vaultH / 2) }
  // Reseal the vault perimeter (the row directly below the vault)
  const sealY = vaultY + vaultH
  for (let x = vaultX - 1; x <= vaultX + vaultW; x++) {
    if (x < 0 || x >= mapWidth) continue
    if (sealY >= 0 && sealY < mapHeight) {
      map[sealY][x] = { type: TileType.RuinWall }
    }
    if (vaultY - 1 >= 0 && vaultY - 1 < mapHeight) {
      map[vaultY - 1][x] = { type: TileType.RuinWall }
    }
  }
  for (let y = vaultY - 1; y <= vaultY + vaultH; y++) {
    if (y < 0 || y >= mapHeight) continue
    if (vaultX - 1 >= 0) map[y][vaultX - 1] = { type: TileType.RuinWall }
    if (vaultX + vaultW < mapWidth) map[y][vaultX + vaultW] = { type: TileType.RuinWall }
  }

  // The entire south wall row of the vault is the door. The player can
  // unlock it from any of the door tiles, mirroring the cave breakable
  // wall pattern (cave.ts) — wider hitbox makes it easy to find with
  // [e] OR click. The landing south of the door is also widened so the
  // player can stand anywhere along the wall and face up to interact.
  // Coyote-role ruins skip the locked door entirely — the rubble is the
  // only obstacle in those ruins. The wall row is converted to floor so
  // the player walks straight in once the barrier is cleared.
  const doorX = vaultCenter.x
  const doorY = sealY
  const doorPositions: Position[] = []
  const skipDoor = ruin.role === RuinRole.Coyote
  if (doorY < mapHeight && doorY >= 0) {
    // Carve a 1-tile-tall landing strip directly under the door so every
    // door tile has a walkable south neighbor.
    const landingY = doorY + 1
    if (landingY < mapHeight) {
      for (let x = vaultX - 1; x <= vaultX + vaultW; x++) {
        if (x < 0 || x >= mapWidth) continue
        map[landingY][x] = { type: TileType.RuinFloor }
      }
    }
    // Then a 1-wide tunnel from the landing center down to the spine.
    const tunnelEnd: Position = { x: doorX, y: spineTopY }
    carveStraight(map, { x: doorX, y: landingY }, tunnelEnd, 1)
    // Convert the wall row to door tiles, or to plain floor for coyote-role.
    for (let x = vaultX - 1; x <= vaultX + vaultW; x++) {
      if (x < 0 || x >= mapWidth) continue
      if (skipDoor) {
        map[doorY][x] = { type: TileType.RuinFloor }
      } else {
        map[doorY][x] = { type: TileType.RuinDoorLocked }
        doorPositions.push({ x, y: doorY })
      }
    }
  }

  // ---- 6. Lay aqueduct channels down the spine and through the vault ----
  const aqueductTiles = new Set<string>()
  for (let y = spineTopY; y <= spineEntryY; y++) {
    if (map[y]?.[entranceX]?.type === TileType.RuinFloor) {
      map[y][entranceX] = { type: TileType.RuinAqueduct }
      aqueductTiles.add(posKey(entranceX, y))
    }
  }
  for (let x = vaultX + 1; x < vaultX + vaultW - 1; x++) {
    if (map[vaultCenter.y]?.[x]?.type === TileType.RuinFloor) {
      map[vaultCenter.y][x] = { type: TileType.RuinAqueduct }
      aqueductTiles.add(posKey(x, vaultCenter.y))
    }
  }

  // ---- 7. Break points along the channel ----
  const breakCount = 2 + Math.floor(rng() * 3)
  const aqueductArray = [...aqueductTiles]
  const breakPoints: Position[] = []
  for (let i = 0; i < breakCount && aqueductArray.length > 2; i++) {
    const startIdx = Math.floor(aqueductArray.length * 0.15)
    const endIdx = Math.max(startIdx + 1, Math.floor(aqueductArray.length * 0.85))
    const idx = startIdx + Math.floor(rng() * (endIdx - startIdx))
    const key = aqueductArray[idx]
    if (!key) continue
    const parts = key.split(',')
    const bx = Number(parts[0])
    const by = Number(parts[1])
    const tooClose = breakPoints.some(bp => Math.abs(bp.x - bx) + Math.abs(bp.y - by) < 4)
    if (tooClose) continue
    map[by][bx] = { type: TileType.RuinAqueductBroken }
    breakPoints.push({ x: bx, y: by })
    aqueductTiles.delete(key)
  }

  // ---- 7.5 Collapse barrier (coyote-role only) ----
  // A 3-tile RuinDebris row across the spine corridor at 35-60% depth from
  // the entrance, gating access to the trapped coyote spawned past it.
  let collapseBarrier: Position[] | null = null
  if (ruin.role === RuinRole.Coyote) {
    const spineLength = spineEntryY - spineTopY
    // y=spineEntryY is at the entrance, y=spineTopY is at the vault.
    // Depth from entrance increases as y decreases.
    const minBarrierY = spineEntryY - Math.floor(spineLength * 0.6)
    const maxBarrierY = spineEntryY - Math.floor(spineLength * 0.35)

    const isCorridorOrChannel = (t: TileType | undefined): boolean =>
      t === TileType.RuinFloor || t === TileType.RuinAqueduct || t === TileType.RuinAqueductBroken

    const tryRow = (y: number): boolean => {
      if (y < spineTopY + 2 || y > spineEntryY - 2) return false
      // Don't collide with door area (skipDoor is true here, but the wall
      // row is at sealY which equals vaultY+vaultH; spineTopY > sealY so
      // this is automatically excluded). Belt-and-braces: also skip if
      // within 1 tile of sealY or the carved landing row.
      if (y >= sealY - 1 && y <= sealY + 1) return false
      for (let dx = -1; dx <= 1; dx++) {
        if (!isCorridorOrChannel(map[y]?.[entranceX + dx]?.type)) return false
      }
      return true
    }

    let chosenY: number | null = null
    if (maxBarrierY >= minBarrierY) {
      const span = maxBarrierY - minBarrierY + 1
      for (let attempt = 0; attempt < 8; attempt++) {
        const y = minBarrierY + Math.floor(rng() * span)
        if (tryRow(y)) {
          chosenY = y
          break
        }
      }
    }
    if (chosenY === null) {
      for (let y = minBarrierY; y <= maxBarrierY; y++) {
        if (tryRow(y)) {
          chosenY = y
          break
        }
      }
    }
    if (chosenY === null) {
      for (let y = spineTopY + 2; y <= spineEntryY - 2; y++) {
        if (tryRow(y)) {
          chosenY = y
          break
        }
      }
    }

    if (chosenY !== null) {
      collapseBarrier = []
      for (let dx = -1; dx <= 1; dx++) {
        const x = entranceX + dx
        const y = chosenY
        const k = posKey(x, y)
        if (aqueductTiles.has(k)) aqueductTiles.delete(k)
        const bpIdx = breakPoints.findIndex(bp => bp.x === x && bp.y === y)
        if (bpIdx >= 0) breakPoints.splice(bpIdx, 1)
        map[y][x] = { type: TileType.RuinDebris }
        collapseBarrier.push({ x, y })
      }
    }
  }

  // ---- 8. Debris at intersections / spine widening ----
  const debrisCount = 3 + Math.floor(rng() * 3)
  const debrisPositions: Position[] = []
  let debrisAttempts = 0
  while (debrisPositions.length < debrisCount && debrisAttempts < 200) {
    debrisAttempts++
    const dx = MARGIN + Math.floor(rng() * (mapWidth - MARGIN * 2))
    const dy = MARGIN + Math.floor(rng() * (mapHeight - MARGIN * 2))
    if (map[dy]?.[dx]?.type !== TileType.RuinFloor) continue
    if (aqueductTiles.has(posKey(dx, dy))) continue
    if (Math.abs(dx - entranceX) <= 1 && dy >= entranceY - 3) continue
    // Avoid the door row and the carved landing strip directly south of it
    // so every door tile remains reachable.
    if (dx >= vaultX - 1 && dx <= vaultX + vaultW && dy >= doorY - 1 && dy <= doorY + 1) continue
    map[dy][dx] = { type: TileType.RuinDebris }
    debrisPositions.push({ x: dx, y: dy })
  }

  // ---- 9. Seed decay timers in the vault ----
  const ageFactor = ruin.age / 6000
  const baseDecay = SEED_DECAY_BASE_MS - ageFactor * (SEED_DECAY_BASE_MS - SEED_DECAY_MIN_MS)
  const seedDecayTimers = new Map<string, number>()
  const seedCount = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < seedCount; i++) {
    const sx = vaultX + 1 + Math.floor(rng() * (vaultW - 2))
    const sy = vaultY + 1 + Math.floor(rng() * (vaultH - 2))
    const key = posKey(sx, sy)
    if (seedDecayTimers.has(key)) continue
    if (map[sy]?.[sx]?.type !== TileType.RuinFloor) continue
    seedDecayTimers.set(key, baseDecay + (rng() - 0.5) * 10_000)
  }

  // ---- 10. Compute BFS distances from the entrance for key/tablet placement ----
  // For BFS we treat the locked door and any collapseBarrier tiles as
  // walkable so cells beyond them contribute distance, but we exclude the
  // vault interior from candidates. Temporarily flip those tiles to floor
  // for BFS, then flip back.
  const doorKeySet = new Set<string>()
  for (const dp of doorPositions) {
    doorKeySet.add(posKey(dp.x, dp.y))
    map[dp.y][dp.x] = { type: TileType.RuinFloor }
  }
  if (collapseBarrier) {
    for (const bp of collapseBarrier) {
      map[bp.y][bp.x] = { type: TileType.RuinFloor }
    }
  }
  const distances = bfsDistances(map, mapWidth, mapHeight, { x: entranceX, y: entranceY - 1 })
  for (const dp of doorPositions) {
    map[dp.y][dp.x] = { type: TileType.RuinDoorLocked }
  }
  if (collapseBarrier) {
    for (const bp of collapseBarrier) {
      map[bp.y][bp.x] = { type: TileType.RuinDebris }
    }
  }

  let maxDist = 0
  for (const d of distances.values()) if (d > maxDist) maxDist = d

  const inVault = (x: number, y: number) => x >= vaultX && x < vaultX + vaultW && y >= vaultY && y < vaultY + vaultH

  const isCandidateCell = (x: number, y: number, allowAqueduct: boolean): boolean => {
    if (inVault(x, y)) return false
    if (doorKeySet.has(posKey(x, y))) return false
    const tile = map[y]?.[x]
    if (!tile) return false
    if (tile.type === TileType.RuinFloor) return true
    if (allowAqueduct && (tile.type === TileType.RuinAqueduct || tile.type === TileType.RuinAqueductBroken)) return true
    return false
  }

  const cellsInBand = (lo: number, hi: number, allowAqueduct: boolean): Position[] => {
    const out: Position[] = []
    for (const [key, d] of distances) {
      const fraction = maxDist > 0 ? d / maxDist : 0
      if (fraction < lo || fraction > hi) continue
      const parts = key.split(',')
      const x = Number(parts[0])
      const y = Number(parts[1])
      if (!isCandidateCell(x, y, allowAqueduct)) continue
      out.push({ x, y })
    }
    return out
  }

  // Key in 60-85% band; allow channels as a last resort. Skipped entirely
  // for coyote-role ruins, which have no door and so need no key.
  let keyPosition: Position | null = null
  if (ruin.role !== RuinRole.Coyote) {
    let keyCandidates = cellsInBand(0.6, 0.85, false)
    if (keyCandidates.length === 0) keyCandidates = cellsInBand(0.6, 0.85, true)
    if (keyCandidates.length === 0) {
      // Fallback: deepest non-vault cell
      let deepestKey: string | null = null
      let deepestD = -1
      for (const [key, d] of distances) {
        const parts = key.split(',')
        const x = Number(parts[0])
        const y = Number(parts[1])
        if (inVault(x, y)) continue
        if (doorKeySet.has(posKey(x, y))) continue
        if (d > deepestD) {
          deepestD = d
          deepestKey = key
        }
      }
      if (deepestKey) {
        const parts = deepestKey.split(',')
        keyCandidates = [{ x: Number(parts[0]), y: Number(parts[1]) }]
      }
    }
    if (keyCandidates.length > 0) {
      keyPosition = keyCandidates[Math.floor(rng() * keyCandidates.length)]
    }
  }

  // Tablet in 25-55% band, excluding the chosen key cell. Channels disallowed.
  const tabletCandidates = cellsInBand(0.25, 0.55, false).filter(c => c.x !== keyPosition?.x || c.y !== keyPosition.y)
  if (tabletCandidates.length === 0) {
    // Fallback: nearest non-conflicting floor cell at any depth
    for (const key of distances.keys()) {
      const parts = key.split(',')
      const x = Number(parts[0])
      const y = Number(parts[1])
      if (!isCandidateCell(x, y, false)) continue
      if (x === keyPosition?.x && y === keyPosition.y) continue
      tabletCandidates.push({ x, y })
      break
    }
  }
  const tabletPosition =
    tabletCandidates.length > 0 ? tabletCandidates[Math.floor(rng() * tabletCandidates.length)] : null

  return {
    aqueductTiles,
    breakPoints,
    repairedBreaks: new Set<string>(),
    debrisPositions,
    seedVault: vaultCenter,
    seedDecayTimers,
    seedDecayAcceleration: 1,
    waterFlowing: false,
    keyPosition,
    tabletPosition,
    doorPositions,
    collapseBarrier,
  }
}

// ---------------------------------------------------------------------------
// Astral void pond generation
// ---------------------------------------------------------------------------

/** Flood-fill from a start position, returning all reachable walkable posKeys. */
const floodFillReachable = (map: Tile[][], mapWidth: number, mapHeight: number, start: Position): Set<string> => {
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
const getCriticalPositions = (entranceInterior: Position, dormantGarden: DormantGardenData | null): Set<string> => {
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
  if (dormantGarden) {
    critical.add(posKey(dormantGarden.seedVault.x, dormantGarden.seedVault.y))
    for (const p of dormantGarden.breakPoints) critical.add(posKey(p.x, p.y))
    for (const key of dormantGarden.aqueductTiles) critical.add(key)
    for (const p of dormantGarden.debrisPositions) critical.add(posKey(p.x, p.y))
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
  dormantGarden: DormantGardenData | null,
  rng: () => number
): void => {
  // Count plain floor tiles eligible for void conversion
  let walkableCount = 0
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const t = map[y][x].type
      if (t === TileType.RuinFloor) walkableCount++
    }
  }
  if (walkableCount === 0) return

  // Target 0-10% coverage
  const coveragePct = rng() * 0.1
  const targetTiles = Math.floor(walkableCount * coveragePct)
  if (targetTiles < 3) return // not enough for a meaningful pond

  const critical = getCriticalPositions(entranceInterior, dormantGarden)

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
      if (seedType !== TileType.RuinFloor) continue
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
      if (nType !== TileType.RuinFloor) continue
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
  rng: () => number
): Omit<RuinInterior, 'entranceOverworld'> => {
  const mapWidth = ruin.radius * 24 + 30
  const mapHeight = ruin.radius * 18 + 24
  const { map, entranceX, entranceY, entranceInterior } = createBaseMap(mapWidth, mapHeight)

  let dormantGardenData: DormantGardenData | null = null

  if (archetype === RuinArchetype.DormantGarden) {
    dormantGardenData = generateDormantGarden(map, mapWidth, mapHeight, entranceX, entranceY, ruin, rng)
  }

  // Place astral void ponds after archetype generation
  placeVoidPonds(map, mapWidth, mapHeight, entranceInterior, dormantGardenData, rng)

  // Revalidate seed positions — void ponds and debris may have overwritten floor tiles
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
    dormantGarden: dormantGardenData,
    fogExplored: new Set<string>(),
    fogDiscovered: new Set<string>(),
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
  clearAllGrowthPreviews(state)
  clearMovementTweens(state)
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

  // Dormant garden: spawn seeds, key, and tablet on first entry
  if (interior.dormantGarden && !interior.explored) {
    spawnDormantGardenSeeds(state, ruinIndex)
    spawnDormantGardenItems(state, ruinIndex)
  }

  // Mark as explored (after first-entry logic)
  interior.explored = true

  clearNavigationState(state)

  // Teleport coyote to ruin
  transitionCoyoteToZone(state, Zone.Ruin)

  recordDiscovery(state, `zone:ruin-${String(ruinIndex)}`)

  // Record archetype-specific discovery for manual entries
  const archetypeDiscoveryKey: Record<string, string> = {
    [RuinArchetype.DormantGarden]: 'zone:ruin-dormant-garden',
  }
  const discoveryKey = archetypeDiscoveryKey[interior.archetype]
  if (discoveryKey) {
    recordDiscovery(state, discoveryKey)
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

  // Place player outside the 3x3 overworld hitbox (Chebyshev distance >= 2)
  state.player = findSafeExitPosition(interior.entranceOverworld, state.map, state.mapWidth, state.mapHeight, 2)

  state.currentRuinIndex = null

  clearNavigationState(state)

  // Teleport coyote to overworld
  transitionCoyoteToZone(state, Zone.Overworld)
}

export const checkRuinTransition = (state: GameState): boolean => {
  const px = state.player.x
  const py = state.player.y

  // Overworld: 3x3 hitbox scan for RuinEntrance
  if (state.currentZone === Zone.Overworld) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (state.map[py + dy]?.[px + dx]?.type === TileType.RuinEntrance) {
          const ex = px + dx
          const ey = py + dy
          const ruinIndex = state.ruinInteriors.findIndex(
            r => r.entranceOverworld.x === ex && r.entranceOverworld.y === ey
          )
          if (ruinIndex !== -1) {
            scheduleZoneTransition(state, performance.now(), {
              direction: 'enter',
              kind: 'ruin',
              irisCenter: { x: ex, y: ey },
              ruinIndex,
            })
            return true
          }
        }
      }
    }
  }

  // Ruin interior: step on any RuinExit tile to exit
  if (state.currentZone === Zone.Ruin) {
    if (state.map[py]?.[px]?.type === TileType.RuinExit) {
      scheduleZoneTransition(state, performance.now(), {
        direction: 'exit',
        kind: 'ruin',
        irisCenter: { x: px, y: py },
      })
      return true
    }
  }

  return false
}

// Register ruin swap handlers with the zone transition module. The
// handlers are the existing enterRuin / exitRuin functions; they fire
// at midpoint via tickZoneTransition. Module-load side effect.
registerZoneSwapHandler('ruin', 'enter', (state, transition) => {
  if (transition.ruinIndex === null) return
  enterRuin(state, transition.ruinIndex)
})
registerZoneSwapHandler('ruin', 'exit', state => {
  exitRuin(state)
})

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

export const getEntranceHaloCells = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  entranceX: number,
  entranceY: number,
  rivers: Set<string>,
  ponds: Set<string>
): Position[] => {
  const cells: Position[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = entranceX + dx
      const y = entranceY + dy
      if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) continue
      if (map[y][x].type === TileType.Space) continue
      const key = posKey(x, y)
      if (rivers.has(key) || ponds.has(key)) continue
      cells.push({ x, y })
    }
  }
  return cells
}

export interface PatinaLayer {
  char: string
  color: string
  dx: number
  dy: number
}

// Sparse verdigris glyphs layered over the 8 perimeter cells of an entrance
// halo. Center entrance tile is excluded by the caller — but we also skip it
// here as a safety net so callers can't accidentally double-glyph the "O".
// Always returns 1 layer for a perimeter cell, plus a 2nd on ~40% of cells
// (h % 5 < 2). Position-deterministic via tileHash.
export const getEntrancePatinaLayers = (
  cellX: number,
  cellY: number,
  entranceX: number,
  entranceY: number
): PatinaLayer[] => {
  if (cellX === entranceX && cellY === entranceY) return []
  const h = tileHash(cellX, cellY)
  const layers: PatinaLayer[] = [
    {
      char: PATINA_CHARS[h % PATINA_CHARS.length],
      color: VERDIGRIS_COLORS[h % VERDIGRIS_COLORS.length],
      dx: 0,
      dy: 0,
    },
  ]
  if (h % 5 < 2) {
    layers.push({
      char: PATINA_CHARS[(h + 2) % PATINA_CHARS.length],
      color: VERDIGRIS_COLORS[(h + 1) % VERDIGRIS_COLORS.length],
      dx: h % 2 === 0 ? 1 : -1,
      dy: h % 3 === 0 ? 1 : 0,
    })
  }
  return layers
}

export const placeRuinEntrances = (map: Tile[][], ruinInteriors: RuinInterior[]): void => {
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

    // Convert all 8 neighbors to RuinApron so the entrance reads as a
    // raised stone platform. CaveEntrance is preserved (indestructible).
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= mapWidth || ny < 0 || ny >= mapHeight) continue
        const neighbor = map[ny][nx]
        if (!neighbor) continue
        if (neighbor.type === TileType.CaveEntrance) continue
        map[ny][nx] = { type: TileType.RuinApron }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Cardinal deltas (used by flood-fill helpers)
// ---------------------------------------------------------------------------

const CARDINAL_DELTAS: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
]

// ---------------------------------------------------------------------------
// Dormant garden seed spawning
// ---------------------------------------------------------------------------

export const spawnDormantGardenSeeds = (state: GameState, ruinIndex: number): void => {
  const interior = state.ruinInteriors[ruinIndex]
  if (!interior?.dormantGarden) return

  // Starter-mode role payloads replace the seed scatter. Each role spawns a
  // single reward at the first vault slot; remaining slots stay empty so the
  // vault reads as "the thing the player came for" rather than a seed pile.
  const ruin = state.civilizationRuins[ruinIndex]
  const role = ruin?.role
  const vaultSlots = Array.from(interior.dormantGarden.seedDecayTimers.keys())

  if (role === RuinRole.Clover || role === RuinRole.Bee) {
    const slot = vaultSlots[0]
    if (!slot) return
    const parts = slot.split(',')
    const x = Number(parts[0])
    const y = Number(parts[1])
    spawnRuinGroundItem(state, ruinIndex, { x, y }, role)
    interior.dormantGarden.seedDecayTimers.clear()
    return
  }

  // Flora-species ruins (precis #5): vault spawns a single seed item
  // matching the role. No collapseBarrier, no trapped entity — the vault
  // is the destination. Precis #11: each seed carries a deterministic
  // FloraGenome derived from (stewardName, ruinIndex, vault slot index 0).
  if (role === RuinRole.Wildflower || role === RuinRole.TallGrass) {
    const slot = vaultSlots[0]
    if (!slot) return
    const parts = slot.split(',')
    const x = Number(parts[0])
    const y = Number(parts[1])
    const species = role === RuinRole.Wildflower ? FloraSpecies.Wildflower : FloraSpecies.TallGrass
    const itemId = role === RuinRole.Wildflower ? 'wildflowerSeeds' : 'tallGrassSeeds'
    const binomial = FLORA_SPECIES[species].latinBinomial
    const genesisSeed = nameToSeed(state.stewardName)
    const identity = generateGenesisIdentity(binomial, genesisSeed, `ruin:${String(ruinIndex)}:vault:0`)
    const genome = { identity, traits: generateTraitBag(identity) }
    spawnRuinGroundItem(state, ruinIndex, { x, y }, itemId, genome)
    interior.dormantGarden.seedDecayTimers.clear()
    return
  }

  if (role === RuinRole.Coyote) {
    // The trapped coyote spawns past the collapseBarrier on the vault side
    // (smaller y), within 2 tiles so it's visible through the rubble. The
    // vault itself is empty for coyote-role ruins — the dog is the prize.
    const barrier = interior.dormantGarden.collapseBarrier
    const map = interior.map
    let coyotePos: Position | null = null
    if (barrier && barrier.length > 0) {
      const barrierY = barrier[0].y
      const centerX = barrier[Math.floor(barrier.length / 2)].x
      outer: for (let dy = 1; dy <= 2; dy++) {
        const y = barrierY - dy
        for (const dxOff of [0, -1, 1, -2, 2]) {
          const x = centerX + dxOff
          const t = map[y]?.[x]?.type
          if (t === TileType.RuinFloor || t === TileType.RuinAqueduct) {
            coyotePos = { x, y }
            break outer
          }
        }
      }
    }
    if (!coyotePos) {
      // Fallback for ruins where the barrier didn't place: use the first
      // vault slot. Should not happen given the barrier-placement contract.
      const slot = vaultSlots[0]
      if (slot) {
        const parts = slot.split(',')
        coyotePos = { x: Number(parts[0]), y: Number(parts[1]) }
      }
    }
    if (coyotePos) {
      createCharacterEntity(state, 'coyote', coyotePos, { zone: Zone.Ruin, ruinIndex })
    }
    interior.dormantGarden.seedDecayTimers.clear()
    return
  }

  // Default (no role match) is intentionally empty. The starter roles —
  // Clover, Bee, Coyote (precis #0/#1) plus Wildflower, TallGrass (precis
  // #5) — handle every fresh game allocation. Complex-mode ruins
  // (future spec) will spawn additional seed scatter when the broader
  // taxonomy lands in precis #11. The decay-timer slots stay registered
  // so #11 can repopulate them without re-deriving the layout.
}

const spawnRuinGroundItem = (
  state: GameState,
  ruinIndex: number,
  pos: Position,
  definitionId: string,
  genome?: FloraGenome,
): void => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x: pos.x, y: pos.y })
  const dropData: { definitionId: string; genome?: FloraGenome } = { definitionId }
  if (genome) dropData.genome = genome
  state.world.addComponent(e, ComponentType.ItemDrop, dropData)
  state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Ruin, ruinIndex })
}

export const spawnDormantGardenItems = (state: GameState, ruinIndex: number): void => {
  const interior = state.ruinInteriors[ruinIndex]
  const garden = interior?.dormantGarden
  if (!garden) return
  if (garden.keyPosition) {
    spawnRuinGroundItem(state, ruinIndex, garden.keyPosition, 'aqueductKey')
  }
  if (garden.tabletPosition) {
    spawnRuinGroundItem(state, ruinIndex, garden.tabletPosition, 'stoneTablet')
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
  setMapTile(state, x, y, { type: TileType.RuinAqueduct })
  garden.repairedBreaks.add(posKey(x, y))
  garden.aqueductTiles.add(posKey(x, y))

  // Check if all breaks are now repaired
  const allRepaired = garden.breakPoints.every(bp => garden.repairedBreaks.has(posKey(bp.x, bp.y)))
  if (allRepaired) {
    garden.waterFlowing = true
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

export const getRuinTileLayers = (tileType: TileType, x: number, y: number, _time: number): RuinTileLayer[] => {
  const h = tileHash(x, y)
  const { palette, chars } = STRUCTURE_REGISTRY.ruin

  switch (tileType) {
    case TileType.RuinWall: {
      // 2-3 dense building char layers in grays — thick, cluttered, ancient
      const layers: RuinTileLayer[] = [
        { char: chars[h % chars.length], color: palette[h % palette.length], dx: 0, dy: 0 },
        {
          char: chars[(h + 3) % chars.length],
          color: palette[(h + 2) % palette.length],
          dx: 1,
          dy: 1,
        },
      ]
      // ~60% of wall tiles get a third layer
      if (h % 5 < 3) {
        layers.push({ char: '·', color: palette[(h + 4) % palette.length], dx: -1, dy: 0 })
      }
      return layers
    }

    case TileType.RuinFloor: {
      // 1-2 sparse layers — floor char + optional debris dot
      const layers: RuinTileLayer[] = [
        { char: h % 3 === 0 ? '·' : '.', color: TILE_COLORS[TileType.RuinFloor], dx: 0, dy: 0 },
      ]
      // ~40% of floor tiles get a debris dot
      if (h % 5 < 2) {
        layers.push({
          char: '·',
          color: palette[(h + 1) % palette.length],
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

    case TileType.RuinDoorLocked: {
      // Same multilayer pattern as RuinWall, but tinted verdigris so the door
      // reads as a wall section flagged by color against the gray wall palette.
      const doorColor = TILE_COLORS[TileType.RuinDoorLocked]
      const layers: RuinTileLayer[] = [
        { char: BUILDING_CHARS[h % BUILDING_CHARS.length], color: doorColor, dx: 0, dy: 0 },
        { char: BUILDING_CHARS[(h + 3) % BUILDING_CHARS.length], color: doorColor, dx: 1, dy: 1 },
      ]
      if (h % 5 < 3) {
        layers.push({ char: '·', color: doorColor, dx: -1, dy: 0 })
      }
      return layers
    }

    case TileType.RuinDoorOpen: {
      // Renders identically to RuinFloor so the doorway visually disappears
      // once unlocked.
      const layers: RuinTileLayer[] = [
        { char: h % 3 === 0 ? '·' : '.', color: TILE_COLORS[TileType.RuinFloor], dx: 0, dy: 0 },
      ]
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

    default:
      // Non-ruin tiles: single layer using standard chars/colors
      return [{ char: TILE_CHARS[tileType] ?? '.', color: TILE_COLORS[tileType] ?? '#666', dx: 0, dy: 0 }]
  }
}
