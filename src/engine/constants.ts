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

export const SAND_BORDER = 1
export const WATER_SAND_BORDER_MAX = 2
export const WATER_SAND_PASS_CHANCES = [100, 50]

export const CAVE_WIDTH = 40
export const CAVE_HEIGHT = 25

export const TILE_CHARS: Record<TileType, string> = {
  [TileType.Space]: ' ',
  [TileType.Dirt]: '.',
  [TileType.Clover]: '%',
  [TileType.BurntClover]: '%',
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
  [TileType.BurntClover]: '#3D2B1F',
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

// lightning
export const LIGHTNING_TICK_MS = 10_000
export const LIGHTNING_BASE_CHANCE = 0.002
export const LIGHTNING_DURATION_MS = 800
export const LIGHTNING_FLASH_MS = 100
export const LIGHTNING_SCREEN_FLASH_MS = 150
export const LIGHTNING_SCREEN_FLASH_OPACITY = 0.3
export const LIGHTNING_BOLT_MIN_LENGTH = 8
export const LIGHTNING_BOLT_MAX_LENGTH = 12
export const LIGHTNING_BRANCH_CHANCE = 0.3
export const LIGHTNING_BOLT_COLOR_BRIGHT = '#FFFFFF'
export const LIGHTNING_BOLT_COLOR_MID = '#E0E0FF'
export const LIGHTNING_BOLT_COLOR_DIM = '#8888CC'
export const LIGHTNING_IMPACT_CHARS = ['*', '+', '.']
export const LIGHTNING_IMPACT_COLORS = ['#FFFFFF', '#FFFFAA', '#FFDD66', '#CC9933']
export const LIGHTNING_MIN_PLAYER_DIST = 3

// lightning targeting weights
export const LIGHTNING_WEIGHT_ELEVATION = 2.0
export const LIGHTNING_WEIGHT_NEAR_WATER = 1.5
export const LIGHTNING_WEIGHT_METAL = 3.0
export const LIGHTNING_WEIGHT_ISOLATED = 1.8
export const LIGHTNING_WEIGHT_CLOVER = 1.3
export const LIGHTNING_WEIGHT_STRIKE_HISTORY = 0.5
export const LIGHTNING_NEAR_WATER_RADIUS = 3
export const LIGHTNING_ISOLATED_RADIUS = 2
export const LIGHTNING_ISOLATED_CLOVER_THRESHOLD = 0.4
export const LIGHTNING_TARGET_SAMPLE_SIZE = 50

// lightning revery
export const LIGHTNING_REVERY_RANGE = 20
export const LIGHTNING_RETICLE_CYCLE_MS = 120
export const LIGHTNING_RETICLE_CHARS = ['|', '/', '\\', '~']
export const LIGHTNING_INVALID_TARGET_CHAR = 'X'
export const LIGHTNING_INVALID_TARGET_COLOR = '#CC4444'
export const LIGHTNING_RANGE_HIGHLIGHT_COLOR = '#222233'

// wildfire
export const WILDFIRE_DURATION_MS = 1500
export const WILDFIRE_MAX_SPREAD = 15
export const FIRE_REVERY_MAX_SPREAD = 7
export const WILDFIRE_DRY_THRESHOLD = 30
export const WILDFIRE_CHARS = ['^', '~', '*']
export const WILDFIRE_COLORS = ['#FF4500', '#FF6347', '#FFD700', '#FF8C00']

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
export const WATER_MAX = 100
export const WATER_DRAIN_RATE = 0.25
export const WATER_RAIN_FILL = 15
export const WATER_PROXIMITY_RADIUS = 8
export const WATER_PROXIMITY_FILL = 3
export const RAIN_FRONT_WIDTH = 30
export const RAIN_FRONT_SPEED = 2
export const DIRT_COLORS = ['#8B7355', '#7B6B55', '#806B50', '#8A6D48', '#756252']
export const BURN_SCAR_COLORS = ['#3D2B1F', '#4A3728', '#352418']
export const WATER_COLORS = ['#4466AA', '#335588', '#556699']
export const SAND_COLORS = ['#C2B280', '#B8A870', '#C8B888', '#BCA868', '#C4BC90']
export const RIVER_COLOR = '#6688BB'
export const POND_COLOR = '#5577AA'
export const CLOVER_HEALTHY_COLORS = ['#2E8B57', '#3CB371', '#50C878']
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
export const SOIL_HEALTH_WATER_REVERY_BONUS = 10
export const SOIL_HEALTH_FIRE_REVERY_BONUS = 25
export const WATER_REVERY_FILL = 50

// earth revery (soil scan)
export const EARTH_SCAN_EXPAND_MS = 1500
export const EARTH_SCAN_HOLD_MS = 2500
export const EARTH_SCAN_FADE_MS = 1500
export const EARTH_SCAN_RADIUS = 20
// red → green gradient (0 = depleted, 100 = thriving)
export const EARTH_SCAN_COLOR_LOW = '#FF3333' // red — depleted
export const EARTH_SCAN_COLOR_HIGH = '#33CC33' // green — thriving

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

// glinting zones
export const GLINT_ZONE_CHARS = ['\u00b7', '\u2726', '+', '.'] // · ✦ + .
export const GLINT_ZONE_COLORS = ['#C9B037', '#DAA520', '#B8A870', '#FFE4B5']
export const GLINT_ZONE_DENSITY = 5 // ~1 in 5 tiles shows a sparkle
export const GLINT_ZONE_SPEED = 0.003 // slow sparkle animation
export const GLINT_ZONE_COUNT = 8 // number of glinting zone patches
export const GLINT_ZONE_RADIUS_MIN = 2
export const GLINT_ZONE_RADIUS_MAX = 4
export const GLINT_ZONE_FADE_IN_MS = 30_000
export const GLINT_ZONE_HOLD_MS = 60_000
export const GLINT_ZONE_FADE_OUT_MS = 30_000
export const GLINT_ZONE_DRIFT_MS = 10_000
export const GLINT_ZONE_SPAWN_MS = 15_000
export const GLINT_ZONE_TICK_MS = 5_000

// angels
export const ANGEL_SPAWN_INTERVAL_MS = 90_000 // ~90s between spawns
export const ANGEL_SPAWN_JITTER_MS = 30_000 // ±30s random jitter
export const ANGEL_LIFESPAN_MS = 120_000 // ~120s before despawn
export const ANGEL_DRIFT_TICK_MS = 2000 // slower than ghosts
export const ANGEL_DRIFT_CHANCE = 0.1 // 10% chance per tick — very slow
export const ANGEL_AURA_RADIUS = 25
export const ANGEL_BEE_SPAWN_INTERVAL_MS = 5000
export const ANGEL_BEE_MAX = 8
export const ANGEL_CLOVER_GROW_INTERVAL_MS = 3000
export const ANGEL_BODY_SIZE = 8 // 8x8 tile footprint
export const ANGEL_ANIMATION_FRAME_MS = 200
export const ANGEL_MIN_PLAYER_DIST = 30
export const ANGEL_CANTOS_MAX = 64 // 8x8 grid
export const ANGEL_AURA_KINDS = ['rain', 'bees', 'clover'] as const

// deep time endgame
export const BEE_STARVATION_MS = 30_000
export const BURNT_CLOVER_RECOVERY_MS = 60_000
export const BURNT_CLOVER_RAIN_MULTIPLIER = 3
export const BEEHIVE_MIN_DISTANCE = 7
export const WEATHER_RAIN_DENSITY = 5
export const DEEP_TIME_BURN_DURATION_MS = 5_000
export const DEEP_TIME_YEARS_PER_FRAME = 1
export const DEEP_TIME_TOTAL_YEARS = 1000

export const INVENTORY_CELL_SIZE = 28
