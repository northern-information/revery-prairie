// @vitest-environment jsdom

import { render } from '../renderer'
import { clearAroundPlayer, createTestState } from './helpers'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CharMetrics, GameState } from '../types'

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

interface FillTextCall {
  text: string
  fillStyle: string
}

// Capture every fillText call (with the active fillStyle) so the test can ask:
// did the renderer ever draw a path-dot glyph in ACTION_COLOR this frame?
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
  canvas.width = 300
  canvas.height = 320
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
  return state
}

const PATH_DOT = '·'
const PATH_WAYPOINT = '+'
const ACTION_COLOR = '#ff69b4'

const hasPathGlyph = (calls: FillTextCall[]): boolean =>
  calls.some(c => (c.text === PATH_DOT || c.text === PATH_WAYPOINT) && c.fillStyle === ACTION_COLOR)

describe('renderer path overlay gate', () => {
  it('does not render path glyphs in ACTION_COLOR when pathIsChained is false (plain right-click)', () => {
    const state = setupState()
    state.path = [
      { x: state.player.x + 1, y: state.player.y },
      { x: state.player.x + 2, y: state.player.y },
      { x: state.player.x + 3, y: state.player.y },
    ]
    state.pathWaypoints = [{ x: state.player.x + 3, y: state.player.y }]
    state.pathIsChained = false

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, 0)
    } finally {
      vi.restoreAllMocks()
    }

    expect(hasPathGlyph(spy.fillTextCalls)).toBe(false)
  })

  it('renders path glyphs in ACTION_COLOR for a single-waypoint path when pathIsChained is true (first shift+right-click)', () => {
    const state = setupState()
    state.path = [
      { x: state.player.x + 1, y: state.player.y },
      { x: state.player.x + 2, y: state.player.y },
      { x: state.player.x + 3, y: state.player.y },
    ]
    state.pathWaypoints = [{ x: state.player.x + 3, y: state.player.y }]
    state.pathIsChained = true

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, 0)
    } finally {
      vi.restoreAllMocks()
    }

    expect(hasPathGlyph(spy.fillTextCalls)).toBe(true)
  })

  it('renders path glyphs in ACTION_COLOR for a chained path (subsequent shift+right-clicks)', () => {
    const state = setupState()
    state.path = [
      { x: state.player.x + 1, y: state.player.y },
      { x: state.player.x + 2, y: state.player.y },
      { x: state.player.x + 3, y: state.player.y },
      { x: state.player.x + 3, y: state.player.y + 1 },
    ]
    state.pathWaypoints = [
      { x: state.player.x + 3, y: state.player.y },
      { x: state.player.x + 3, y: state.player.y + 1 },
    ]
    state.pathIsChained = true

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, 0)
    } finally {
      vi.restoreAllMocks()
    }

    expect(hasPathGlyph(spy.fillTextCalls)).toBe(true)
  })
})
