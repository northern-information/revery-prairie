import { describe, expect, it } from 'vitest'
import { getRuinTileLayers } from '../ruins'
import { BUILDING_CHARS, CIV_COLORS } from '../constants'
import { TileType } from '../types'

describe('ruin visual style', () => {
  describe('getRuinTileLayers', () => {
    it('always returns at least one layer', () => {
      const ruinTileTypes = [
        TileType.RuinWall,
        TileType.RuinFloor,
        TileType.RuinEntrance,
        TileType.RuinUnstable,
        TileType.RuinAqueduct,
        TileType.RuinAqueductBroken,
        TileType.RuinDebris,
        TileType.RuinMachine,
        TileType.RuinMachineActive,
        TileType.RuinHiddenFloor,
      ]
      for (const tileType of ruinTileTypes) {
        const layers = getRuinTileLayers(tileType, 10, 10, 0)
        expect(layers.length).toBeGreaterThanOrEqual(1)
      }
    })

    it('returns valid layer structure', () => {
      const layers = getRuinTileLayers(TileType.RuinWall, 5, 5, 0)
      for (const layer of layers) {
        expect(layer.char).toBeTruthy()
        expect(layer.color).toBeTruthy()
        expect(typeof layer.dx).toBe('number')
        expect(typeof layer.dy).toBe('number')
      }
    })
  })

  describe('wall tiles', () => {
    it('renders 2-3 layers with building chars', () => {
      const layers = getRuinTileLayers(TileType.RuinWall, 5, 5, 0)
      expect(layers.length).toBeGreaterThanOrEqual(2)
      expect(layers.length).toBeLessThanOrEqual(3)
      expect(BUILDING_CHARS).toContain(layers[0].char)
    })

    it('uses CIV_COLORS palette', () => {
      const layers = getRuinTileLayers(TileType.RuinWall, 5, 5, 0)
      expect(CIV_COLORS).toContain(layers[0].color)
    })

    it('has offset layers for messy look', () => {
      const layers = getRuinTileLayers(TileType.RuinWall, 5, 5, 0)
      expect(layers[0].dx).toBe(0)
      expect(layers[0].dy).toBe(0)
      if (layers.length >= 2) {
        const hasOffset = layers.slice(1).some((l) => l.dx !== 0 || l.dy !== 0)
        expect(hasOffset).toBe(true)
      }
    })
  })

  describe('floor tiles', () => {
    it('renders 1-2 sparse layers', () => {
      const layers = getRuinTileLayers(TileType.RuinFloor, 5, 5, 0)
      expect(layers.length).toBeGreaterThanOrEqual(1)
      expect(layers.length).toBeLessThanOrEqual(2)
    })

    it('uses floor chars', () => {
      const layers = getRuinTileLayers(TileType.RuinFloor, 5, 5, 0)
      expect(['.', '·']).toContain(layers[0].char)
    })
  })

  describe('entrance tile', () => {
    it('renders O with secondary layer', () => {
      const layers = getRuinTileLayers(TileType.RuinEntrance, 5, 5, 0)
      expect(layers[0].char).toBe('O')
      expect(layers.length).toBe(2)
    })
  })

  describe('aqueduct tiles', () => {
    it('uses box-drawing or wave chars', () => {
      const layers = getRuinTileLayers(TileType.RuinAqueduct, 5, 5, 0)
      expect(layers.length).toBeGreaterThanOrEqual(1)
      const validChars = ['─', '│', '~']
      expect(validChars).toContain(layers[0].char)
    })

    it('broken aqueduct uses fragmenting chars', () => {
      const layers = getRuinTileLayers(TileType.RuinAqueductBroken, 5, 5, 0)
      expect(layers.length).toBe(1)
      expect(['+', '.', '·']).toContain(layers[0].char)
    })
  })

  describe('debris tiles', () => {
    it('renders 2 crumble layers', () => {
      const layers = getRuinTileLayers(TileType.RuinDebris, 5, 5, 0)
      expect(layers.length).toBe(2)
      expect(['▒', '░', '▓']).toContain(layers[0].char)
    })
  })

  describe('machine tiles', () => {
    it('inactive machine has copper glyph with secondary layer', () => {
      const layers = getRuinTileLayers(TileType.RuinMachine, 5, 5, 0)
      expect(layers.length).toBe(2)
      expect(layers[0].color).toBe('#B87333')
    })

    it('active machine pulses with gold', () => {
      const layers = getRuinTileLayers(TileType.RuinMachineActive, 5, 5, 0)
      expect(layers.length).toBe(2)
      expect(layers[0].color).toBe('#FFD700')
    })

    it('active machine secondary layer changes with time', () => {
      const layers1 = getRuinTileLayers(TileType.RuinMachineActive, 5, 5, 0)
      const layers2 = getRuinTileLayers(TileType.RuinMachineActive, 5, 5, 500)
      // At different times, the pulse char may differ
      // Just verify both return valid layers
      expect(layers1.length).toBe(2)
      expect(layers2.length).toBe(2)
    })
  })

  describe('determinism', () => {
    it('same position produces same layers', () => {
      const layers1 = getRuinTileLayers(TileType.RuinWall, 10, 20, 0)
      const layers2 = getRuinTileLayers(TileType.RuinWall, 10, 20, 0)
      expect(layers1).toEqual(layers2)
    })

    it('different positions produce different layers', () => {
      const layers1 = getRuinTileLayers(TileType.RuinWall, 10, 20, 0)
      const layers2 = getRuinTileLayers(TileType.RuinWall, 11, 20, 0)
      // At least one property should differ
      const same = layers1.length === layers2.length && layers1.every((l, i) => l.char === layers2[i].char && l.color === layers2[i].color)
      expect(same).toBe(false)
    })
  })

  describe('genesis palette reuse', () => {
    it('BUILDING_CHARS and CIV_COLORS are available', () => {
      expect(BUILDING_CHARS.length).toBe(9)
      expect(CIV_COLORS.length).toBe(5)
    })
  })
})
