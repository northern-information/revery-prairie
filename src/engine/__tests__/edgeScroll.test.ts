import { beforeEach, describe, expect, it } from 'vitest'

import { EDGE_SCROLL_SPEED_TILES_PER_SEC, EDGE_SCROLL_ZONE_PX, MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { computeEdgeScrollDirection, recenterCamera, tickEdgeScroll } from '../edgeScroll'

import type { CharMetrics, GameState } from '../types'

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

const makeState = (overrides: Partial<GameState> = {}): GameState => {
  // Minimal stand-in. Edge-scroll only reads a handful of fields.
  return {
    camera: { x: 50, y: 30 },
    edgeScrollPos: null,
    edgeScrollDirection: { dx: 0, dy: 0 },
    cameraSubpixel: { x: 0, y: 0 },
    viewportWidth: 60,
    viewportHeight: 30,
    rightInsetTiles: 0,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    cameraMode: 'follow',
    lastEdgeScrollTime: 0,
    ...overrides,
  } as unknown as GameState
}

describe('computeEdgeScrollDirection', () => {
  const w = 600
  const h = 480

  it('returns (0,0) when cursor is in the center', () => {
    expect(computeEdgeScrollDirection(300, 240, w, h)).toEqual({ dx: 0, dy: 0 })
  })

  it('returns dx=-1 when cursor is at the left edge', () => {
    expect(computeEdgeScrollDirection(EDGE_SCROLL_ZONE_PX - 1, 240, w, h)).toEqual({ dx: -1, dy: 0 })
  })

  it('returns dx=+1 when cursor is at the right edge', () => {
    expect(computeEdgeScrollDirection(w - EDGE_SCROLL_ZONE_PX + 1, 240, w, h)).toEqual({ dx: 1, dy: 0 })
  })

  it('returns dy=-1 when cursor is at the top edge', () => {
    expect(computeEdgeScrollDirection(300, EDGE_SCROLL_ZONE_PX - 1, w, h)).toEqual({ dx: 0, dy: -1 })
  })

  it('returns dy=+1 when cursor is at the bottom edge', () => {
    expect(computeEdgeScrollDirection(300, h - EDGE_SCROLL_ZONE_PX + 1, w, h)).toEqual({ dx: 0, dy: 1 })
  })

  it('supports diagonal scroll in corners', () => {
    expect(computeEdgeScrollDirection(2, 2, w, h)).toEqual({ dx: -1, dy: -1 })
    expect(computeEdgeScrollDirection(w - 2, h - 2, w, h)).toEqual({ dx: 1, dy: 1 })
  })

  it('returns dx=0 when cursor is past the right edge (over sidebar overlay)', () => {
    expect(computeEdgeScrollDirection(w + 50, 240, w, h)).toEqual({ dx: 0, dy: 0 })
  })

  it('returns dy=0 when cursor is past the bottom edge', () => {
    expect(computeEdgeScrollDirection(300, h + 50, w, h)).toEqual({ dx: 0, dy: 0 })
  })

  it('returns 0 when cursor is past both edges', () => {
    expect(computeEdgeScrollDirection(w + 100, h + 100, w, h)).toEqual({ dx: 0, dy: 0 })
  })
})

describe('tickEdgeScroll', () => {
  let state: GameState

  beforeEach(() => {
    state = makeState()
  })

  it('does nothing when edgeScrollPos is null', () => {
    state.edgeScrollPos =null
    state.lastEdgeScrollTime = 100
    tickEdgeScroll(state, metrics, 200)
    expect(state.cameraMode).toBe('follow')
    expect(state.camera.x).toBe(50)
    expect(state.camera.y).toBe(30)
  })

  it('does nothing when cursor is in the center of the canvas', () => {
    state.edgeScrollPos ={ x: 300, y: 240 }
    state.lastEdgeScrollTime = 100
    tickEdgeScroll(state, metrics, 200)
    expect(state.cameraMode).toBe('follow')
    expect(state.camera.x).toBe(50)
    expect(state.camera.y).toBe(30)
  })

  it('flips cameraMode to free on first edge input', () => {
    state.edgeScrollPos ={ x: 5, y: 240 }
    state.lastEdgeScrollTime = 100
    tickEdgeScroll(state, metrics, 200)
    expect(state.cameraMode).toBe('free')
  })

  it('moves camera left when cursor is at the left edge', () => {
    // 100ms frame at 18 tiles/sec = 1.8 tiles, rounds to 2.
    state.edgeScrollPos ={ x: 5, y: 240 }
    state.lastEdgeScrollTime = 0
    tickEdgeScroll(state, metrics, 100)
    expect(state.camera.x).toBeLessThan(50)
    expect(state.camera.y).toBe(30)
  })

  it('moves camera diagonally in a corner', () => {
    state.edgeScrollPos ={ x: 5, y: 5 }
    state.lastEdgeScrollTime = 0
    tickEdgeScroll(state, metrics, 100)
    expect(state.camera.x).toBeLessThan(50)
    expect(state.camera.y).toBeLessThan(30)
  })

  it('moves camera by trunc(speed*dt) tiles per frame, accumulating remainder', () => {
    state.edgeScrollPos = { x: 5, y: 240 }
    state.lastEdgeScrollTime = 0
    tickEdgeScroll(state, metrics, 100)
    // Expected: 50 - trunc(18 * 0.1) = 50 - 1 = 49; subpixel x = -0.8
    expect(state.camera.x).toBe(50 - Math.trunc(EDGE_SCROLL_SPEED_TILES_PER_SEC * 0.1))
    expect(state.cameraSubpixel.x).toBeCloseTo(-0.8, 5)
  })

  it('subpixel accumulator drives camera at sub-1-tile-per-frame rates', () => {
    state.edgeScrollPos = { x: 5, y: 240 }
    state.lastEdgeScrollTime = 0
    let now = 0
    const startCamera = state.camera.x
    for (let i = 0; i < 10; i++) {
      now += 16
      tickEdgeScroll(state, metrics, now)
    }
    expect(state.camera.x).toBeLessThanOrEqual(startCamera - 2)
  })

  it('clamps camera to overscroll bounds at the left edge', () => {
    // Free-pan allows overscroll = viewportWidth tiles past the map edge.
    state.camera.x = -state.viewportWidth + 1
    state.edgeScrollPos = { x: 5, y: 240 }
    state.lastEdgeScrollTime = 0
    tickEdgeScroll(state, metrics, 200)
    expect(state.camera.x).toBe(-state.viewportWidth)
  })

  it('clamps camera to overscroll bounds at the right edge', () => {
    const visibleWidth = state.viewportWidth - state.rightInsetTiles
    const maxX = state.mapWidth - visibleWidth + state.viewportWidth
    state.camera.x = maxX - 1
    state.edgeScrollPos = { x: 600 - 2, y: 240 }
    state.lastEdgeScrollTime = 0
    tickEdgeScroll(state, metrics, 200)
    expect(state.camera.x).toBe(maxX)
  })

  it('skips on first frame (dt = 0)', () => {
    state.edgeScrollPos ={ x: 5, y: 240 }
    state.lastEdgeScrollTime = 100
    tickEdgeScroll(state, metrics, 100)
    expect(state.camera.x).toBe(50)
  })

  it('skips on background-tab pause (dt > 200ms)', () => {
    state.edgeScrollPos ={ x: 5, y: 240 }
    state.lastEdgeScrollTime = 0
    tickEdgeScroll(state, metrics, 5000)
    expect(state.camera.x).toBe(50)
    // But timestamp updates so subsequent frames work normally.
    expect(state.lastEdgeScrollTime).toBe(5000)
  })

  it('updates lastEdgeScrollTime on every call (even no-op center frame)', () => {
    state.edgeScrollPos ={ x: 300, y: 240 }
    state.lastEdgeScrollTime = 100
    tickEdgeScroll(state, metrics, 250)
    expect(state.lastEdgeScrollTime).toBe(250)
  })

  it('updates lastEdgeScrollTime when cursor is null', () => {
    state.edgeScrollPos =null
    state.lastEdgeScrollTime = 100
    tickEdgeScroll(state, metrics, 250)
    expect(state.lastEdgeScrollTime).toBe(250)
  })
})

describe('recenterCamera', () => {
  it("sets cameraMode to 'follow'", () => {
    const state = makeState({ cameraMode: 'free' })
    recenterCamera(state)
    expect(state.cameraMode).toBe('follow')
  })

  it('is idempotent', () => {
    const state = makeState({ cameraMode: 'follow' })
    recenterCamera(state)
    expect(state.cameraMode).toBe('follow')
  })
})
