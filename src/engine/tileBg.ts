import { tileHash } from './position'
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
  [TileType.Dirt]: [
    '#4A3D2F',
    '#473A2D',
    '#4D4031',
    '#443A2D',
    '#4F4133',
    '#48402F',
    '#4B3D2D',
    '#463A2C',
  ],
  [TileType.Clover]: [
    '#224F30',
    '#1F4D2E',
    '#255231',
    '#234E2F',
    '#205030',
    '#26542F',
    '#214D2E',
    '#244F31',
  ],
  [TileType.BurntClover]: ['#1A0F0A', '#1D110B', '#180D08', '#1B0E0A', '#170C08', '#1C100B'],
  [TileType.Sand]: ['#6E5F3F', '#6B5C3D', '#71623F', '#6D5E3E', '#6A5B3D', '#705F3E', '#6E5D3D'],
  [TileType.CaveFloor]: [
    '#2A2A2A',
    '#2C2C2C',
    '#282828',
    '#2B2B2B',
    '#292929',
    '#2D2D2D',
    '#272727',
  ],
  [TileType.CaveWall]: ['#1A1A1A', '#1B1B1B', '#191919', '#1C1C1C', '#181818'],
  [TileType.CaveBreakableWall]: ['#3D2E1F', '#3F3022', '#3B2C1D', '#402F20', '#3C2D1E', '#3E2E1F'],
  [TileType.CaveEntrance]: ['#4A4A4A', '#4D4D4D', '#484848', '#4C4C4C', '#494949'],
  [TileType.RuinFloor]: ['#2D2D26', '#2F2F28', '#2C2C25', '#2E2E27', '#2B2B24'],
  [TileType.RuinWall]: ['#1F1F1F', '#212121', '#1D1D1D', '#202020', '#1E1E1E'],
  [TileType.RuinEntrance]: ['#1F4D45', '#1E4C44', '#205047', '#214D45'],
  [TileType.RuinAqueduct]: ['#2A3D4F', '#2C3F50', '#283C4D', '#2B3E50'],
  [TileType.RuinAqueductBroken]: ['#221C16', '#241D17', '#201B15', '#231D17'],
  [TileType.RuinDebris]: ['#3F3326', '#412F25', '#3D3025', '#403326', '#3E3125'],
  [TileType.RuinDoorLocked]: ['#1F4D45', '#1E4C44', '#205047'],
  [TileType.RuinDoorOpen]: ['#2D2D26', '#2F2F28', '#2C2C25'],
}

export const getTileBgColor = (tileType: TileType, x: number, y: number): string => {
  const palette = TILE_BG_PALETTES[tileType]
  return palette[tileHash(x, y) % palette.length]
}

// Multiply each RGB channel of a 6-digit hex color by `factor`. Used for
// directional wall shading: the lit side keeps factor close to 1 (lightly
// darkened) and the shadow side uses a smaller factor (more darkening).
// Returns a 6-digit hex string.
export const darkenColor = (hex: string, factor: number): string => {
  const r = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor)))
  const g = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor)))
  const b = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor)))
  const toHex = (n: number): string => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Wall shading factors. Iso projection makes both side faces visible;
// directional light from the upper-left makes the left face lit and the
// right face shadowed. Tunable.
export const WALL_LEFT_SHADE = 0.78
export const WALL_RIGHT_SHADE = 0.55
