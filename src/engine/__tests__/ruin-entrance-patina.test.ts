import { FOG_EXPLORED_BRIGHTNESS, PATINA_CHARS, VERDIGRIS_COLORS } from '../constants'
import { posKey } from '../position'
import { ruinEntrancePatinaPass } from '../render/passes/ruinEntrancePatina'
import { getEntranceHaloCells, getEntrancePatinaLayers } from '../ruins'
import { Zone } from '../types'
import { computeZoneVisibility } from '../visibility'
import { describe, expect, it } from 'vitest'

import { TEST_CHAR_METRICS, makeCanvasStub } from './canvasStub'
import { clearArea, createTestState } from './helpers'

import type { GameState, RuinInterior } from '../types'

describe('ruin entrance patina', () => {
  describe('VERDIGRIS_COLORS palette', () => {
    it('exports a verdigris ramp ordered dark to bright ending in the entrance color', () => {
      expect(VERDIGRIS_COLORS.length).toBeGreaterThanOrEqual(3)
      expect(VERDIGRIS_COLORS[VERDIGRIS_COLORS.length - 1]).toBe('#5FD3BC')
      for (const c of VERDIGRIS_COLORS) {
        expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    })

    it('exports patina chars as a sparse glyph set', () => {
      expect(PATINA_CHARS.length).toBeGreaterThanOrEqual(3)
      for (const ch of PATINA_CHARS) {
        expect(ch).toBeTruthy()
        expect(ch.length).toBeGreaterThanOrEqual(1)
      }
    })
  })

  describe('getEntrancePatinaLayers', () => {
    it('returns no layers for the center entrance tile', () => {
      const layers = getEntrancePatinaLayers(5, 5, 5, 5)
      expect(layers).toEqual([])
    })

    it('returns at least one layer for every perimeter cell', () => {
      const ex = 10
      const ey = 10
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const layers = getEntrancePatinaLayers(ex + dx, ey + dy, ex, ey)
          expect(layers.length).toBeGreaterThanOrEqual(1)
          expect(layers.length).toBeLessThanOrEqual(2)
        }
      }
    })

    it('uses VERDIGRIS_COLORS and PATINA_CHARS', () => {
      const layers = getEntrancePatinaLayers(11, 10, 10, 10)
      for (const layer of layers) {
        expect(VERDIGRIS_COLORS).toContain(layer.color)
        expect(PATINA_CHARS).toContain(layer.char)
      }
    })

    it('layer 0 sits at the cell origin (0,0)', () => {
      const layers = getEntrancePatinaLayers(11, 10, 10, 10)
      expect(layers[0].dx).toBe(0)
      expect(layers[0].dy).toBe(0)
    })

    it('any secondary layer is offset (matches multilayer convention)', () => {
      const ex = 50
      const ey = 50
      let sawSecondary = false
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const layers = getEntrancePatinaLayers(ex + dx, ey + dy, ex, ey)
          if (layers.length === 2) {
            sawSecondary = true
            const offset = layers[1]
            expect(offset.dx === 0 ? offset.dy !== 0 : true).toBe(true)
          }
        }
      }
      expect(sawSecondary).toBe(true)
    })

    it('is deterministic — same coords produce the same layers', () => {
      const a = getEntrancePatinaLayers(11, 10, 10, 10)
      const b = getEntrancePatinaLayers(11, 10, 10, 10)
      expect(a).toEqual(b)
    })

    it('different cells produce different layer signatures', () => {
      const a = getEntrancePatinaLayers(11, 10, 10, 10)
      const b = getEntrancePatinaLayers(9, 10, 10, 10)
      const sigA = `${String(a.length)}:${a[0].char}:${a[0].color}`
      const sigB = `${String(b.length)}:${b[0].char}:${b[0].color}`
      expect(sigA === sigB).toBe(false)
    })
  })

  describe('ruinEntrancePatinaPass', () => {
    const buildState = (zone: Zone, ruinCount: number): Partial<GameState> => ({
      currentZone: zone,
      ruinInteriors: Array.from({ length: ruinCount }, () => ({})) as GameState['ruinInteriors'],
    })

    it('is registered in the effect slot', () => {
      expect(ruinEntrancePatinaPass.slot).toBe('effect')
      expect(ruinEntrancePatinaPass.id).toBe('ruin-entrance-patina')
    })

    it('is active in overworld with at least one ruin interior', () => {
      const state = buildState(Zone.Overworld, 1) as GameState
      expect(ruinEntrancePatinaPass.isActive(state)).toBe(true)
    })

    it('is inactive in cave zone', () => {
      const state = buildState(Zone.Cave, 1) as GameState
      expect(ruinEntrancePatinaPass.isActive(state)).toBe(false)
    })

    it('is inactive in ruin zone', () => {
      const state = buildState(Zone.Ruin, 1) as GameState
      expect(ruinEntrancePatinaPass.isActive(state)).toBe(false)
    })

    it('is inactive when no ruin interiors exist', () => {
      const state = buildState(Zone.Overworld, 0) as GameState
      expect(ruinEntrancePatinaPass.isActive(state)).toBe(false)
    })
  })

  // Regression — without per-cell fog-of-war gating, the patina pass
  // (effect slot) renders glyphs on top of the fogMask diamond and leaks
  // ruin locations through unexplored territory. See
  // harness/specs/fog-ruin-patina-leak.yaml.
  describe('fog of war', () => {
    // Place the ruin entrance away from the player so we can independently
    // configure visibility for the halo cells. Camera is set to put the
    // halo inside the viewport regardless of where the player stands.
    const RUIN_X = 50
    const RUIN_Y = 50

    const setupRuinState = (): GameState => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      // Clear a 3-tile-radius patch of dirt around the entrance so
      // getEntranceHaloCells does not exclude any cell for being Space
      // or water.
      clearArea(state, RUIN_X, RUIN_Y, 2)
      state.ruinInteriors = [
        {
          entranceOverworld: { x: RUIN_X, y: RUIN_Y },
        } as unknown as RuinInterior,
      ]
      // Frame the halo inside the viewport. createTestState defaults to a
      // 20x20 viewport — camera at (RUIN_X - 10, RUIN_Y - 10) centers it.
      state.camera = { x: RUIN_X - 10, y: RUIN_Y - 10 }
      // Reset fog state so each test starts from a known baseline.
      state.overworldFogExplored = new Set()
      return state
    }

    const haloPerimeterKeys = (state: GameState): string[] => {
      const cells = getEntranceHaloCells(
        state.map,
        state.mapWidth,
        state.mapHeight,
        RUIN_X,
        RUIN_Y,
        state.rivers,
        state.ponds
      )
      return cells.filter(c => !(c.x === RUIN_X && c.y === RUIN_Y)).map(c => posKey(c.x, c.y))
    }

    it('draws no patina glyphs on unexplored halo cells', () => {
      const state = setupRuinState()
      // Player stands far away — FOV does not reach the ruin and
      // overworldFogExplored is empty, so every halo cell is unexplored.
      state.player = { x: 10, y: 10 }
      computeZoneVisibility(state)

      const { ctx, mocks } = makeCanvasStub()
      ruinEntrancePatinaPass.draw(ctx, state, TEST_CHAR_METRICS, 0)

      expect(mocks.fillText).not.toHaveBeenCalled()
    })

    it('dims patina glyphs on remembered halo cells', () => {
      const state = setupRuinState()
      // Player still far from ruin so the halo is not currently visible,
      // but the halo cells have been explored before — they are in the
      // remembered tier.
      state.player = { x: 10, y: 10 }
      for (const key of haloPerimeterKeys(state)) {
        state.overworldFogExplored.add(key)
      }
      computeZoneVisibility(state)

      const { ctx, mocks, paintSnapshots } = makeCanvasStub()
      ruinEntrancePatinaPass.draw(ctx, state, TEST_CHAR_METRICS, 0)

      expect(mocks.fillText).toHaveBeenCalled()
      const textSnapshots = paintSnapshots.filter(s => s.op === 'fillText')
      expect(textSnapshots.length).toBeGreaterThan(0)
      for (const snap of textSnapshots) {
        expect(snap.globalAlpha).toBeCloseTo(FOG_EXPLORED_BRIGHTNESS, 5)
      }
    })

    it('draws patina at full alpha on visible halo cells', () => {
      const state = setupRuinState()
      // Player stands on the entrance so the halo perimeter is inside
      // the player FOV (vision radius 6) — every cell is currently visible.
      state.player = { x: RUIN_X, y: RUIN_Y }
      computeZoneVisibility(state)

      const { ctx, mocks, paintSnapshots } = makeCanvasStub()
      ruinEntrancePatinaPass.draw(ctx, state, TEST_CHAR_METRICS, 0)

      expect(mocks.fillText).toHaveBeenCalled()
      const textSnapshots = paintSnapshots.filter(s => s.op === 'fillText')
      expect(textSnapshots.length).toBeGreaterThan(0)
      for (const snap of textSnapshots) {
        expect(snap.globalAlpha).toBe(1)
      }
    })

    it('restores globalAlpha after dimming a remembered cell', () => {
      const state = setupRuinState()
      state.player = { x: 10, y: 10 }
      for (const key of haloPerimeterKeys(state)) {
        state.overworldFogExplored.add(key)
      }
      computeZoneVisibility(state)

      const { ctx } = makeCanvasStub()
      ctx.globalAlpha = 1
      ruinEntrancePatinaPass.draw(ctx, state, TEST_CHAR_METRICS, 0)

      expect(ctx.globalAlpha).toBe(1)
    })
  })
})
