import { ANGEL_ANIMATION_FRAME_MS, ANGEL_BODY_SIZE } from './constants'
import { tileHash } from './position'

import type { Position } from './types'

/**
 * Angel animation system.
 *
 * Each angel is rendered as an 8x8 ASCII figure inspired by Ezekiel's
 * descriptions: wheels within wheels, many eyes, wings, halos.
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
 * Generate a base pattern template for an angel.
 * This creates the structural layout — which cells are eyes, wings,
 * wheels, halos, structure, or empty.
 */
const generateTemplate = (seed: number): number[][] => {
  const rng = mulberry32(seed)
  const S = ANGEL_BODY_SIZE
  const template: number[][] = Array.from({ length: S }, () => Array.from({ length: S }, () => 0))
  // 0 = void, 1 = eye, 2 = wing, 3 = wheel, 4 = halo, 5 = structure

  const cx = Math.floor(S / 2)
  const cy = Math.floor(S / 2)

  // Central wheel (ring of wheel chars)
  const wheelRadius = 1 + Math.floor(rng() * 2) // 1-2
  for (let dy = -wheelRadius; dy <= wheelRadius; dy++) {
    for (let dx = -wheelRadius; dx <= wheelRadius; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy) // manhattan
      if (dist === wheelRadius || dist === wheelRadius - 1) {
        const wy = cy + dy
        const wx = cx + dx
        if (wy >= 0 && wy < S && wx >= 0 && wx < S) {
          template[wy][wx] = 3
        }
      }
    }
  }

  // Eyes scattered — more toward center, fewer at edges
  const eyeCount = 4 + Math.floor(rng() * 5) // 4-8 eyes
  for (let i = 0; i < eyeCount; i++) {
    const ex = Math.floor(rng() * S)
    const ey = Math.floor(rng() * S)
    if (template[ey][ex] === 0) {
      template[ey][ex] = 1
    }
  }

  // Wings — fill edges with wing chars
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (template[y][x] !== 0) continue
      const edgeDist = Math.min(x, y, S - 1 - x, S - 1 - y)
      if (edgeDist <= 1 && rng() < 0.6) {
        template[y][x] = 2
      }
    }
  }

  // Halo — top and bottom rows get halo chars if not already filled
  for (let x = 0; x < S; x++) {
    if (template[0][x] === 0 && rng() < 0.7) template[0][x] = 4
    if (template[S - 1][x] === 0 && rng() < 0.7) template[S - 1][x] = 4
  }

  // Structure — fill remaining gaps with occasional structure chars
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (template[y][x] !== 0) continue
      if (rng() < 0.3) {
        template[y][x] = 5
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
 * cell in the angel's 8x8 body.
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
