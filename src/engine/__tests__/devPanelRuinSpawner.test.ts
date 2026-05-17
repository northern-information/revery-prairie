import { ENTRANCE_GLYPHS } from '../constants'
import {
  getRuinPreviewGlyph,
  RUIN_ARCHETYPE_OPTIONS,
  RUIN_GLYPH_OPTIONS,
  RUIN_GLYPH_RANDOM,
  RUIN_PRESET_KEY,
  RUIN_PRESET_LABEL,
  spawnDevRuin,
} from '../devPanel'
import { createWorld } from '../ecs/world'
import { posKey } from '../position'
import { RuinArchetype, TileType, Zone } from '../types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameState, RuinInterior } from '../types'

const makeOverworldState = (): GameState => {
  const map = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({ type: TileType.Dirt as TileType })))
  const interiors: RuinInterior[] = []
  return {
    world: createWorld(),
    map,
    mapWidth: 20,
    mapHeight: 20,
    currentZone: Zone.Overworld,
    player: { x: 10, y: 10 },
    ruinInteriors: interiors,
    ponds: new Set<string>(),
    rivers: new Set<string>(),
  } as GameState
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dev panel ruin spawner', () => {
  describe('preset metadata', () => {
    it('exposes preset key and label', () => {
      expect(RUIN_PRESET_KEY).toBe('ruin')
      expect(RUIN_PRESET_LABEL).toBeTruthy()
    })

    it('archetype options cover all four RuinArchetype values', () => {
      const optionValues = new Set(RUIN_ARCHETYPE_OPTIONS.map(o => o.value))
      const archetypes = new Set(Object.values(RuinArchetype))
      expect(optionValues).toEqual(archetypes)
    })

    it('glyph options start with random and include all ENTRANCE_GLYPHS', () => {
      expect(RUIN_GLYPH_OPTIONS[0]).toBe(RUIN_GLYPH_RANDOM)
      const rest = new Set(RUIN_GLYPH_OPTIONS.slice(1))
      expect(rest).toEqual(new Set(ENTRANCE_GLYPHS))
    })

    it('preview glyph for "random" returns a stable fallback character', () => {
      const preview = getRuinPreviewGlyph(RUIN_GLYPH_RANDOM)
      expect(preview.char).toBe(ENTRANCE_GLYPHS[0])
      expect(preview.color).toBeTruthy()
    })

    it('preview glyph for an explicit glyph returns that character', () => {
      const preview = getRuinPreviewGlyph('Δ')
      expect(preview.char).toBe('Δ')
    })
  })

  describe('spawnDevRuin happy path', () => {
    it('places a RuinEntrance tile at the drop position', () => {
      const state = makeOverworldState()
      const ok = spawnDevRuin(state, { x: 5, y: 6 }, RuinArchetype.DormantGarden, 'Δ')
      expect(ok).toBe(true)
      expect(state.map[6][5].type).toBe(TileType.RuinEntrance)
    })

    it('appends a RuinInterior with matching entranceOverworld and ruinIndex', () => {
      const state = makeOverworldState()
      spawnDevRuin(state, { x: 5, y: 6 }, RuinArchetype.DormantGarden, 'Δ')
      expect(state.ruinInteriors).toHaveLength(1)
      const interior = state.ruinInteriors[0]
      expect(interior.entranceOverworld).toEqual({ x: 5, y: 6 })
      expect(interior.ruinIndex).toBe(0)
    })

    it('dispatches the chosen archetype', () => {
      for (const archetype of Object.values(RuinArchetype)) {
        const state = makeOverworldState()
        spawnDevRuin(state, { x: 5, y: 6 }, archetype, 'Δ')
        expect(state.ruinInteriors[0].archetype).toBe(archetype)
      }
    })

    it('stores the chosen explicit glyph on the interior', () => {
      const state = makeOverworldState()
      spawnDevRuin(state, { x: 5, y: 6 }, RuinArchetype.DormantGarden, 'Φ')
      expect(state.ruinInteriors[0].glyph).toBe('Φ')
    })

    it('resolves "random" glyph to a member of ENTRANCE_GLYPHS at drop time', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      const state = makeOverworldState()
      spawnDevRuin(state, { x: 5, y: 6 }, RuinArchetype.DormantGarden, RUIN_GLYPH_RANDOM)
      const expected = ENTRANCE_GLYPHS[Math.floor(0.5 * ENTRANCE_GLYPHS.length)]
      expect(state.ruinInteriors[0].glyph).toBe(expected)
    })

    it('assigns ruinIndex sequentially across multiple drops', () => {
      const state = makeOverworldState()
      spawnDevRuin(state, { x: 3, y: 3 }, RuinArchetype.DormantGarden, 'Δ')
      spawnDevRuin(state, { x: 8, y: 8 }, RuinArchetype.DormantGarden, 'Φ')
      spawnDevRuin(state, { x: 12, y: 12 }, RuinArchetype.DormantGarden, 'Ψ')
      expect(state.ruinInteriors.map(r => r.ruinIndex)).toEqual([0, 1, 2])
    })
  })

  describe('drop validation (silent reject)', () => {
    it('rejects out-of-bounds drops', () => {
      const state = makeOverworldState()
      expect(spawnDevRuin(state, { x: -1, y: 5 }, RuinArchetype.DormantGarden, 'Δ')).toBe(false)
      expect(spawnDevRuin(state, { x: 5, y: 99 }, RuinArchetype.DormantGarden, 'Δ')).toBe(false)
      expect(state.ruinInteriors).toHaveLength(0)
    })

    it('rejects drops on Space tiles', () => {
      const state = makeOverworldState()
      state.map[5][5] = { type: TileType.Space }
      expect(spawnDevRuin(state, { x: 5, y: 5 }, RuinArchetype.DormantGarden, 'Δ')).toBe(false)
      expect(state.map[5][5].type).toBe(TileType.Space)
      expect(state.ruinInteriors).toHaveLength(0)
    })

    it('rejects drops on existing RuinEntrance tiles', () => {
      const state = makeOverworldState()
      state.map[5][5] = { type: TileType.RuinEntrance }
      expect(spawnDevRuin(state, { x: 5, y: 5 }, RuinArchetype.DormantGarden, 'Δ')).toBe(false)
    })

    it('rejects drops on existing CaveEntrance tiles', () => {
      const state = makeOverworldState()
      state.map[5][5] = { type: TileType.CaveEntrance }
      expect(spawnDevRuin(state, { x: 5, y: 5 }, RuinArchetype.DormantGarden, 'Δ')).toBe(false)
    })

    it('rejects drops on pond tiles', () => {
      const state = makeOverworldState()
      state.ponds.add(posKey(5, 5))
      expect(spawnDevRuin(state, { x: 5, y: 5 }, RuinArchetype.DormantGarden, 'Δ')).toBe(false)
      expect(state.map[5][5].type).toBe(TileType.Dirt)
      expect(state.ruinInteriors).toHaveLength(0)
    })

    it('rejects drops on river tiles', () => {
      const state = makeOverworldState()
      state.rivers.add(posKey(5, 5))
      expect(spawnDevRuin(state, { x: 5, y: 5 }, RuinArchetype.DormantGarden, 'Δ')).toBe(false)
    })

    it('rejects drops while not on the overworld', () => {
      const state = makeOverworldState()
      state.currentZone = Zone.Cave
      expect(spawnDevRuin(state, { x: 5, y: 5 }, RuinArchetype.DormantGarden, 'Δ')).toBe(false)
      state.currentZone = Zone.Ruin
      expect(spawnDevRuin(state, { x: 5, y: 5 }, RuinArchetype.DormantGarden, 'Δ')).toBe(false)
      expect(state.ruinInteriors).toHaveLength(0)
    })
  })
})
