import { describe, expect, it } from 'vitest'
import { shouldRenderRuinMultilayer } from '../ruins'
import { TileType, Zone } from '../types'

const baseArgs = {
  zone: Zone.Ruin,
  tileType: TileType.RuinFloor,
  isPlayer: false,
  isEntity: false,
  hasPreview: false,
  isHighlighted: false,
  hasOverlay: false,
} as const

describe('ruin path overlay', () => {
  describe('shouldRenderRuinMultilayer', () => {
    it('returns true for plain ruin tile in ruin zone', () => {
      expect(shouldRenderRuinMultilayer({ ...baseArgs })).toBe(true)
    })

    it('returns false outside ruin zones', () => {
      expect(shouldRenderRuinMultilayer({ ...baseArgs, zone: Zone.Overworld })).toBe(false)
      expect(shouldRenderRuinMultilayer({ ...baseArgs, zone: Zone.Cave })).toBe(false)
    })

    it('returns false for non-ruin tile types', () => {
      expect(shouldRenderRuinMultilayer({ ...baseArgs, tileType: TileType.Dirt })).toBe(false)
      expect(shouldRenderRuinMultilayer({ ...baseArgs, tileType: TileType.CaveFloor })).toBe(false)
      expect(shouldRenderRuinMultilayer({ ...baseArgs, tileType: undefined })).toBe(false)
    })

    it('skips multilayer for player tile', () => {
      expect(shouldRenderRuinMultilayer({ ...baseArgs, isPlayer: true })).toBe(false)
    })

    it('skips multilayer for entity tile', () => {
      expect(shouldRenderRuinMultilayer({ ...baseArgs, isEntity: true })).toBe(false)
    })

    it('skips multilayer when preview overlay is active', () => {
      expect(shouldRenderRuinMultilayer({ ...baseArgs, hasPreview: true })).toBe(false)
    })

    it('skips multilayer for highlighted tiles', () => {
      expect(shouldRenderRuinMultilayer({ ...baseArgs, isHighlighted: true })).toBe(false)
    })
  })

  describe('path overlay', () => {
    it('skips multilayer on path tiles in ruin zones', () => {
      const onPath = shouldRenderRuinMultilayer({ ...baseArgs, hasOverlay: true })
      expect(onPath).toBe(false)
    })

    it('skips multilayer on path tiles regardless of ruin tile type', () => {
      for (const tileType of [
        TileType.RuinFloor,
        TileType.RuinWall,
        TileType.RuinEntrance,
        TileType.RuinUnstable,
        TileType.RuinAqueduct,
        TileType.RuinDebris,
        TileType.RuinHiddenFloor,
      ]) {
        expect(shouldRenderRuinMultilayer({ ...baseArgs, tileType, hasOverlay: true })).toBe(false)
      }
    })
  })

  describe('hover path overlay', () => {
    it('skips multilayer on hover-path tiles in ruin zones', () => {
      expect(shouldRenderRuinMultilayer({ ...baseArgs, hasOverlay: true })).toBe(false)
    })
  })

  describe('trail overlay', () => {
    it('skips multilayer on player trail tiles in ruin zones', () => {
      expect(shouldRenderRuinMultilayer({ ...baseArgs, hasOverlay: true })).toBe(false)
    })
  })

  describe('multilayer skip precedence', () => {
    it('respects every exclusion independently', () => {
      const exclusions: (keyof typeof baseArgs)[] = [
        'isPlayer',
        'isEntity',
        'hasPreview',
        'isHighlighted',
        'hasOverlay',
      ]
      for (const key of exclusions) {
        const args = { ...baseArgs, [key]: true }
        expect(shouldRenderRuinMultilayer(args)).toBe(false)
      }
    })
  })
})
