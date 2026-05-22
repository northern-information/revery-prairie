// @vitest-environment jsdom

import { render } from '../renderer'
import { TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CharMetrics, GameState } from '../types'

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

interface FillTextCall {
  text: string
  font: string
  px: number
  py: number
}

const installCanvasContextSpy = (): { fillTextCalls: FillTextCall[] } => {
  const fillTextCalls: FillTextCall[] = []
  const noop = (): undefined => undefined
  function stub(this: HTMLCanvasElement): unknown {
    let fillStyle = ''
    let font = ''
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
      fillText: (text: string, px: number, py: number) => {
        fillTextCalls.push({ text, font, px, py })
      },
      get fillStyle() {
        return fillStyle
      },
      set fillStyle(v: string) {
        fillStyle = v
      },
      get font() {
        return font
      },
      set font(v: string) {
        font = v
      },
      strokeStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
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

const placePlayerOnEgregore = (state: GameState): void => {
  state.map[state.player.y][state.player.x] = { type: TileType.Egregore }
}

describe('renderer egregore tile under player', () => {
  it('draws the egregore glyph in the Voynich font when the player stands on the tile', () => {
    const state = setupState()
    placePlayerOnEgregore(state)
    state.playerSpawn.visible = true

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, 0)
    } finally {
      vi.restoreAllMocks()
    }

    const voynichCalls = spy.fillTextCalls.filter(c => c.font.includes("'Voynich'"))
    expect(voynichCalls.length).toBeGreaterThan(0)
  })

  it('does not draw a "?" glyph at any position when the player stands on an egregore tile', () => {
    const state = setupState()
    placePlayerOnEgregore(state)
    state.playerSpawn.visible = true

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, 0)
    } finally {
      vi.restoreAllMocks()
    }

    const questionMarkCalls = spy.fillTextCalls.filter(c => c.text === '?')
    expect(questionMarkCalls).toEqual([])
  })

  it('still applies the Voynich font swap when playerSpawn.visible is false', () => {
    const state = setupState()
    placePlayerOnEgregore(state)
    state.playerSpawn.visible = false

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, 0)
    } finally {
      vi.restoreAllMocks()
    }

    const voynichCalls = spy.fillTextCalls.filter(c => c.font.includes("'Voynich'"))
    expect(voynichCalls.length).toBeGreaterThan(0)
  })
})
