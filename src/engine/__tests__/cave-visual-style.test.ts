import { describe, expect, it } from 'vitest'
import { getCaveTileLayers, shouldRenderCaveMultilayer } from '../cave'
import { BUILDING_CHARS, CIV_COLORS, TILE_COLORS } from '../constants'
import { TileType, Zone } from '../types'

describe('cave visual style', () => {
  describe('getCaveTileLayers', () => {
    it('always returns at least one layer for cave terrain', () => {
      for (const tileType of [TileType.CaveWall, TileType.CaveFloor]) {
        const layers = getCaveTileLayers(tileType, 10, 10)
        expect(layers.length).toBeGreaterThanOrEqual(1)
      }
    })

    it('returns valid layer structure', () => {
      const layers = getCaveTileLayers(TileType.CaveWall, 5, 5)
      for (const layer of layers) {
        expect(layer.char).toBeTruthy()
        expect(layer.color).toBeTruthy()
        expect(typeof layer.dx).toBe('number')
        expect(typeof layer.dy).toBe('number')
      }
    })

    it('returns single fallback layer for non-cave tile types', () => {
      const layers = getCaveTileLayers(TileType.Dirt, 5, 5)
      expect(layers.length).toBe(1)
    })
  })

  describe('wall tiles', () => {
    it('renders 2-3 layers with building chars', () => {
      const layers = getCaveTileLayers(TileType.CaveWall, 5, 5)
      expect(layers.length).toBeGreaterThanOrEqual(2)
      expect(layers.length).toBeLessThanOrEqual(3)
      expect(BUILDING_CHARS).toContain(layers[0].char)
    })

    it('uses CIV_COLORS palette', () => {
      const layers = getCaveTileLayers(TileType.CaveWall, 5, 5)
      expect(CIV_COLORS).toContain(layers[0].color)
    })

    it('has offset layers for textured look', () => {
      const layers = getCaveTileLayers(TileType.CaveWall, 5, 5)
      expect(layers[0].dx).toBe(0)
      expect(layers[0].dy).toBe(0)
      const hasOffset = layers.slice(1).some((l) => l.dx !== 0 || l.dy !== 0)
      expect(hasOffset).toBe(true)
    })
  })

  describe('floor tiles', () => {
    it('renders 1-2 sparse layers', () => {
      const layers = getCaveTileLayers(TileType.CaveFloor, 5, 5)
      expect(layers.length).toBeGreaterThanOrEqual(1)
      expect(layers.length).toBeLessThanOrEqual(2)
    })

    it('uses floor chars from cave floor color', () => {
      const layers = getCaveTileLayers(TileType.CaveFloor, 5, 5)
      expect(['.', '·']).toContain(layers[0].char)
      expect(layers[0].color).toBe(TILE_COLORS[TileType.CaveFloor])
    })
  })

  describe('shouldRenderCaveMultilayer', () => {
    const baseArgs = {
      zone: Zone.Cave,
      tileType: TileType.CaveWall,
      isPlayer: false,
      isEntity: false,
      hasPreview: false,
      isHighlighted: false,
      hasOverlay: false,
    }

    it('returns true for CaveWall in cave zone with no overrides', () => {
      expect(shouldRenderCaveMultilayer(baseArgs)).toBe(true)
    })

    it('returns true for CaveFloor in cave zone', () => {
      expect(shouldRenderCaveMultilayer({ ...baseArgs, tileType: TileType.CaveFloor })).toBe(true)
    })

    it('returns false outside cave zone', () => {
      expect(shouldRenderCaveMultilayer({ ...baseArgs, zone: Zone.Overworld })).toBe(false)
      expect(shouldRenderCaveMultilayer({ ...baseArgs, zone: Zone.Ruin })).toBe(false)
    })

    it('returns false for non-multilayer cave tile types', () => {
      expect(shouldRenderCaveMultilayer({ ...baseArgs, tileType: TileType.CaveBreakableWall })).toBe(false)
      expect(shouldRenderCaveMultilayer({ ...baseArgs, tileType: TileType.CaveEntrance })).toBe(false)
      expect(shouldRenderCaveMultilayer({ ...baseArgs, tileType: TileType.CaveExit })).toBe(false)
    })

    it('returns false when highlighted, on player, on entity, with preview, or with overlay', () => {
      expect(shouldRenderCaveMultilayer({ ...baseArgs, isHighlighted: true })).toBe(false)
      expect(shouldRenderCaveMultilayer({ ...baseArgs, isPlayer: true })).toBe(false)
      expect(shouldRenderCaveMultilayer({ ...baseArgs, isEntity: true })).toBe(false)
      expect(shouldRenderCaveMultilayer({ ...baseArgs, hasPreview: true })).toBe(false)
      expect(shouldRenderCaveMultilayer({ ...baseArgs, hasOverlay: true })).toBe(false)
    })
  })

  describe('determinism', () => {
    it('same position produces same layers', () => {
      const layers1 = getCaveTileLayers(TileType.CaveWall, 10, 20)
      const layers2 = getCaveTileLayers(TileType.CaveWall, 10, 20)
      expect(layers1).toEqual(layers2)
    })

    it('different positions produce different layers', () => {
      const layers1 = getCaveTileLayers(TileType.CaveWall, 10, 20)
      const layers2 = getCaveTileLayers(TileType.CaveWall, 11, 20)
      const same =
        layers1.length === layers2.length &&
        layers1.every((l, i) => l.char === layers2[i].char && l.color === layers2[i].color)
      expect(same).toBe(false)
    })
  })

  describe('palette reuse', () => {
    it('BUILDING_CHARS and CIV_COLORS are available', () => {
      expect(BUILDING_CHARS.length).toBe(9)
      expect(CIV_COLORS.length).toBe(5)
    })
  })
})
