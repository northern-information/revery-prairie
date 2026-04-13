import { ANGEL_ANIMATION_FRAME_MS, ANGEL_BODY_SIZE } from './constants'
import { tileHash } from './position'

import type { Position } from './types'

/**
 * Angel animation system.
 *
 * Each angel is rendered as a 9x9 ASCII figure inspired by Ezekiel's
 * descriptions: wheels within wheels, many eyes, wings, halos.
 *
 * Kaleidoscopic symmetry: strong bilateral symmetry on both axes,
 * but not quadrilateral. Y-axis (left-right) governs wings and
 * structure. X-axis (top-bottom) governs halos. The face and wheel
 * are quad-symmetric since they're radial. Chars and colors mirror
 * along the same axes as the template roles — mirrored cells always
 * show the same glyph and color.
 *
 * The animation is procedurally varied per-angel using a seed derived
 * from spawn position. No two angels look identical. The frame cycles
 * through multiple patterns at ~200ms per frame.
 */

// Character palettes by structural role
const EYE_CHARS = ['O', 'o', '0', '@', '*']
const WING_CHARS = ['~', '^', 'v', '>', '<']
const WHEEL_CHARS = ['@', '*', 'o', '+', '#']
const HALO_CHARS = ['-', '=', '~', '\u00b7'] // · at end
const STRUCTURE_CHARS = ['|', '+', '{', '}', '(', ')']
const VOID_CHAR = ' '

// Color palettes — ethereal, shifting
const ANGEL_COLORS = [
  '#FFFFFF', // white
  '#E8E8FF', // pale blue-white
  '#FFE4B5', // warm gold
  '#B0C4DE', // steel blue
  '#DDA0DD', // plum
  '#F0E68C', // khaki gold
  '#C0C0C0', // silver
  '#98FB98', // pale green
]

interface AngelFrame {
  chars: string[][]
  colors: string[][]
}

// Seeded PRNG for deterministic per-angel variation
const mulberry32 = (seed: number): (() => number) => {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pickFrom = <T>(arr: readonly T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)]

// Symmetry axis tags stored per-cell so frame generation mirrors correctly
const SYM_QUAD = 0 // mirror both axes (face, wheel)
const SYM_LR = 1 // mirror left-right only (wings, structure)
const SYM_TB = 2 // mirror top-bottom only (halos)

/**
 * Generate a base pattern template for an angel.
 *
 * Returns both the role grid and a symmetry-axis grid so that
 * generateFrame knows which axes to mirror chars/colors along.
 */
const generateTemplate = (seed: number): { roles: number[][]; symmetry: number[][] } => {
  const rng = mulberry32(seed)
  const S = ANGEL_BODY_SIZE
  const roles: number[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => 0))
  const symmetry: number[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => -1))
  // roles: 0 = void, 1 = eye, 2 = wing, 3 = wheel, 4 = halo, 5 = structure

  const cx = Math.floor(S / 2)
  const cy = Math.floor(S / 2)

  const setQuad = (y: number, x: number, role: number): void => {
    const mx = S - 1 - x
    const my = S - 1 - y
    roles[y][x] = role
    roles[y][mx] = role
    roles[my][x] = role
    roles[my][mx] = role
    symmetry[y][x] = SYM_QUAD
    symmetry[y][mx] = SYM_QUAD
    symmetry[my][x] = SYM_QUAD
    symmetry[my][mx] = SYM_QUAD
  }

  const setLR = (y: number, x: number, role: number): void => {
    roles[y][x] = role
    roles[y][S - 1 - x] = role
    symmetry[y][x] = SYM_LR
    symmetry[y][S - 1 - x] = SYM_LR
  }

  const setTB = (y: number, x: number, role: number): void => {
    roles[y][x] = role
    roles[S - 1 - y][x] = role
    symmetry[y][x] = SYM_TB
    symmetry[S - 1 - y][x] = SYM_TB
  }

  // --- Central face (quad-symmetric) ---
  roles[cy][cx] = 1
  symmetry[cy][cx] = SYM_QUAD
  const faceEyes = 2 + Math.floor(rng() * 3) // 2-4 quad-mirrored eye groups
  for (let i = 0; i < faceEyes; i++) {
    const dx = Math.floor(rng() * 2) + 1 // 1-2 from center
    const dy = Math.floor(rng() * 2) + 1 // 1-2 from center
    const ex = cx - dx
    const ey = cy - dy
    if (ey >= 0 && ex >= 0) {
      setQuad(ey, ex, 1)
    }
  }

  // --- Central wheel (quad-symmetric) ---
  const wheelRadius = 1 + Math.floor(rng() * 2) // 1-2
  for (let dy = -wheelRadius; dy <= wheelRadius; dy++) {
    for (let dx = -wheelRadius; dx <= wheelRadius; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy)
      if (dist === wheelRadius || dist === wheelRadius - 1) {
        const wy = cy + dy
        const wx = cx + dx
        if (wy >= 0 && wy < S && wx >= 0 && wx < S && roles[wy][wx] === 0) {
          roles[wy][wx] = 3
          symmetry[wy][wx] = SYM_QUAD
        }
      }
    }
  }

  // --- Wings: LR-only, sparser for organic feel ---
  for (let y = 0; y < S; y++) {
    for (let x = 0; x <= cx; x++) {
      if (roles[y][x] !== 0) continue
      const edgeDistX = Math.min(x, S - 1 - x)
      // Distance from center row — wings taper toward poles
      const distFromCenter = Math.abs(y - cy)
      const wingChance = edgeDistX <= 1 ? 0.45 - distFromCenter * 0.04 : 0
      if (wingChance > 0 && rng() < wingChance) {
        setLR(y, x, 2)
      }
    }
  }

  // --- Halos: TB-only, top/bottom edge emphasis ---
  for (let y = 0; y <= cy; y++) {
    for (let x = 0; x < S; x++) {
      if (roles[y][x] !== 0) continue
      const edgeDistY = Math.min(y, S - 1 - y)
      if (edgeDistY <= 1 && rng() < 0.5) {
        setTB(y, x, 4)
      }
    }
  }

  // --- Structure: LR-only, very sparse for breathing room ---
  for (let y = 0; y < S; y++) {
    for (let x = 0; x <= cx; x++) {
      if (roles[y][x] !== 0) continue
      if (rng() < 0.15) {
        setLR(y, x, 5)
      }
    }
  }

  return { roles, symmetry }
}

/**
 * Pick char and color for a role, applying eye-blink variation.
 */
const pickCharColor = (
  role: number,
  rng: () => number,
  variation: number
): { char: string; color: string } => {
  switch (role) {
    case 1: {
      // eye
      const char = variation < 0.1 ? '.' : pickFrom(EYE_CHARS, rng)
      return { char, color: pickFrom(['#FFFFFF', '#FFE4B5', '#F0E68C'], rng) }
    }
    case 2: // wing
      return { char: pickFrom(WING_CHARS, rng), color: pickFrom(['#E8E8FF', '#B0C4DE', '#DDA0DD'], rng) }
    case 3: // wheel
      return { char: pickFrom(WHEEL_CHARS, rng), color: pickFrom(['#FFE4B5', '#F0E68C', '#FFD700'], rng) }
    case 4: // halo
      return { char: pickFrom(HALO_CHARS, rng), color: pickFrom(['#FFFFFF', '#FFE4B5', '#FFFFAA'], rng) }
    case 5: // structure
      return { char: pickFrom(STRUCTURE_CHARS, rng), color: pickFrom(ANGEL_COLORS, rng) }
    default:
      return { char: VOID_CHAR, color: '#FFFFFF' }
  }
}

/**
 * Generate a single animation frame from a template.
 *
 * Chars and colors are generated at the "source" position only,
 * then copied to mirrored positions so the visual mirrors exactly.
 */
const generateFrame = (
  template: { roles: number[][]; symmetry: number[][] },
  seed: number,
  frameIndex: number
): AngelFrame => {
  const S = ANGEL_BODY_SIZE
  const rng = mulberry32(seed + frameIndex * 7919)
  const chars: string[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => VOID_CHAR))
  const colors: string[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => '#FFFFFF'))
  const filled: boolean[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => false))

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (filled[y][x]) continue
      const role = template.roles[y][x]
      if (role === 0) continue

      const sym = template.symmetry[y][x]
      const cellSeed = tileHash(x + frameIndex * 3, y + seed) % 1000
      const variation = cellSeed / 1000
      const { char, color } = pickCharColor(role, rng, variation)

      // Place at source
      chars[y][x] = char
      colors[y][x] = color
      filled[y][x] = true

      // Mirror according to symmetry axis
      const mx = S - 1 - x
      const my = S - 1 - y

      if (sym === SYM_QUAD) {
        chars[y][mx] = char
        colors[y][mx] = color
        filled[y][mx] = true
        chars[my][x] = char
        colors[my][x] = color
        filled[my][x] = true
        chars[my][mx] = char
        colors[my][mx] = color
        filled[my][mx] = true
      } else if (sym === SYM_LR) {
        chars[y][mx] = char
        colors[y][mx] = color
        filled[y][mx] = true
      } else if (sym === SYM_TB) {
        chars[my][x] = char
        colors[my][x] = color
        filled[my][x] = true
      }
    }
  }

  return { chars, colors }
}

// Cache templates per seed to avoid regenerating every frame
const templateCache = new Map<number, { roles: number[][]; symmetry: number[][] }>()

const getTemplate = (seed: number): { roles: number[][]; symmetry: number[][] } => {
  let template = templateCache.get(seed)
  if (!template) {
    template = generateTemplate(seed)
    templateCache.set(seed, template)
    // Keep cache bounded
    if (templateCache.size > 20) {
      const firstKey = templateCache.keys().next().value
      if (firstKey !== undefined) templateCache.delete(firstKey)
    }
  }
  return template
}

// Frame cache: seed + frameIndex -> AngelFrame
const frameCache = new Map<string, AngelFrame>()

const getFrame = (seed: number, frameIndex: number): AngelFrame => {
  const key = `${String(seed)}:${String(frameIndex)}`
  let frame = frameCache.get(key)
  if (!frame) {
    const template = getTemplate(seed)
    frame = generateFrame(template, seed, frameIndex)
    frameCache.set(key, frame)
    // Keep cache bounded
    if (frameCache.size > 100) {
      const firstKey = frameCache.keys().next().value
      if (firstKey !== undefined) frameCache.delete(firstKey)
    }
  }
  return frame
}

const FRAME_COUNT = 6

/**
 * Get the current animation frame for an angel.
 *
 * Returns an array of { pos, char, color } entries for each non-void
 * cell in the angel's 9x9 body.
 */
export const getAngelRenderData = (
  seed: number,
  anchorX: number,
  anchorY: number,
  time: number
): { pos: Position; char: string; color: string }[] => {
  const frameIndex = Math.floor(time / ANGEL_ANIMATION_FRAME_MS) % FRAME_COUNT
  const frame = getFrame(seed, frameIndex)
  const result: { pos: Position; char: string; color: string }[] = []

  for (let y = 0; y < ANGEL_BODY_SIZE; y++) {
    for (let x = 0; x < ANGEL_BODY_SIZE; x++) {
      const char = frame.chars[y][x]
      if (char === VOID_CHAR) continue
      result.push({
        pos: { x: anchorX + x, y: anchorY + y },
        char,
        color: frame.colors[y][x],
      })
    }
  }

  return result
}
