// Stub OffscreenCanvas before importing the pass module so the tile-bake
// path has a working canvas factory in the node test environment.
class FakeOffscreenCanvas {
  width: number
  height: number
  constructor(w: number, h: number) {
    this.width = w
    this.height = h
  }
  getContext(): unknown {
    let fillStyle: unknown = ''
    let globalCompositeOperation: GlobalCompositeOperation = 'source-over'
    return {
      drawImage: (): void => undefined,
      fillRect: (): void => undefined,
      set fillStyle(v: unknown) {
        fillStyle = v
      },
      get fillStyle(): unknown {
        return fillStyle
      },
      set globalCompositeOperation(v: GlobalCompositeOperation) {
        globalCompositeOperation = v
      },
      get globalCompositeOperation(): GlobalCompositeOperation {
        return globalCompositeOperation
      },
    }
  }
}
;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = FakeOffscreenCanvas

import { __testing, filmGrainOverlayPass } from '../render/passes/filmGrainOverlay'
import { createTestState } from './helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CharMetrics } from '../types'

const CHAR_WIDTH = 10
const CHAR_HEIGHT = 16
const METRICS: CharMetrics = { charWidth: CHAR_WIDTH, charHeight: CHAR_HEIGHT, font: '16px monospace' }

const makeFakeImage = (): HTMLImageElement => {
  return { width: 512, height: 512 } as unknown as HTMLImageElement
}

interface DrawCall {
  kind: 'drawImage'
  globalAlpha: number
  x: number
  y: number
}

const makeRecordingCtx = (): {
  ctx: CanvasRenderingContext2D
  calls: DrawCall[]
} => {
  const calls: DrawCall[] = []
  const state = { globalAlpha: 1 }
  const ctx = {
    get globalAlpha() {
      return state.globalAlpha
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v
    },
    canvas: { width: 1024, height: 1024 } as HTMLCanvasElement,
    drawImage: vi.fn((_img: unknown, x: number, y: number) => {
      calls.push({ kind: 'drawImage', globalAlpha: state.globalAlpha, x, y })
    }),
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('film grain overlay pass', () => {
  beforeEach(() => {
    __testing.setGrainReady(false)
    __testing.setGrainImage(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isActive', () => {
    it('is inactive while grainReady is false', () => {
      const state = createTestState()
      expect(filmGrainOverlayPass.isActive(state)).toBe(false)
    })

    it('is active once grainReady is true and an image is set', () => {
      __testing.setGrainImage(makeFakeImage())
      __testing.setGrainReady(true)
      const state = createTestState()
      expect(filmGrainOverlayPass.isActive(state)).toBe(true)
    })

    it('stays inactive when only grainReady is true without an image (load-failure analogue)', () => {
      __testing.setGrainImage(null)
      __testing.setGrainReady(true)
      const state = createTestState()
      expect(filmGrainOverlayPass.isActive(state)).toBe(false)
    })
  })

  describe('draw — seasonal alpha curve', () => {
    // FILM_GRAIN_ALPHA (0.2) is baked into the tile canvas during the
    // one-shot bake. Per-frame draws leave globalAlpha at its incoming
    // value when the seasonal wash is inactive; only the winter
    // attenuation (1 - washIntensity) is applied at draw-time.

    it('leaves globalAlpha untouched at spring equinox (intensity 0)', () => {
      __testing.setGrainImage(makeFakeImage())
      __testing.setGrainReady(true)
      const state = createTestState()
      state.seasonalPhase = 0.0

      const { ctx, calls } = makeRecordingCtx()
      ctx.globalAlpha = 1
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)

      // 1024×1024 canvas / 512 tile → 2×2 grid, with one tile of
      // overscan on each side for camera-pan continuity → up to 3×3 = 9
      // tiles. At least 4 must be drawn to cover the canvas.
      expect(calls.length).toBeGreaterThanOrEqual(4)
      // All blits inherit the incoming globalAlpha unchanged.
      for (const c of calls) {
        expect(c.globalAlpha).toBeCloseTo(1, 6)
      }
    })

    it('applies seasonal attenuation at winter solstice (phase 0.75, intensity 0.4 → 0.6 multiplier)', () => {
      __testing.setGrainImage(makeFakeImage())
      __testing.setGrainReady(true)
      const state = createTestState()
      state.seasonalPhase = 0.75

      const { ctx, calls } = makeRecordingCtx()
      ctx.globalAlpha = 1
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)

      expect(calls.length).toBeGreaterThanOrEqual(4)
      // Winter: globalAlpha modulated by (1 - 0.4) = 0.6 during blits.
      // The cache's baked 0.2 alpha multiplies through, so effective
      // visual alpha is 0.12 — same as the original draw-time math.
      for (const c of calls) {
        expect(c.globalAlpha).toBeCloseTo(0.6, 6)
      }
    })

    it('restores globalAlpha after drawing in winter (when the modulation path runs)', () => {
      __testing.setGrainImage(makeFakeImage())
      __testing.setGrainReady(true)
      const state = createTestState()
      state.seasonalPhase = 0.75

      const { ctx } = makeRecordingCtx()
      ctx.globalAlpha = 0.5
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)
      expect(ctx.globalAlpha).toBeCloseTo(0.5, 6)
    })
  })

  describe('viewport coverage', () => {
    it('covers the entire canvas with the tile grid (no masked region — grain extends across the Space border)', () => {
      __testing.setGrainImage(makeFakeImage())
      __testing.setGrainReady(true)
      const state = createTestState()

      const { ctx, calls } = makeRecordingCtx()
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)

      // Tiles must collectively span at least [0, canvasW) × [0, canvasH).
      const minX = Math.min(...calls.map(c => c.x))
      const minY = Math.min(...calls.map(c => c.y))
      const maxX = Math.max(...calls.map(c => c.x))
      const maxY = Math.max(...calls.map(c => c.y))
      // Grid origin sits at or below 0, last tile starts at or beyond
      // the far edge (canvasW - TILE_SIZE), so a full 512×512 blit
      // there covers the right/bottom edge.
      expect(minX).toBeLessThanOrEqual(0)
      expect(minY).toBeLessThanOrEqual(0)
      expect(maxX + 512).toBeGreaterThanOrEqual(1024)
      expect(maxY + 512).toBeGreaterThanOrEqual(1024)
    })
  })
})
