import { describe, expect, it } from 'vitest'
import { ANGEL_ANIMATION_FRAME_MS, ANGEL_BODY_SIZE } from '../constants'
import { getAngelRenderData } from '../angelAnimation'

describe('angelAnimation', () => {
  it('returns cells whose positions stay inside the 9x9 anchor footprint', () => {
    const anchorX = 10
    const anchorY = 20
    const cells = getAngelRenderData(42, anchorX, anchorY, 0)
    expect(cells.length).toBeGreaterThan(0)
    for (const { pos } of cells) {
      expect(pos.x).toBeGreaterThanOrEqual(anchorX)
      expect(pos.x).toBeLessThan(anchorX + ANGEL_BODY_SIZE)
      expect(pos.y).toBeGreaterThanOrEqual(anchorY)
      expect(pos.y).toBeLessThan(anchorY + ANGEL_BODY_SIZE)
    }
  })

  it('renders no void characters', () => {
    const cells = getAngelRenderData(42, 0, 0, 0)
    for (const { char } of cells) {
      expect(char).not.toBe(' ')
      expect(char.length).toBeGreaterThan(0)
    }
  })

  it('uses hex color strings for every cell', () => {
    const cells = getAngelRenderData(42, 0, 0, 0)
    for (const { color } of cells) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{3,8}$/)
    }
  })

  it('is deterministic for a given seed + time', () => {
    const a = getAngelRenderData(42, 0, 0, 0)
    const b = getAngelRenderData(42, 0, 0, 0)
    expect(b).toEqual(a)
  })

  it('changes the output when the frame index advances', () => {
    const t0 = 0
    const t1 = ANGEL_ANIMATION_FRAME_MS // crosses into frame 1
    const frame0 = getAngelRenderData(42, 0, 0, t0)
    const frame1 = getAngelRenderData(42, 0, 0, t1)
    // Cells may differ in char or color across frames. Compare as JSON.
    expect(JSON.stringify(frame1)).not.toBe(JSON.stringify(frame0))
  })

  it('produces a different cell set for different seeds', () => {
    const a = getAngelRenderData(1, 0, 0, 0)
    const b = getAngelRenderData(2, 0, 0, 0)
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a))
  })

  it('translates positions by the anchor without changing chars or colors', () => {
    const at0 = getAngelRenderData(7, 0, 0, 0)
    const at10 = getAngelRenderData(7, 10, 20, 0)
    expect(at10.length).toBe(at0.length)
    for (let i = 0; i < at0.length; i++) {
      expect(at10[i].pos.x - at0[i].pos.x).toBe(10)
      expect(at10[i].pos.y - at0[i].pos.y).toBe(20)
      expect(at10[i].char).toBe(at0[i].char)
      expect(at10[i].color).toBe(at0[i].color)
    }
  })

  it('always includes the center eye (the 9x9 anchor center cell)', () => {
    // generateTemplate hardcodes roles[cy][cx] = 1 (eye) — the center
    // cell is always present, regardless of seed.
    const center = Math.floor(ANGEL_BODY_SIZE / 2)
    const cells = getAngelRenderData(99, 0, 0, 0)
    const centerCell = cells.find(c => c.pos.x === center && c.pos.y === center)
    expect(centerCell).toBeDefined()
  })

  it('cycles through 6 frames and wraps', () => {
    // FRAME_COUNT = 6. After 6 * ANGEL_ANIMATION_FRAME_MS the frame
    // index wraps back to 0, so the output should match t=0.
    const wrapTime = ANGEL_ANIMATION_FRAME_MS * 6
    const frame0 = getAngelRenderData(42, 0, 0, 0)
    const wrapped = getAngelRenderData(42, 0, 0, wrapTime)
    expect(JSON.stringify(wrapped)).toBe(JSON.stringify(frame0))
  })

  it('produces a kaleidoscopically symmetric body — top-half cells mirror to the bottom half', () => {
    const center = Math.floor(ANGEL_BODY_SIZE / 2)
    const cells = getAngelRenderData(13, 0, 0, 0)
    const byKey = new Map(cells.map(c => [`${String(c.pos.x)},${String(c.pos.y)}`, c]))
    for (const c of cells) {
      // For every cell in the top-left quadrant, the mirror in the
      // bottom-right quadrant must also be filled (color matches; char
      // may differ if the glyph has an axis-flip rule like `<` → `>`,
      // but the cell is non-void).
      if (c.pos.x > center || c.pos.y > center) continue
      const mx = ANGEL_BODY_SIZE - 1 - c.pos.x
      const my = ANGEL_BODY_SIZE - 1 - c.pos.y
      const mirror = byKey.get(`${String(mx)},${String(my)}`)
      expect(mirror).toBeDefined()
      expect(mirror?.color).toBe(c.color)
    }
  })
})
