// Engine tests run in a node environment. Stub OffscreenCanvas before importing
// the pass module so the cache-building path has a working canvas factory.
class FakeOffscreenCanvas {
  width: number
  height: number
  constructor(w: number, h: number) {
    this.width = w
    this.height = h
  }
  getContext(): unknown {
    let fillStyle: unknown = ''
    return {
      createPattern: (): Record<string, never> => ({}),
      fillRect: (): void => undefined,
      beginPath: (): void => undefined,
      moveTo: (): void => undefined,
      lineTo: (): void => undefined,
      closePath: (): void => undefined,
      fill: (): void => undefined,
      set fillStyle(v: unknown) {
        fillStyle = v
      },
      get fillStyle(): unknown {
        return fillStyle
      },
    }
  }
}
;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = FakeOffscreenCanvas

import { __testing, filmGrainOverlayPass } from '../render/passes/filmGrainOverlay'
import { TileType } from '../types'
import { createTestState } from './helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CharMetrics, Tile } from '../types'

const CHAR_WIDTH = 10
const CHAR_HEIGHT = 16
const METRICS: CharMetrics = { charWidth: CHAR_WIDTH, charHeight: CHAR_HEIGHT, font: '16px monospace' }

const makeFlatMap = (width: number, height: number, type: TileType = TileType.Dirt): Tile[][] => {
  // Keep map content trivial; the pass treats every map cell uniformly.
  const map: Tile[][] = []
  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < width; x++) row.push({ type })
    map.push(row)
  }
  return map
}

const makeFakeImage = (): HTMLImageElement => {
  // Real Image() in jsdom doesn't load remote URLs; we build a minimal stand-in
  // that satisfies createPattern's source-image contract for tests.
  return { width: 64, height: 64 } as unknown as HTMLImageElement
}

interface DrawCall {
  kind: 'drawImage'
  globalAlpha: number
  dx: number
  dy: number
}

const makeRecordingCtx = (): {
  ctx: CanvasRenderingContext2D
  calls: DrawCall[]
} => {
  const calls: DrawCall[] = []
  const state = { globalAlpha: 1, fillStyle: '#000' as string | CanvasPattern }
  const ctx = {
    get globalAlpha() {
      return state.globalAlpha
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v
    },
    get fillStyle() {
      return state.fillStyle
    },
    set fillStyle(v: string | CanvasPattern) {
      state.fillStyle = v
    },
    createPattern: vi.fn((): CanvasPattern => ({}) as unknown as CanvasPattern),
    fillRect: vi.fn(),
    drawImage: vi.fn((_img: unknown, dx: number, dy: number) => {
      calls.push({ kind: 'drawImage', globalAlpha: state.globalAlpha, dx, dy })
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
    it('draws at full FILM_GRAIN_ALPHA at spring equinox (phase 0.0, intensity 0.0)', () => {
      __testing.setGrainImage(makeFakeImage())
      __testing.setGrainReady(true)
      const state = createTestState()
      state.map = makeFlatMap(state.mapWidth, state.mapHeight)
      state.seasonalPhase = 0.0

      const { ctx, calls } = makeRecordingCtx()
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)

      expect(calls).toHaveLength(1)
      // Spring equinox: washIntensity = 0, alpha = 0.2 * 1 = 0.2
      expect(calls[0].globalAlpha).toBeCloseTo(0.2, 6)
    })

    it('dims to roughly 0.12 at winter solstice (phase 0.75, intensity 0.4)', () => {
      __testing.setGrainImage(makeFakeImage())
      __testing.setGrainReady(true)
      const state = createTestState()
      state.map = makeFlatMap(state.mapWidth, state.mapHeight)
      state.seasonalPhase = 0.75

      const { ctx, calls } = makeRecordingCtx()
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)

      // Winter solstice anchor intensity is 0.4 → alpha = 0.2 * (1 - 0.4) = 0.12
      expect(calls[0].globalAlpha).toBeCloseTo(0.12, 6)
    })

    it('restores globalAlpha after drawing', () => {
      __testing.setGrainImage(makeFakeImage())
      __testing.setGrainReady(true)
      const state = createTestState()
      state.map = makeFlatMap(state.mapWidth, state.mapHeight)
      state.seasonalPhase = 0.0

      const { ctx } = makeRecordingCtx()
      ctx.globalAlpha = 0.5
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)
      expect(ctx.globalAlpha).toBeCloseTo(0.5, 6)
    })
  })

  describe('cache invalidation', () => {
    it('builds a cache entry on the first draw and reuses it on subsequent draws', () => {
      const image = makeFakeImage()
      __testing.setGrainImage(image)
      __testing.setGrainReady(true)
      const state = createTestState()
      state.map = makeFlatMap(state.mapWidth, state.mapHeight)

      const { ctx } = makeRecordingCtx()
      expect(__testing.getCacheEntry(state.map)).toBeUndefined()
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)
      const firstEntry = __testing.getCacheEntry(state.map)
      expect(firstEntry).toBeDefined()
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)
      expect(__testing.getCacheEntry(state.map)).toBe(firstEntry)
    })

    it('creates a new cache entry when state.map is swapped (zone change)', () => {
      const image = makeFakeImage()
      __testing.setGrainImage(image)
      __testing.setGrainReady(true)
      const state = createTestState()
      const mapA = makeFlatMap(state.mapWidth, state.mapHeight)
      state.map = mapA

      const { ctx } = makeRecordingCtx()
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)
      const entryA = __testing.getCacheEntry(mapA)
      expect(entryA).toBeDefined()

      const mapB = makeFlatMap(state.mapWidth, state.mapHeight, TileType.CaveFloor)
      state.map = mapB
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)
      const entryB = __testing.getCacheEntry(mapB)
      expect(entryB).toBeDefined()
      expect(entryB).not.toBe(entryA)
    })

    it('rebuilds cache when charWidth or charHeight changes (font scale toggle)', () => {
      const image = makeFakeImage()
      __testing.setGrainImage(image)
      __testing.setGrainReady(true)
      const state = createTestState()
      state.map = makeFlatMap(state.mapWidth, state.mapHeight)

      const { ctx } = makeRecordingCtx()
      filmGrainOverlayPass.draw(ctx, state, METRICS, 0)
      const entry1 = __testing.getCacheEntry(state.map)
      expect(entry1).toBeDefined()

      const zoomedMetrics: CharMetrics = { charWidth: 20, charHeight: 32, font: '32px monospace' }
      filmGrainOverlayPass.draw(ctx, state, zoomedMetrics, 0)
      const entry2 = __testing.getCacheEntry(state.map)
      expect(entry2).toBeDefined()
      expect(entry2).not.toBe(entry1)
      expect(entry2?.charWidth).toBe(20)
      expect(entry2?.charHeight).toBe(32)
    })
  })

  describe('non-space masking', () => {
    it('paints one iso diamond per non-Space tile during bake (regression for bounding-box bleed)', () => {
      // Replace the OffscreenCanvas stub with a recording one for this test only.
      const recorded: { fillCount: number } = { fillCount: 0 }
      class RecordingOffscreenCanvas {
        width: number
        height: number
        constructor(w: number, h: number) {
          this.width = w
          this.height = h
        }
        getContext(): unknown {
          return {
            createPattern: (): Record<string, never> => ({}),
            fillRect: (): void => undefined,
            beginPath: (): void => undefined,
            moveTo: (): void => undefined,
            lineTo: (): void => undefined,
            closePath: (): void => undefined,
            fill: (): void => {
              recorded.fillCount++
            },
            set fillStyle(_v: unknown) {
              // unused
            },
            get fillStyle(): unknown {
              return ''
            },
          }
        }
      }
      const prevOC = (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas
      ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = RecordingOffscreenCanvas
      try {
        // 4×4 map: 6 Dirt tiles, 10 Space tiles
        const map: Tile[][] = [
          [{ type: TileType.Space }, { type: TileType.Space }, { type: TileType.Space }, { type: TileType.Space }],
          [{ type: TileType.Space }, { type: TileType.Dirt }, { type: TileType.Dirt }, { type: TileType.Space }],
          [{ type: TileType.Space }, { type: TileType.Dirt }, { type: TileType.Dirt }, { type: TileType.Space }],
          [{ type: TileType.Dirt }, { type: TileType.Dirt }, { type: TileType.Space }, { type: TileType.Space }],
        ]
        const image = makeFakeImage()
        __testing.getOrBuildCache(map, 4, 4, CHAR_WIDTH, CHAR_HEIGHT, image)
        expect(recorded.fillCount).toBe(6)
      } finally {
        ;(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = prevOC
      }
    })
  })

  describe('degenerate inputs', () => {
    it('returns early without crashing when mapWidth or mapHeight is 0', () => {
      __testing.setGrainImage(makeFakeImage())
      __testing.setGrainReady(true)
      const state = createTestState()
      state.map = []
      state.mapWidth = 0
      state.mapHeight = 0

      const { ctx, calls } = makeRecordingCtx()
      expect(() => {
        filmGrainOverlayPass.draw(ctx, state, METRICS, 0)
      }).not.toThrow()
      expect(calls).toHaveLength(0)
    })
  })
})
