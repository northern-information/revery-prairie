import { describe, expect, it } from 'vitest'
import { getTileBgColor, TILE_BG_PALETTES } from '../tileBg'
import { TileType } from '../types'

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
