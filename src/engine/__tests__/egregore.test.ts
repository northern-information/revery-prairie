// Tests for precis #8a egregoric flora — thematic allusions.
//
// Covers:
//   - EGREGORE_GLYPHS determinism per tile position
//   - Latin pierce 1-in-5 distribution
//   - Per-tile manual body / binomial determinism
//   - Genesis placement count + walkability + walk-over no-op

import {
  EMPTY_PUA_BLOCKLIST,
  EVA_TOKEN_COUNT,
  EGREGORE_GLYPHS,
  LATIN_PIERCE_WORD_COUNT,
  getEgregoreGlyph,
  getEgregoreLatinPierce,
  getEgregoreManualBody,
} from '../egregore'
import { createGameState } from '../state'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

// Bounds of the kreativekorp Voynich Unicode font's PUA coverage. EVA
// tokens may use any char in this range; EGREGORE_GLYPHS uses a curated
// subset. All chars must be outside EMPTY_PUA_BLOCKLIST (the four cmap-
// mapped slots with zero-length glyph data).
const PUA_LO = 0xf121
const PUA_HI = 0xf2ff

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
    // Eight glyphs in the alphabet; over 100 positions the picker
    // should surface at least 5 distinct values.
    expect(seen.size).toBeGreaterThanOrEqual(5)
  })

  it('contains exactly the 8 locked PUA code points', () => {
    expect(EGREGORE_GLYPHS).toEqual([
      '\u{F166}',
      '\u{F174}',
      '\u{F182}',
      '\u{F1B4}',
      '\u{F12A}',
      '\u{F1A1}',
      '\u{F1B1}',
      '\u{F1FD}',
    ])
  })
})

describe('PUA alphabet contract', () => {
  it('every EGREGORE_GLYPHS char is in U+F121..U+F2FF and not blocklisted', () => {
    const blocklist = new Set<string>(EMPTY_PUA_BLOCKLIST)
    for (const glyph of EGREGORE_GLYPHS) {
      expect(glyph).toHaveLength(1)
      const cp = glyph.codePointAt(0) ?? 0
      expect(cp).toBeGreaterThanOrEqual(PUA_LO)
      expect(cp).toBeLessThanOrEqual(PUA_HI)
      expect(blocklist.has(glyph)).toBe(false)
    }
  })

  it('EMPTY_PUA_BLOCKLIST contains exactly U+F120, U+F1A0, U+F220, U+F2A0', () => {
    expect(new Set<string>(EMPTY_PUA_BLOCKLIST)).toEqual(
      new Set(['\u{F120}', '\u{F1A0}', '\u{F220}', '\u{F2A0}']),
    )
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

  it('exports a non-trivial EVA token count', () => {
    expect(EVA_TOKEN_COUNT).toBeGreaterThan(10)
  })

  it('every body char is in PUA range and not blocklisted', () => {
    const blocklist = new Set<string>(EMPTY_PUA_BLOCKLIST)
    for (let i = 0; i < 25; i++) {
      const body = getEgregoreManualBody(i, i * 2)
      // Body interleaves EVA tokens with spaces and may contain one
      // ASCII Latin pierce word. The PUA assertion only applies to the
      // non-space, non-pierce characters.
      const pierce = getEgregoreLatinPierce(i, i * 2)
      const filtered = pierce !== null ? body.replace(pierce, '') : body
      for (const ch of filtered) {
        if (ch === ' ') continue
        const cp = ch.codePointAt(0) ?? 0
        expect(cp).toBeGreaterThanOrEqual(PUA_LO)
        expect(cp).toBeLessThanOrEqual(PUA_HI)
        expect(blocklist.has(ch)).toBe(false)
      }
    }
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
