import { SOIL_HEALTH_MAX, SPACE_BORDER } from './constants'
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

export const generateTerrain = (width: number, height: number): Tile[][] => {
  // Coastline variation: smooth noise on each edge gives an organic
  // space-to-dirt boundary. Sand is no longer placed at this boundary
  // (it only appears around water during genesis); the no-genesis
  // fallback produces only Space and Dirt tiles.
  const topVariation = smoothNoise(width, 6, 12)
  const bottomVariation = smoothNoise(width, 6, 12)
  const leftVariation = smoothNoise(height, 6, 12)
  const rightVariation = smoothNoise(height, 6, 12)

  const border = SPACE_BORDER

  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const top = border + topVariation[x]
      const bottom = border + bottomVariation[x]
      const left = border + leftVariation[y]
      const right = border + rightVariation[y]

      const isSpace = x < left || x >= width - right || y < top || y >= height - bottom
      return { type: isSpace ? TileType.Space : TileType.Dirt }
    })
  )
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
