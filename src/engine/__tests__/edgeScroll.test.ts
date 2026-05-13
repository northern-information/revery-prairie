import { beforeEach, describe, expect, it } from 'vitest'

import { EDGE_SCROLL_SPEED_TILES_PER_SEC, EDGE_SCROLL_ZONE_PX, MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { computeEdgeScrollDirection, recenterCamera, tickEdgeScroll } from '../edgeScroll'
import { createGameState } from '../state'

import type { CharMetrics, GameState } from '../types'

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

const makeState = (overrides: Partial<GameState> = {}): GameState => {
  // Minimal stand-in. Edge-scroll only reads a handful of fields.
  return {
    camera: { x: 50, y: 30 },
    edgeScrollPos: null,
    edgeScrollDirection: { dx: 0, dy: 0 },
    edgeScrollIndicatorAlpha: 0,
    edgeScrollIndicatorDirection: { dx: 0, dy: 0 },
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

  it('moves camera in screen-left direction when cursor is at the left edge', () => {
    // Screen-left input maps through the inverse projection to world delta
    // (-0.5, +0.5) per screen tile: camera moves left and down in world.
    // 200ms at 18 tiles/sec * 0.5 = 1.8 → trunc = 1 step in each axis.
    state.edgeScrollPos = { x: 5, y: 240 }
    state.lastEdgeScrollTime = 0
    tickEdgeScroll(state, metrics, 200)
    expect(state.camera.x).toBeLessThan(50)
    expect(state.camera.y).toBeGreaterThan(30)
  })

  it('moves camera diagonally up-left in the top-left corner', () => {
    // Screen (-1, -1) maps to world (-1.5, -0.5): camera moves left and up.
    state.edgeScrollPos = { x: 5, y: 5 }
    state.lastEdgeScrollTime = 0
    tickEdgeScroll(state, metrics, 200)
    expect(state.camera.x).toBeLessThan(50)
    expect(state.camera.y).toBeLessThan(30)
  })

  it('moves camera by trunc(camDx*speed*dt) tiles per frame, accumulating remainder', () => {
    state.edgeScrollPos = { x: 5, y: 240 }
    state.lastEdgeScrollTime = 0
    tickEdgeScroll(state, metrics, 200)
    // dx=-1, dy=0: camDxPerTile = -0.5. Step = trunc(-0.5 * 18 * 0.2) = -1
    const camDxPerTile = -0.5
    const dtSec = 0.2
    const expectedDelta = camDxPerTile * EDGE_SCROLL_SPEED_TILES_PER_SEC * dtSec
    const step = Math.trunc(expectedDelta)
    expect(state.camera.x).toBe(50 + step)
    expect(state.cameraSubpixel.x).toBeCloseTo(expectedDelta - step, 5)
  })

  it('subpixel accumulator drives camera at sub-1-tile-per-frame rates', () => {
    state.edgeScrollPos = { x: 5, y: 240 }
    state.lastEdgeScrollTime = 0
    let now = 0
    const startCamera = state.camera.x
    for (let i = 0; i < 20; i++) {
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

describe('tickEdgeScroll — indicator fade', () => {
  // Constants mirror edgeScroll.ts. Kept here so the test fails loudly if
  // those values are tuned without updating the spec.
  const FADE_IN_MS = 120
  const FADE_OUT_MS = 280

  it('fades alpha in by dt / FADE_IN_MS while cursor sits in an edge zone', () => {
    const state = makeState({
      edgeScrollPos: { x: 5, y: 240 },
      lastEdgeScrollTime: 0,
    })
    tickEdgeScroll(state, metrics, 60)
    expect(state.edgeScrollIndicatorAlpha).toBeCloseTo(60 / FADE_IN_MS, 5)
    expect(state.edgeScrollIndicatorDirection).toEqual({ dx: -1, dy: 0 })
  })

  it('clamps alpha at 1.0 after sustained time in zone', () => {
    const state = makeState({
      edgeScrollPos: { x: 5, y: 240 },
      lastEdgeScrollTime: 0,
      edgeScrollIndicatorAlpha: 0.95,
    })
    tickEdgeScroll(state, metrics, 100)
    expect(state.edgeScrollIndicatorAlpha).toBe(1)
  })

  it('fades alpha out by dt / FADE_OUT_MS when cursor returns to centre', () => {
    const state = makeState({
      edgeScrollPos: { x: 300, y: 240 },
      lastEdgeScrollTime: 0,
      edgeScrollIndicatorAlpha: 1,
      edgeScrollIndicatorDirection: { dx: -1, dy: 0 },
    })
    tickEdgeScroll(state, metrics, 100)
    expect(state.edgeScrollIndicatorAlpha).toBeCloseTo(1 - 100 / FADE_OUT_MS, 5)
    // Latched direction must persist so the same edges stay illuminated.
    expect(state.edgeScrollIndicatorDirection).toEqual({ dx: -1, dy: 0 })
  })

  it('fades alpha out when edgeScrollPos becomes null (cursor leaves canvas)', () => {
    const state = makeState({
      edgeScrollPos: null,
      lastEdgeScrollTime: 0,
      edgeScrollIndicatorAlpha: 1,
      edgeScrollIndicatorDirection: { dx: 1, dy: 1 },
    })
    tickEdgeScroll(state, metrics, 100)
    expect(state.edgeScrollIndicatorAlpha).toBeCloseTo(1 - 100 / FADE_OUT_MS, 5)
    expect(state.edgeScrollIndicatorDirection).toEqual({ dx: 1, dy: 1 })
    expect(state.edgeScrollDirection).toEqual({ dx: 0, dy: 0 })
  })

  it('clamps alpha at 0 after sustained fade-out', () => {
    const state = makeState({
      edgeScrollPos: null,
      lastEdgeScrollTime: 0,
      edgeScrollIndicatorAlpha: 0.05,
    })
    tickEdgeScroll(state, metrics, 100)
    expect(state.edgeScrollIndicatorAlpha).toBe(0)
  })

  it('skips alpha update on the first frame (dt = 0)', () => {
    const state = makeState({
      edgeScrollPos: { x: 5, y: 240 },
      lastEdgeScrollTime: 100,
      edgeScrollIndicatorAlpha: 0.4,
    })
    tickEdgeScroll(state, metrics, 100)
    expect(state.edgeScrollIndicatorAlpha).toBe(0.4)
    expect(state.lastEdgeScrollTime).toBe(100)
  })

  it('skips alpha update on background-tab pause (dt > 200ms)', () => {
    const state = makeState({
      edgeScrollPos: { x: 5, y: 240 },
      lastEdgeScrollTime: 0,
      edgeScrollIndicatorAlpha: 0.4,
    })
    tickEdgeScroll(state, metrics, 5000)
    expect(state.edgeScrollIndicatorAlpha).toBe(0.4)
    expect(state.lastEdgeScrollTime).toBe(5000)
  })

  it('updates latched direction when cursor moves between edge zones mid-fade', () => {
    const state = makeState({
      edgeScrollPos: { x: 5, y: 240 },
      lastEdgeScrollTime: 0,
      edgeScrollIndicatorAlpha: 0.5,
      edgeScrollIndicatorDirection: { dx: -1, dy: 0 },
    })
    // Move cursor from left-edge into bottom-right corner.
    state.edgeScrollPos = { x: 600 - 2, y: 480 - 2 }
    tickEdgeScroll(state, metrics, 60)
    expect(state.edgeScrollIndicatorDirection).toEqual({ dx: 1, dy: 1 })
    // Alpha should have advanced (still in zone, just a different one).
    expect(state.edgeScrollIndicatorAlpha).toBeGreaterThan(0.5)
  })

  it('does not latch direction on a pure no-op centre frame', () => {
    const state = makeState({
      edgeScrollPos: { x: 300, y: 240 },
      lastEdgeScrollTime: 0,
      edgeScrollIndicatorAlpha: 0.6,
      edgeScrollIndicatorDirection: { dx: -1, dy: 0 },
    })
    tickEdgeScroll(state, metrics, 60)
    // Latched direction should be untouched (last non-zero value).
    expect(state.edgeScrollIndicatorDirection).toEqual({ dx: -1, dy: 0 })
    // Alpha decays toward 0.
    expect(state.edgeScrollIndicatorAlpha).toBeCloseTo(0.6 - 60 / FADE_OUT_MS, 5)
  })
})

describe('recenterCamera', () => {
  // Regression: holding WASD with the mouse cursor parked in a canvas edge
  // zone used to let tickEdgeScroll repeatedly flip cameraMode to 'free' on
  // a frame in between WASD moves. movePlayer's updateCamera call would
  // early-return, recenterCamera flipped the flag but did NOT snap the
  // camera, and the player drifted off canvas center step by step.
  it('snaps camera onto player when called from a free-mode stale camera', () => {
    const state = createGameState('Test', 40, 40)
    const visibleWidth = state.viewportWidth - state.rightInsetTiles
    state.player.x = 50
    state.player.y = 50
    // Simulate prior edge-scroll: free mode, camera off-center.
    state.cameraMode = 'free'
    state.camera.x = state.player.x - Math.floor(visibleWidth / 2) + 8
    state.camera.y = state.player.y - Math.floor(state.viewportHeight / 2) - 5

    recenterCamera(state)

    expect(state.cameraMode).toBe('follow')
    expect(state.camera.x).toBe(state.player.x - Math.floor(visibleWidth / 2))
    expect(state.camera.y).toBe(state.player.y - Math.floor(state.viewportHeight / 2))
  })

  it('after recenter, player viewport coords match the follow-mode invariant', () => {
    const state = createGameState('Test', 40, 40)
    const visibleWidth = state.viewportWidth - state.rightInsetTiles
    state.player.x = 90
    state.player.y = 30
    state.cameraMode = 'free'
    state.camera.x = 0
    state.camera.y = 0

    recenterCamera(state)

    const vx = state.player.x - state.camera.x
    const vy = state.player.y - state.camera.y
    expect(vx).toBe(Math.floor(visibleWidth / 2))
    expect(vy).toBe(Math.floor(state.viewportHeight / 2))
  })

  it('is idempotent when already in follow mode and centered', () => {
    const state = createGameState('Test', 40, 40)
    state.player.x = 60
    state.player.y = 60
    state.cameraMode = 'follow'
    recenterCamera(state)
    const camAfterFirst = { x: state.camera.x, y: state.camera.y }
    recenterCamera(state)
    expect(state.cameraMode).toBe('follow')
    expect(state.camera).toEqual(camAfterFirst)
  })
})
