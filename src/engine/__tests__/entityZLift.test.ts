import { ANGEL_FLOAT_LIFT_PX, ELEVATION_TIER_COUNT, ELEVATION_TIER_LIFT_PX } from '../tileBg'
import { describe, expect, it } from 'vitest'

// Canvas rendering cannot be unit-tested per CLAUDE.md, so the
// deferred-draw flush itself is verified visually by the user. These
// tests guard the constant the renderer relies on: angels lift by
// `ANGEL_FLOAT_LIFT_PX` so the multi-glyph body floats above the
// tallest possible terrain cube.
describe('ANGEL_FLOAT_LIFT_PX', () => {
  it('equals (ELEVATION_TIER_COUNT - 1) * ELEVATION_TIER_LIFT_PX', () => {
    expect(ANGEL_FLOAT_LIFT_PX).toBe((ELEVATION_TIER_COUNT - 1) * ELEVATION_TIER_LIFT_PX)
  })

  it('is positive (subtracting it lifts the entity up in canvas Y)', () => {
    expect(ANGEL_FLOAT_LIFT_PX).toBeGreaterThan(0)
  })

  it('clears the tallest possible cube wall', () => {
    // When a tier-(N-1) tile abuts a tier-0 tile, the wall extrudes
    // (N-1) * ELEVATION_TIER_LIFT_PX pixels. Angels must clear at least
    // this far to read as floating, not embedded.
    const maxWallDepth = (ELEVATION_TIER_COUNT - 1) * ELEVATION_TIER_LIFT_PX
    expect(ANGEL_FLOAT_LIFT_PX).toBeGreaterThanOrEqual(maxWallDepth)
  })
})
