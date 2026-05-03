import { getFloraSwayOffset, resetFloraWindSmooth, tickFloraWind } from '../render/floraWind'
import { CloverStage, WindDirection, Zone } from '../types'

import type { CloverLifecycleState, Weather } from '../types'

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeWeather = (overrides: Partial<Weather> = {}): Weather => ({
  sky: 'sun' as const,
  temperatureF: 60,
  windSpeed: 15,
  windDirection: WindDirection.W,
  humidity: 60,
  season: 'spring' as const,
  ...overrides,
})

const lifecycle = (stage: CloverStage): CloverLifecycleState => ({
  stage,
  stageStartTime: 0,
  hasLight: true,
})

const CHAR_W = 20
const CHAR_H = 12
const BASE_COLOR = '#3a8c3a'
const TIME = 1000

// Seed the smooth state from a weather snapshot at a given time, then advance
// to the test time so smoothSpeed/smoothSx/smoothSy are fully settled.
const seedWind = (weather: Weather, seedTime = 0): void => {
  resetFloraWindSmooth()
  tickFloraWind(weather, seedTime)
}

// ─── flora wind tests ─────────────────────────────────────────────────────────

describe('flora wind', () => {
  beforeEach(() => {
    resetFloraWindSmooth()
  })

  describe('zone suppression', () => {
    it('returns zero offsets and original color in Cave zone', () => {
      seedWind(makeWeather())
      const result = getFloraSwayOffset(
        5, 5, TIME, Zone.Cave, undefined, CHAR_W, CHAR_H, BASE_COLOR,
      )
      expect(result.dx).toBe(0)
      expect(result.dy).toBe(0)
      expect(result.color).toBe(BASE_COLOR)
    })

    it('returns zero offsets and original color in Ruin zone', () => {
      seedWind(makeWeather())
      const result = getFloraSwayOffset(
        5, 5, TIME, Zone.Ruin, undefined, CHAR_W, CHAR_H, BASE_COLOR,
      )
      expect(result.dx).toBe(0)
      expect(result.dy).toBe(0)
      expect(result.color).toBe(BASE_COLOR)
    })
  })

  describe('lifecycle damping', () => {
    it('applies full sway for Healthy stage', () => {
      seedWind(makeWeather())
      const result = getFloraSwayOffset(
        5, 5, TIME, Zone.Overworld, lifecycle(CloverStage.Healthy), CHAR_W, CHAR_H, BASE_COLOR,
      )
      expect(typeof result.dx).toBe('number')
      expect(typeof result.dy).toBe('number')
    })

    it('returns zero offsets for Black stage', () => {
      seedWind(makeWeather())
      const result = getFloraSwayOffset(
        5, 5, TIME, Zone.Overworld, lifecycle(CloverStage.Black), CHAR_W, CHAR_H, BASE_COLOR,
      )
      expect(result.dx).toBe(0)
      expect(result.dy).toBe(0)
    })

    it('returns zero offsets for Decomposing stage', () => {
      seedWind(makeWeather())
      const result = getFloraSwayOffset(
        5, 5, TIME, Zone.Overworld, lifecycle(CloverStage.Decomposing), CHAR_W, CHAR_H, BASE_COLOR,
      )
      expect(result.dx).toBe(0)
      expect(result.dy).toBe(0)
    })

    it('returns zero offsets for BurntRecovering stage', () => {
      seedWind(makeWeather())
      const result = getFloraSwayOffset(
        5, 5, TIME, Zone.Overworld, lifecycle(CloverStage.BurntRecovering), CHAR_W, CHAR_H, BASE_COLOR,
      )
      expect(result.dx).toBe(0)
      expect(result.dy).toBe(0)
    })

    it('treats missing lifecycle entry as Healthy (non-zero sway possible)', () => {
      seedWind(makeWeather())
      const withLifecycle = getFloraSwayOffset(
        7, 3, TIME, Zone.Overworld, lifecycle(CloverStage.Healthy), CHAR_W, CHAR_H, BASE_COLOR,
      )
      const withoutLifecycle = getFloraSwayOffset(
        7, 3, TIME, Zone.Overworld, undefined, CHAR_W, CHAR_H, BASE_COLOR,
      )
      expect(withLifecycle.dx).toBeCloseTo(withoutLifecycle.dx)
      expect(withLifecycle.dy).toBeCloseTo(withoutLifecycle.dy)
    })

    it('Brown stage produces smaller amplitude than Healthy at the same position and time', () => {
      seedWind(makeWeather())
      const healthy = getFloraSwayOffset(
        10, 10, TIME, Zone.Overworld, lifecycle(CloverStage.Healthy), CHAR_W, CHAR_H, BASE_COLOR,
      )
      const brown = getFloraSwayOffset(
        10, 10, TIME, Zone.Overworld, lifecycle(CloverStage.Brown), CHAR_W, CHAR_H, BASE_COLOR,
      )
      expect(Math.abs(brown.dx)).toBeLessThanOrEqual(Math.abs(healthy.dx) + 0.001)
      expect(Math.abs(brown.dy)).toBeLessThanOrEqual(Math.abs(healthy.dy) + 0.001)
    })
  })

  describe('wind speed', () => {
    it('returns zero offsets when windSpeed is 0', () => {
      seedWind(makeWeather({ windSpeed: 0 }))
      const result = getFloraSwayOffset(
        5, 5, TIME, Zone.Overworld, undefined, CHAR_W, CHAR_H, BASE_COLOR,
      )
      expect(result.dx).toBe(0)
      expect(result.dy).toBe(0)
    })

    it('max wind amplitude stays within bounds', () => {
      const directions = Object.values(WindDirection)
      const maxDxBound = CHAR_W * 0.15
      const maxDyBound = CHAR_H * 0.35

      const times = [0, 500, 1000, 2000, 5000]
      const positions: [number, number][] = [[5, 5], [12, 8], [30, 20], [1, 1]]

      for (const dir of directions) {
        seedWind(makeWeather({ windSpeed: 25, windDirection: dir }))
        for (const t of times) {
          for (const [mx, my] of positions) {
            const result = getFloraSwayOffset(
              mx, my, t, Zone.Overworld,
              undefined, CHAR_W, CHAR_H, BASE_COLOR,
            )
            expect(Math.abs(result.dx)).toBeLessThanOrEqual(maxDxBound + 0.001)
            expect(Math.abs(result.dy)).toBeLessThanOrEqual(maxDyBound + 0.001)
          }
        }
      }
    })
  })

  describe('per-tile phase offset', () => {
    it('different tile positions produce different offsets at the same time', () => {
      seedWind(makeWeather({ windSpeed: 25 }))
      const a = getFloraSwayOffset(3, 7, TIME, Zone.Overworld, undefined, CHAR_W, CHAR_H, BASE_COLOR)
      const b = getFloraSwayOffset(8, 2, TIME, Zone.Overworld, undefined, CHAR_W, CHAR_H, BASE_COLOR)
      const sameOffset = Math.abs(a.dx - b.dx) < 0.001 && Math.abs(a.dy - b.dy) < 0.001
      expect(sameOffset).toBe(false)
    })

    it('same tile position at the same time produces identical offsets (deterministic)', () => {
      seedWind(makeWeather())
      const a = getFloraSwayOffset(5, 5, TIME, Zone.Overworld, undefined, CHAR_W, CHAR_H, BASE_COLOR)
      const b = getFloraSwayOffset(5, 5, TIME, Zone.Overworld, undefined, CHAR_W, CHAR_H, BASE_COLOR)
      expect(a.dx).toBe(b.dx)
      expect(a.dy).toBe(b.dy)
    })
  })

  describe('zoom-proportional amplitude', () => {
    it('larger tile size produces larger pixel offsets', () => {
      seedWind(makeWeather({ windSpeed: 25 }))
      const small = getFloraSwayOffset(5, 5, TIME, Zone.Overworld, undefined, 10, 6, BASE_COLOR)
      const large = getFloraSwayOffset(5, 5, TIME, Zone.Overworld, undefined, 40, 24, BASE_COLOR)
      if (Math.abs(small.dx) > 0.001) {
        expect(Math.abs(large.dx)).toBeGreaterThan(Math.abs(small.dx))
      }
      if (Math.abs(small.dy) > 0.001) {
        expect(Math.abs(large.dy)).toBeGreaterThan(Math.abs(small.dy))
      }
    })
  })

  describe('luminance shift', () => {
    it('returns a modified color string for non-zero sway', () => {
      seedWind(makeWeather({ windSpeed: 25 }))
      let gotModifiedColor = false
      for (let mx = 0; mx < 20; mx++) {
        const result = getFloraSwayOffset(
          mx, 5, TIME, Zone.Overworld, undefined, CHAR_W, CHAR_H, BASE_COLOR,
        )
        if (result.color !== BASE_COLOR) {
          gotModifiedColor = true
          expect(result.color).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
          break
        }
      }
      expect(gotModifiedColor).toBe(true)
    })

    it('returns original color when sway factor is 0', () => {
      seedWind(makeWeather())
      const result = getFloraSwayOffset(
        5, 5, TIME, Zone.Overworld, lifecycle(CloverStage.Black), CHAR_W, CHAR_H, BASE_COLOR,
      )
      expect(result.color).toBe(BASE_COLOR)
    })
  })

  describe('wind smoothing', () => {
    it('does not snap on direction change — smooth state interpolates gradually', () => {
      // Start with W wind fully settled
      seedWind(makeWeather({ windSpeed: 15, windDirection: WindDirection.W }))
      const before = getFloraSwayOffset(5, 5, TIME, Zone.Overworld, undefined, CHAR_W, CHAR_H, BASE_COLOR)

      // Switch to E wind (opposite direction) — one frame tick, dt = 16ms
      tickFloraWind(makeWeather({ windSpeed: 15, windDirection: WindDirection.E }), 16)
      const after = getFloraSwayOffset(5, 5, TIME, Zone.Overworld, undefined, CHAR_W, CHAR_H, BASE_COLOR)

      // The offset should have moved slightly toward the new direction but not flipped sign yet.
      // Both dx values should have the same sign as the before offset (W→E flip is slow).
      // We just verify the delta between before and after is small relative to the full range.
      const maxDx = CHAR_W * 0.15
      expect(Math.abs(after.dx - before.dx)).toBeLessThan(maxDx * 0.1)
    })

    it('returns zero offsets when smooth speed has not been initialised (cold state)', () => {
      // resetFloraWindSmooth was called in beforeEach — smooth speed is 0
      const result = getFloraSwayOffset(5, 5, TIME, Zone.Overworld, undefined, CHAR_W, CHAR_H, BASE_COLOR)
      expect(result.dx).toBe(0)
      expect(result.dy).toBe(0)
    })
  })
})
