import { describe, expect, it } from 'vitest'
import { BUILDING_CHARS, CAVE_BUILDING_CHARS, CAVE_WALL_COLORS, CIV_COLORS } from '../constants'
import { STRUCTURE_REGISTRY, getStructurePlatformLift } from '../structures'
import { TileType } from '../types'

describe('structure registry', () => {
  describe('shape', () => {
    it('exposes ruin and cave entries', () => {
      expect(STRUCTURE_REGISTRY.ruin).toBeDefined()
      expect(STRUCTURE_REGISTRY.cave).toBeDefined()
    })

    it('every entry declares entranceTile, apronTile, lifts, palette, chars, multilayerTiles', () => {
      for (const entry of Object.values(STRUCTURE_REGISTRY)) {
        expect(entry.entranceTile).toBeTruthy()
        expect(entry.apronTile).toBeTruthy()
        expect(entry.entranceLiftPx).toBeGreaterThan(0)
        expect(entry.apronLiftPx).toBeGreaterThan(0)
        expect(entry.entranceLiftPx).toBeGreaterThan(entry.apronLiftPx)
        expect(entry.palette.length).toBeGreaterThan(0)
        expect(entry.chars.length).toBeGreaterThan(0)
        expect(entry.multilayerTiles.length).toBeGreaterThan(0)
      }
    })

    it('entranceTile and apronTile are unique across entries', () => {
      const seen = new Set<TileType>()
      for (const entry of Object.values(STRUCTURE_REGISTRY)) {
        expect(seen.has(entry.entranceTile)).toBe(false)
        seen.add(entry.entranceTile)
        expect(seen.has(entry.apronTile)).toBe(false)
        seen.add(entry.apronTile)
      }
    })
  })

  describe('ruin entry', () => {
    it('uses CIV_COLORS palette and BUILDING_CHARS', () => {
      expect(STRUCTURE_REGISTRY.ruin.palette).toBe(CIV_COLORS)
      expect(STRUCTURE_REGISTRY.ruin.chars).toBe(BUILDING_CHARS)
    })

    it('targets RuinEntrance and RuinApron tiles', () => {
      expect(STRUCTURE_REGISTRY.ruin.entranceTile).toBe(TileType.RuinEntrance)
      expect(STRUCTURE_REGISTRY.ruin.apronTile).toBe(TileType.RuinApron)
    })
  })

  describe('cave entry', () => {
    it('uses CAVE_WALL_COLORS palette and CAVE_BUILDING_CHARS', () => {
      expect(STRUCTURE_REGISTRY.cave.palette).toBe(CAVE_WALL_COLORS)
      expect(STRUCTURE_REGISTRY.cave.chars).toBe(CAVE_BUILDING_CHARS)
    })

    it('targets CaveEntrance and CaveApron tiles', () => {
      expect(STRUCTURE_REGISTRY.cave.entranceTile).toBe(TileType.CaveEntrance)
      expect(STRUCTURE_REGISTRY.cave.apronTile).toBe(TileType.CaveApron)
    })

    it('palette is visually distinct from ruin palette (no shared colors)', () => {
      const ruinSet = new Set(STRUCTURE_REGISTRY.ruin.palette)
      for (const color of STRUCTURE_REGISTRY.cave.palette) {
        expect(ruinSet.has(color)).toBe(false)
      }
    })
  })

  describe('getStructurePlatformLift', () => {
    it('returns negative entranceLiftPx for entrance tiles', () => {
      expect(getStructurePlatformLift(TileType.RuinEntrance)).toBe(-STRUCTURE_REGISTRY.ruin.entranceLiftPx)
      expect(getStructurePlatformLift(TileType.CaveEntrance)).toBe(-STRUCTURE_REGISTRY.cave.entranceLiftPx)
    })

    it('returns negative apronLiftPx for apron tiles', () => {
      expect(getStructurePlatformLift(TileType.RuinApron)).toBe(-STRUCTURE_REGISTRY.ruin.apronLiftPx)
      expect(getStructurePlatformLift(TileType.CaveApron)).toBe(-STRUCTURE_REGISTRY.cave.apronLiftPx)
    })

    it('returns 0 for tiles not registered as a structure platform', () => {
      const nonPlatform: TileType[] = [
        TileType.Dirt,
        TileType.Clover,
        TileType.Sand,
        TileType.Space,
        TileType.CaveFloor,
        TileType.CaveWall,
        TileType.RuinFloor,
        TileType.RuinWall,
      ]
      for (const t of nonPlatform) {
        expect(getStructurePlatformLift(t)).toBe(0)
      }
    })
  })
})
