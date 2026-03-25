import { TileType } from './types'

export const MAP_WIDTH = 170
export const MAP_HEIGHT = 95
export const SPACE_BORDER = 10
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

// shooting stars
export const SHOOTING_STAR_TICK_MS = 80
export const SHOOTING_STAR_SPAWN_TICK_MS = 2000
export const SHOOTING_STAR_SPAWN_CHANCE = 0.15 // ~1 every 13s
export const SHOOTING_STAR_LAND_CHANCE = 0.08 // ~1 in 12 stars lands
export const SHOOTING_STAR_MAX_AGE = 300
export const SHOOTING_STAR_MIN_LENGTH = 3
export const SHOOTING_STAR_MAX_LENGTH = 6
export const SHOOTING_STAR_MAX_ACTIVE = 5

export const SHOOTING_STAR_HEAD_CHAR = '*'
export const SHOOTING_STAR_HEAD_COLOR = '#FFFFFF'
export const SHOOTING_STAR_TRAIL_COLORS = ['#CCC', '#999', '#666', '#444', '#222']

// direction → trail character
export const SHOOTING_STAR_TRAIL_CHARS: Record<string, string> = {
  '1,1': '\\',
  '-1,-1': '\\',
  '1,-1': '/',
  '-1,1': '/',
  '1,0': '-',
  '-1,0': '-',
  '0,1': '|',
  '0,-1': '|',
}

// meteorites
export const METEORITE_CHAR = '\u2726' // ✦ black four-pointed star
export const METEORITE_COLOR = '#FFE4B5' // moccasin — warm pale gold

// landing explosion
export const EXPLOSION_DURATION_MS = 500 // total explosion lifetime
export const EXPLOSION_RADIUS = 3 // max radius in tiles
export const EXPLOSION_CHARS = ['*', '+', '.', '\u00b7'] // particles shrink as they fade
export const EXPLOSION_COLORS = ['#FFD700', '#FFC125', '#DAA520', '#B8860B', '#8B6914'] // gold → dark gold fade

// omnibox
export const OMNIBOX_WIDTH = 5
export const OMNIBOX_HEIGHT = 5

export const PLAYER_CHAR = '@'
export const PLAYER_COLOR = '#FFFFFF'
export const BEE_CHAR = '*'
export const BEE_COLOR = '#FFD700'
export const BG_COLOR = '#1a1a1a'
export const INVENTORY_CELL_SIZE = 28
