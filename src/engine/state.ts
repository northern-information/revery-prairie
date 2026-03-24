import { MAP_HEIGHT, MAP_WIDTH } from './constants'
import { autoSort, placeItem } from './inventory'
import { createBackpack } from './items'
import { generateTerrain } from './terrain'
import { Rotation } from './types'
import { generateWeather } from './weather'

import type { GameState } from './types'

export const createGameState = (stewardName: string, viewportWidth: number, viewportHeight: number): GameState => {
  const map = generateTerrain(MAP_WIDTH, MAP_HEIGHT)
  const playerX = Math.floor(MAP_WIDTH / 2)
  const playerY = Math.floor(MAP_HEIGHT / 2)

  const backpack = createBackpack()
  placeItem(backpack, 'bee', Rotation.R0, 0, 0)
  placeItem(backpack, 'bee', Rotation.R0, 1, 0)
  placeItem(backpack, 'bee', Rotation.R0, 2, 0)
  placeItem(backpack, 'clover', Rotation.R0, 0, 1)
  placeItem(backpack, 'clover', Rotation.R0, 1, 1)
  placeItem(backpack, 'clover', Rotation.R0, 2, 1)
  placeItem(backpack, 'soil_sampler', Rotation.R0, 3, 0)
  autoSort(backpack)

  return {
    stewardName,
    map,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    player: { x: playerX, y: playerY },
    backpack,
    openContainer: null,
    camera: {
      x: playerX - Math.floor(viewportWidth / 2),
      y: playerY - Math.floor(viewportHeight / 2),
    },
    viewportWidth,
    viewportHeight,
    bees: [],
    groundItems: [],
    discoveredRecipes: new Set<string>(),
    previewFn: null,
    weather: generateWeather(),
    path: null,
    pendingAction: null,
  }
}
