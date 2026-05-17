import {
  darkenColor,
  ELEVATION_TIER_COUNT,
  ELEVATION_TIER_LIFT_PX,
  getElevationTier,
  getTierLift,
  getTileBgColor,
  TILE_BG_PALETTES,
} from '../tileBg'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

describe('TILE_BG_PALETTES', () => {
  it('has at least one color for every tile type', () => {
    for (const type of Object.values(TileType)) {
      const palette = TILE_BG_PALETTES[type]
      expect(palette.length).toBeGreaterThan(0)
    }
  })

  it('every palette entry is a 6-digit hex color', () => {
    for (const type of Object.values(TileType)) {
      for (const color of TILE_BG_PALETTES[type]) {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })
})

describe('getTileBgColor', () => {
  it('returns a color from the palette of the given tile type', () => {
    const palette = TILE_BG_PALETTES[TileType.Dirt]
    const color = getTileBgColor(TileType.Dirt, 5, 5)
    expect(palette).toContain(color)
  })

  it('returns the same color for the same (type, x, y) — no flicker', () => {
    const a = getTileBgColor(TileType.Clover, 12, 7)
    const b = getTileBgColor(TileType.Clover, 12, 7)
    expect(a).toBe(b)
  })

  it('produces variation across different positions', () => {
    const seen = new Set<string>()
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        seen.add(getTileBgColor(TileType.Dirt, x, y))
      }
    }
    // dirt has 8 entries; across 100 tiles the hash should select more than one.
    expect(seen.size).toBeGreaterThan(1)
  })

  it('uses the type-specific palette (different types yield different color sets across many tiles)', () => {
    const dirtColors = new Set<string>()
    const cloverColors = new Set<string>()
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        dirtColors.add(getTileBgColor(TileType.Dirt, x, y))
        cloverColors.add(getTileBgColor(TileType.Clover, x, y))
      }
    }
    // Two surfaces shouldn't produce overlapping color sets.
    for (const c of dirtColors) {
      expect(cloverColors.has(c)).toBe(false)
    }
  })

  it('handles single-color palettes (Space) without crashing', () => {
    const color = getTileBgColor(TileType.Space, 100, 200)
    expect(color).toBe('#000000')
  })
})

describe('darkenColor', () => {
  it('returns a 6-digit hex color', () => {
    expect(darkenColor('#aabbcc', 0.5)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('factor 1.0 returns the original color', () => {
    expect(darkenColor('#aabbcc', 1.0)).toBe('#aabbcc')
  })

  it('factor 0 returns black', () => {
    expect(darkenColor('#ffffff', 0)).toBe('#000000')
  })

  it('factor 0.5 halves each channel', () => {
    expect(darkenColor('#ffffff', 0.5)).toBe('#808080')
  })

  it('preserves channel proportions for greys', () => {
    const out = darkenColor('#888888', 0.5)
    const r = parseInt(out.slice(1, 3), 16)
    const g = parseInt(out.slice(3, 5), 16)
    const b = parseInt(out.slice(5, 7), 16)
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  it('clamps to [0, 255] (factor > 1 should not overflow)', () => {
    const out = darkenColor('#ffffff', 2)
    expect(out).toBe('#ffffff')
  })
})

describe('getElevationTier', () => {
  it('returns 0 for undefined elevation (cave / out of bounds)', () => {
    expect(getElevationTier(undefined)).toBe(0)
  })

  it('clamps low elevation to tier 0', () => {
    expect(getElevationTier(0)).toBe(0)
    expect(getElevationTier(24)).toBe(0)
  })

  it('clamps high elevation to the top tier', () => {
    expect(getElevationTier(100)).toBe(ELEVATION_TIER_COUNT - 1)
    expect(getElevationTier(99)).toBe(ELEVATION_TIER_COUNT - 1)
  })

  it('snaps mid elevations to the matching tier', () => {
    // With ELEVATION_TIER_COUNT = 4, tier size = 25
    expect(getElevationTier(25)).toBe(1)
    expect(getElevationTier(50)).toBe(2)
    expect(getElevationTier(74)).toBe(2)
    expect(getElevationTier(75)).toBe(3)
  })
})

describe('getTierLift', () => {
  it('tier 0 lifts by 0', () => {
    expect(getTierLift(0)).toBeCloseTo(0)
  })

  it('higher tiers lift by negative y (up the canvas)', () => {
    expect(getTierLift(1)).toBe(-ELEVATION_TIER_LIFT_PX)
    expect(getTierLift(3)).toBe(-3 * ELEVATION_TIER_LIFT_PX)
  })

  it('is monotonic across tiers', () => {
    const lifts = [0, 1, 2, 3].map(getTierLift)
    for (let i = 1; i < lifts.length; i++) {
      expect(lifts[i]).toBeLessThan(lifts[i - 1])
    }
  })
})
