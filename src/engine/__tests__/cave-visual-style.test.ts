import { describe, expect, it } from 'vitest'
import { getCaveTileLayers, shouldRenderCaveMultilayer } from '../cave'
import { CAVE_BUILDING_CHARS, CAVE_WALL_COLORS, TILE_COLORS } from '../constants'
import { getStructurePlatformLift, STRUCTURE_REGISTRY } from '../structures'
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
    it('renders 2-3 layers with cave building chars', () => {
      const layers = getCaveTileLayers(TileType.CaveWall, 5, 5)
      expect(layers.length).toBeGreaterThanOrEqual(2)
      expect(layers.length).toBeLessThanOrEqual(3)
      expect(CAVE_BUILDING_CHARS).toContain(layers[0].char)
    })

    it('uses CAVE_WALL_COLORS palette (distinct from ruin CIV_COLORS)', () => {
      const layers = getCaveTileLayers(TileType.CaveWall, 5, 5)
      expect(CAVE_WALL_COLORS).toContain(layers[0].color)
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

  describe('distinct palette', () => {
    it('cave palette and chars are available from STRUCTURE_REGISTRY.cave', () => {
      expect(STRUCTURE_REGISTRY.cave.palette).toBe(CAVE_WALL_COLORS)
      expect(STRUCTURE_REGISTRY.cave.chars).toBe(CAVE_BUILDING_CHARS)
      expect(CAVE_WALL_COLORS.length).toBe(5)
      expect(CAVE_BUILDING_CHARS.length).toBe(5)
    })
  })

  describe('overworld cave entrance platform', () => {
    it('CaveEntrance lifts more than CaveApron, both positive', () => {
      const entranceLift = -getStructurePlatformLift(TileType.CaveEntrance)
      const apronLift = -getStructurePlatformLift(TileType.CaveApron)
      expect(entranceLift).toBeGreaterThan(0)
      expect(apronLift).toBeGreaterThan(0)
      expect(entranceLift).toBeGreaterThan(apronLift)
    })

    it('no lift for cave interior tiles (zone gating happens at the caller)', () => {
      expect(getStructurePlatformLift(TileType.CaveFloor)).toBe(0)
      expect(getStructurePlatformLift(TileType.CaveWall)).toBe(0)
      expect(getStructurePlatformLift(TileType.CaveExit)).toBe(0)
      expect(getStructurePlatformLift(TileType.CaveBreakableWall)).toBe(0)
    })
  })
})
