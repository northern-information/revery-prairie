import { ANGEL_ANIMATION_FRAME_MS, ANGEL_BODY_SIZE } from './constants'
import { tileHash } from './position'

import type { Position } from './types'

/**
 * Angel animation system.
 *
 * Each angel is rendered as a 9x9 ASCII figure inspired by Ezekiel's
 * descriptions: wheels within wheels, many eyes, wings, halos.
 *
 * Strong bilateral symmetry on both axes, but not quadrilateral.
 * Y-axis symmetry (left-right mirror) governs wings and structure.
 * X-axis symmetry (top-bottom mirror) governs halos. Each axis
 * contributes different structural roles so the angel reads
 * differently horizontally vs vertically. The face and central
 * wheel use quad symmetry since they're radial by nature.
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

/**
 * Mirror a cell left-right (Y-axis symmetry).
 */
const mirrorLR = (template: number[][], y: number, x: number, role: number, S: number): void => {
  template[y][x] = role
  template[y][S - 1 - x] = role
}

/**
 * Mirror a cell top-bottom (X-axis symmetry).
 */
const mirrorTB = (template: number[][], y: number, x: number, role: number, S: number): void => {
  template[y][x] = role
  template[S - 1 - y][x] = role
}

/**
 * Generate a base pattern template for an angel.
 *
 * Strong bilateral symmetry on both axes, but NOT quadrilateral.
 * Y-axis (left-right) is generated first on the left half and mirrored.
 * X-axis (top-bottom) is generated separately on the top half and mirrored.
 * Each axis contributes different structural roles so the angel reads
 * differently horizontally vs vertically.
 *
 * Face (eyes) is centered at (cx, cy) and uses full quad symmetry
 * since a face should be symmetric in all directions.
 */
const generateTemplate = (seed: number): number[][] => {
  const rng = mulberry32(seed)
  const S = ANGEL_BODY_SIZE
  const template: number[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => 0))
  // 0 = void, 1 = eye, 2 = wing, 3 = wheel, 4 = halo, 5 = structure

  const cx = Math.floor(S / 2)
  const cy = Math.floor(S / 2)

  // --- Central face (quad-symmetric — a face should be) ---
  template[cy][cx] = 1 // center eye
  const faceEyes = 2 + Math.floor(rng() * 3) // 2-4 eye pairs
  for (let i = 0; i < faceEyes; i++) {
    const dx = Math.floor(rng() * 2) + 1 // 1-2 from center
    const dy = Math.floor(rng() * 2) + 1 // 1-2 from center
    const ex = cx - dx
    const ey = cy - dy
    if (ey >= 0 && ex >= 0) {
      // Quad mirror for face eyes
      template[ey][ex] = 1
      template[ey][S - 1 - ex] = 1
      template[S - 1 - ey][ex] = 1
      template[S - 1 - ey][S - 1 - ex] = 1
    }
  }

  // --- Central wheel (quad-symmetric — radial structure) ---
  const wheelRadius = 1 + Math.floor(rng() * 2) // 1-2
  for (let dy = -wheelRadius; dy <= wheelRadius; dy++) {
    for (let dx = -wheelRadius; dx <= wheelRadius; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy) // manhattan
      if (dist === wheelRadius || dist === wheelRadius - 1) {
        const wy = cy + dy
        const wx = cx + dx
        if (wy >= 0 && wy < S && wx >= 0 && wx < S && template[wy][wx] === 0) {
          template[wy][wx] = 3
        }
      }
    }
  }

  // --- Y-axis layer: wings on left/right edges, mirrored LR only ---
  // Generate on left half, mirror right. NOT mirrored top-bottom.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x <= cx; x++) {
      if (template[y][x] !== 0) continue
      const edgeDistX = Math.min(x, S - 1 - x)
      if (edgeDistX <= 1 && rng() < 0.6) {
        mirrorLR(template, y, x, 2, S)
      }
    }
  }

  // --- X-axis layer: halos on top/bottom rows, mirrored TB only ---
  // Generate on top half, mirror bottom. NOT mirrored left-right.
  for (let y = 0; y <= cy; y++) {
    for (let x = 0; x < S; x++) {
      if (template[y][x] !== 0) continue
      const edgeDistY = Math.min(y, S - 1 - y)
      if (edgeDistY <= 1 && rng() < 0.65) {
        mirrorTB(template, y, x, 4, S)
      }
    }
  }

  // --- Structure: fill remaining voids with LR symmetry ---
  // Gives a vertical spine feel without top-bottom repetition
  for (let y = 0; y < S; y++) {
    for (let x = 0; x <= cx; x++) {
      if (template[y][x] !== 0) continue
      if (rng() < 0.3) {
        mirrorLR(template, y, x, 5, S)
      }
    }
  }

  return template
}

/**
 * Generate a single animation frame from a template.
 * Frame index and seed determine which specific chars/colors are picked.
 */
const generateFrame = (template: number[][], seed: number, frameIndex: number): AngelFrame => {
  const S = ANGEL_BODY_SIZE
  const rng = mulberry32(seed + frameIndex * 7919) // different seed per frame
  const chars: string[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => VOID_CHAR))
  const colors: string[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => '#FFFFFF'))

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const role = template[y][x]
      if (role === 0) continue

      // Add per-cell variation using tile hash + frame
      const cellSeed = tileHash(x + frameIndex * 3, y + seed) % 1000
      const variation = cellSeed / 1000

      switch (role) {
        case 1: // eye
          chars[y][x] = pickFrom(EYE_CHARS, rng)
          // Eyes blink — occasionally show void
          if (variation < 0.1) chars[y][x] = '.'
          colors[y][x] = pickFrom(['#FFFFFF', '#FFE4B5', '#F0E68C'], rng)
          break
        case 2: // wing
          chars[y][x] = pickFrom(WING_CHARS, rng)
          colors[y][x] = pickFrom(['#E8E8FF', '#B0C4DE', '#DDA0DD'], rng)
          break
        case 3: // wheel
          chars[y][x] = pickFrom(WHEEL_CHARS, rng)
          colors[y][x] = pickFrom(['#FFE4B5', '#F0E68C', '#FFD700'], rng)
          break
        case 4: // halo
          chars[y][x] = pickFrom(HALO_CHARS, rng)
          colors[y][x] = pickFrom(['#FFFFFF', '#FFE4B5', '#FFFFAA'], rng)
          break
        case 5: // structure
          chars[y][x] = pickFrom(STRUCTURE_CHARS, rng)
          colors[y][x] = pickFrom(ANGEL_COLORS, rng)
          break
      }
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
