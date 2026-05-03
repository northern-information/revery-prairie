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
  it('matches the main tile loop expansion in renderer.ts (vw=30, vh=20)', () => {
    expect(getVisibleTileBounds(30, 20)).toEqual({
      vxStart: -20,
      vxEnd: 50,
      vyStart: -20,
      vyEnd: 50,
    })
  })

  it('expands symmetrically when margin is supplied', () => {
    const m = 5
    expect(getVisibleTileBounds(30, 20, m)).toEqual({
      vxStart: -25,
      vxEnd: 55,
      vyStart: -25,
      vyEnd: 55,
    })
  })

  // The chosen bounds [-vh, vw+vh) on both axes (matching the renderer's
  // main tile loop) cover the parallelogram when `vh >= vw/4` and
  // `vw >= vh/4`. Standard browser viewports comfortably satisfy this;
  // extreme aspect ratios past 4:1 are out of scope for this helper.
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
      const bounds = getVisibleTileBounds(vw, vh)
      for (const { cx, cy } of sampleCanvasPixels(canvasWidth, canvasHeight)) {
        const tile = screenToTile(cx, cy, camera, charWidth, charHeight, vw, vh)
        // Camera at origin → world tile == viewport tile.
        expect(tile.x).toBeGreaterThanOrEqual(bounds.vxStart)
        expect(tile.x).toBeLessThan(bounds.vxEnd)
        expect(tile.y).toBeGreaterThanOrEqual(bounds.vyStart)
        expect(tile.y).toBeLessThan(bounds.vyEnd)
      }
    })
  }
})

describe('isTileInVisibleViewport', () => {
  it('agrees with getVisibleTileBounds', () => {
    const vw = 30
    const vh = 20
    const bounds = getVisibleTileBounds(vw, vh)
    // Spot-check a grid spanning the bounds plus a frame outside.
    for (let vy = bounds.vyStart - 3; vy < bounds.vyEnd + 3; vy++) {
      for (let vx = bounds.vxStart - 3; vx < bounds.vxEnd + 3; vx++) {
        const expected =
          vx >= bounds.vxStart && vx < bounds.vxEnd && vy >= bounds.vyStart && vy < bounds.vyEnd
        expect(isTileInVisibleViewport(vx, vy, vw, vh)).toBe(expected)
      }
    }
  })

  it('respects margin', () => {
    const vw = 10
    const vh = 8
    const isoEnd = vw + vh
    expect(isTileInVisibleViewport(isoEnd, 0, vw, vh)).toBe(false)
    expect(isTileInVisibleViewport(isoEnd, 0, vw, vh, 1)).toBe(true)
  })
})

describe('parallelogram corner tiles', () => {
  // The visible region is a parallelogram. Its four corner tiles
  // (camera at origin) sit at:
  //   left:   (0, 0)            ← canvas top-left maps near here
  //   top:    (vw, -vh) ish via screenToTile of canvas top-right
  //   right:  (vw, vh)
  //   bottom: (-vh, vw) ish via screenToTile of canvas bottom-left
  // The exact corners depend on the transform, but every tile that any
  // canvas pixel resolves to MUST be inside `getVisibleTileBounds`.
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
      const tile = screenToTile(cx, cy, camera, charWidth, charHeight, vw, vh)
      expect(isTileInVisibleViewport(tile.x, tile.y, vw, vh)).toBe(true)
    }
  })
})

describe('regression: ortho-rect vs iso-parallelogram mismatch', () => {
  // Several render passes and gameLoop's satellite-impact visibility check
  // previously used the orthogonal rect [0, vw) × [0, vh). Iso projection
  // makes that rect a parallelogram on canvas; tiles outside the rect but
  // inside the parallelogram corners are still visible. This test pins the
  // boundary tile that exposed the bug: outside the orthogonal rect, inside
  // the iso parallelogram.
  it('accepts tiles outside the orthogonal rect but inside the iso parallelogram', () => {
    const vw = 30
    const vh = 20
    // (vx=-1, vy=5): vx < 0 → orthogonal rect rejects; iso parallelogram
    // accepts because vxStart = -vh = -20 and -1 ≥ -20.
    const vx = -1
    const vy = 5
    const orthoRectRejects = vx < 0 || vx >= vw || vy < 0 || vy >= vh
    expect(orthoRectRejects).toBe(true)
    expect(isTileInVisibleViewport(vx, vy, vw, vh)).toBe(true)
  })

  it('accepts the iso top-right and bottom-left corner tiles', () => {
    const vw = 30
    const vh = 20
    // Canvas top-right corresponds roughly to (vw, -vh) area.
    expect(isTileInVisibleViewport(vw - 1, -vh + 1, vw, vh)).toBe(true)
    expect(isTileInVisibleViewport(-vh + 1, vw - 1, vw, vh)).toBe(true)
  })
})

describe('regression: angel aura corner coverage', () => {
  // Both passes (gold aura iteration, rain aura radial) previously skipped
  // tiles outside [0, vw) × [0, vh). After the fix, every canvas pixel's
  // resolved tile must pass `isTileInVisibleViewport` so an angel parked
  // near a viewport edge can paint into the corners.
  const vw = 35
  const vh = 25
  const canvasWidth = vw * charWidth
  const canvasHeight = vh * charHeight
  const camera = { x: 0, y: 0 }

  it('rejects tiles strictly outside the parallelogram only', () => {
    // A tile far past the end is rejected.
    const farX = vw + vh + 5
    expect(isTileInVisibleViewport(farX, 0, vw, vh)).toBe(false)
    // A tile far into negative space is rejected.
    expect(isTileInVisibleViewport(-vh - 5, 0, vw, vh)).toBe(false)
  })

  it('accepts every tile resolved from canvas pixels', () => {
    for (const { cx, cy } of sampleCanvasPixels(canvasWidth, canvasHeight, 8)) {
      const tile = screenToTile(cx, cy, camera, charWidth, charHeight, vw, vh)
      expect(isTileInVisibleViewport(tile.x, tile.y, vw, vh)).toBe(true)
    }
  })
})
