import { markTileDirty } from './tileBgCache'
import type { GameState, Tile } from './types'

export const setMapTile = (state: GameState, x: number, y: number, tile: Tile): void => {
  state.map[y][x] = tile
  markTileDirty(state.map, x, y)
}
