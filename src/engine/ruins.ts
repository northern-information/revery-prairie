import { transitionCoyoteToZone } from './coyote'
import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { posKey, tileHash } from './position'
import { RuinArchetype, TileType, Zone } from './types'

import type { CivilizationRuin } from './genesisTypes'
import type { GameState, Position, RuinInterior, SubsidenceData, Tile } from './types'

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

  if (archetype === RuinArchetype.Subsidence) {
    subsidenceData = generateSubsidence(map, mapWidth, mapHeight, entranceX, entranceY, ruin, rng)
  } else {
    // Fallback: generic corridors for non-subsidence archetypes (placeholder)
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
