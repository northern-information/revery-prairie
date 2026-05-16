import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('measureChar', () => {
  it('BASE_FONT_SIZE is 32 for crisp native rendering', () => {
    // Regression guard: if someone reintroduces a zoom multiplier and
    // drops BASE_FONT_SIZE back to 16, glyphs will look pixelated on
    // retina. 32 = the natively-rendered glyph size; do not change
    // without understanding the rationale captured in the
    // genesis-transition spec.
    const source = readFileSync(join(__dirname, '../constants.ts'), 'utf-8')
    expect(source).toMatch(/export const BASE_FONT_SIZE = 32/)
  })

  it('FONT string matches BASE_FONT_SIZE', () => {
    const source = readFileSync(join(__dirname, '../constants.ts'), 'utf-8')
    expect(source).toContain(`export const FONT = '32px monospace'`)
  })

  it('GENESIS_FONT_SIZE is defined and smaller than BASE_FONT_SIZE', () => {
    const source = readFileSync(join(__dirname, '../constants.ts'), 'utf-8')
    const match = /export const GENESIS_FONT_SIZE = (\d+)/.exec(source)
    expect(match).not.toBeNull()
    if (!match) return
    const genesisSize = Number(match[1])
    expect(genesisSize).toBeGreaterThan(0)
    expect(genesisSize).toBeLessThan(32)
  })

  it('ZOOM_DEFAULT is not defined', () => {
    const source = readFileSync(join(__dirname, '../constants.ts'), 'utf-8')
    expect(source).not.toMatch(/ZOOM_DEFAULT/)
  })

  it('measureChar signature accepts an optional fontSize, not a zoom multiplier', () => {
    const source = readFileSync(join(__dirname, '../renderer.ts'), 'utf-8')
    expect(source).toMatch(/measureChar\s*=\s*\(\s*ctx:\s*CanvasRenderingContext2D\s*,\s*fontSize/)
    // The old zoom multiplier signature must not return.
    expect(source).not.toMatch(/measureChar\s*=\s*\(\s*ctx[^)]*,\s*zoom/)
  })
})
