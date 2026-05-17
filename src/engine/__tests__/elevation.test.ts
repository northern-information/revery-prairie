import { ELEVATION_LIFT_FRACTION, getCellSideQuads, getElevationLift } from '../projection'
import { describe, expect, it } from 'vitest'

describe('getElevationLift', () => {
  const charHeight = 16

  it('returns 0 for the default elevation of 50', () => {
    expect(getElevationLift(50, charHeight)).toBeCloseTo(0)
  })

  it('returns 0 when elevation is undefined (cave / out of bounds)', () => {
    expect(getElevationLift(undefined, charHeight)).toBe(0)
  })

  it('lifts up (negative y) at max elevation', () => {
    const lift = getElevationLift(100, charHeight)
    expect(lift).toBe(-charHeight * ELEVATION_LIFT_FRACTION)
    expect(lift).toBeLessThan(0)
  })

  it('sinks down (positive y) at min elevation', () => {
    const lift = getElevationLift(0, charHeight)
    expect(lift).toBe(charHeight * ELEVATION_LIFT_FRACTION)
    expect(lift).toBeGreaterThan(0)
  })

  it('is monotonic: higher elevation -> smaller (more negative) y', () => {
    const samples = [0, 10, 25, 40, 50, 60, 75, 90, 100]
    const lifts = samples.map(e => getElevationLift(e, charHeight))
    for (let i = 1; i < lifts.length; i++) {
      expect(lifts[i]).toBeLessThanOrEqual(lifts[i - 1])
    }
  })

  it('scales linearly with charHeight', () => {
    const a = getElevationLift(80, 16)
    const b = getElevationLift(80, 32)
    expect(b).toBeCloseTo(a * 2, 5)
  })
})

describe('getCellSideQuads', () => {
  const px = 100
  const py = 200
  const charWidth = 8
  const charHeight = 16

  it('returns null when lift is 0 (flat)', () => {
    expect(getCellSideQuads(px, py, charWidth, charHeight, 0)).toBeNull()
  })

  it('returns null when lift is positive (sunken)', () => {
    expect(getCellSideQuads(px, py, charWidth, charHeight, 5)).toBeNull()
  })

  it('returns two 4-point quads when lift is negative (raised)', () => {
    const quads = getCellSideQuads(px, py, charWidth, charHeight, -4)
    expect(quads).not.toBeNull()
    expect(quads?.leftQuad).toHaveLength(4)
    expect(quads?.rightQuad).toHaveLength(4)
  })

  it('left and right quads share the bottom-apex edge of the lifted top diamond', () => {
    const lift = -4
    const quads = getCellSideQuads(px, py, charWidth, charHeight, lift)
    if (!quads) throw new Error('expected quads')
    // Left quad's second point is the lifted top's bottom apex.
    // Right quad's first point should be the same bottom apex (continuous, no gap).
    expect(quads.leftQuad[1]).toEqual(quads.rightQuad[0])
  })

  it('left and right quads share the bottom-apex edge of the flat-baseline diamond', () => {
    const lift = -4
    const quads = getCellSideQuads(px, py, charWidth, charHeight, lift)
    if (!quads) throw new Error('expected quads')
    // Left quad's third point and right quad's last point are both base.bottom.
    expect(quads.leftQuad[2]).toEqual(quads.rightQuad[3])
  })

  it('top edges of the quads sit at the lifted diamond, bottom edges at the flat baseline', () => {
    const lift = -4
    const quads = getCellSideQuads(px, py, charWidth, charHeight, lift)
    if (!quads) throw new Error('expected quads')
    // Lifted-diamond left vertex is at y = py + charHeight/2.
    // Flat-baseline diamond left vertex is at y = (py - lift) + charHeight/2.
    const liftedLeftY = quads.leftQuad[0][1]
    const baseLeftY = quads.leftQuad[3][1]
    expect(liftedLeftY).toBe(py + charHeight / 2)
    expect(baseLeftY).toBe(py - lift + charHeight / 2)
    expect(baseLeftY).toBeGreaterThan(liftedLeftY)
  })
})
