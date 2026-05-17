import { PATINA_CHARS, VERDIGRIS_COLORS } from '../constants'
import { ruinEntrancePatinaPass } from '../render/passes/ruinEntrancePatina'
import { getEntrancePatinaLayers } from '../ruins'
import { Zone } from '../types'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

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
})
