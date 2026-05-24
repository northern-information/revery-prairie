import { TILE_COLORS } from './constants'
import { transitionCoyoteToZone } from './coyote'
import { clearAllGrowthPreviews } from './floraGrowthPreviews'
import { checkHouseTransition } from './house'
import { recordDiscovery } from './manual'
import { clearMovementTweens } from './movementTween'
import { findSafeExitPosition, tileHash } from './position'
import { checkRuinTransition } from './ruins'
import { STRUCTURE_REGISTRY } from './structures'
import { TileType, Zone } from './types'
import { registerZoneSwapHandler, scheduleZoneTransition } from './zoneTransition'

import type { RuinTileLayer } from './ruins'
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
  tileType: TileType = TileType.CaveFloor
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
const carveCorridor = (map: Tile[][], from: Position, to: Position, width: number): void => {
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

export const generateCave = (width: number, height: number, rng: () => number = Math.random): CaveResult => {
  // Fill with CaveWall
  const map: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: TileType.CaveWall }))
  )

  // Exit row at bottom center: 5 CaveExit tiles (hot pink, walkable)
  const entranceX = Math.floor(width / 2)
  const entranceY = height - 2
  const EXIT_WIDTH = 5
  const exitMargin = 3
  const exitStartX = Math.max(
    exitMargin,
    Math.min(width - exitMargin - EXIT_WIDTH, entranceX - Math.floor(EXIT_WIDTH / 2))
  )
  for (let i = 0; i < EXIT_WIDTH; i++) {
    const ex = exitStartX + i
    if (ex >= 0 && ex < width) map[entranceY][ex] = { type: TileType.CaveExit }
  }

  // Landing area (3 wide, 2 tall) directly above the center exit tile
  carveRect(map, entranceX - 1, entranceY - 2, 3, 2)

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
  // Restore exit tiles (corridor carving may have overwritten them)
  for (let i = 0; i < EXIT_WIDTH; i++) {
    const ex = exitStartX + i
    if (ex >= 0 && ex < width) map[entranceY][ex] = { type: TileType.CaveExit }
  }

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
// Both zones persist simultaneously. Entities are tagged with EntityZone
// and remain in the shared ECS world. These functions only swap the
// active map pointer and reposition the player.

export const enterCave = (state: GameState): void => {
  // Swap to cave map
  state.map = state.caveMap
  state.mapWidth = state.caveMapWidth
  state.mapHeight = state.caveMapHeight

  // Place player one tile above the cave entrance (adjacent, not on it)
  state.player = {
    x: state.caveEntranceInterior.x,
    y: state.caveEntranceInterior.y - 1,
  }
  state.currentZone = Zone.Cave
  recordDiscovery(state, 'zone:cave')

  // Clear navigation state
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

  // Teleport coyote to cave
  transitionCoyoteToZone(state, Zone.Cave)
}

export const exitCave = (state: GameState): void => {
  // Swap to overworld map
  state.map = state.overworldMap
  state.mapWidth = state.overworldMapWidth
  state.mapHeight = state.overworldMapHeight
  state.currentZone = Zone.Overworld

  // Place player outside the 3x3 overworld hitbox (Chebyshev distance >= 2)
  state.player = findSafeExitPosition(state.caveEntranceOverworld, state.map, state.mapWidth, state.mapHeight, 2)

  // Clear navigation state
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

  // Teleport coyote to overworld
  transitionCoyoteToZone(state, Zone.Overworld)
}

export const checkTransition = (state: GameState): boolean => {
  const px = state.player.x
  const py = state.player.y

  // Overworld: 3x3 hitbox scan for CaveEntrance
  if (state.currentZone === Zone.Overworld) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (state.map[py + dy]?.[px + dx]?.type === TileType.CaveEntrance) {
          scheduleZoneTransition(state, performance.now(), {
            direction: 'enter',
            kind: 'cave',
            irisCenter: { x: px + dx, y: py + dy },
          })
          return true
        }
      }
    }
  }

  // Cave interior: step on any CaveExit tile to exit
  if (state.currentZone === Zone.Cave) {
    if (state.map[py]?.[px]?.type === TileType.CaveExit) {
      scheduleZoneTransition(state, performance.now(), {
        direction: 'exit',
        kind: 'cave',
        irisCenter: { x: px, y: py },
      })
      return true
    }
  }

  // Ruin transitions (overworld 3x3 hitbox + interior RuinExit)
  if (checkRuinTransition(state)) return true

  // Little house transitions (overworld HouseEntrance 3x3 + interior HouseExit)
  return checkHouseTransition(state)
}

// Register cave swap handlers with the zone transition module. The
// handlers are the existing enterCave / exitCave functions; they fire
// at midpoint via tickZoneTransition. Module-load side effect.
registerZoneSwapHandler('cave', 'enter', state => {
  enterCave(state)
})
registerZoneSwapHandler('cave', 'exit', state => {
  exitCave(state)
})

// ---------------------------------------------------------------------------
// Multilayer cave tile rendering
// ---------------------------------------------------------------------------

export interface CaveMultilayerArgs {
  zone: Zone
  tileType: TileType | undefined
  isPlayer: boolean
  isEntity: boolean
  hasPreview: boolean
  isHighlighted: boolean
  hasOverlay: boolean
}

const isCaveMultilayerTile = (tileType: TileType | undefined): boolean =>
  tileType === TileType.CaveWall || tileType === TileType.CaveFloor

export const shouldRenderCaveMultilayer = (args: CaveMultilayerArgs): boolean => {
  return (
    args.zone === Zone.Cave &&
    !args.isPlayer &&
    !args.isEntity &&
    !args.hasPreview &&
    !args.isHighlighted &&
    !args.hasOverlay &&
    isCaveMultilayerTile(args.tileType)
  )
}

export const getCaveTileLayers = (tileType: TileType, x: number, y: number): RuinTileLayer[] => {
  const h = tileHash(x, y)
  const { palette, chars } = STRUCTURE_REGISTRY.cave

  switch (tileType) {
    case TileType.CaveWall: {
      const layers: RuinTileLayer[] = [
        { char: chars[h % chars.length], color: palette[h % palette.length], dx: 0, dy: 0 },
        {
          char: chars[(h + 3) % chars.length],
          color: palette[(h + 2) % palette.length],
          dx: 1,
          dy: 1,
        },
      ]
      if (h % 5 < 3) {
        layers.push({ char: '·', color: palette[(h + 4) % palette.length], dx: -1, dy: 0 })
      }
      return layers
    }

    case TileType.CaveFloor: {
      const layers: RuinTileLayer[] = [
        { char: h % 3 === 0 ? '·' : '.', color: TILE_COLORS[TileType.CaveFloor], dx: 0, dy: 0 },
      ]
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

    default:
      return [{ char: '?', color: '#FFFFFF', dx: 0, dy: 0 }]
  }
}
