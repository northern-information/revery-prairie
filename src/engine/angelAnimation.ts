import { ANGEL_ANIMATION_FRAME_MS, ANGEL_BODY_SIZE } from './constants'
import { tileHash } from './position'

import type { Position } from './types'

/**
 * Angel animation system.
 *
 * Each angel is rendered as a 9x9 ASCII figure inspired by Ezekiel's
 * descriptions: wheels within wheels, many eyes, wings, halos.
 *
 * Kaleidoscopic symmetry: all cells mirror on both axes. The template
 * is generated in the top-left quadrant only, then mirrored to the
 * other three quadrants. Chars and colors are generated once per
 * source cell and copied to all mirrors, so the visual is perfectly
 * kaleidoscopic.
 *
 * Different structural roles (eyes, wheels, wings, halos, structure)
 * are placed in different zones of the quadrant for variety — eyes
 * near center, wheels in a ring, wings at edges, halos at corners,
 * structure in gaps. The result is skeletal and organic, not blocky.
 */

// Character palettes by structural role
const EYE_CHARS = ['O', 'o', '0', '@', '*']
const WING_CHARS = ['~', '^', 'v', '>', '<']
const WHEEL_CHARS = ['@', '*', 'o', '+', '#']
const HALO_CHARS = ['-', '=', '~', '\u00b7'] // · at end
const STRUCTURE_CHARS = ['|', '+', '{', '}', '(', ')']
const VOID_CHAR = ' '

// Mirror maps for glyph reflection across axes
const H_MIRROR: Record<string, string> = { '<': '>', '>': '<', '{': '}', '}': '{', '(': ')', ')': '(' }
const V_MIRROR: Record<string, string> = { '^': 'v', v: '^' }

const mirrorH = (c: string): string => H_MIRROR[c] ?? c
const mirrorV = (c: string): string => V_MIRROR[c] ?? c

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

/**
 * Generate a base pattern template for an angel.
 *
 * Only the top-left quadrant (including center row/column) is
 * generated. All cells are quad-mirrored for full kaleidoscopic
 * symmetry. Returns a flat role grid.
 */
const generateTemplate = (seed: number): number[][] => {
  const rng = mulberry32(seed)
  const S = ANGEL_BODY_SIZE
  const roles: number[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => 0))
  // 0 = void, 1 = eye, 2 = wing, 3 = wheel, 4 = halo, 5 = structure

  const cx = Math.floor(S / 2)
  const cy = Math.floor(S / 2)

  const setQuad = (y: number, x: number, role: number): void => {
    roles[y][x] = role
    roles[y][S - 1 - x] = role
    roles[S - 1 - y][x] = role
    roles[S - 1 - y][S - 1 - x] = role
  }

  // --- Central eye ---
  roles[cy][cx] = 1

  // --- Face eyes: 2-4 pairs near center ---
  const faceEyes = 2 + Math.floor(rng() * 3)
  for (let i = 0; i < faceEyes; i++) {
    const dx = Math.floor(rng() * 2) + 1 // 1-2 from center
    const dy = Math.floor(rng() * 2) + 1
    const ex = cx - dx
    const ey = cy - dy
    if (ey >= 0 && ex >= 0) {
      setQuad(ey, ex, 1)
    }
  }

  // --- Wheel ring around center ---
  const wheelRadius = 1 + Math.floor(rng() * 2) // 1-2
  for (let dy = -wheelRadius; dy <= wheelRadius; dy++) {
    for (let dx = -wheelRadius; dx <= wheelRadius; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy)
      if (dist === wheelRadius || dist === wheelRadius - 1) {
        const wy = cy + dy
        const wx = cx + dx
        if (wy >= 0 && wy < S && wx >= 0 && wx < S && roles[wy][wx] === 0) {
          roles[wy][wx] = 3
        }
      }
    }
  }

  // --- Wings: sparse, near edges of the top-left quadrant ---
  for (let y = 0; y <= cy; y++) {
    for (let x = 0; x <= cx; x++) {
      if (roles[y][x] !== 0) continue
      const edgeDist = Math.min(x, y)
      if (edgeDist <= 1 && rng() < 0.35) {
        setQuad(y, x, 2)
      }
    }
  }

  // --- Halos: top/left edge of quadrant, very sparse ---
  for (let y = 0; y <= cy; y++) {
    for (let x = 0; x <= cx; x++) {
      if (roles[y][x] !== 0) continue
      if ((y === 0 || x === 0) && rng() < 0.4) {
        setQuad(y, x, 4)
      }
    }
  }

  // --- Structure: scattered in remaining gaps, very sparse ---
  for (let y = 0; y <= cy; y++) {
    for (let x = 0; x <= cx; x++) {
      if (roles[y][x] !== 0) continue
      if (rng() < 0.1) {
        setQuad(y, x, 5)
      }
    }
  }

  return roles
}

/**
 * Pick char and color for a role, applying eye-blink variation.
 */
const pickCharColor = (role: number, rng: () => number, variation: number): { char: string; color: string } => {
  switch (role) {
    case 1: {
      const char = variation < 0.1 ? '.' : pickFrom(EYE_CHARS, rng)
      return { char, color: pickFrom(['#FFFFFF', '#FFE4B5', '#F0E68C'], rng) }
    }
    case 2:
      return { char: pickFrom(WING_CHARS, rng), color: pickFrom(['#E8E8FF', '#B0C4DE', '#DDA0DD'], rng) }
    case 3:
      return { char: pickFrom(WHEEL_CHARS, rng), color: pickFrom(['#FFE4B5', '#F0E68C', '#FFD700'], rng) }
    case 4:
      return { char: pickFrom(HALO_CHARS, rng), color: pickFrom(['#FFFFFF', '#FFE4B5', '#FFFFAA'], rng) }
    case 5:
      return { char: pickFrom(STRUCTURE_CHARS, rng), color: pickFrom(ANGEL_COLORS, rng) }
    default:
      return { char: VOID_CHAR, color: '#FFFFFF' }
  }
}

/**
 * Generate a single animation frame from a template.
 *
 * Only generates chars/colors for the top-left quadrant (including
 * center row/column), then mirrors to all four quadrants.
 */
const generateFrame = (template: number[][], seed: number, frameIndex: number): AngelFrame => {
  const S = ANGEL_BODY_SIZE
  const rng = mulberry32(seed + frameIndex * 7919)
  const chars: string[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => VOID_CHAR))
  const colors: string[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => '#FFFFFF'))

  const cx = Math.floor(S / 2)
  const cy = Math.floor(S / 2)

  // Generate top-left quadrant (including center row/column), mirror to all four
  for (let y = 0; y <= cy; y++) {
    for (let x = 0; x <= cx; x++) {
      const role = template[y][x]
      if (role === 0) continue

      const cellSeed = tileHash(x + frameIndex * 3, y + seed) % 1000
      const variation = cellSeed / 1000
      const { char, color } = pickCharColor(role, rng, variation)

      const mx = S - 1 - x
      const my = S - 1 - y

      chars[y][x] = char
      colors[y][x] = color
      chars[y][mx] = mirrorH(char)
      colors[y][mx] = color
      chars[my][x] = mirrorV(char)
      colors[my][x] = color
      chars[my][mx] = mirrorH(mirrorV(char))
      colors[my][mx] = color
    }
  }

  return { chars, colors }
}

// Cache templates per seed to avoid regenerating every frame
const templateCache = new Map<number, number[][]>()

const getTemplate = (seed: number): number[][] => {
  let template = templateCache.get(seed)
  if (!template) {
    template = generateTemplate(seed)
    templateCache.set(seed, template)
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
