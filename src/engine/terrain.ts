import { SAND_BORDER, WATER_BORDER } from './constants'
import { TileType } from './types'

import type { Tile } from './types'

// Simple 1D noise — smoothly varying random values
const smoothNoise = (length: number, amplitude: number, wavelength: number): number[] => {
  const result: number[] = []
  let prev = 0
  for (let i = 0; i < length; i++) {
    if (i % wavelength === 0) {
      prev = (Math.random() - 0.5) * 2 * amplitude
    }
    const next = i + wavelength < length ? (Math.random() - 0.5) * 2 * amplitude : prev
    const t = (i % wavelength) / wavelength
    result.push(Math.round(prev + (next - prev) * t))
  }
  return result
}

const scatterSandbars = (map: Tile[][], width: number, height: number) => {
  const count = Math.floor((width + height) / 4)

  for (let i = 0; i < count; i++) {
    // Pick a random spot in the outer border zone
    const edge = Math.floor(Math.random() * 4)
    let cx: number
    let cy: number

    const margin = WATER_BORDER - 2
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

  const outerBorder = WATER_BORDER
  const innerBorder = WATER_BORDER + SAND_BORDER

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
