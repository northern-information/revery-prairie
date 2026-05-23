// Regression tests for pollen-burst-clock spec.
//
// Two bugs being guarded:
//  1. gameLoop.ts passed Date.now() to tickFloraWaves while the renderer
//     reads performance.now()-domain rAF time. The clock mismatch made
//     pollenBurst TimedEffects appear never to expire, so the gold '*'
//     glyph (identical to BEE_CHAR/BEE_COLOR) stayed on screen forever,
//     looking like a static cloud of stationary "bees".
//  2. No cleanup system destroyed pollenBurst entities after their
//     POLLEN_BURST_DURATION_MS window. Even with rendering fixed, the
//     ECS would grow without bound across repeated ceremony casts.

import { afterEach, describe, expect, it, vi } from 'vitest'

import { POLLEN_BURST_DURATION_MS } from '../constants'
import { ComponentType } from '../ecs/types'
import { createGameLoop } from '../gameLoop'
import { RECIPES } from '../recipes'
import { Zone } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

const prairieRecipe = RECIPES[0]

const queryPollenBursts = (state: ReturnType<typeof createTestState>): number[] =>
  state.world
    .query(ComponentType.TimedEffect, ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'pollenBurst')

describe('pollen burst clock alignment', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stamps pollenBurst.startTime with the rAF time argument, not Date.now()', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    clearAroundPlayer(state, 12)

    // Cast the ceremony so a wave is queued.
    expect(prairieRecipe.execute(state)).toBe(true)

    // 0.5 keeps the per-tick burst count deterministic inside floraWaves.ts
    // (POLLEN_BURSTS_PER_TICK_MIN..MAX random pick).
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    // rAF time is small (uptime-ms domain). Date.now() is ~1.7e12.
    // The gameLoop must hand its rAF `time` argument straight through
    // to tickFloraWaves so the burst startTime is in the same clock
    // the renderer compares against.
    const rafTime = 5000
    const gameLoop = createGameLoop(state, {})
    gameLoop.tick(rafTime)

    const bursts = queryPollenBursts(state)
    expect(bursts.length).toBeGreaterThanOrEqual(1)

    // Every burst's startTime must be in the rAF-clock neighborhood of
    // the tick we just ran — never the Date.now() epoch (~1.7e12).
    for (const eid of bursts) {
      const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
      expect(effect).toBeDefined()
      // Allow a small slack but reject anything in the Unix-epoch range.
      expect(effect?.startTime).toBeLessThan(1_000_000)
      expect(effect?.startTime).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('pollen burst cleanup system', () => {
  it('destroys pollenBurst entities once elapsed exceeds POLLEN_BURST_DURATION_MS', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld

    // Seed a pollenBurst entity directly so the test is independent of
    // the ceremony-wave path.
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: 5, y: 5 })
    state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'pollenBurst', startTime: 0 })
    state.world.addComponent(e, ComponentType.EntityTag, 'pollenBurst')
    state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })

    const gameLoop = createGameLoop(state, {})

    // Still within the fade window — entity must survive.
    gameLoop.tick(POLLEN_BURST_DURATION_MS - 1)
    expect(queryPollenBursts(state)).toHaveLength(1)

    // Past the fade window — cleanup must have destroyed the entity.
    gameLoop.tick(POLLEN_BURST_DURATION_MS + 1)
    expect(queryPollenBursts(state)).toHaveLength(0)
  })
})
