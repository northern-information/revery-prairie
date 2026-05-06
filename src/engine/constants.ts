import { RuinArchetype, TileType } from './types'

export const MAP_WIDTH = 147
export const MAP_HEIGHT = 147
export const SPACE_BORDER = 10
export const FONT = '16px monospace'
export const BASE_FONT_SIZE = 16
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 3.0
export const ZOOM_STEP = 0.125
export const ZOOM_DEFAULT = 1.0

// RTS-style edge-scroll: cursor within EDGE_SCROLL_ZONE_PX of any canvas edge
// pans the camera at EDGE_SCROLL_SPEED_TILES_PER_SEC tiles per second.
// 80px is a generous hitbox — easier to hit accidentally than miss.
export const EDGE_SCROLL_ZONE_PX = 80
export const EDGE_SCROLL_SPEED_TILES_PER_SEC = 18
// Width of the hot-pink "active edge" indicator line drawn when the
// cursor is in the scroll zone, so the user gets clear feedback.
export const EDGE_SCROLL_INDICATOR_THICKNESS_PX = 3

export const WATER_SAND_BORDER_MAX = 2
export const WATER_SAND_PASS_CHANCES = [100, 50]

export const CAVE_WIDTH = 40
export const CAVE_HEIGHT = 25

export const TILE_CHARS: Record<TileType, string> = {
  [TileType.Space]: ' ',
  [TileType.Dirt]: '·',
  [TileType.Clover]: '%',
  [TileType.BurntClover]: '%',
  [TileType.Sand]: ':',
  [TileType.CaveFloor]: '·',
  [TileType.CaveWall]: '#',
  [TileType.CaveBreakableWall]: '#',
  [TileType.CaveEntrance]: 'O',
  [TileType.RuinFloor]: '·',
  [TileType.RuinWall]: '#',
  [TileType.RuinEntrance]: 'O',
  [TileType.RuinAqueduct]: '~',
  [TileType.RuinAqueductBroken]: '~',
  [TileType.RuinDebris]: '░',
  [TileType.RuinDoorLocked]: '#',
  [TileType.RuinDoorOpen]: '.',
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
  [TileType.RuinFloor]: '#7A7A6E',
  [TileType.RuinWall]: '#555555',
  [TileType.RuinEntrance]: '#5FD3BC',
  [TileType.RuinAqueduct]: '#6688AA',
  [TileType.RuinAqueductBroken]: '#5A4A3A',
  [TileType.RuinDebris]: '#8B7355',
  [TileType.RuinDoorLocked]: '#5FD3BC',
  [TileType.RuinDoorOpen]: '#7A7A6E',
}

// Ruin visual palette — shared with genesis civilization rendering
export const BUILDING_CHARS = ['▓', '▒', '░', '█', '#', '+', 'H', 'T', '=']
export const CIV_COLORS = ['#666', '#777', '#888', '#999', '#AAA']

// Verdigris (copper-oxide patina) ramp used for the ruin entrance halo and
// patina overlay. Reads as bronze infrastructure bleeding into the soil.
// Ordered dark → bright; the bright end echoes TILE_COLORS[RuinEntrance].
export const VERDIGRIS_COLORS = ['#2A4A42', '#3A6B5F', '#4A7F70', '#5FA890', '#5FD3BC']

// Backdrop painted in a 3x3 footprint behind RuinEntrance tiles on the
// overworld — dark verdigris so the entrance reads as patina-stained ground
// against the warm prairie palette. Overworld-only — never painted in cave
// or ruin zones.
export const RUIN_ENTRANCE_HALO_COLOR = '#1A2E2A'

// Sparse patina chars layered over the 8 perimeter cells of the halo
// footprint. Drawn in the effect slot so they render above terrain glyphs.
export const PATINA_CHARS = ['·', ':', '+', "'", '.']

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

// projection rotates world deltas by 45°: world (vx, vy) projects to
// screen ((vx - vy) * cw, (vx + vy) * halfH). pick the glyph that matches
// the resulting on-screen slope, not the world-space slope.
export const SHOOTING_STAR_TRAIL_CHARS: Record<VelocityKey, string> = {
  '1,1': '|',
  '-1,-1': '|',
  '1,-1': '-',
  '-1,1': '-',
  '1,0': '\\',
  '-1,0': '\\',
  '0,1': '/',
  '0,-1': '/',
}

// meteor showers
export const METEOR_SHOWER_TICK_MS = 200
export const METEOR_SHOWER_MIN_INTERVAL_MS = 120_000
export const METEOR_SHOWER_MAX_INTERVAL_MS = 240_000
export const METEOR_SHOWER_STAR_COUNT_MIN = 8
export const METEOR_SHOWER_STAR_COUNT_MAX = 12
export const METEOR_SHOWER_SPAWN_WINDOW_MS = 4000

// player spawn meteor — descent target window
export const PLAYER_SPAWN_DESCENT_TARGET_MS = 2000

// meteorites
export const METEORITE_CHAR = '\u2726' // ✦ black four-pointed star
export const METEORITE_COLOR = '#FFE4B5' // moccasin — warm pale gold
export const METEORITE_GROUND_MAX = 20

// landing explosion
export const EXPLOSION_DURATION_MS = 500 // total explosion lifetime
export const EXPLOSION_RADIUS = 3 // max radius in tiles
export const EXPLOSION_CHARS = ['*', '+', '.', '\u00b7'] // particles shrink as they fade
export const EXPLOSION_COLORS = ['#FFD700', '#FFC125', '#DAA520', '#B8860B', '#8B6914'] // gold → dark gold fade

// satellites
export const SATELLITE_TICK_MS = 150 // slower than shooting stars (80ms)
export const SATELLITE_SPAWN_TICK_MS = 10_000 // check every 10s
export const SATELLITE_SPAWN_CHANCE = 0.2 // ~1 every 50s of checks → ~3-5 min avg
export const SATELLITE_MIN_SPAWN_INTERVAL_MS = 180_000 // minimum 3 min between satellites
export const SATELLITE_MAX_AGE = 500
export const SATELLITE_MIN_LENGTH = 8
export const SATELLITE_MAX_LENGTH = 12
export const SATELLITE_IMPACT_RADIUS = 2 // 5x5 zone (center ± 2)
export const SATELLITE_SOIL_DAMAGE = 30
export const SATELLITE_GOOD_PAYLOAD_CHANCE = 0.3 // 30% chance for seeds
export const SATELLITE_SEED_COUNT_MIN = 2
export const SATELLITE_SEED_COUNT_MAX = 4
export const SATELLITE_IMPACT_DURATION_MS = 800 // larger explosion
export const SATELLITE_IMPACT_RADIUS_VISUAL = 4 // visual explosion radius
export const SATELLITE_HEAD_COLORS = ['#FF4444', '#CC3333', '#AA2222'] // red palette
export const SATELLITE_TRAIL_COLORS = ['#CC3333', '#AA2222', '#882222', '#661111', '#441111'] // red fade
export const SATELLITE_SHAKE_DURATION_MS = 400
export const SATELLITE_SHAKE_AMPLITUDE = 4

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

// tick intervals
export const BEE_TICK_MS = 200
export const PATH_TICK_MS = 100
export const KEYBOARD_MOVE_TICK_MS = 100
// while sprinting, the path and keyboard-move ticks fire at this faster cadence
// with a single move per tick so every tile is a discrete stop point
export const SPRINT_MOVE_TICK_MS = 50
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
export const RAIN_FRONT_FRINGE = 8
export const RAIN_FADE_DURATION_MS = 3000
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

// movement tween (smooth tile-to-tile interpolation)
export const MOVEMENT_TWEEN_DEFAULT_MS = 100
export const MOVEMENT_TWEEN_SPRINT_MS = 50
export const BEE_CHAR = '*'
export const BEE_COLOR = '#FFD700'
export const BG_COLOR = '#1a1a1a'
export const ACTION_COLOR = '#ff69b4'
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

// glinting beams (light pouring through cloud cracks above ~30% of glinting tiles)
export const GLINT_BEAM_CHAR = '/'
export const GLINT_BEAM_LENGTH_MIN = 3
export const GLINT_BEAM_LENGTH_MAX = 5
export const GLINT_BEAM_CHANCE = 0.3 // ~30% of glinting tiles get a beam
export const GLINT_BEAM_CYCLE_MS = 1500
export const GLINT_BEAM_MAX_OPACITY = 0.4 // each beam picks a random cap in [0, this]
export const GLINT_BEAM_TAIL_OPACITY = 0.5 // bottom segment dims to this fraction of the top

// angels
export const ANGEL_SPAWN_INTERVAL_MS = 90_000 // ~90s between spawns
export const ANGEL_SPAWN_JITTER_MS = 30_000 // ±30s random jitter
export const ANGEL_LIFESPAN_MS = 120_000 // ~120s before despawn
export const ANGEL_DRIFT_TICK_MS = 2000 // slower than ghosts
export const ANGEL_DRIFT_CHANCE = 0.2 // 20% chance per tick
export const ANGEL_AURA_RADIUS = 25
export const ANGEL_BEE_SPAWN_INTERVAL_MS = 5000
export const ANGEL_BEE_MAX = 8
export const ANGEL_CLOVER_GROW_INTERVAL_MS = 3000
export const ANGEL_BODY_SIZE = 9 // 9x9 tile footprint
export const ANGEL_ANIMATION_FRAME_MS = 200
export const ANGEL_MIN_PLAYER_DIST = 30
export const ANGEL_CANTOS_MAX = 64 // 8x8 grid
export const ANGEL_AURA_KINDS = ['rain', 'bees', 'clover'] as const

// prairie halo: subtle warm glow over space tiles adjacent to land
export const PRAIRIE_HALO_RADIUS = 4 // tiles of falloff into space from nearest land
export const PRAIRIE_HALO_COLOR = '#FFC078' // muted amber, distinct from angel gold and reserved hot pink
export const PRAIRIE_HALO_MIN_ALPHA = 0.048
export const PRAIRIE_HALO_MAX_ALPHA = 0.168
export const PRAIRIE_HALO_PULSE_SPEED = 0.0015 // radians per ms; gentle breath

// deep time endgame
export const BEE_STARVATION_MS = 30_000
export const BURNT_CLOVER_RECOVERY_MS = 60_000
export const BURNT_CLOVER_RAIN_MULTIPLIER = 3
export const BEEHIVE_MIN_DISTANCE = 7
export const WEATHER_RAIN_DENSITY = 5

// rain aura animation (shared between genesis renderer and gameplay renderer)
export const RAIN_AURA_CHARS = ['|', ':', '.', ',']
export const RAIN_AURA_COLORS = ['#4466aa', '#335588', '#556699', '#445577']
export const RAIN_AURA_DENSITY = 3 // ~1 in 3 tiles has a visible raindrop
export const RAIN_AURA_SPEED = 0.008 // cycles per millisecond

export const DEEP_TIME_BURN_DURATION_MS = 5_000
export const DEEP_TIME_YEARS_PER_FRAME = 1
export const DEEP_TIME_TOTAL_YEARS = 1000
export const DEEP_TIME_LIGHTNING_COUNT = 13
export const DEEP_TIME_SHAKE_AMPLITUDE = 3 // pixels
export const DEEP_TIME_SHAKE_DURATION_MS = 200 // per-strike shake

// coyote companion
export const COYOTE_CHAR = 'C'
export const COYOTE_COLOR = '#D4A054'
export const COYOTE_TICK_MS = 150
export const COYOTE_FOLLOW_MIN_DIST = 2
export const COYOTE_FOLLOW_MAX_DIST = 3

// rts unit selection
export const MOVE_ORDER_MARKER_DURATION_MS = 500
export const UNIT_COMMAND_TICK_MS = 150
export const SELECTION_DRAG_THRESHOLD = 3 // px — minimum drag distance to start box select

// genesis-to-gameplay transition
export const GENESIS_TRANSITION_DURATION_MS = 1500
export const GENESIS_TRANSITION_SIDEBAR_DURATION_MS = 1000
export const GENESIS_TRANSITION_ACTION_BAR_DELAY_MS = 500
export const GENESIS_TRANSITION_ACTION_BAR_DURATION_MS = 800

// deep time-to-wandering transition
export const DEEP_TIME_TRANSITION_DURATION_MS = 1000
export const DEEP_TIME_TRANSITION_GLYPH_DURATION_MS = 800

// fog of war
export const CAVE_VISION_RADIUS = 3
export const RUIN_VISION_RADIUS = 3
export const FOG_EXPLORED_BRIGHTNESS = 0.4 // dimmed brightness for partiallyDiscovered tiles
export const REVERY_ILLUMINATION_RADIUS = 3 // fire/lightning reveal radius from impact point
export const DISCOVERY_RADIUS = 2 // Chebyshev distance for player-proximity full-discovery promotion

// Greek letter glyphs for overworld entrances (index 0 = cave, 1+ = ruins by ruinIndex)
export const ENTRANCE_GLYPHS = ['Ω', 'Δ', 'Φ', 'Ψ', 'Σ', 'Λ', 'Θ', 'Π', 'Ξ', 'Γ'] as const

/** Get the Greek letter for an entrance. Index 0 = cave, 1+ = ruin by ruinIndex. */
export const getEntranceGlyph = (index: number): string => ENTRANCE_GLYPHS[index % ENTRANCE_GLYPHS.length]

// monarch butterfly
export const MONARCH_CHAR = '*'
export const MONARCH_COLOR = '#FF8C00' // dark orange
export const MONARCH_SPAWN_CHANCE = 0.1 // 10% chance during rain
export const MONARCH_TICK_MS = 200 // movement tick (same as bees)
export const MONARCH_ZIGZAG_MIN = 5 // min tiles per zig-zag leg
export const MONARCH_ZIGZAG_MAX = 10 // max tiles per zig-zag leg
export const MONARCH_FLEE_RADIUS = 4 // player proximity triggers flee
export const MONARCH_SEARCH_RADIUS = 30 // tiles to search for fertile soil
export const MONARCH_SOIL_THRESHOLD_HIGH = 80 // preferred soil health
export const MONARCH_SOIL_THRESHOLD_LOW = 50 // fallback soil health
export const MONARCH_POLLINATE_MS = 5000 // ms between pollination events
export const MONARCH_SETTLE_RADIUS = 3 // wander radius when settled

export const INVENTORY_CELL_SIZE = 28

export const RUIN_ENTRY_TOASTS: Record<RuinArchetype, string> = {
  [RuinArchetype.DormantGarden]: 'A dormant garden stirs beneath the dust.',
}
