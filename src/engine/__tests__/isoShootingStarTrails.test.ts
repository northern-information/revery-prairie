import { describe, expect, it } from 'vitest'
import { SHOOTING_STAR_TRAIL_CHARS, type VelocityKey } from '../constants'

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

// Projection: world (vx, vy) → screen ((vx - vy) * cw, (vx + vy) * halfH).
// Scale factors don't change the sign, so use 1.
const projectScreen = (dx: number, dy: number): { sdx: number; sdy: number } => ({
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

describe('shooting star trail glyphs', () => {
  it('table maps each velocity to the glyph that matches its projected screen direction', () => {
    expect(SHOOTING_STAR_TRAIL_CHARS).toEqual({
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

  it.each(VELOCITY_KEYS)('glyph for %s matches the projected slope', velKey => {
    const [dxStr, dyStr] = velKey.split(',')
    const { sdx, sdy } = projectScreen(Number(dxStr), Number(dyStr))
    expect(SHOOTING_STAR_TRAIL_CHARS[velKey]).toBe(expectedGlyphForScreenDelta(sdx, sdy))
  })
})
