import { describe, expect, it } from 'vitest'
import {
  SHOOTING_STAR_TRAIL_CHARS,
  SHOOTING_STAR_TRAIL_CHARS_ISO,
  type VelocityKey,
} from '../constants'

// Pick the glyph that visually matches a screen delta.
// screen_dx == 0 → vertical → '|'
// screen_dy == 0 → horizontal → '-'
// sign(dx) == sign(dy) → down-right or up-left → '\'
// sign(dx) != sign(dy) → down-left or up-right → '/'
const expectedGlyphForScreenDelta = (sdx: number, sdy: number): string => {
  if (sdx === 0) return '|'
  if (sdy === 0) return '-'
  return Math.sign(sdx) === Math.sign(sdy) ? '\\' : '/'
}

// Iso projection: world (vx, vy) → screen ((vx - vy) * cw, (vx + vy) * halfH).
// Scale factors don't change the sign, so use 1.
const projectIso = (dx: number, dy: number): { sdx: number; sdy: number } => ({
  sdx: dx - dy,
  sdy: dx + dy,
})

const VELOCITY_KEYS: VelocityKey[] = [
  '1,1',
  '-1,-1',
  '1,-1',
  '-1,1',
  '1,0',
  '-1,0',
  '0,1',
  '0,-1',
]

describe('iso shooting star trail glyphs', () => {
  it('orthogonal table maps world velocity directly to glyph (unchanged)', () => {
    expect(SHOOTING_STAR_TRAIL_CHARS).toEqual({
      '1,1': '\\',
      '-1,-1': '\\',
      '1,-1': '/',
      '-1,1': '/',
      '1,0': '-',
      '-1,0': '-',
      '0,1': '|',
      '0,-1': '|',
    })
  })

  it('iso table maps each velocity to the glyph that matches its projected screen direction', () => {
    expect(SHOOTING_STAR_TRAIL_CHARS_ISO).toEqual({
      '1,1': '|',
      '-1,-1': '|',
      '1,-1': '-',
      '-1,1': '-',
      '1,0': '\\',
      '-1,0': '\\',
      '0,1': '/',
      '0,-1': '/',
    })
  })

  it.each(VELOCITY_KEYS)('iso glyph for %s matches the iso-projected slope', velKey => {
    const [dxStr, dyStr] = velKey.split(',')
    const { sdx, sdy } = projectIso(Number(dxStr), Number(dyStr))
    expect(SHOOTING_STAR_TRAIL_CHARS_ISO[velKey]).toBe(expectedGlyphForScreenDelta(sdx, sdy))
  })

  it('iso and orthogonal tables differ for every direction (the fix actually flips the glyph)', () => {
    for (const k of VELOCITY_KEYS) {
      expect(SHOOTING_STAR_TRAIL_CHARS_ISO[k]).not.toBe(SHOOTING_STAR_TRAIL_CHARS[k])
    }
  })
})
