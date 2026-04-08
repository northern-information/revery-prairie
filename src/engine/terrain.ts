import { SAND_BORDER, SOIL_HEALTH_MAX, SPACE_BORDER } from './constants'
import { posKey } from './position'
import { TileType } from './types'

import type { Tile } from './types'

// Simple 1D noise — smoothly varying random values
// Seeded variant accepts an rng function; Math.random used as default.
export const smoothNoiseSeeded = (
  length: number,
  amplitude: number,
  wavelength: number,
  rng: () => number
): number[] => {
  const result: number[] = []
  let prev = 0
  for (let i = 0; i < length; i++) {
    if (i % wavelength === 0) {
      prev = (rng() - 0.5) * 2 * amplitude
    }
    const next = i + wavelength < length ? (rng() - 0.5) * 2 * amplitude : prev
    const t = (i % wavelength) / wavelength
    result.push(Math.round(prev + (next - prev) * t))
  }
  return result
}

const smoothNoise = (length: number, amplitude: number, wavelength: number): number[] =>
  smoothNoiseSeeded(length, amplitude, wavelength, Math.random)

const scatterSandbars = (map: Tile[][], width: number, height: number) => {
  const count = Math.floor((width + height) / 4)

  for (let i = 0; i < count; i++) {
    // Pick a random spot in the outer border zone
    const edge = Math.floor(Math.random() * 4)
    let cx: number
    let cy: number

    const margin = SPACE_BORDER - 2
    if (margin < 2) continue

    switch (edge) {
      case 0: // top
        cx = Math.floor(Math.random() * width)
        cy = Math.floor(Math.random() * (margin - 1)) + 1
        break
      case 1: // bottom
        cx = Math.floor(Math.random() * width)
        cy = height - 1 - Math.floor(Math.random() * (margin - 1)) - 1
        break
      case 2: // left
        cx = Math.floor(Math.random() * (margin - 1)) + 1
        cy = Math.floor(Math.random() * height)
        break
      default: // right
        cx = width - 1 - Math.floor(Math.random() * (margin - 1)) - 1
        cy = Math.floor(Math.random() * height)
        break
    }

    // Only place sandbars on space tiles
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue
    if (map[cy][cx].type !== TileType.Space) continue

    // Place a small cluster (1-4 tiles)
    map[cy][cx] = { type: TileType.Sand }
    const size = Math.floor(Math.random() * 3) + 1
    const deltas = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, -1],
    ]
    for (let j = 0; j < size; j++) {
      const [ddx, ddy] = deltas[Math.floor(Math.random() * deltas.length)]
      const nx = cx + ddx
      const ny = cy + ddy
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && map[ny][nx].type === TileType.Space) {
        map[ny][nx] = { type: TileType.Sand }
      }
    }
  }
}

export const generateTerrain = (width: number, height: number): Tile[][] => {
  // Outer edge variation (sand-to-space boundary)
  const topOuterVariation = smoothNoise(width, 3, 6)
  const bottomOuterVariation = smoothNoise(width, 3, 6)
  const leftOuterVariation = smoothNoise(height, 3, 6)
  const rightOuterVariation = smoothNoise(height, 3, 6)

  // Inner edge variation (sand-to-dirt boundary)
  const topInnerVariation = smoothNoise(width, 3, 8)
  const bottomInnerVariation = smoothNoise(width, 3, 8)
  const leftInnerVariation = smoothNoise(height, 3, 8)
  const rightInnerVariation = smoothNoise(height, 3, 8)

  const outerBorder = SPACE_BORDER
  const innerBorder = SPACE_BORDER + SAND_BORDER

  const map = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const topOuter = outerBorder + topOuterVariation[x]
      const bottomOuter = outerBorder + bottomOuterVariation[x]
      const leftOuter = outerBorder + leftOuterVariation[y]
      const rightOuter = outerBorder + rightOuterVariation[y]

      const isSpace = x < leftOuter || x >= width - rightOuter || y < topOuter || y >= height - bottomOuter

      if (isSpace) return { type: TileType.Space }

      const topInner = innerBorder + topInnerVariation[x]
      const bottomInner = innerBorder + bottomInnerVariation[x]
      const leftInner = innerBorder + leftInnerVariation[y]
      const rightInner = innerBorder + rightInnerVariation[y]

      const isSand = x < leftInner || x >= width - rightInner || y < topInner || y >= height - bottomInner

      return { type: isSand ? TileType.Sand : TileType.Dirt }
    })
  )

  scatterSandbars(map, width, height)

  return map
}

/**
 * Generate topographic soil health using layered smooth noise.
 * Produces gradual slopes between healthier and less healthy areas.
 * Only generates values for dirt tiles (non-dirt tiles are excluded).
 */
export const generateSoilHealth = (map: Tile[][], width: number, height: number): Map<string, number> => {
  const soilHealth = new Map<string, number>()

  // Generate 2D noise by combining horizontal and vertical smooth noise bands
  // at different wavelengths for natural-looking topography
  const hNoise1 = smoothNoise(width, 20, 12)
  const vNoise1 = smoothNoise(height, 20, 12)
  const hNoise2 = smoothNoise(width, 10, 25)
  const vNoise2 = smoothNoise(height, 10, 25)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (map[y][x].type !== TileType.Dirt) continue
      const raw = 50 + hNoise1[x] + vNoise1[y] + hNoise2[x] + vNoise2[y]
      const clamped = Math.max(10, Math.min(raw, SOIL_HEALTH_MAX))
      soilHealth.set(posKey(x, y), clamped)
    }
  }

  return soilHealth
}
