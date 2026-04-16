import { describe, expect, it } from 'vitest'
import {
  generateRuinInterior,
  offerItemToGuardian,
} from '../ruins'
import { CHARACTER_DEFINITIONS } from '../characters'
import { RuinArchetype, TileType } from '../types'
import { posKey } from '../position'

import type { CivilizationRuin } from '../genesisTypes'

const makeRuin = (overrides: Partial<CivilizationRuin> = {}): CivilizationRuin => ({
  position: { x: 50, y: 50 },
  name: 'Test Haunted Ruin',
  radius: 4,
  age: 3000,
  aqueductPaths: [],
  buildingFootprints: [{ x: 50, y: 50 }],
  ...overrides,
})

const makeRng = (seed = 42) => {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const makeHauntedInterior = (overrides: Partial<CivilizationRuin> = {}) => {
  const ruin = makeRuin(overrides)
  return generateRuinInterior(ruin, 0, RuinArchetype.HauntedThreshold, makeRng())
}

describe('ruin haunted threshold', () => {
  describe('generation', () => {
    it('generates hauntedThreshold data', () => {
      const interior = makeHauntedInterior()
      expect(interior.hauntedThreshold).not.toBeNull()
      expect(interior.subsidence).toBeNull()
      expect(interior.dormantGarden).toBeNull()
    })

    it('creates rooms', () => {
      const interior = makeHauntedInterior()
      const ht = interior.hauntedThreshold
      expect(ht).toBeTruthy()
      if (!ht) return
      expect(ht.rooms.length).toBeGreaterThanOrEqual(3)
      for (const room of ht.rooms) {
        expect(room.width).toBeGreaterThanOrEqual(5)
        expect(room.height).toBeGreaterThanOrEqual(5)
      }
    })

    it('creates ghost formations between rooms', () => {
      const interior = makeHauntedInterior()
      const ht = interior.hauntedThreshold
      expect(ht).toBeTruthy()
      if (!ht) return
      expect(ht.ghostFormations.length).toBeGreaterThanOrEqual(1)
      for (const formation of ht.ghostFormations) {
        expect(formation.positions.length).toBeGreaterThanOrEqual(1)
        expect(formation.wantedItems.length).toBe(formation.positions.length)
        expect(formation.satisfied.length).toBe(formation.positions.length)
        expect(formation.satisfied.every((s) => s === false)).toBe(true)
      }
    })

    it('places ghost positions on walkable floor tiles', () => {
      const interior = makeHauntedInterior()
      const ht = interior.hauntedThreshold
      if (!ht) return
      for (const formation of ht.ghostFormations) {
        for (const pos of formation.positions) {
          expect(interior.map[pos.y][pos.x].type).toBe(TileType.RuinFloor)
        }
      }
    })

    it('registers character definitions for guardian ghosts', () => {
      const interior = makeHauntedInterior()
      const ht = interior.hauntedThreshold
      if (!ht) return
      for (let fi = 0; fi < ht.ghostFormations.length; fi++) {
        for (let gi = 0; gi < ht.ghostFormations[fi].positions.length; gi++) {
          const ghostId = `ruin-guardian-0-${String(fi + 1)}-${String(gi)}`
          expect(CHARACTER_DEFINITIONS[ghostId]).toBeDefined()
          const def = CHARACTER_DEFINITIONS[ghostId]
          expect(def.glyph).toBe('ö')
          expect(def.dialog.length).toBeGreaterThan(0)
        }
      }
    })

    it('wants items from the existing item pool', () => {
      const interior = makeHauntedInterior()
      const ht = interior.hauntedThreshold
      if (!ht) return
      const validItems = ['clover', 'honey', 'coin', 'meteorite', 'bee']
      for (const formation of ht.ghostFormations) {
        for (const itemId of formation.wantedItems) {
          expect(validItems).toContain(itemId)
        }
      }
    })

    it('creates an inner chamber with floor tiles', () => {
      const interior = makeHauntedInterior()
      const ht = interior.hauntedThreshold
      if (!ht) return
      expect(ht.innerChamber.length).toBeGreaterThan(0)
      for (const pos of ht.innerChamber) {
        expect(interior.map[pos.y][pos.x].type).toBe(TileType.RuinFloor)
      }
    })

    it('places artifact position in the inner chamber', () => {
      const interior = makeHauntedInterior()
      const ht = interior.hauntedThreshold
      if (!ht) return
      const isInChamber = ht.innerChamber.some(
        (p) => p.x === ht.artifactPosition.x && p.y === ht.artifactPosition.y,
      )
      expect(isInChamber).toBe(true)
    })

    it('room count scales with radius', () => {
      const small = makeHauntedInterior({ radius: 3 })
      const large = makeHauntedInterior({ radius: 5 })
      const smallRooms = small.hauntedThreshold?.rooms.length ?? 0
      const largeRooms = large.hauntedThreshold?.rooms.length ?? 0
      expect(largeRooms).toBeGreaterThanOrEqual(smallRooms)
    })
  })

  describe('offering mechanic', () => {
    it('returns false when not in a ruin', () => {
      const state = { currentRuinIndex: null } as never
      expect(offerItemToGuardian(state, 0, 'clover')).toBe(false)
    })

    it('returns false when ruin has no haunted threshold data', () => {
      const interior = generateRuinInterior(makeRuin(), 0, RuinArchetype.Subsidence, makeRng())
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
        world: {
          getComponent: () => undefined,
        },
      } as never
      expect(offerItemToGuardian(state, 0, 'clover')).toBe(false)
    })
  })
})
