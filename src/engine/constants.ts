import { TileType } from './types'

export const MAP_WIDTH = 170
export const MAP_HEIGHT = 95
export const SPACE_BORDER = 10
export const FONT = '16px monospace'
export const BASE_FONT_SIZE = 16
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 3.0
export const ZOOM_STEP = 0.125
export const ZOOM_DEFAULT = 1.0

export const SAND_BORDER = 2

export const CAVE_WIDTH = 40
export const CAVE_HEIGHT = 25

export const TILE_CHARS: Record<TileType, string> = {
  [TileType.Space]: ' ',
  [TileType.Dirt]: '.',
  [TileType.Clover]: '%',
  [TileType.Sand]: ':',
  [TileType.CaveFloor]: '.',
  [TileType.CaveWall]: '#',
  [TileType.CaveBreakableWall]: '#',
  [TileType.CaveEntrance]: 'O',
}

export const TILE_COLORS: Record<TileType, string> = {
  [TileType.Space]: '#000',
  [TileType.Dirt]: '#8B7355',
  [TileType.Clover]: '#50C878',
  [TileType.Sand]: '#C2B280',
  [TileType.CaveFloor]: '#666666',
  [TileType.CaveWall]: '#444444',
  [TileType.CaveBreakableWall]: '#997755',
  [TileType.CaveEntrance]: '#AAAAAA',
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

// direction → trail character (keys are "dx,dy" velocity strings)
export type VelocityKey = '1,1' | '-1,-1' | '1,-1' | '-1,1' | '1,0' | '-1,0' | '0,1' | '0,-1'

export const SHOOTING_STAR_TRAIL_CHARS: Record<VelocityKey, string> = {
  '1,1': '\\',
  '-1,-1': '\\',
  '1,-1': '/',
  '-1,1': '/',
  '1,0': '-',
  '-1,0': '-',
  '0,1': '|',
  '0,-1': '|',
}

// meteor showers
export const METEOR_SHOWER_TICK_MS = 200
export const METEOR_SHOWER_MIN_INTERVAL_MS = 120_000
export const METEOR_SHOWER_MAX_INTERVAL_MS = 240_000
export const METEOR_SHOWER_STAR_COUNT_MIN = 8
export const METEOR_SHOWER_STAR_COUNT_MAX = 12
export const METEOR_SHOWER_SPAWN_WINDOW_MS = 4000

// meteorites
export const METEORITE_CHAR = '\u2726' // ✦ black four-pointed star
export const METEORITE_COLOR = '#FFE4B5' // moccasin — warm pale gold

// landing explosion
export const EXPLOSION_DURATION_MS = 500 // total explosion lifetime
export const EXPLOSION_RADIUS = 3 // max radius in tiles
export const EXPLOSION_CHARS = ['*', '+', '.', '\u00b7'] // particles shrink as they fade
export const EXPLOSION_COLORS = ['#FFD700', '#FFC125', '#DAA520', '#B8860B', '#8B6914'] // gold → dark gold fade

// meteorite pickup effect (starlight bloom)
export const PICKUP_EFFECT_DURATION_MS = 700 // total effect lifetime
export const PICKUP_EFFECT_BLOOM_MS = 400 // phase 1 (expanding ring) duration
export const PICKUP_EFFECT_RADIUS = 3 // max diamond radius in tiles
export const PICKUP_EFFECT_CHARS_RING = ['\u2726', '+', '.', '\u00b7'] // ✦ → + → . → · (ring shrinks)
export const PICKUP_EFFECT_CHARS_FILL = ['.', '+'] // shimmer interior chars
export const PICKUP_EFFECT_COLORS = ['#FFFFFF', '#E0E0FF', '#C8C8FF', '#B0B0EE', '#9999DD'] // white → soft lavender fade

// omnibox
export const OMNIBOX_WIDTH = 5
export const OMNIBOX_HEIGHT = 5

// tick intervals
export const BEE_TICK_MS = 200
export const PATH_TICK_MS = 100
export const KEYBOARD_MOVE_TICK_MS = 100
export const WEATHER_TICK_MS = 5000

// ghosts
export const GHOST_CHAR = 'ö'
export const GHOST_COLOR = '#FFFFFF'
export const GHOST_TICK_MS = 500

// crumble effect (breakable wall)
export const CRUMBLE_DURATION_MS = 600
export const CRUMBLE_CHARS = ['#', '+', '.', '\u00b7']
export const CRUMBLE_COLORS = ['#997755', '#887744', '#665522', '#554411', '#332200']

// clover ecosystem
export const CLOVER_GROWTH_TICK_MS = 4000
export const CLOVER_HIVE_TICK_MS = 10000
export const CLOVER_BASE_GROWTH_CHANCE = 0.05
export const CLOVER_BEE_GROWTH_BONUS = 0.08
export const CLOVER_MAX_GROWTH_PER_TICK = 3
export const CLOVER_HIVE_RATIO = 27
export const CLOVER_HONEY_BASE_CHANCE = 0.15
export const CLOVER_HONEY_BEE_BONUS = 0.03
export const BEEHIVE_CHAR = '\u2302' // ⌂
export const BEEHIVE_COLOR = '#DAA520'
export const CLOVER_PREVIEW_COLORS = ['#90EE90', '#78CC78', '#60AA60', '#78CC78']
export const CLOVER_PREVIEW_BLINK_SPEED = 0.003

// clover lifecycle
export const CLOVER_LIFECYCLE_TICK_MS = 3000
export const CLOVER_BROWN_DURATION_MS = 20_000
export const CLOVER_BLINK_RED_DURATION_MS = 15_000
export const CLOVER_BLACK_DURATION_MS = 10_000
export const CLOVER_DECOMPOSE_DURATION_MS = 30_000
export const CLOVER_WATER_MAX = 100
export const CLOVER_WATER_DRAIN_RATE = 2
export const CLOVER_WATER_RAIN_FILL = 15
export const CLOVER_BROWN_COLOR = '#8B6914'
export const CLOVER_DYING_COLOR_FROM = [0x8b, 0x69, 0x14] // brown (#8B6914)
export const CLOVER_DYING_COLOR_TO = [0x8b, 0x00, 0x00] // dark red (#8B0000)
export const CLOVER_DYING_OSCILLATION_SPEED = 0.002
export const CLOVER_BLACK_COLOR = '#222222'
export const CLOVER_DECOMPOSE_COLOR = '#4A3728'

// soil health
export const SOIL_HEALTH_DEFAULT = 50
export const SOIL_HEALTH_MAX = 100
export const SOIL_HEALTH_CLOVER_DEATH_BONUS = 15
export const SOIL_HEALTH_CUT_BONUS = 10

export const PLAYER_CHAR = '@'
export const PLAYER_COLOR = '#FFFFFF'
export const TRAIL_DURATION_MS = 1000
export const TRAIL_MAX_LENGTH = 20
export const BEE_CHAR = '*'
export const BEE_COLOR = '#FFD700'
export const BG_COLOR = '#1a1a1a'
export const ACTION_COLOR = '#ff69b4'
export const HOVER_PATH_COLOR = '#555555'
export const COIN_GLINTING_COLOR = '#C9B037'
export const COIN_DULL_COLOR = '#8B7D3C'
export const INVENTORY_CELL_SIZE = 28
