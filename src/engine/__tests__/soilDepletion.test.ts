import {
  CLOVER_BLACK_DURATION_MS,
  CLOVER_BLINK_RED_DURATION_MS,
  CLOVER_BROWN_DURATION_MS,
  CLOVER_DECOMPOSE_DURATION_MS,
  SOIL_HEALTH_DEFAULT,
  SOIL_HEALTH_FLORA_DEATH_BONUS,
  SOIL_HEALTH_FLORA_SPAWN_DEBIT,
  SOIL_HEALTH_MAX,
  SOIL_HEALTH_NITROGEN_FIXER_BONUS,
  WATER_MAX,
} from '../constants'
import { createFloraLifecycleEntry } from '../floraLifecycleEntry'
import { tickFloraLifecycle } from '../floraLifecycle'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { posKey } from '../position'
import { FloraSpecies, FloraStage, Season, Sky, TileType, Zone } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'

import type { FloraLifecycleState, GameState } from '../types'

const placeFlora = (
  state: GameState,
  x: number,
  y: number,
  opts: {
    species: FloraSpecies
    soilEffectApplied?: boolean
    stage?: FloraStage
    soilStart?: number
  }
) => {
  state.map[y][x] = { type: TileType.Flora }
  const key = posKey(x, y)
  if (!state.tileWater.has(key)) state.tileWater.set(key, WATER_MAX)
  if (opts.soilStart !== undefined) state.soilHealth.set(key, opts.soilStart)
  const identity = generateGenesisIdentity(`Test:${opts.species}`, 0, key)
  const entry: FloraLifecycleState = createFloraLifecycleEntry({
    time: 0,
    hasLight: true,
    species: opts.species,
    identity,
    traits: generateTraitBag(identity),
    stage: opts.stage,
    soilEffectApplied: opts.soilEffectApplied,
  })
  state.floraLifecycle.set(key, entry)
  return key
}

describe('soil depletion (RP-19)', () => {
  let state: GameState
  const px = () => state.player.x
  const py = () => state.player.y

  beforeEach(() => {
    state = createTestState()
    clearAroundPlayer(state, 5)
    state.weather.sky = Sky.Sun
    state.weather.season = Season.Spring
    state.meteorShower = { ...state.meteorShower, active: false }
  })

  describe('per-plant spawn effect', () => {
    it('clover credits SOIL_HEALTH_NITROGEN_FIXER_BONUS on first Healthy tick', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Clover,
        soilStart: SOIL_HEALTH_DEFAULT,
      })

      tickFloraLifecycle(state, Zone.Overworld, 1000)

      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT + SOIL_HEALTH_NITROGEN_FIXER_BONUS)
      expect(state.floraLifecycle.get(key)?.soilEffectApplied).toBe(true)
    })

    it('wildflower debits SOIL_HEALTH_FLORA_SPAWN_DEBIT on first Healthy tick', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: SOIL_HEALTH_DEFAULT,
      })

      tickFloraLifecycle(state, Zone.Overworld, 1000)

      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT - SOIL_HEALTH_FLORA_SPAWN_DEBIT)
      expect(state.floraLifecycle.get(key)?.soilEffectApplied).toBe(true)
    })

    it('tall grass debits SOIL_HEALTH_FLORA_SPAWN_DEBIT on first Healthy tick', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.TallGrass,
        soilStart: SOIL_HEALTH_DEFAULT,
      })

      tickFloraLifecycle(state, Zone.Overworld, 1000)

      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT - SOIL_HEALTH_FLORA_SPAWN_DEBIT)
      expect(state.floraLifecycle.get(key)?.soilEffectApplied).toBe(true)
    })
  })

  describe('genesis-seeded flora skips spawn effect', () => {
    it('clover with soilEffectApplied=true does not credit soil', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Clover,
        soilEffectApplied: true,
        soilStart: SOIL_HEALTH_DEFAULT,
      })

      tickFloraLifecycle(state, Zone.Overworld, 1000)

      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT)
      expect(state.floraLifecycle.get(key)?.soilEffectApplied).toBe(true)
    })

    it('wildflower with soilEffectApplied=true does not debit soil', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilEffectApplied: true,
        soilStart: SOIL_HEALTH_DEFAULT,
      })

      tickFloraLifecycle(state, Zone.Overworld, 1000)

      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT)
    })
  })

  describe('one-time fire', () => {
    it('does not re-fire across Healthy → Brown → Healthy stress recovery', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: SOIL_HEALTH_DEFAULT,
      })

      // First tick fires the spawn effect
      tickFloraLifecycle(state, Zone.Overworld, 1000)
      const afterFirstTick = state.soilHealth.get(key)
      expect(afterFirstTick).toBe(SOIL_HEALTH_DEFAULT - SOIL_HEALTH_FLORA_SPAWN_DEBIT)

      // Stress: drain water → Brown
      state.tileWater.set(key, 0)
      tickFloraLifecycle(state, Zone.Overworld, 2000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)

      // Recover: refill water → Healthy
      state.tileWater.set(key, WATER_MAX)
      tickFloraLifecycle(state, Zone.Overworld, 3000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Healthy)

      // Soil unchanged across the recovery — the effect already fired
      expect(state.soilHealth.get(key)).toBe(afterFirstTick)
    })

    it('BurntRecovering entry does not fire the spawn effect', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        stage: FloraStage.BurntRecovering,
        soilStart: SOIL_HEALTH_DEFAULT,
      })
      // BurntRecovering tiles live on BurntFlora map tiles, not Flora.
      // Reflect that on the map so the burnt-recovery branch handles it.
      state.map[py() + 1][px()] = { type: TileType.BurntFlora }

      tickFloraLifecycle(state, Zone.Overworld, 1000)

      // Soil unchanged — BurntRecovering branch is its own continue,
      // never reaches the spawn-effect hook.
      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT)
      expect(state.floraLifecycle.get(key)?.soilEffectApplied).toBe(false)
    })
  })

  describe('death enrichment unchanged', () => {
    it('full wildflower lifecycle nets -5 (debit 20 + death 15)', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: SOIL_HEALTH_DEFAULT,
      })

      // Run the full death sequence in a cave (no light forces stress)
      let t = 1000
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BROWN_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLINK_RED_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLACK_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_DECOMPOSE_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)

      expect(state.map[py() + 1][px()].type).toBe(TileType.Dirt)
      expect(state.soilHealth.get(key)).toBe(
        SOIL_HEALTH_DEFAULT - SOIL_HEALTH_FLORA_SPAWN_DEBIT + SOIL_HEALTH_FLORA_DEATH_BONUS
      )
    })

    it('full clover lifecycle nets +20 (credit 5 + death 15)', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Clover,
        soilStart: SOIL_HEALTH_DEFAULT,
      })

      let t = 1000
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BROWN_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLINK_RED_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLACK_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_DECOMPOSE_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)

      expect(state.soilHealth.get(key)).toBe(
        SOIL_HEALTH_DEFAULT + SOIL_HEALTH_NITROGEN_FIXER_BONUS + SOIL_HEALTH_FLORA_DEATH_BONUS
      )
    })
  })

  describe('clamps at [0, SOIL_HEALTH_MAX]', () => {
    it('wildflower spawn-debit clamps soilHealth at 0', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: 0,
      })

      tickFloraLifecycle(state, Zone.Overworld, 1000)

      expect(state.soilHealth.get(key)).toBe(0)
      // Flag still flips — the effect "fired", the clamp is independent
      expect(state.floraLifecycle.get(key)?.soilEffectApplied).toBe(true)
    })

    it('wildflower below the debit clamps down to 0 (not negative)', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: 5,
      })

      tickFloraLifecycle(state, Zone.Overworld, 1000)

      expect(state.soilHealth.get(key)).toBe(0)
    })

    it('clover spawn-credit clamps soilHealth at SOIL_HEALTH_MAX', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Clover,
        soilStart: SOIL_HEALTH_MAX,
      })

      tickFloraLifecycle(state, Zone.Overworld, 1000)

      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_MAX)
      expect(state.floraLifecycle.get(key)?.soilEffectApplied).toBe(true)
    })
  })

  describe('cave flora', () => {
    it('fires spawn effect on first tick before transitioning to Brown', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: SOIL_HEALTH_DEFAULT,
      })

      // Cave = no light → stress detected after spawn effect
      tickFloraLifecycle(state, Zone.Cave, 1000)

      // Soil paid the debit even though the plant immediately starts dying
      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT - SOIL_HEALTH_FLORA_SPAWN_DEBIT)
      const entry = state.floraLifecycle.get(key)
      expect(entry?.soilEffectApplied).toBe(true)
      expect(entry?.stage).toBe(FloraStage.Brown)
    })
  })

  describe('winter dormancy', () => {
    it('defers spawn effect while entry is Dormant', () => {
      state.weather.season = Season.Winter
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: SOIL_HEALTH_DEFAULT,
      })

      tickFloraLifecycle(state, Zone.Overworld, 1000)

      // Dormancy branch flipped Healthy → Dormant before the spawn-effect
      // hook; the hook gates on Healthy and is skipped.
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Dormant)
      expect(state.floraLifecycle.get(key)?.soilEffectApplied).toBe(false)
      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT)
    })

    it('fires spawn effect on first non-winter tick after thaw', () => {
      state.weather.season = Season.Winter
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: SOIL_HEALTH_DEFAULT,
      })
      tickFloraLifecycle(state, Zone.Overworld, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Dormant)

      // Thaw
      state.weather.season = Season.Spring
      tickFloraLifecycle(state, Zone.Overworld, 2000)

      // The thaw branch flips Dormant → Healthy and `continues` — does not
      // run the spawn-effect hook this tick. One more tick fires it.
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Healthy)
      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT)

      tickFloraLifecycle(state, Zone.Overworld, 3000)
      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT - SOIL_HEALTH_FLORA_SPAWN_DEBIT)
      expect(state.floraLifecycle.get(key)?.soilEffectApplied).toBe(true)
    })

    it('does not re-fire after Healthy → Dormant → Healthy when already paid', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: SOIL_HEALTH_DEFAULT,
      })
      tickFloraLifecycle(state, Zone.Overworld, 1000)
      const afterFirstTick = state.soilHealth.get(key)

      // Go into winter
      state.weather.season = Season.Winter
      tickFloraLifecycle(state, Zone.Overworld, 2000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Dormant)

      // Thaw
      state.weather.season = Season.Spring
      tickFloraLifecycle(state, Zone.Overworld, 3000)
      tickFloraLifecycle(state, Zone.Overworld, 4000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Healthy)

      // Soil unchanged across dormancy round-trip
      expect(state.soilHealth.get(key)).toBe(afterFirstTick)
    })
  })

  describe('serialization round-trip preserves the flag', () => {
    it('JSON.parse(JSON.stringify(entry)) preserves soilEffectApplied', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: SOIL_HEALTH_DEFAULT,
      })
      tickFloraLifecycle(state, Zone.Overworld, 1000)
      const before = state.floraLifecycle.get(key)
      expect(before?.soilEffectApplied).toBe(true)

      const serialized = JSON.stringify(before)
      const after = JSON.parse(serialized) as FloraLifecycleState

      expect(after.soilEffectApplied).toBe(true)
    })

    it('a fresh entry serializes soilEffectApplied=false explicitly', () => {
      const key = placeFlora(state, px(), py() + 1, {
        species: FloraSpecies.Wildflower,
        soilStart: SOIL_HEALTH_DEFAULT,
      })
      const entry = state.floraLifecycle.get(key)
      expect(entry?.soilEffectApplied).toBe(false)
      const serialized = JSON.stringify(entry)
      expect(serialized.includes('"soilEffectApplied":false')).toBe(true)
    })
  })
})
