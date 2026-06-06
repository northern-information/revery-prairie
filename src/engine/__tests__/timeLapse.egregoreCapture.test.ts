import { TILE_COLORS } from '../constants'
import { EGREGORE_GLYPHS, getEgregoreGlyph } from '../egregore'
import { captureCells } from '../timeLapse'
import { TileType } from '../types'
import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'
import { describe, expect, it } from 'vitest'

// Regression: captureCells must resolve the per-position Voynich glyph
// for TileType.Egregore tiles via getEgregoreGlyph(x, y), NOT the
// TILE_CHARS[TileType.Egregore] fallback '?'.
// See harness/specs/bug-album-voynich-glyphs.yaml.
describe('time-lapse capture resolves egregore glyph per position', () => {
  it('captureCells returns the per-position Voynich glyph for an Egregore tile at the center', () => {
    const state = createTestState()
    swapToOverworldForTest(state)
    clearAroundPlayer(state, 3)
    const { x, y } = state.player
    state.map[y][x] = { type: TileType.Egregore }

    const cells = captureCells(state, x, y)
    // FRAME_OFFSETS row-major: index 4 is the center cell.
    const center = cells[4]
    expect(center.char).toBe(getEgregoreGlyph(x, y))
    expect(center.char).not.toBe('?')
    expect(center.color).toBe(TILE_COLORS[TileType.Egregore])
    const code = center.char.codePointAt(0) ?? 0
    expect(code).toBeGreaterThanOrEqual(0xf121)
    expect(code).toBeLessThanOrEqual(0xf2ff)
    expect((EGREGORE_GLYPHS as readonly string[]).includes(center.char)).toBe(true)
  })

  it('different egregore tile positions resolve to position-specific glyphs', () => {
    const state = createTestState()
    swapToOverworldForTest(state)
    clearAroundPlayer(state, 3)
    const { x, y } = state.player
    // Two egregore tiles at distinct positions inside the 3x3 footprint.
    state.map[y][x - 1] = { type: TileType.Egregore }
    state.map[y][x + 1] = { type: TileType.Egregore }

    const cells = captureCells(state, x, y)
    // Row-major: y row is indices 3..5 (W, C, E).
    const west = cells[3]
    const east = cells[5]
    expect(west.char).toBe(getEgregoreGlyph(x - 1, y))
    expect(east.char).toBe(getEgregoreGlyph(x + 1, y))
    expect(west.color).toBe(TILE_COLORS[TileType.Egregore])
    expect(east.color).toBe(TILE_COLORS[TileType.Egregore])
  })

  it('non-egregore tiles are unaffected by the egregore branch', () => {
    const state = createTestState()
    swapToOverworldForTest(state)
    clearAroundPlayer(state, 3)
    const { x, y } = state.player
    state.map[y][x] = { type: TileType.Dirt }

    const cells = captureCells(state, x, y)
    const code = cells[4].char.codePointAt(0) ?? 0
    expect(code).toBeLessThan(0xf121)
  })
})
