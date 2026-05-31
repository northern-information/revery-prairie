// @vitest-environment jsdom

import { BEE_CHAR, FOG_EXPLORED_BRIGHTNESS } from '../constants'
import { registerGhostDefinitions, removeCharacterDefinition } from '../characters'
import { createCharacterEntity } from '../entities'
import { ComponentType } from '../ecs/types'
import { posKey } from '../position'
import { render } from '../renderer'
import { FLORA_SPECIES } from '../flora/species'
import { FloraSpecies, TileType } from '../types'
import { clearAroundPlayer, createBeeEntity, createTestState } from './helpers'
import { createTestFloraEntry } from './helpers/createTestFloraEntry'
import { dimColor } from '../visibility'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CharMetrics, GameState } from '../types'

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
  canvas.width = 400
  canvas.height = 400
  const got = canvas.getContext('2d')
  if (!got) throw new Error('canvas stub did not return a context')
  ctx = got
})

beforeEach(() => {
  spy.fillTextCalls.length = 0
})

// Keep the player's whole vision disc on cleared terrain so the only flora in
// view is the one the test places, and center the camera on the player.
const setupPrairie = (state: GameState): void => {
  clearAroundPlayer(state, 20)
  state.viewportWidth = 30
  state.viewportHeight = 20
  state.camera = { x: state.player.x - 15, y: state.player.y - 10 }
  state.trail = []
  state.path = null
  state.pathWaypoints = []
  state.overworldFogExplored.clear()
  state.overworldFloraMemory.clear()
}

const recenterCameraOnPlayer = (state: GameState): void => {
  state.camera = { x: state.player.x - 15, y: state.player.y - 10 }
}

const placeFlora = (state: GameState, x: number, y: number): void => {
  state.map[y][x] = { type: TileType.Flora }
  state.floraLifecycle.set(posKey(x, y), createTestFloraEntry({ posKey: posKey(x, y), species: FloraSpecies.Clover }))
}

describe('renderer fog memory (RP-62)', () => {
  it('renders a remembered flora tile from the dimmed snapshot after the player walks away', () => {
    const state = createTestState()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      setupPrairie(state)
      const fx = state.player.x + 2
      const fy = state.player.y
      placeFlora(state, fx, fy)

      // Frame 1: flora is in gaze — its appearance is captured into memory.
      render(ctx, state, metrics, 0)
      const snapshot = state.overworldFloraMemory.get(posKey(fx, fy))
      expect(snapshot).toBeDefined()
      expect(snapshot?.char).toBe(FLORA_SPECIES[FloraSpecies.Clover].glyph)

      // Walk far away so the flora tile leaves gaze and becomes remembered.
      state.player = { x: state.player.x + 12, y: state.player.y }
      recenterCameraOnPlayer(state)
      spy.fillTextCalls.length = 0
      render(ctx, state, metrics, 10)

      // The remembered flora renders dimmed (the snapshot color at 40%).
      const cloverGlyph = FLORA_SPECIES[FloraSpecies.Clover].glyph
      const dimmedDraws = spy.fillTextCalls.filter(
        (c) => c.text === cloverGlyph && c.fillStyle === dimColor(snapshot?.color ?? '#000', FOG_EXPLORED_BRIGHTNESS)
      )
      expect(dimmedDraws.length).toBeGreaterThan(0)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('never freezes a live creature into flora memory (bee on a flora tile leaving gaze)', () => {
    const state = createTestState()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      setupPrairie(state)
      const fx = state.player.x + 2
      const fy = state.player.y
      placeFlora(state, fx, fy)

      // Frame 1: flora alone in gaze → snapshot records the FLORA glyph.
      render(ctx, state, metrics, 0)
      const snapshot = state.overworldFloraMemory.get(posKey(fx, fy))
      expect(snapshot?.char).toBe(FLORA_SPECIES[FloraSpecies.Clover].glyph)

      // A bee now lands on the flora tile (still in gaze). The bee resolves
      // char to BEE_CHAR this frame — but the snapshot must NOT be overwritten
      // with the bee glyph, because the tile no longer renders its own flora.
      createBeeEntity(state, fx, fy)
      render(ctx, state, metrics, 5)
      const afterBee = state.overworldFloraMemory.get(posKey(fx, fy))
      expect(afterBee?.char).toBe(FLORA_SPECIES[FloraSpecies.Clover].glyph)
      expect(afterBee?.char).not.toBe(BEE_CHAR)

      // Walk away — the tile is now remembered. The bee is a live creature and
      // is culled out of gaze; the remembered tile shows the dimmed flora
      // snapshot, never the bee.
      state.player = { x: state.player.x + 12, y: state.player.y }
      recenterCameraOnPlayer(state)
      spy.fillTextCalls.length = 0
      render(ctx, state, metrics, 10)

      const beeDraws = spy.fillTextCalls.filter((c) => c.text === BEE_CHAR)
      expect(beeDraws).toEqual([])
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('does not leak a tweening ghost glyph through unexplored fog', () => {
    const state = createTestState()
    const ghostId = 'ghost-99'
    registerGhostDefinitions([99])
    try {
      setupPrairie(state)
      // Ghost destination tile sits well outside the player's gaze, in
      // unexplored fog. Source tile is the adjacent unexplored tile.
      const gx = state.player.x + 14
      const gy = state.player.y
      const eid = createCharacterEntity(state, ghostId, { x: gx, y: gy })
      // Hand-roll the tween so the lerp is mid-flight at render `time = 50`
      // (startTime 0, duration 200 → t ≈ 0.25, floored lerp = (gx-1, gy),
      // also unexplored). Without the fog gate on the smooth-movement
      // post-pass, the 'ö' glyph would render straight over the fog.
      state.world.addComponent(eid, ComponentType.MovementTween, {
        fromX: gx - 1,
        fromY: gy,
        startTime: 0,
        durationMs: 200,
      })

      expect(state.overworldFogExplored.has(posKey(gx, gy))).toBe(false)
      expect(state.overworldFogExplored.has(posKey(gx - 1, gy))).toBe(false)

      spy.fillTextCalls.length = 0
      render(ctx, state, metrics, 50)

      const ghostGlyph = 'ö'
      const ghostDraws = spy.fillTextCalls.filter((c) => c.text === ghostGlyph)
      expect(ghostDraws).toEqual([])
    } finally {
      removeCharacterDefinition(ghostId)
    }
  })
})
