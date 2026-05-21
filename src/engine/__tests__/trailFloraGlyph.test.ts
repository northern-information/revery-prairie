// @vitest-environment jsdom

import { posKey } from '../position'
import { render } from '../renderer'
import { FloraSpecies, TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { createTestFloraEntry } from './helpers/createTestFloraEntry'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CharMetrics, GameState } from '../types'

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

interface FillTextCall {
  text: string
  fillStyle: string
}

const installCanvasContextSpy = (): { fillTextCalls: FillTextCall[] } => {
  const fillTextCalls: FillTextCall[] = []
  const noop = (): undefined => undefined
  function stub(this: HTMLCanvasElement): unknown {
    let fillStyle = ''
    const ctx: Record<string, unknown> = {
      canvas: this,
      clearRect: noop,
      fillRect: noop,
      strokeRect: noop,
      beginPath: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      closePath: noop,
      fill: noop,
      stroke: noop,
      save: noop,
      restore: noop,
      translate: noop,
      scale: noop,
      rotate: noop,
      setTransform: noop,
      resetTransform: noop,
      drawImage: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      measureText: () => ({ width: metrics.charWidth }),
      fillText: (text: string) => {
        fillTextCalls.push({ text, fillStyle })
      },
      get fillStyle() {
        return fillStyle
      },
      set fillStyle(v: string) {
        fillStyle = v
      },
      strokeStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
      font: '',
      textBaseline: '',
      textAlign: '',
      imageSmoothingEnabled: false,
    }
    return ctx
  }
  HTMLCanvasElement.prototype.getContext = stub as HTMLCanvasElement['getContext']
  return { fillTextCalls }
}

let spy: { fillTextCalls: FillTextCall[] }
let ctx: CanvasRenderingContext2D

beforeAll(() => {
  spy = installCanvasContextSpy()
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 400
  const got = canvas.getContext('2d')
  if (!got) throw new Error('canvas stub did not return a context')
  ctx = got
})

beforeEach(() => {
  spy.fillTextCalls.length = 0
})

const setupState = (): GameState => {
  const state = createTestState()
  clearAroundPlayer(state, 6)
  state.viewportWidth = 30
  state.viewportHeight = 20
  state.camera = { x: state.player.x - 15, y: state.player.y - 10 }
  state.trail = []
  state.path = null
  state.pathWaypoints = []
  return state
}

// Place a flora tile of the given species at (x, y) and wire up a lifecycle
// entry — the renderer reads species from state.floraLifecycle.
const placeFlora = (state: GameState, x: number, y: number, species: FloraSpecies): void => {
  state.map[y][x] = { type: TileType.Flora }
  state.floraLifecycle.set(posKey(x, y), createTestFloraEntry({ posKey: posKey(x, y), species }))
}

const TRAIL_TIME = 0
const RENDER_TIME = 10 // well within TRAIL_DURATION_MS so the trail is still active

// Trail tiles render with hot-pink rgba (`rgba(255, 105, 180, opacity)`).
// Use this to isolate trail draws from regular tile draws (which use chromatic
// species colors like #50C878), so assertions don't get false positives from
// other flora tiles elsewhere in the viewport.
const TRAIL_PINK_RE = /^rgba\(255, 105, 180, [\d.]+\)$/
const isTrailDraw = (c: FillTextCall): boolean => TRAIL_PINK_RE.test(c.fillStyle)

describe('renderer trail flora glyph', () => {
  it('renders the wildflower glyph (*) for a trail tile sitting on a wildflower', () => {
    const state = setupState()
    const x = state.player.x + 2
    const y = state.player.y
    placeFlora(state, x, y, FloraSpecies.Wildflower)
    state.trail.push({ x, y, time: TRAIL_TIME })

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, RENDER_TIME)
    } finally {
      vi.restoreAllMocks()
    }

    const trailDraws = spy.fillTextCalls.filter(isTrailDraw)
    expect(trailDraws.some(c => c.text === '*')).toBe(true)
    expect(trailDraws.some(c => c.text === '%')).toBe(false)
  })

  it('renders the tall-grass glyph (") for a trail tile sitting on tall grass', () => {
    const state = setupState()
    const x = state.player.x + 2
    const y = state.player.y
    placeFlora(state, x, y, FloraSpecies.TallGrass)
    state.trail.push({ x, y, time: TRAIL_TIME })

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, RENDER_TIME)
    } finally {
      vi.restoreAllMocks()
    }

    const trailDraws = spy.fillTextCalls.filter(isTrailDraw)
    expect(trailDraws.some(c => c.text === '"')).toBe(true)
    expect(trailDraws.some(c => c.text === '%')).toBe(false)
  })

  it('preserves the clover glyph (%) for a trail tile sitting on clover (regression guard)', () => {
    const state = setupState()
    const x = state.player.x + 2
    const y = state.player.y
    placeFlora(state, x, y, FloraSpecies.Clover)
    state.trail.push({ x, y, time: TRAIL_TIME })

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, RENDER_TIME)
    } finally {
      vi.restoreAllMocks()
    }

    const trailDraws = spy.fillTextCalls.filter(isTrailDraw)
    expect(trailDraws.some(c => c.text === '%')).toBe(true)
  })

  it('does not crash when a trail tile sits on TileType.Flora with no floraLifecycle entry (defensive)', () => {
    const state = setupState()
    const x = state.player.x + 2
    const y = state.player.y
    state.map[y][x] = { type: TileType.Flora }
    // intentionally do not set a floraLifecycle entry
    state.trail.push({ x, y, time: TRAIL_TIME })

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      expect(() => {
        render(ctx, state, metrics, RENDER_TIME)
      }).not.toThrow()
    } finally {
      vi.restoreAllMocks()
    }
  })
})
