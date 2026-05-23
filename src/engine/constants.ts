import { TileType } from './types'

export const MAP_WIDTH = 147
export const MAP_HEIGHT = 147
export const SPACE_BORDER = 10
// Native 32px monospace — no zoom upscale. An earlier iteration rendered
// at 16px and applied a 2x zoom, which produced pixelated glyphs on
// retina. 32x1 = same on-screen tile footprint, crisp text.
export const FONT = '32px monospace'
export const BASE_FONT_SIZE = 32
// Genesis renders the full 147x147 prairie zoomed out at this smaller
// font size. Gameplay always uses BASE_FONT_SIZE.
export const GENESIS_FONT_SIZE = 8

export const WATER_SAND_BORDER_MAX = 2
export const WATER_SAND_PASS_CHANCES = [100, 50]

export const CAVE_WIDTH = 40
export const CAVE_HEIGHT = 25

export const TILE_CHARS: Record<TileType, string> = {
  [TileType.Space]: ' ',
  [TileType.Dirt]: '·',
  [TileType.Flora]: '%',
  [TileType.BurntFlora]: '%',
  [TileType.Sand]: ':',
  [TileType.CaveFloor]: '·',
  [TileType.CaveWall]: '#',
  [TileType.CaveBreakableWall]: '#',
  [TileType.CaveEntrance]: 'O',
  [TileType.CaveApron]: '·',
  [TileType.CaveExit]: '█',
  [TileType.RuinFloor]: '·',
  [TileType.RuinWall]: '#',
  [TileType.RuinEntrance]: 'O',
  [TileType.RuinApron]: '·',
  [TileType.RuinExit]: '█',
  [TileType.RuinAqueduct]: '~',
  [TileType.RuinAqueductBroken]: '~',
  [TileType.RuinDebris]: '░',
  [TileType.RuinDoorLocked]: '#',
  [TileType.RuinDoorOpen]: '.',
  // Egregore tiles render their per-position glyph at draw time via
  // EGREGORE_GLYPHS in src/engine/egregore.ts. The fallback character
  // here is shown if the renderer can't resolve a per-position glyph
  // for any reason.
  [TileType.Egregore]: '?',
  // Little house (precis #33). HouseEntrance uses Greek lowercase
  // alpha — complements the cave's omega-shaped entrance glyph.
  // Fireplace is sampled from FIREPLACE_CHARS at FIRE_TICK_MS cadence
  // in the renderer; this fallback is rarely shown.
  [TileType.HouseEntrance]: 'α',
  [TileType.HouseApron]: '·',
  [TileType.HouseFloor]: '·',
  [TileType.HouseWall]: '#',
  // Bed and chair render as floor glyphs — furniture identity lives on
  // the tile type alone, not the on-screen character.
  [TileType.HouseBed]: '·',
  [TileType.HouseChair]: '·',
  [TileType.Fireplace]: '^',
  // Hearth — stone slab in front of the fireplace, walkable.
  [TileType.HouseHearth]: '·',
  [TileType.HouseExit]: '█',
}

export const TILE_COLORS: Record<TileType, string> = {
  [TileType.Space]: '#000',
  [TileType.Dirt]: '#8B7355',
  [TileType.Flora]: '#50C878',
  [TileType.BurntFlora]: '#3D2B1F',
  [TileType.Sand]: '#C2B280',
  [TileType.CaveFloor]: '#666666',
  [TileType.CaveWall]: '#444444',
  [TileType.CaveBreakableWall]: '#997755',
  [TileType.CaveEntrance]: '#AAAAAA',
  [TileType.CaveApron]: '#6B7080',
  [TileType.CaveExit]: '#ff69b4',
  [TileType.RuinFloor]: '#7A7A6E',
  [TileType.RuinWall]: '#555555',
  [TileType.RuinEntrance]: '#5FD3BC',
  [TileType.RuinApron]: '#6B5E47',
  [TileType.RuinExit]: '#ff69b4',
  [TileType.RuinAqueduct]: '#6688AA',
  [TileType.RuinAqueductBroken]: '#5A4A3A',
  [TileType.RuinDebris]: '#8B7355',
  [TileType.RuinDoorLocked]: '#5FD3BC',
  [TileType.RuinDoorOpen]: '#7A7A6E',
  // Egregore glyph color — iridescent violet. Off-spectrum from the
  // Earth-native palette (clover green #50C878, dirt browns, flora
  // hues): the doctrine calls the egregores "not-of-this-Earth" and
  // the color should read as alien but vital, not as ruined machinery.
  // Sits between the magenta wildflower (#D85FB7) and the cooler
  // ruin-aqueduct (#6688AA) without colliding with either.
  [TileType.Egregore]: '#B080D0',
  // Little house (precis #33). Warm browns through the structure; the
  // exit reuses the existing pink-door idiom (CaveExit / RuinExit also
  // use `#ff69b4` — reserved user-action color per CLAUDE.md).
  [TileType.HouseEntrance]: '#7A5A38',
  [TileType.HouseApron]: '#5A4128',
  [TileType.HouseFloor]: '#6B4A2B',
  [TileType.HouseWall]: '#4A2F1B',
  // Bed and chair use the same floor color so the glyph reads as floor;
  // furniture identity is encoded only in the tile type.
  [TileType.HouseBed]: '#6B4A2B',
  [TileType.HouseChair]: '#6B4A2B',
  [TileType.Fireplace]: '#FF8C42',
  // Hearth — slightly darker than floor; reads as worn stone slab.
  [TileType.HouseHearth]: '#7A5A38',
  [TileType.HouseExit]: '#ff69b4',
}

// Ruin visual palette — shared with genesis civilization rendering
export const BUILDING_CHARS = ['▓', '▒', '░', '█', '#', '+', 'H', 'T', '=']
export const CIV_COLORS = ['#666', '#777', '#888', '#999', '#AAA']

// Cave visual palette — cool slate-blues, distinct from the warm ruin
// CIV_COLORS so a glance reads structure type. Sourced by the cave
// entry in STRUCTURE_REGISTRY (src/engine/structures.ts).
export const CAVE_WALL_COLORS = ['#5A6470', '#646E7A', '#6E7884', '#788290', '#82909C']
export const CAVE_BUILDING_CHARS = ['▓', '▒', '░', '#', '+']

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

// meteor showers — cardinal schedule
// One shower per cardinal phase per year: spring equinox (0.0),
// summer solstice (0.25), autumn equinox (0.5), winter solstice (0.75).
// No intermittent showers between anchors.
export const METEOR_SHOWER_TICK_MS = 200
export const METEOR_SHOWER_ANCHORS = [0.0, 0.25, 0.5, 0.75] as const
// Jitter applied to all shower anchors so they don't feel metronomic.
// 0.01 of a year ≈ 12s with SEASONAL_PHASE_PERIOD_MS = 20min.
export const METEOR_SHOWER_JITTER_PHASE = 0.01
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
// Radial elevation falloff for impact craters. Subtracted from existing
// elevation, clamped to [0, 100]. Center drops ~one tier on the 4-tier
// scale (tierSize = 25), giving a visible bowl without an ejecta rim.
export const SATELLITE_CRATER_DEPTH_CENTER = 25
export const SATELLITE_CRATER_DEPTH_RING = 10
export const SATELLITE_CRATER_DEPTH_EDGE = 3
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

// wildfire
export const WILDFIRE_DURATION_MS = 1500
export const WILDFIRE_MAX_SPREAD = 15
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

// click-target feedback (pink "pop and fade" on the destination tile of a
// click-to-move). Drawn at the 'effect' slot so it composites above terrain
// but below screen overlays.
export const CLICK_TARGET_DURATION_MS = 400
export const CLICK_TARGET_POP_MS = 80
export const CLICK_TARGET_COLOR = '#ff69b4'

// tick intervals
export const BEE_TICK_MS = 200
export const PATH_TICK_MS = 100
export const KEYBOARD_MOVE_TICK_MS = 100
// while sprinting, the path and keyboard-move ticks fire at this faster cadence
// with a single move per tick so every tile is a discrete stop point
export const SPRINT_MOVE_TICK_MS = 50
export const WEATHER_TICK_MS = 5000

// phenological seasons (precis #2): full year cycles every SEASONAL_PHASE_PERIOD_MS
// of wall-clock overworld time. each of the four seasons gets a quarter of that
// (~5 minutes per season at the default 20-minute year). state.seasonalPhase is a
// fractional position in [0, 1) that advances only when the player is in the
// overworld zone; cave/ruin time does not advance the prairie's calendar.
export const SEASONAL_PHASE_PERIOD_MS = 20 * 60 * 1000

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

// Genesis post-process flora patch seeding (precis #1). After the
// epoch chain runs and stamps clover, genesis scatters a handful of
// wildflower (Echinacea purpurea) and tall grass (Andropogon gerardii)
// patches across walkable dirt tiles. Determinism is preserved because
// both passes consume the same nameToSeed PRNG via sim.rng.
export const GENESIS_WILDFLOWER_PATCH_COUNT_MIN = 6
export const GENESIS_WILDFLOWER_PATCH_COUNT_MAX = 10
export const GENESIS_TALL_GRASS_PATCH_COUNT_MIN = 6
export const GENESIS_TALL_GRASS_PATCH_COUNT_MAX = 10
export const GENESIS_FLORA_PATCH_TILES_MIN = 2
export const GENESIS_FLORA_PATCH_TILES_MAX = 4

// Egregore tile placement (precis #8a). The post-process places a small
// fixed number of inert egregore tiles biased near crater positions. The
// total target stays in the [MIN, MAX] range — placement failures (no
// reachable dirt within bias radius) reduce the count but do not crash.
export const GENESIS_EGREGORE_TILE_COUNT_MIN = 2
export const GENESIS_EGREGORE_TILE_COUNT_MAX = 4
// Bias radius around crater positions. The post-process picks
// crater-adjacent dirt within this Chebyshev distance preferentially,
// then falls back to any walkable dirt if no crater-adjacent candidates
// remain.
export const GENESIS_EGREGORE_BIAS_RADIUS = 5

// soil health
export const SOIL_HEALTH_DEFAULT = 50
export const SOIL_HEALTH_MAX = 100
export const SOIL_HEALTH_FLORA_DEATH_BONUS = 15
export const SOIL_HEALTH_CUT_BONUS = 10
export const SOIL_HEALTH_BURN_BONUS = 25

// red → green gradient (0 = depleted, 100 = thriving)
export const EARTH_SCAN_COLOR_LOW = '#FF3333' // red — depleted
export const EARTH_SCAN_COLOR_HIGH = '#33CC33' // green — thriving

export const PLAYER_CHAR = '@'
export const PLAYER_COLOR = '#FFFFFF'
export const TRAIL_DURATION_MS = 2000
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
// Minimum number of land tiles a glint patch must cover. Spawn candidates
// and drift destinations that fall below this are rejected — keeps stray
// 1- and 2-tile slivers off the map at coastlines and peninsulas.
export const GLINT_PATCH_MIN_TILES = 5
// Pop animation duration (ms) for a coin transitioning unglinted→glinted
// in the inventory. Inventory cells gate the pop animation on
// now - popTime &lt; COIN_POP_DURATION_MS.
export const COIN_POP_DURATION_MS = 500
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
export const ANGEL_DRIFT_CHANCE = 1.0 // step every tick — combines with the 2s slide for near-continuous motion
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

// Snow render constants (precis #2). Snow falls slower than rain and
// uses round / dot glyphs in white-grey. Density is sparser so the
// scene reads as snowfall, not a blizzard whiteout.
export const SNOW_AURA_CHARS = ['*', '.', '·', '✦']
export const SNOW_AURA_COLORS = ['#F0F4F8', '#D8DCE0', '#BCC0C4', '#E8ECF0']
export const SNOW_AURA_SPEED = 0.003 // ~1/3 the rain speed — slower drift
export const WEATHER_SNOW_DENSITY = 8 // ~1 in 8 tiles has a flake visible

export const DEEP_TIME_BURN_DURATION_MS = 5_000
export const DEEP_TIME_YEARS_PER_FRAME = 1
export const DEEP_TIME_TOTAL_YEARS = 1000
export const DEEP_TIME_LIGHTNING_COUNT = 13
export const DEEP_TIME_SHAKE_AMPLITUDE = 3 // pixels
export const DEEP_TIME_SHAKE_DURATION_MS = 200 // per-strike shake

// precis #4 — the Revery. Compressed-time observation phase. See
// docs/claude/revery.md for the full phase machine and rationale.
// Smaller than DEEP_TIME_YEARS_PER_FRAME (1) — the Revery passes through
// a single winter, not a millennium. ~60 frames/sec * ~0.005 years/frame
// at this rate yields ~3.3 seconds of wall-clock for one full year.
export const REVERY_YEARS_PER_FRAME = 0.005
// Cooldown between Reveries. SEASONAL_PHASE_PERIOD_MS = one full year of
// overworld time; subsequent Reveries can't fire more than once per year.
export const REVERY_COOLDOWN_MS = SEASONAL_PHASE_PERIOD_MS
// How often the camera shifts during Observing. Stable cadence keeps the
// drift feeling ceremonial rather than chaotic.
export const REVERY_CAMERA_DRIFT_INTERVAL_MS = 800
// Precis #32 — dormancy pressure linear ramp endpoints in seasonalPhase
// space. Pressure floor = clamp01((seasonalPhase - START) / (END - START))
// when state.weather.season === Season.Autumn. Ramp reaches ceiling at
// the winter solstice, guaranteeing the Revery within a year.
export const REVERY_PRESSURE_RAMP_START = 0.5 // autumn equinox
export const REVERY_PRESSURE_RAMP_END = 0.75 // winter solstice
// First-Revery hardcoded egregoric advance per v3 doctrine 8a section.
export const FIRST_REVERY_EGREGORE_COUNT = 3
// Ordered axes the phenotype label rotates through, by reveryCount %
// PHENOTYPE_AXES.length. Order is the trait-bag insertion order in #3.
export const PHENOTYPE_AXES = [
  'bloomTiming',
  'coldTolerance',
  'droughtResponse',
  'pollinatorPreference',
] as const

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

// deep time-to-wandering transition
export const DEEP_TIME_TRANSITION_DURATION_MS = 1000
export const DEEP_TIME_TRANSITION_GLYPH_DURATION_MS = 800

// zone transition (overworld <-> cave/ruin): crossfade with a title hold.
// Total duration = fade-in + hold + fade-out. The deferred map swap
// fires at the midpoint of the hold, fully under cover of the black
// overlay so the swap is invisible.
export const ZONE_TRANSITION_FADE_IN_MS = 700
export const ZONE_TRANSITION_HOLD_MS = 2000
export const ZONE_TRANSITION_FADE_OUT_MS = 700
export const ZONE_TRANSITION_DURATION_MS =
  ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS + ZONE_TRANSITION_FADE_OUT_MS

// fog of war
export const CAVE_VISION_RADIUS = 3
export const RUIN_VISION_RADIUS = 3
export const FOG_EXPLORED_BRIGHTNESS = 0.4 // dimmed brightness for partiallyDiscovered tiles
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

// Precis #6 — hold-to-scan duration (ms). Releasing [v] before this elapses
// aborts the scan; releasing at or after commits.
export const SCAN_DURATION_MS = 1500

// Precis #17 — wildflower spread. Pollinator-gated rhizome-style growth via
// the species-agnostic spread engine. Rates are derived from clover: ~0.6x
// CLOVER_BASE_GROWTH_CHANCE so wildflower expands slower than clover even
// when pollinators are abundant. Playtest-tunable.
export const WILDFLOWER_BASE_GROWTH_CHANCE = 0.03
export const WILDFLOWER_MAX_GROWTH_PER_TICK = 2

// Precis #17 — tall grass spread. Pollinator-independent rhizome growth.
// Slowest of the three species — ~0.3x CLOVER_BASE_GROWTH_CHANCE — because
// it spreads in any conditions and would otherwise dominate the prairie.
export const TALLGRASS_BASE_GROWTH_CHANCE = 0.015
export const TALLGRASS_MAX_GROWTH_PER_TICK = 2

// Precis #17 — bee+clover ceremony wave. The combine produces a slow
// ceremonial radial wave that paints clover with jittered boundaries
// via cellNoise. Single-cast; the wave is hard-bounded at radius 13
// and is removed from state.activeWaves on the tick currentRadius
// exceeds maxRadius.
export const CEREMONY_WAVE_RADIUS = 13
export const CEREMONY_WAVE_TICK_MS = 250

// Precis #17 — bee pollen bag (PollenBag ECS component). LIFO eviction
// when full; cross-species mixing allowed. Bees empty their bag when
// within Chebyshev-1 of a beehive.
export const POLLEN_BAG_CAPACITY = 4

// Precis #17 — pollen burst TimedEffect. Spawned 2-4 per tick on the
// leading annulus of an active ceremony wave. Fades over this duration.
export const POLLEN_BURST_DURATION_MS = 600

// Little house (precis #33). 30 x 18 deterministic interior. Fireplace
// glyph cycles through FIREPLACE_CHARS at FIRE_TICK_MS; color alternates
// between FIREPLACE_COLOR_A (orange) and FIREPLACE_COLOR_B (yellow) on
// the same cadence.
export const HOUSE_WIDTH = 15
export const HOUSE_HEIGHT = 9
export const FIRE_TICK_MS = 200
export const FIREPLACE_CHARS = ['^', '~', '*'] as const
export const FIREPLACE_COLOR_A = '#FF8C42'
export const FIREPLACE_COLOR_B = '#FFD56B'

