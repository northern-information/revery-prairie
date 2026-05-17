import {
  PRAIRIE_HALO_MAX_ALPHA,
  PRAIRIE_HALO_MIN_ALPHA,
  PRAIRIE_HALO_PULSE_SPEED,
  PRAIRIE_HALO_RADIUS,
} from '../constants'
import { computePrairieHaloAlpha, nearestLandDistance } from '../renderer'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

const makeMap = (cells: TileType[][]): { type: TileType }[][] => cells.map(row => row.map(type => ({ type })))

describe('prairie halo nearestLandDistance', () => {
  it('returns 1 when an immediately adjacent tile is land', () => {
    const map = makeMap([
      [TileType.Space, TileType.Space, TileType.Space],
      [TileType.Space, TileType.Space, TileType.Dirt],
      [TileType.Space, TileType.Space, TileType.Space],
    ])
    expect(nearestLandDistance(map, 3, 3, 1, 1, PRAIRIE_HALO_RADIUS)).toBe(1)
  })

  it('returns Infinity when no land sits within the radius', () => {
    const w = PRAIRIE_HALO_RADIUS * 2 + 5
    const h = PRAIRIE_HALO_RADIUS * 2 + 5
    const cells: TileType[][] = []
    for (let y = 0; y < h; y++) {
      const row: TileType[] = []
      for (let x = 0; x < w; x++) row.push(TileType.Space)
      cells.push(row)
    }
    const map = makeMap(cells)
    const cx = Math.floor(w / 2)
    const cy = Math.floor(h / 2)
    expect(nearestLandDistance(map, w, h, cx, cy, PRAIRIE_HALO_RADIUS)).toBe(Infinity)
  })

  it('measures by chebyshev so a diagonal land tile counts as distance 1', () => {
    const map = makeMap([
      [TileType.Sand, TileType.Space, TileType.Space],
      [TileType.Space, TileType.Space, TileType.Space],
      [TileType.Space, TileType.Space, TileType.Space],
    ])
    // (2, 2) — Sand at (0, 0) is chebyshev distance 2
    expect(nearestLandDistance(map, 3, 3, 2, 2, PRAIRIE_HALO_RADIUS)).toBe(2)
    // (1, 1) — Sand at (0, 0) is chebyshev distance 1
    expect(nearestLandDistance(map, 3, 3, 1, 1, PRAIRIE_HALO_RADIUS)).toBe(1)
  })

  it('finds the closest land when multiple candidates exist within the radius', () => {
    const map = makeMap([
      [TileType.Space, TileType.Space, TileType.Space, TileType.Space, TileType.Dirt],
      [TileType.Space, TileType.Space, TileType.Space, TileType.Space, TileType.Space],
      [TileType.Space, TileType.Space, TileType.Space, TileType.Space, TileType.Space],
      [TileType.Sand, TileType.Space, TileType.Space, TileType.Space, TileType.Space],
      [TileType.Space, TileType.Space, TileType.Space, TileType.Space, TileType.Space],
    ])
    // Sand at (0, 3) → chebyshev distance 3 from (2, 2)
    // Dirt at (4, 0) → chebyshev distance 2 from (2, 2)
    expect(nearestLandDistance(map, 5, 5, 2, 2, PRAIRIE_HALO_RADIUS)).toBe(2)
  })

  it('treats out-of-bounds neighbors as space', () => {
    const map = makeMap([
      [TileType.Space, TileType.Space],
      [TileType.Space, TileType.Space],
    ])
    expect(nearestLandDistance(map, 2, 2, 0, 0, PRAIRIE_HALO_RADIUS)).toBe(Infinity)
  })

  it('respects maxRadius even when land exists beyond it', () => {
    const w = PRAIRIE_HALO_RADIUS * 2 + 3
    const cells: TileType[][] = [Array.from({ length: w }, () => TileType.Space)]
    for (let i = 0; i < PRAIRIE_HALO_RADIUS * 2 + 1; i++) {
      cells.push(Array.from({ length: w }, () => TileType.Space))
    }
    cells.push(Array.from({ length: w }, () => TileType.Space))
    // Place land at the bottom-right corner, well outside the radius
    const lastY = cells.length - 1
    cells[lastY][w - 1] = TileType.Dirt
    const map = makeMap(cells)
    expect(nearestLandDistance(map, w, cells.length, 0, 0, PRAIRIE_HALO_RADIUS)).toBe(Infinity)
  })
})

describe('prairie halo computePrairieHaloAlpha', () => {
  it('returns 0 when distance is Infinity', () => {
    expect(computePrairieHaloAlpha(Infinity, 0)).toBe(0)
    expect(computePrairieHaloAlpha(Infinity, 12345)).toBe(0)
  })

  it('returns 0 when distance is 0 or beyond the radius', () => {
    expect(computePrairieHaloAlpha(0, 0)).toBe(0)
    expect(computePrairieHaloAlpha(PRAIRIE_HALO_RADIUS + 1, 0)).toBe(0)
  })

  it('keeps alpha within [0, PRAIRIE_HALO_MAX_ALPHA] for any valid distance and time', () => {
    const samples: number[] = []
    for (let d = 1; d <= PRAIRIE_HALO_RADIUS; d++) {
      for (let t = 0; t < 10000; t += 250) {
        const a = computePrairieHaloAlpha(d, t)
        expect(a).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThanOrEqual(PRAIRIE_HALO_MAX_ALPHA)
        samples.push(a)
      }
    }
    // Sanity: alpha should reach above the configured min for some samples
    expect(samples.some(a => a > PRAIRIE_HALO_MIN_ALPHA)).toBe(true)
  })

  it('is stronger near land than far from land at peak pulse', () => {
    // Find a time where the pulse is at its peak (sin = 1)
    const peakTime = Math.PI / 2 / PRAIRIE_HALO_PULSE_SPEED
    const near = computePrairieHaloAlpha(1, peakTime)
    const far = computePrairieHaloAlpha(PRAIRIE_HALO_RADIUS, peakTime)
    expect(near).toBeGreaterThan(far)
  })

  it('breathes over time at a fixed distance (varies between min-ish and max)', () => {
    const distance = 1
    let min = Infinity
    let max = -Infinity
    // Sweep one pulse period
    const period = (2 * Math.PI) / PRAIRIE_HALO_PULSE_SPEED
    for (let t = 0; t <= period; t += period / 64) {
      const a = computePrairieHaloAlpha(distance, t)
      if (a < min) min = a
      if (a > max) max = a
    }
    expect(max).toBeGreaterThan(min)
    expect(max).toBeLessThanOrEqual(PRAIRIE_HALO_MAX_ALPHA)
    expect(min).toBeGreaterThanOrEqual(0)
  })
})
