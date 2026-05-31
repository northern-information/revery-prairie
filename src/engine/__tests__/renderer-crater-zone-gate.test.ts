// @vitest-environment jsdom

import { posKey } from '../position'
import { render } from '../renderer'
import { TileType } from '../types'
import { enterLittleHouseYardFromApron } from '../yard'
import { createTestState } from './helpers'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CharMetrics, GameState } from '../types'

// Crater glyph palette — the rendering branch at renderer.ts:1606 picks one
// of these from BUILDING_CHARS for a Dirt tile whose posKey appears in
// state.craters. Copying the literal palette here (rather than importing
// it) so the test fails immediately if the renderer starts drawing them
// in a non-overworld zone — even if the BUILDING_CHARS constant later
// expands.
const CRATER_GLYPHS = new Set(['▓', '▒', '░', '█', '#', '+', 'H', 'T', '='])
const CRATER_COLORS = new Set(['#8B4513', '#7A3B10', '#6B320D', '#5C290A', '#4D2007'])

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

interface FillTextCall {
  text: string
  fillStyle: string
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
        fillTextCalls.push({ text, fillStyle, px, py })
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
  canvas.width = 600
  canvas.height = 600
  const got = canvas.getContext('2d')
  if (!got) throw new Error('canvas stub did not return a context')
  ctx = got
})

beforeEach(() => {
  spy.fillTextCalls.length = 0
})

// Find a yard-map position that is plain Dirt (not Fence, gate, roof, eaves,
// door, or already overlaid as Flora at zone-enter). Force one yard tile back
// to Dirt if necessary — sampleYardFlora may have overlaid the entire walkable
// interior with Flora when the apron tally is non-empty. Returns a guaranteed-
// Dirt position. Must be called AFTER entering the yard so state.map points
// at the yard's tile grid.
const findYardDirtTile = (state: GameState): { x: number; y: number } => {
  for (let y = 1; y < state.mapHeight - 1; y++) {
    for (let x = 1; x < state.mapWidth - 1; x++) {
      if (state.map[y][x].type === TileType.Dirt) return { x, y }
    }
  }
  // Fall back: force the (1, 1) interior cell to Dirt. Clearing the
  // sampled-flora entry keeps the renderer from substituting a species
  // glyph back on top.
  const tile = { x: 1, y: 1 }
  state.map[tile.y][tile.x] = { type: TileType.Dirt }
  return tile
}

describe('crater rendering zone gate (regression: overworld craters must not bleed into the yard)', () => {
  it('does not draw crater glyphs in the little-house yard at a yard Dirt position whose coord also lives in state.craters', () => {
    const state = createTestState()
    const apron = { x: state.player.x, y: state.player.y }
    enterLittleHouseYardFromApron(state, apron)

    // Pick a yard Dirt tile and add its coord to state.craters (as if an
    // overworld crater had been recorded at the same numeric (x, y)).
    const tile = findYardDirtTile(state)
    state.craters.add(posKey(tile.x, tile.y))

    // Center the camera near the tile so it lands inside the viewport.
    state.viewportWidth = 30
    state.viewportHeight = 20
    state.camera = { x: tile.x - 15, y: tile.y - 10 }

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, 0)
    } finally {
      vi.restoreAllMocks()
    }

    // The crater rendering branch in renderer.ts:1606 paints with one of
    // craterColors (`#8B4513`..). Outside the overworld none of those
    // colors should ever appear in a fillText call — the yard's legitimate
    // glyphs use the standard Dirt / Flora / wall palettes.
    const leakedColorCalls = spy.fillTextCalls.filter(c => CRATER_COLORS.has(c.fillStyle))
    expect(leakedColorCalls).toEqual([])
  })

  it('does not pick a BUILDING_CHARS glyph for the colliding yard tile when only Dirt + standard tiles are present', () => {
    const state = createTestState()
    const apron = { x: state.player.x, y: state.player.y }
    enterLittleHouseYardFromApron(state, apron)

    const tile = findYardDirtTile(state)
    state.craters.add(posKey(tile.x, tile.y))

    state.viewportWidth = 30
    state.viewportHeight = 20
    state.camera = { x: tile.x - 15, y: tile.y - 10 }

    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      render(ctx, state, metrics, 0)
    } finally {
      vi.restoreAllMocks()
    }

    // Filter to fillText calls in the regular monospace font (excludes
    // Voynich-font egregore glyphs). Among those calls, count any whose
    // fillStyle matches the crater palette — should be zero.
    //
    // Note: ▓ and █ also belong to BUILDING_CHARS and are legitimate yard
    // glyphs (HouseRoof, HouseDoorClosed, FenceGate). So we cannot assert
    // "no BUILDING_CHARS text". Instead we assert "no BUILDING_CHARS text
    // drawn in a CRATER_COLORS fillStyle" — that combination is unique to
    // the leak.
    const leakedCombos = spy.fillTextCalls.filter(c => CRATER_GLYPHS.has(c.text) && CRATER_COLORS.has(c.fillStyle))
    expect(leakedCombos).toEqual([])
  })
})
