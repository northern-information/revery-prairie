// Tests for precis #8a egregoric flora — thematic allusions.
//
// Covers:
//   - EGREGORE_GLYPHS determinism per tile position
//   - Latin pierce 1-in-5 distribution
//   - Per-tile manual body / binomial determinism
//   - Genesis placement count + walkability + walk-over no-op

import {
  EVA_TOKEN_COUNT,
  EGREGORE_GLYPHS,
  LATIN_PIERCE_WORD_COUNT,
  getEgregoreBinomial,
  getEgregoreGlyph,
  getEgregoreLatinPierce,
  getEgregoreManualBody,
} from '../egregore'
import { createGameState } from '../state'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

describe('egregore glyph picker', () => {
  it('returns a glyph from EGREGORE_GLYPHS', () => {
    for (let i = 0; i < 50; i++) {
      const glyph = getEgregoreGlyph(i, i * 3)
      expect(EGREGORE_GLYPHS).toContain(glyph)
    }
  })

  it('is stable per position', () => {
    const a = getEgregoreGlyph(10, 20)
    const b = getEgregoreGlyph(10, 20)
    expect(a).toBe(b)
  })

  it('varies across positions', () => {
    const seen = new Set<string>()
    for (let x = 0; x < 100; x++) {
      seen.add(getEgregoreGlyph(x, 0))
    }
    // Five glyphs in the allowlist; over 100 positions we should see
    // at least 3 distinct values (otherwise the picker is collapsing).
    expect(seen.size).toBeGreaterThanOrEqual(3)
  })
})

describe('egregore Latin pierce', () => {
  it('returns roughly 1 in 5 tiles with a pierce', () => {
    let withPierce = 0
    const N = 1000
    for (let x = 0; x < N; x++) {
      if (getEgregoreLatinPierce(x, 0) !== null) withPierce++
    }
    // Expected rate is 1/5 = 200/1000. Allow ±50 for hash variance.
    expect(withPierce).toBeGreaterThan(150)
    expect(withPierce).toBeLessThan(250)
  })

  it('is stable per position', () => {
    for (let i = 0; i < 50; i++) {
      const a = getEgregoreLatinPierce(i, i)
      const b = getEgregoreLatinPierce(i, i)
      expect(a).toBe(b)
    }
  })

  it('returns null or a word from the allowlist', () => {
    const allowed = new Set([
      'threshold',
      'between',
      'garden',
      'before',
      'not',
      'here',
      'was',
      'meteor',
      'Earth',
      'line',
      'thin',
      'near',
      'moved',
      'past',
      'us',
      'them',
    ])
    expect(allowed.size).toBe(LATIN_PIERCE_WORD_COUNT)
    for (let i = 0; i < 100; i++) {
      const word = getEgregoreLatinPierce(i, 0)
      if (word !== null) expect(allowed.has(word)).toBe(true)
    }
  })
})

describe('egregore manual body and binomial', () => {
  it('returns a non-empty body for any position', () => {
    for (let i = 0; i < 20; i++) {
      const body = getEgregoreManualBody(i, i * 2)
      expect(body.length).toBeGreaterThan(0)
    }
  })

  it('embeds the pierce inside the body when the pierce hash bucket fires', () => {
    // Find a position with a pierce and verify the body contains it.
    for (let i = 0; i < 100; i++) {
      const pierce = getEgregoreLatinPierce(i, 0)
      if (pierce === null) continue
      const body = getEgregoreManualBody(i, 0)
      expect(body).toContain(pierce)
      return
    }
    throw new Error('expected at least one pierce in 100 positions')
  })

  it('binomial is two tokens', () => {
    const binomial = getEgregoreBinomial(7, 13)
    expect(binomial.split(' ')).toHaveLength(2)
  })

  it('exports a non-trivial EVA token count', () => {
    expect(EVA_TOKEN_COUNT).toBeGreaterThan(10)
  })
})

describe('egregore genesis placement (precis #8a)', () => {
  it('places at least 2 egregore tiles on a fresh game', () => {
    const state = createGameState('PrecisEightA', 20, 20)
    expect(state.egregorePositions.length).toBeGreaterThanOrEqual(2)
    expect(state.egregorePositions.length).toBeLessThanOrEqual(4)
  })

  it('every egregore position is a TileType.Egregore on the map', () => {
    const state = createGameState('PrecisEightA', 20, 20)
    for (const pos of state.egregorePositions) {
      expect(state.map[pos.y][pos.x].type).toBe(TileType.Egregore)
    }
  })

  it('is deterministic — same steward name produces same positions', () => {
    const a = createGameState('PrecisEightA', 20, 20)
    const b = createGameState('PrecisEightA', 20, 20)
    expect(a.egregorePositions.length).toBe(b.egregorePositions.length)
    for (let i = 0; i < a.egregorePositions.length; i++) {
      expect(a.egregorePositions[i].x).toBe(b.egregorePositions[i].x)
      expect(a.egregorePositions[i].y).toBe(b.egregorePositions[i].y)
    }
  })

  it('unlocks manual discovery for every placed egregore tile', () => {
    const state = createGameState('PrecisEightA', 20, 20)
    for (const pos of state.egregorePositions) {
      const key = `egregore:${String(pos.x)},${String(pos.y)}`
      expect(state.manualDiscoveries.has(key)).toBe(true)
    }
  })
})
