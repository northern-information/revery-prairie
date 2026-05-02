import { describe, expect, it } from 'vitest'
import { darkenColor, getTileBgColor, TILE_BG_PALETTES } from '../tileBg'
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
    expect(darkenColor('#ffffff', 0.5)).toBe('#808080') // 255 * 0.5 = 127.5 → round 128 → 0x80
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
