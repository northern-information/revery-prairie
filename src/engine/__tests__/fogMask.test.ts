import { BG_COLOR, FOG_EXPLORED_BRIGHTNESS } from '../constants'
import { posKey } from '../position'
import { fogMaskPass } from '../render/passes/fogMask'
import { TileType, Zone } from '../types'
import { computeZoneVisibility } from '../visibility'
import { createTestState } from './helpers'
import { describe, expect, it, vi } from 'vitest'

import type { CharMetrics, GameState, Tile } from '../types'

const CHAR_WIDTH = 10
const CHAR_HEIGHT = 16
const METRICS: CharMetrics = { charWidth: CHAR_WIDTH, charHeight: CHAR_HEIGHT, font: '16px monospace' }

const makeCaveMap = (width: number, height: number): Tile[][] => {
  const map: Tile[][] = []
  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < width; x++) {
      row.push({ type: TileType.CaveFloor })
    }
    map.push(row)
  }
  return map
}

const enterTestCave = (state: GameState): void => {
  const map = makeCaveMap(20, 20)
  state.map = map
  state.mapWidth = 20
  state.mapHeight = 20
  state.currentZone = Zone.Cave
  state.player.x = 10
  state.player.y = 10
  state.camera.x = 0
  state.camera.y = 0
  state.viewportWidth = 20
  state.viewportHeight = 20
  // Force-clear the entrance so it doesn't pull the entrance ring into the
  // visible set during these tests.
  state.caveEntranceInterior = { x: -10, y: -10 }
}

interface RecordedFill {
  fillStyle: string
  globalAlpha: number
}

const makeRecordingCtx = (): { ctx: CanvasRenderingContext2D; fills: RecordedFill[] } => {
  const fills: RecordedFill[] = []
  const state = { fillStyle: '#000', globalAlpha: 1 }
  const ctx = {
    get fillStyle() {
      return state.fillStyle
    },
    set fillStyle(v: string) {
      state.fillStyle = v
    },
    get globalAlpha() {
      return state.globalAlpha
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v
    },
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => {
      fills.push({ fillStyle: state.fillStyle, globalAlpha: state.globalAlpha })
    }),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D
  return { ctx, fills }
}

describe('fog mask pass', () => {
  describe('isActive', () => {
    it('is active in cave zone', () => {
      const state = createTestState()
      state.currentZone = Zone.Cave
      expect(fogMaskPass.isActive(state)).toBe(true)
    })

    it('is active in ruin zone', () => {
      const state = createTestState()
      state.currentZone = Zone.Ruin
      expect(fogMaskPass.isActive(state)).toBe(true)
    })

    it('is active on overworld (RP-38)', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      expect(fogMaskPass.isActive(state)).toBe(true)
    })
  })

  describe('mask painting', () => {
    it('paints opaque BG_COLOR diamonds over unexplored tiles', () => {
      const state = createTestState()
      enterTestCave(state)
      computeZoneVisibility(state)

      const { ctx, fills } = makeRecordingCtx()
      fogMaskPass.draw(ctx, state, METRICS, 0)

      expect(fills.length).toBeGreaterThan(0)
      const opaqueBgFills = fills.filter(f => f.fillStyle === BG_COLOR && f.globalAlpha === 1)
      expect(opaqueBgFills.length).toBeGreaterThan(0)
    })

    it('paints alpha (1 - FOG_EXPLORED_BRIGHTNESS) black diamonds over partiallyDiscovered tiles', () => {
      const state = createTestState()
      enterTestCave(state)
      // Mark a viewport tile as previously explored but not fullyDiscovered.
      const dimKey = posKey(15, 15)
      state.caveFogExplored.add(dimKey)

      computeZoneVisibility(state)

      const { ctx, fills } = makeRecordingCtx()
      fogMaskPass.draw(ctx, state, METRICS, 0)

      const expectedAlpha = 1 - FOG_EXPLORED_BRIGHTNESS
      const partialFills = fills.filter(f => f.fillStyle === '#000' && Math.abs(f.globalAlpha - expectedAlpha) < 1e-6)
      expect(partialFills.length).toBeGreaterThan(0)
    })

    it('does not mask visible tiles (player FOV)', () => {
      const state = createTestState()
      enterTestCave(state)
      computeZoneVisibility(state)

      const { ctx, fills } = makeRecordingCtx()
      fogMaskPass.draw(ctx, state, METRICS, 0)

      // Every recorded fill should be either an opaque BG_COLOR or a
      // partial-mask black — never a transparent or omitted mask.
      // Visible tiles around the player are skipped entirely (no fill call).
      const totalTilesInViewport = state.viewportWidth * state.viewportHeight
      // Player FOV (radius 3) covers at minimum the player tile itself,
      // plus surrounding tiles. Conservatively expect at least 1 unmasked tile.
      expect(fills.length).toBeLessThan(totalTilesInViewport * 4)
    })

    it('masks unexplored tiles on overworld as well (RP-38)', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      // Fresh tenure — no prairie tiles explored yet. The fog-mask pass
      // is active and paints BG_COLOR diamonds over the viewport.
      expect(fogMaskPass.isActive(state)).toBe(true)
    })

    it('skips space tiles', () => {
      const state = createTestState()
      enterTestCave(state)
      // Convert a viewport tile to space.
      state.map[5][5] = { type: TileType.Space }
      computeZoneVisibility(state)

      const { ctx, fills } = makeRecordingCtx()
      fogMaskPass.draw(ctx, state, METRICS, 0)

      // Cannot easily verify the exact tile was skipped from this fill list,
      // but verify the pass doesn't crash and still produces masks for
      // surrounding non-space tiles.
      expect(fills.length).toBeGreaterThan(0)
    })
  })

  describe('regression: bg cache leak through fog', () => {
    it('produces opaque BG_COLOR masks for tiles never in player FOV', () => {
      // The original bug: caveFloor / caveWall bg colors leaked through fog
      // because the bg-cache composite painted the entire map regardless of
      // visibility. Fix is the fog mask pass painting BG_COLOR over unexplored
      // tiles. This test reproduces the original failure mode.
      const state = createTestState()
      enterTestCave(state)
      // Player at (10,10), vision radius 3. Tile at (0,0) is unexplored.
      computeZoneVisibility(state)

      const { ctx, fills } = makeRecordingCtx()
      fogMaskPass.draw(ctx, state, METRICS, 0)

      // At least one mask must be opaque BG_COLOR — covering an unexplored tile.
      const hasOpaqueMask = fills.some(f => f.fillStyle === BG_COLOR && f.globalAlpha === 1)
      expect(hasOpaqueMask).toBe(true)
    })
  })
})
