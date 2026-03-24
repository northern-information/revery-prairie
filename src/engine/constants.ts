import { TileType } from './types'

export const MAP_WIDTH = 170
export const MAP_HEIGHT = 95
export const WATER_BORDER = 10
export const FONT = '16px monospace'

export const SAND_BORDER = 2

export const TILE_CHARS: Record<TileType, string> = {
  [TileType.Space]: ' ',
  [TileType.Dirt]: '.',
  [TileType.Clover]: '%',
  [TileType.Sand]: ':',
}

export const TILE_COLORS: Record<TileType, string> = {
  [TileType.Space]: '#000',
  [TileType.Dirt]: '#8B7355',
  [TileType.Clover]: '#50C878',
  [TileType.Sand]: '#C2B280',
}

export const PLAYER_CHAR = '@'
export const PLAYER_COLOR = '#FFFFFF'
export const BEE_CHAR = '*'
export const BEE_COLOR = '#FFD700'
export const BG_COLOR = '#1a1a1a'
export const INVENTORY_CELL_SIZE = 28
