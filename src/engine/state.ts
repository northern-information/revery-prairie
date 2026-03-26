import { spawnShootingStarAtTarget } from './actions'
import { MAP_HEIGHT, MAP_WIDTH, SPACE_BORDER } from './constants'
import { autoSort, createOmniboxContainer, findFitPosition, placeItem } from './inventory'
import { createBackpack } from './items'
import { posKey } from './position'
import { generateTerrain } from './terrain'
import { Rotation, TileType } from './types'
import { generateWeather } from './weather'

import type { GameState, Position } from './types'

export const createGameState = (stewardName: string, viewportWidth: number, viewportHeight: number): GameState => {
  const map = generateTerrain(MAP_WIDTH, MAP_HEIGHT)
  const playerX = Math.floor(MAP_WIDTH / 2)
  const playerY = Math.floor(MAP_HEIGHT / 2)

  // Pick 7 random dirt tiles to be meteorite landing targets
  const landingTargets: Position[] = []
  const usedKeys = new Set<string>()
  const minDist = 8
  while (landingTargets.length < 7) {
    const mx = SPACE_BORDER + Math.floor(Math.random() * (MAP_WIDTH - SPACE_BORDER * 2))
    const my = SPACE_BORDER + Math.floor(Math.random() * (MAP_HEIGHT - SPACE_BORDER * 2))
    const key = posKey(mx, my)
    if (usedKeys.has(key)) continue
    if (map[my][mx].type !== TileType.Dirt) continue
    if (Math.abs(mx - playerX) + Math.abs(my - playerY) < minDist) continue
    usedKeys.add(key)
    landingTargets.push({ x: mx, y: my })
  }

  const backpack = createBackpack()
  placeItem(backpack, 'bee', Rotation.R0, 0, 0)
  placeItem(backpack, 'bee', Rotation.R0, 1, 0)
  placeItem(backpack, 'bee', Rotation.R0, 2, 0)
  placeItem(backpack, 'clover', Rotation.R0, 0, 1)
  placeItem(backpack, 'clover', Rotation.R0, 1, 1)
  placeItem(backpack, 'clover', Rotation.R0, 2, 1)
  placeItem(backpack, 'permacomputer', Rotation.R0, 0, 2)

  const state: GameState = {
    stewardName,
    map,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    player: { x: playerX, y: playerY },
    backpack,
    openContainer: null,
    playerFacing: 'down',
    facingOmniboxPos: null,
    camera: {
      x: playerX - Math.floor(viewportWidth / 2),
      y: playerY - Math.floor(viewportHeight / 2),
    },
    viewportWidth,
    viewportHeight,
    bees: [],
    shootingStars: [],
    meteorites: [],
    explosions: [],
    meteoritePickupEffects: [],
    groundItems: [],
    groundOmniboxes: [],
    characters: [],
    activeDialog: null,
    omniboxContainers: new Map(),
    nextOmniboxNumber: 1,
    discoveredRecipes: new Set<string>(),
    previewFn: null,
    weather: generateWeather(),
    path: null,
    pendingAction: null,
    cursorTile: null,
    cursorScreenPos: null,
    rainSeed: Math.floor(Math.random() * 2147483647),
    metric: true,
  }

  // Place Gron near the player
  const gronX = playerX + 5
  const gronY = playerY
  if (map[gronY][gronX].type === TileType.Dirt || map[gronY][gronX].type === TileType.Clover) {
    state.characters.push({ definitionId: 'gron', pos: { x: gronX, y: gronY }, aura: 'rain' })
  } else {
    // Fallback: ensure tile is dirt then place
    map[gronY][gronX] = { type: TileType.Dirt }
    state.characters.push({ definitionId: 'gron', pos: { x: gronX, y: gronY }, aura: 'rain' })
  }

  // Place an omnibox in the backpack
  const omniboxFit = findFitPosition(backpack, 'omnibox')
  if (omniboxFit) {
    const omniboxItem = placeItem(backpack, 'omnibox', omniboxFit.rotation, omniboxFit.gridX, omniboxFit.gridY)
    if (omniboxItem) {
      createOmniboxContainer(state, omniboxItem.uid)
    }
  }
  autoSort(backpack)

  // Spawn 7 shooting stars from the top-right aimed at dirt tiles
  for (const target of landingTargets) {
    spawnShootingStarAtTarget(state, target, { dx: -1, dy: 1 })
  }

  return state
}
