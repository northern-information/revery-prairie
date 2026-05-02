import { describe, expect, it } from 'vitest'
import { screenToTile } from '../projection'
import { getVisibleTileBounds, isTileInVisibleViewport } from '../viewportBounds'

const charWidth = 10
const charHeight = 16

const sampleCanvasPixels = (canvasWidth: number, canvasHeight: number, step = 4): { cx: number; cy: number }[] => {
  const samples: { cx: number; cy: number }[] = []
  for (let cy = 0; cy < canvasHeight; cy += step) {
    for (let cx = 0; cx < canvasWidth; cx += step) {
      samples.push({ cx, cy })
    }
  }
  // Always include the four corners.
  samples.push({ cx: 0, cy: 0 })
  samples.push({ cx: canvasWidth - 1, cy: 0 })
  samples.push({ cx: 0, cy: canvasHeight - 1 })
  samples.push({ cx: canvasWidth - 1, cy: canvasHeight - 1 })
  return samples
}

describe('getVisibleTileBounds', () => {
  describe('cartesian mode', () => {
    it('returns [0, vw) × [0, vh) with no margin', () => {
      expect(getVisibleTileBounds(false, 30, 20)).toEqual({
        vxStart: 0,
        vxEnd: 30,
        vyStart: 0,
        vyEnd: 20,
      })
    })

    it('expands symmetrically when margin is supplied', () => {
      expect(getVisibleTileBounds(false, 30, 20, 4)).toEqual({
        vxStart: -4,
        vxEnd: 34,
        vyStart: -4,
        vyEnd: 24,
      })
    })
  })

  describe('iso mode', () => {
    it('matches the main tile loop expansion in renderer.ts (vw=30, vh=20)', () => {
      // Mirrors `renderer.ts` ~line 1330-1335 literal bounds.
      expect(getVisibleTileBounds(true, 30, 20)).toEqual({
        vxStart: -20,
        vxEnd: 50,
        vyStart: -20,
        vyEnd: 50,
      })
    })

    it('expands symmetrically when margin is supplied', () => {
      const m = 5
      expect(getVisibleTileBounds(true, 30, 20, m)).toEqual({
        vxStart: -25,
        vxEnd: 55,
        vyStart: -25,
        vyEnd: 55,
      })
    })

    // The chosen bounds [-vh, vw+vh) on both axes (matching the renderer's
    // main tile loop at `renderer.ts:1330-1335`) cover the iso parallelogram
    // when `vh >= vw/4` and `vw >= vh/4`. Standard browser viewports
    // comfortably satisfy this; extreme aspect ratios past 4:1 are out of
    // scope for this helper.
    const cases = [
      { name: 'square viewport', vw: 20, vh: 20 },
      { name: 'small viewport', vw: 5, vh: 5 },
      { name: 'wide viewport', vw: 40, vh: 25 },
      { name: 'tall viewport', vw: 25, vh: 40 },
    ]

    for (const { name, vw, vh } of cases) {
      it(`covers every tile resolved by screenToTile across the canvas — ${name}`, () => {
        const canvasWidth = vw * charWidth
        const canvasHeight = vh * charHeight
        const camera = { x: 0, y: 0 }
        const bounds = getVisibleTileBounds(true, vw, vh)
        for (const { cx, cy } of sampleCanvasPixels(canvasWidth, canvasHeight)) {
          const tile = screenToTile(cx, cy, camera, charWidth, charHeight, true, vw, vh)
          // Camera at origin → world tile == viewport tile.
          expect(tile.x).toBeGreaterThanOrEqual(bounds.vxStart)
          expect(tile.x).toBeLessThan(bounds.vxEnd)
          expect(tile.y).toBeGreaterThanOrEqual(bounds.vyStart)
          expect(tile.y).toBeLessThan(bounds.vyEnd)
        }
      })
    }
  })
})

describe('isTileInVisibleViewport', () => {
  it('agrees with getVisibleTileBounds in cartesian mode', () => {
    const vw = 30
    const vh = 20
    const bounds = getVisibleTileBounds(false, vw, vh)
    for (let vy = -2; vy < vh + 2; vy++) {
      for (let vx = -2; vx < vw + 2; vx++) {
        const expected =
          vx >= bounds.vxStart && vx < bounds.vxEnd && vy >= bounds.vyStart && vy < bounds.vyEnd
        expect(isTileInVisibleViewport(vx, vy, false, vw, vh)).toBe(expected)
      }
    }
  })

  it('agrees with getVisibleTileBounds in iso mode', () => {
    const vw = 30
    const vh = 20
    const bounds = getVisibleTileBounds(true, vw, vh)
    // Spot-check a grid spanning the iso bounds plus a frame outside.
    for (let vy = bounds.vyStart - 3; vy < bounds.vyEnd + 3; vy++) {
      for (let vx = bounds.vxStart - 3; vx < bounds.vxEnd + 3; vx++) {
        const expected =
          vx >= bounds.vxStart && vx < bounds.vxEnd && vy >= bounds.vyStart && vy < bounds.vyEnd
        expect(isTileInVisibleViewport(vx, vy, true, vw, vh)).toBe(expected)
      }
    }
  })

  it('respects margin', () => {
    const vw = 10
    const vh = 8
    // Cartesian: tile just outside rect not visible without margin, visible with margin.
    expect(isTileInVisibleViewport(-1, 0, false, vw, vh)).toBe(false)
    expect(isTileInVisibleViewport(-1, 0, false, vw, vh, 2)).toBe(true)
    expect(isTileInVisibleViewport(-3, 0, false, vw, vh, 2)).toBe(false)

    // Iso: tile one past iso end not visible without margin, visible with margin.
    const isoEnd = vw + vh
    expect(isTileInVisibleViewport(isoEnd, 0, true, vw, vh)).toBe(false)
    expect(isTileInVisibleViewport(isoEnd, 0, true, vw, vh, 1)).toBe(true)
  })
})

describe('iso parallelogram corner tiles', () => {
  // The iso visible region is a parallelogram. Its four corner tiles
  // (camera at origin) sit at:
  //   left:   (0, 0)            ← canvas top-left maps near here
  //   top:    (vw, -vh) ish via screenToTile of canvas top-right
  //   right:  (vw, vh)
  //   bottom: (-vh, vw) ish via screenToTile of canvas bottom-left
  // The exact corners depend on the iso transform, but every tile that
  // any canvas pixel resolves to MUST be inside `getVisibleTileBounds`.
  it('all canvas-corner tiles are accepted by isTileInVisibleViewport', () => {
    const vw = 30
    const vh = 20
    const canvasWidth = vw * charWidth
    const canvasHeight = vh * charHeight
    const camera = { x: 0, y: 0 }
    const corners = [
      { cx: 0, cy: 0 },
      { cx: canvasWidth - 1, cy: 0 },
      { cx: 0, cy: canvasHeight - 1 },
      { cx: canvasWidth - 1, cy: canvasHeight - 1 },
    ]
    for (const { cx, cy } of corners) {
      const tile = screenToTile(cx, cy, camera, charWidth, charHeight, true, vw, vh)
      expect(isTileInVisibleViewport(tile.x, tile.y, true, vw, vh)).toBe(true)
    }
  })
})

describe('regression: angel aura iso-corner coverage', () => {
  // Both passes (gold aura iteration, rain aura radial) previously skipped
  // tiles outside [0, vw) × [0, vh). After the fix, every canvas pixel's
  // resolved tile must pass `isTileInVisibleViewport(..., iso=true, ...)` so
  // an angel parked near a viewport edge can paint into the iso corners.
  const vw = 35
  const vh = 25
  const canvasWidth = vw * charWidth
  const canvasHeight = vh * charHeight
  const camera = { x: 0, y: 0 }

  it('iso-mode rejects tiles strictly outside the parallelogram only', () => {
    // A tile far past the iso end is rejected.
    const farX = vw + vh + 5
    expect(isTileInVisibleViewport(farX, 0, true, vw, vh)).toBe(false)
    // A tile far into negative space is rejected.
    expect(isTileInVisibleViewport(-vh - 5, 0, true, vw, vh)).toBe(false)
  })

  it('iso-mode accepts every tile resolved from canvas pixels', () => {
    for (const { cx, cy } of sampleCanvasPixels(canvasWidth, canvasHeight, 8)) {
      const tile = screenToTile(cx, cy, camera, charWidth, charHeight, true, vw, vh)
      expect(isTileInVisibleViewport(tile.x, tile.y, true, vw, vh)).toBe(true)
    }
  })
})
