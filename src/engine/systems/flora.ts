import { tickPollination } from '../beePollination'
import { tickCloverGrowth, tickCloverHives } from '../clover'
import {
  BEE_TICK_MS,
  CEREMONY_WAVE_TICK_MS,
  CLOVER_GROWTH_TICK_MS,
  CLOVER_HIVE_TICK_MS,
  CLOVER_LIFECYCLE_TICK_MS,
} from '../constants'
import { tickPollenDrift, tickPollenEmit } from '../flora'
import { tickSpeciesSpread } from '../flora/spread'
import { TALLGRASS_SPREAD_CONFIG } from '../flora/type/tallGrass/spread'
import { WILDFLOWER_SPREAD_CONFIG } from '../flora/type/wildflower/spread'
import { tickFloraLifecycle } from '../floraLifecycle'
import { tickFloraWaves } from '../floraWaves'
import { tickTileWater } from '../tileWater'
import { Zone } from '../types'

import type { TickSystem } from './types'
import type { GameState } from '../types'

export const floraSystems = (): TickSystem[] => [
  {
    // Per-frame: age and drift all active pollen particles.
    id: 'pollen-drift',
    intervalMs: 0,
    zone: 'overworld',
    fn: (() => {
      let lastTime = 0
      return (state: GameState, time: number) => {
        const dt = lastTime > 0 ? time - lastTime : 0
        lastTime = time
        tickPollenDrift(state, dt)
      }
    })(),
  },
  {
    // 100 ms interval: probabilistic emission from visible flora tiles above wind threshold.
    id: 'pollen-emit',
    intervalMs: 100,
    zone: 'overworld',
    fn: state => {
      tickPollenEmit(state, 100)
    },
  },
  {
    id: 'clover-growth',
    intervalMs: CLOVER_GROWTH_TICK_MS,
    zone: 'overworld',
    priority: 50,
    fn: state => {
      tickCloverGrowth(state)
    },
  },
  {
    // RP-17 — wildflower autonomous spread (pollinator-gated).
    // Same cadence as clover; the per-tick selectors differ.
    id: 'wildflower-spread',
    intervalMs: CLOVER_GROWTH_TICK_MS,
    zone: 'overworld',
    priority: 50,
    fn: state => {
      tickSpeciesSpread(state, Date.now(), WILDFLOWER_SPREAD_CONFIG)
    },
  },
  {
    // RP-17 — tall grass autonomous spread (rhizome, slowest rate).
    id: 'tallgrass-spread',
    intervalMs: CLOVER_GROWTH_TICK_MS,
    zone: 'overworld',
    priority: 50,
    fn: state => {
      tickSpeciesSpread(state, Date.now(), TALLGRASS_SPREAD_CONFIG)
    },
  },
  {
    // RP-17 — ceremony wave advance. Bee+clover combine
    // (recipes.ts) enqueues a WaveEmission; this tick walks the wave
    // outward in CEREMONY_WAVE_TICK_MS steps until it completes.
    id: 'flora-waves',
    intervalMs: CEREMONY_WAVE_TICK_MS,
    zone: 'overworld',
    priority: 54,
    fn: (state, time) => {
      tickFloraWaves(state, time)
    },
  },
  {
    // RP-17 — bee-mediated pollination. Reads bee/monarch
    // positions after their movement tick has run; primes tiles for
    // cross-pollination on the next spread.
    id: 'bee-pollination',
    intervalMs: BEE_TICK_MS,
    zone: 'overworld',
    priority: 53,
    fn: state => {
      tickPollination(state)
    },
  },
  {
    id: 'clover-hive',
    intervalMs: CLOVER_HIVE_TICK_MS,
    zone: 'overworld',
    priority: 55,
    fn: state => {
      tickCloverHives(state)
    },
  },
  {
    id: 'tile-water',
    intervalMs: CLOVER_LIFECYCLE_TICK_MS,
    zone: 'overworld',
    priority: 51,
    fn: state => {
      tickTileWater(state, Zone.Overworld)
    },
  },
  {
    id: 'clover-lifecycle-overworld',
    intervalMs: CLOVER_LIFECYCLE_TICK_MS,
    zone: 'overworld',
    priority: 52,
    fn: (state, time) => {
      tickFloraLifecycle(state, Zone.Overworld, time)
    },
  },
  {
    id: 'clover-lifecycle-cave',
    intervalMs: CLOVER_LIFECYCLE_TICK_MS,
    zone: 'cave',
    priority: 52,
    fn: (state, time) => {
      tickFloraLifecycle(state, Zone.Cave, time)
    },
  },
]
