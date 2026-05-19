import { tileHash } from './position'
import { getStructurePlatformLift, STRUCTURE_REGISTRY } from './structures'
import { TileType } from './types'

// Per-tile background color palettes. Each palette is a small set of
// colors darker than the corresponding TILE_COLORS glyph for that
// surface, so glyphs read as foliage / marks ON the surface. Per-tile
// pseudorandom selection via tileHash gives stable variation that
// doesn't flicker between frames.
//
// Space is included for type-completeness but the renderer's tile-bg
// pre-pass skips space tiles — they continue to render as twinkling
// stars on the canvas BG_COLOR.
export const TILE_BG_PALETTES: Record<TileType, readonly string[]> = {
  [TileType.Space]: ['#000000'],
  [TileType.Dirt]: ['#4A3D2F', '#473A2D', '#4D4031', '#443A2D', '#4F4133', '#48402F', '#4B3D2D', '#463A2C'],
  [TileType.Flora]: ['#224F30', '#1F4D2E', '#255231', '#234E2F', '#205030', '#26542F', '#214D2E', '#244F31'],
  [TileType.BurntFlora]: ['#1A0F0A', '#1D110B', '#180D08', '#1B0E0A', '#170C08', '#1C100B'],
  [TileType.Sand]: ['#6E5F3F', '#6B5C3D', '#71623F', '#6D5E3E', '#6A5B3D', '#705F3E', '#6E5D3D'],
  [TileType.CaveFloor]: ['#2A2A2A', '#2C2C2C', '#282828', '#2B2B2B', '#292929', '#2D2D2D', '#272727'],
  [TileType.CaveWall]: ['#1A1A1A', '#1B1B1B', '#191919', '#1C1C1C', '#181818'],
  [TileType.CaveBreakableWall]: ['#3D2E1F', '#3F3022', '#3B2C1D', '#402F20', '#3C2D1E', '#3E2E1F'],
  [TileType.CaveEntrance]: ['#4A4A4A', '#4D4D4D', '#484848', '#4C4C4C', '#494949'],
  [TileType.CaveApron]: ['#2E3640', '#303842', '#2C343E', '#2F3741', '#2D3540'],
  [TileType.CaveExit]: ['#4A4A4A', '#4D4D4D', '#484848', '#4C4C4C', '#494949'],
  [TileType.RuinFloor]: ['#2D2D26', '#2F2F28', '#2C2C25', '#2E2E27', '#2B2B24'],
  [TileType.RuinWall]: ['#1F1F1F', '#212121', '#1D1D1D', '#202020', '#1E1E1E'],
  [TileType.RuinEntrance]: ['#1F4D45', '#1E4C44', '#205047', '#214D45'],
  [TileType.RuinApron]: ['#3A3225', '#3C3427', '#383023', '#3B3326', '#392F22'],
  [TileType.RuinExit]: ['#1F4D45', '#1E4C44', '#205047', '#214D45'],
  [TileType.RuinAqueduct]: ['#2A3D4F', '#2C3F50', '#283C4D', '#2B3E50'],
  [TileType.RuinAqueductBroken]: ['#221C16', '#241D17', '#201B15', '#231D17'],
  [TileType.RuinDebris]: ['#3F3326', '#412F25', '#3D3025', '#403326', '#3E3125'],
  [TileType.RuinDoorLocked]: ['#1F4D45', '#1E4C44', '#205047'],
  [TileType.RuinDoorOpen]: ['#2D2D26', '#2F2F28', '#2C2C25'],
  // Egregore bg — slightly cooler than dirt so the off-key glyph reads
  // distinctly without dominating the prairie palette. Reads as
  // "something here is wrong with the soil" rather than as a feature.
  [TileType.Egregore]: ['#2C2D33', '#2D2E34', '#2A2B30', '#2E2F35', '#2B2C32'],
}

export const getTileBgColor = (tileType: TileType, x: number, y: number): string => {
  const palette = TILE_BG_PALETTES[tileType]
  return palette[tileHash(x, y) % palette.length]
}

// Water has no TileType — it lives in state.rivers / state.ponds (and
// genesis's sim.riverPaths / sim.ponds plus the elevation-based lowland
// water predicate). The bg fill needs its own palette so water tiles
// don't render as brown dirt under blue water glyphs. Palettes are
// slightly desaturated/darkened RIVER_COLOR / POND_COLOR variants so the
// blue glyphs ('~', '=', '-') still read as foliage on the water.
export const RIVER_BG_PALETTE: readonly string[] = ['#3A557F', '#3D5985', '#37527B', '#405E8A', '#385479']

export const POND_BG_PALETTE: readonly string[] = ['#2F4870', '#324B73', '#2C456D', '#354E76', '#304770']

export const getRiverBgColor = (x: number, y: number): string =>
  RIVER_BG_PALETTE[tileHash(x, y) % RIVER_BG_PALETTE.length]

export const getPondBgColor = (x: number, y: number): string => POND_BG_PALETTE[tileHash(x, y) % POND_BG_PALETTE.length]

// Satellite craters live as a state.craters Set keyed by posKey rather
// than as a TileType, so they need their own bg palette overlay. Each
// entry is the corresponding TileType.Dirt palette color multiplied by
// 0.80, so cratered ground reads as a subtly darker depression beneath
// the reddish-brown BUILDING_CHARS glyph.
export const CRATER_BG_PALETTE: readonly string[] = [
  '#3B3126',
  '#392E24',
  '#3E3327',
  '#362E24',
  '#3F3429',
  '#3A3326',
  '#3C3124',
  '#382E23',
]

export const getCraterBgColor = (x: number, y: number): string =>
  CRATER_BG_PALETTE[tileHash(x, y) % CRATER_BG_PALETTE.length]

// Multiply each RGB channel of a 6-digit hex color by `factor`. Used for
// directional wall shading: the lit side keeps factor close to 1 (lightly
// darkened) and the shadow side uses a smaller factor (more darkening).
// Returns a 6-digit hex string.
//
// Memoized via a two-level Map (hex → factor → result). The input space is
// finite (~80 palette colors × 2 shade factors), so the cache stays small.
// Two-level lookup avoids allocating a composite key string on cache hits.
const _darkenCache = new Map<string, Map<number, string>>()

export const darkenColor = (hex: string, factor: number): string => {
  let factorMap = _darkenCache.get(hex)
  if (factorMap !== undefined) {
    const cached = factorMap.get(factor)
    if (cached !== undefined) return cached
  } else {
    factorMap = new Map()
    _darkenCache.set(hex, factorMap)
  }
  const r = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor)))
  const g = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor)))
  const b = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor)))
  const toHex = (n: number): string => n.toString(16).padStart(2, '0')
  const result = `#${toHex(r)}${toHex(g)}${toHex(b)}`
  factorMap.set(factor, result)
  return result
}

// Wall shading factors. Iso projection makes both side faces visible;
// directional light from the upper-left makes the left face lit and
// the right face shadowed. Walls only render at tier transitions (see
// ELEVATION_TIER_COUNT below) so strong shading does not produce a
// per-tile diamond grid — only honest cliff faces between plateaus.
export const WALL_LEFT_SHADE = 0.78
export const WALL_RIGHT_SHADE = 0.55

// Discrete elevation tiers ("Minecraft" style): each tile snaps to a
// tier index 0..ELEVATION_TIER_COUNT-1 based on its raw elevation, and
// the visual lift is tier * ELEVATION_TIER_LIFT_PX. Every tile renders
// as a discrete cube — all four cardinal directions get a small wall
// (`CUBE_BASE_DEPTH_PX` deep) so each tile reads as a physical block;
// at tier transitions the wall extends down by the full tier delta to
// produce a visible cliff face.
//
// Tunable: more tiers → more variation. Larger lift per tier → more
// dramatic cliffs. Larger CUBE_BASE_DEPTH_PX → chunkier cubes (but the
// per-tile cube edges become more prominent).
export const ELEVATION_TIER_COUNT = 4
export const ELEVATION_TIER_LIFT_PX = 6
// Must exceed ~ch/2 (half the diamond height) for the cube edge to peek
// out below the next-row tile's diamond top in painter's order. Below
// that threshold, the wall is fully covered by the next row and the
// cube is invisible on a flat plateau. 8px gives a clear cube edge at
// typical font sizes (charHeight ≈ 14).
export const CUBE_BASE_DEPTH_PX = 8

// Overworld-only platform lift constants for ruin entrances. Sourced
// from STRUCTURE_REGISTRY.ruin so this module and the registry can't
// drift. Re-exported here for back-compat with callers that still read
// the named constants directly.
export const RUIN_APRON_LIFT_PX = STRUCTURE_REGISTRY.ruin.apronLiftPx
export const RUIN_ENTRANCE_LIFT_PX = STRUCTURE_REGISTRY.ruin.entranceLiftPx

export const getElevationTier = (elevation: number | undefined): number => {
  if (elevation === undefined) return 0
  const tierSize = 100 / ELEVATION_TIER_COUNT
  const tier = Math.floor(elevation / tierSize)
  return Math.max(0, Math.min(ELEVATION_TIER_COUNT - 1, tier))
}

export const getTierLift = (tier: number): number => -tier * ELEVATION_TIER_LIFT_PX

// Duration (in ms) of the cosmetic tier-to-tier lift tween used by the
// genesis renderer. Shared between the diamond pass and the cube-wall
// pass so they always agree on a tile's current rendered lift. Lives
// here, beside the tier/lift API, so both pass implementations import
// from a single location. A value of 0 makes the tween degenerate to
// the un-tweened renderer (see clamp on u-value in genesisRenderer).
export const TIER_TWEEN_DURATION_MS = 400

// Standard ease-in-out cubic curve. Pure math helper colocated with the
// tween duration so the genesis renderer reads both from one module.
export const easeInOutCubic = (t: number): number => {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Re-export from structures.ts so callers that imported this from
// tileBg keep working. The registry is the single source of truth.
export { getStructurePlatformLift }

// Vertical sink (in pixels, positive = down) applied to water tiles
// (rivers and ponds in gameplay; rivers, ponds, and lowland water in
// genesis) so water always reads as a depression below the surrounding
// dirt. Set to half a tier lift so the surface looks meaningfully sunk
// without dropping below the next-lower tier's plateau. Applied to the
// diamond bg fill, the glyph anchor, and (via lift accessors) the wall
// depth math so the cube wall facing water grows taller by exactly this
// amount.
export const WATER_SINK_PX = Math.round(ELEVATION_TIER_LIFT_PX / 2)

// Constant Y offset (in pixels, negative = up) applied to angel body
// pixels on top of their tile's pyLift, so the multi-glyph body always
// floats above the tallest possible terrain cube on the map. Equal to
// the maximum tier lift so an angel body over a tier-3 plateau still
// reads as floating, not embedded.
export const ANGEL_FLOAT_LIFT_PX = (ELEVATION_TIER_COUNT - 1) * ELEVATION_TIER_LIFT_PX
