import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import {
  GLINT_ZONE_COUNT,
  GLINT_ZONE_FADE_IN_MS,
} from '../constants'
import { completeGenesis } from '../genesis'
import { createGameState } from '../state'
import { withSeededRandom } from '@/harness/prng'

const SEED = 42

const readGenesisRenderer = (): string =>
  readFileSync(join(__dirname, '../genesisRenderer.ts'), 'utf-8')

describe('genesis handoff pops', () => {
  describe('ruin-entrance halo paints on top of bg in genesisRenderer', () => {
    it('halo block runs after the tile-bg fill pre-pass, not before', () => {
      const source = readGenesisRenderer()
      const haloMarker = source.indexOf('Ruin-entrance halo pass')
      const bgFillMarker = source.indexOf('Tile-bg fill pre-pass')
      const glyphPassMarker = source.indexOf('Main glyph pass')

      expect(haloMarker).toBeGreaterThan(0)
      expect(bgFillMarker).toBeGreaterThan(0)
      expect(glyphPassMarker).toBeGreaterThan(0)

      // The halo must paint AFTER bg fill (otherwise bg fill erases the
      // halo cells) and BEFORE the main glyph pass (so glyphs land on
      // top of the halo backdrop, just like the gameplay world-overlay
      // -> tile-glyph order).
      expect(haloMarker).toBeGreaterThan(bgFillMarker)
      expect(haloMarker).toBeLessThan(glyphPassMarker)
    })

    it('does not contain a stale halo pre-pass before the bg fill', () => {
      const source = readGenesisRenderer()
      // The previous (buggy) version had a "halo pre-pass" comment placed
      // before the bg fill. After the fix, no such marker should exist.
      expect(source).not.toContain('halo pre-pass')
    })
  })

  describe('createGameState leaves glint state empty', () => {
    it('does not seed glint patches at game-state creation', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 20, 20))
      // Patches must be deferred to completeGenesis so they all start
      // in fade-in (opacity 0) on the first gameplay frame instead of
      // popping in fully aged.
      expect(state.glintPatches).toEqual([])
      expect(state.glintZones.size).toBe(0)
      expect(state.glintOpacity.size).toBe(0)
      expect(state.lastGlintSpawnTime).toBe(0)
    })
  })

  describe('completeGenesis seeds glint patches at handoff', () => {
    it('populates glintPatches with GLINT_ZONE_COUNT entries', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 40))
      expect(state.glintPatches).toEqual([])

      completeGenesis(state, { skipTitleCard: true })

      expect(state.glintPatches.length).toBe(GLINT_ZONE_COUNT)
    })

    it('no patch has a birthTime that would make it pre-aged at handoff', () => {
      const before = performance.now()
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 40))
      completeGenesis(state, { skipTitleCard: true })

      // Every patch must have birthTime >= the handoff baseline, so
      // every patch enters the fade-in phase from opacity 0 (or is not
      // yet born, also opacity 0). The pre-fix behavior produced
      // birthtimes as far back as handoff - 105s, well beyond the
      // 30s fade-in window — that would make patches start at hold-
      // phase opacity 1, the exact pop we are fixing.
      for (const patch of state.glintPatches) {
        expect(patch.birthTime).toBeGreaterThanOrEqual(before)
        expect(patch.birthTime).toBeGreaterThan(performance.now() - GLINT_ZONE_FADE_IN_MS)
      }
    })

    it('lastGlintSpawnTime is set to the handoff time', () => {
      const before = performance.now()
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 40))
      completeGenesis(state, { skipTitleCard: true })
      const after = performance.now()

      expect(state.lastGlintSpawnTime).toBeGreaterThanOrEqual(before)
      expect(state.lastGlintSpawnTime).toBeLessThanOrEqual(after)
    })

    it('glintOpacity is approximately 0 on the first gameplay frame (no pop)', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 40))
      completeGenesis(state, { skipTitleCard: true })

      // The "first gameplay frame" reads opacities from rebuildGlintZones,
      // which completeGenesis already ran with the handoff time. Every
      // opacity should be ~0 (one tick into a 30s fade-in is negligible),
      // proving no patch starts fully active.
      for (const opacity of state.glintOpacity.values()) {
        // Allow a small slop in case multiple patches overlap a tile —
        // none should exceed a sliver of fade-in.
        expect(opacity).toBeLessThan(0.01)
      }
    })

    it('does not re-seed glint patches when called twice', () => {
      const state = withSeededRandom(SEED, () => createGameState('test', 40, 40))
      completeGenesis(state, { skipTitleCard: true })
      const firstBirthTimes = state.glintPatches.map((p) => p.birthTime)

      completeGenesis(state, { skipTitleCard: true })
      const secondBirthTimes = state.glintPatches.map((p) => p.birthTime)

      expect(secondBirthTimes).toEqual(firstBirthTimes)
    })
  })
})
