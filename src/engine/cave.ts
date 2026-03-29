import { TileType, Zone } from './types'

import type { GameState, Position, Tile } from './types'

export interface CaveResult {
  map: Tile[][]
  entrance: Position
  npcSpot: Position
  hiddenChamberPositions: Position[]
  breakableWallPositions: Position[]
}

// Carve a rectangle of CaveFloor into the map
const carveRect = (
  map: Tile[][],
  x: number,
  y: number,
  w: number,
  h: number,
  tileType: TileType = TileType.CaveFloor,
): void => {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const row = map[y + dy]
      if (row) {
        row[x + dx] = { type: tileType }
      }
    }
  }
}

// Carve a corridor between two points (L-shaped: horizontal then vertical)
const carveCorridor = (
  map: Tile[][],
  from: Position,
  to: Position,
  width: number,
): void => {
  const halfW = Math.floor(width / 2)

  // Horizontal segment
  const minX = Math.min(from.x, to.x)
  const maxX = Math.max(from.x, to.x)
  for (let x = minX; x <= maxX; x++) {
    for (let dy = -halfW; dy <= halfW; dy++) {
      const row = map[from.y + dy]
      if (row && x >= 0 && x < map[0].length) {
        row[x] = { type: TileType.CaveFloor }
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
        row[to.x + dx] = { type: TileType.CaveFloor }
      }
    }
  }
}

export const generateCave = (
  width: number,
  height: number,
  rng: () => number = Math.random,
): CaveResult => {
  // Fill with CaveWall
  const map: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: TileType.CaveWall })),
  )

  // Entrance at bottom center
  const entranceX = Math.floor(width / 2)
  const entranceY = height - 2
  map[entranceY][entranceX] = { type: TileType.CaveEntrance }

  // Carve a small landing area around the entrance
  carveRect(map, entranceX - 1, entranceY - 1, 3, 2)
  // Restore the entrance tile (carveRect may have overwritten it)
  map[entranceY][entranceX] = { type: TileType.CaveEntrance }

  // Generate waypoints for the main passage
  // Start just above entrance landing, wander upward with lateral variation
  const margin = 3
  const waypoints: Position[] = [{ x: entranceX, y: entranceY - 1 }]

  let curX = entranceX
  let curY = entranceY - 4
  const segments = 3 + Math.floor(rng() * 2) // 3-4 segments

  // Reserve space for breakable wall + hidden chamber at the top
  const minPassageY = 12 // passage stops here; breakable wall and chamber go above

  for (let i = 0; i < segments; i++) {
    // Bias upward, allow lateral movement
    const lateralRange = Math.floor((width - margin * 2) / 2)
    const dx = Math.floor(rng() * lateralRange * 2) - lateralRange
    const nextX = Math.max(margin, Math.min(width - margin - 1, curX + dx))
    const nextY = Math.max(minPassageY, curY - (3 + Math.floor(rng() * 4)))
    waypoints.push({ x: nextX, y: nextY })
    curX = nextX
    curY = nextY
  }

  // Carve corridors between waypoints
  const corridorWidth = 2 + Math.floor(rng() * 2) // 2-3 tiles wide
  for (let i = 0; i < waypoints.length - 1; i++) {
    carveCorridor(map, waypoints[i], waypoints[i + 1], corridorWidth)
  }
  // Restore entrance tile (corridor carving may have overwritten it)
  map[entranceY][entranceX] = { type: TileType.CaveEntrance }

  // Small chamber at the last waypoint — extend upward to touch the breakable wall
  const lastWaypoint = waypoints[waypoints.length - 1]
  const breakableY = lastWaypoint.y - 4
  // Carve from breakableY+1 (just below the wall) down to lastWaypoint.y+2
  carveRect(map, lastWaypoint.x - 2, breakableY + 1, 5, lastWaypoint.y + 2 - breakableY)

  // Place breakable wall and hidden chamber above the last waypoint
  const chamberCenterX = Math.max(margin, Math.min(width - margin - 1, lastWaypoint.x))
  const breakableStartX = chamberCenterX - 2
  const breakableWidth = 5

  // Place breakable wall row and collect positions
  const breakableWallPositions: Position[] = []
  for (let dx = 0; dx < breakableWidth; dx++) {
    const bx = breakableStartX + dx
    if (bx >= 0 && bx < width && breakableY >= 0 && breakableY < height) {
      map[breakableY][bx] = { type: TileType.CaveBreakableWall }
      breakableWallPositions.push({ x: bx, y: breakableY })
    }
  }

  // Carve hidden chamber behind (above) the breakable wall
  const chamberY = Math.max(1, breakableY - 5)
  const chamberW = 5
  const chamberH = Math.max(1, breakableY - chamberY)
  carveRect(map, breakableStartX, chamberY, chamberW, chamberH)

  // Collect hidden chamber floor positions
  const hiddenChamberPositions: Position[] = []
  for (let dy = 0; dy < chamberH; dy++) {
    for (let dx = 0; dx < chamberW; dx++) {
      const cx = breakableStartX + dx
      const cy = chamberY + dy
      if (cx >= 0 && cx < width && cy >= 0 && cy < height && map[cy][cx].type === TileType.CaveFloor) {
        hiddenChamberPositions.push({ x: cx, y: cy })
      }
    }
  }

  // NPC spot is in the center of the hidden chamber
  const npcSpot: Position = {
    x: breakableStartX + Math.floor(chamberW / 2),
    y: chamberY + Math.floor(chamberH / 2),
  }

  return {
    map,
    entrance: { x: entranceX, y: entranceY },
    npcSpot,
    hiddenChamberPositions,
    breakableWallPositions,
  }
}

// --- Transition functions ---

export const enterCave = (state: GameState): void => {
  // Snapshot overworld state
  state.overworldSnapshot = {
    map: state.map,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    player: { ...state.player },
    bees: state.bees,
    characters: state.characters,
    groundItems: state.groundItems,
    groundOmniboxes: state.groundOmniboxes,
    meteorites: state.meteorites,
    path: state.path,
    pathWaypoints: state.pathWaypoints,
    pendingAction: state.pendingAction,
    previewFn: state.previewFn,
    facingEntityPos: state.facingEntityPos,
  }

  // Swap in cave state
  state.map = state.caveMap
  state.mapWidth = state.caveMapWidth
  state.mapHeight = state.caveMapHeight
  // Place player one tile above the cave entrance (adjacent, not on it)
  state.player = {
    x: state.caveEntranceInterior.x,
    y: state.caveEntranceInterior.y - 1,
  }
  state.currentZone = Zone.Cave

  // Clear entities for cave
  state.bees = []
  state.characters = [{ definitionId: 'moab', pos: { ...state.caveNpcSpot } }]
  state.groundItems = []
  state.groundOmniboxes = []
  state.meteorites = []

  // Clear navigation state
  state.path = null
  state.pathWaypoints = []
  state.pendingAction = null
  state.pendingInteractionTarget = null
  state.heldDirection = null
  state.previewFn = null
  state.facingEntityPos = null
  state.activeDialog = null
}

export const exitCave = (state: GameState): void => {
  const snapshot = state.overworldSnapshot
  if (!snapshot) return

  // Restore overworld state
  state.map = snapshot.map
  state.mapWidth = snapshot.mapWidth
  state.mapHeight = snapshot.mapHeight
  state.bees = snapshot.bees
  state.characters = snapshot.characters
  state.groundItems = snapshot.groundItems
  state.groundOmniboxes = snapshot.groundOmniboxes
  state.meteorites = snapshot.meteorites
  state.currentZone = Zone.Overworld

  // Place player one tile south of the cave entrance to avoid re-entry loop
  state.player = {
    x: state.caveEntranceOverworld.x,
    y: state.caveEntranceOverworld.y + 1,
  }

  // Clear navigation state
  state.path = null
  state.pathWaypoints = []
  state.pendingAction = null
  state.pendingInteractionTarget = null
  state.heldDirection = null
  state.previewFn = null
  state.facingEntityPos = null
  state.activeDialog = null
  state.overworldSnapshot = null
}

export const checkTransition = (state: GameState): boolean => {
  const tileType = state.map[state.player.y]?.[state.player.x]?.type
  if (tileType !== TileType.CaveEntrance) return false

  if (state.currentZone === Zone.Overworld) {
    enterCave(state)
    return true
  } else if (state.currentZone === Zone.Cave) {
    exitCave(state)
    return true
  }

  return false
}
