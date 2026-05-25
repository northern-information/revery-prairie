import { spawnAngel, tickAngelBeeAura, tickAngelCloverAura, tickAngelDrift, tickAngelLifespan } from '../angels'
import {
  ANGEL_BEE_SPAWN_INTERVAL_MS,
  ANGEL_CLOVER_GROW_INTERVAL_MS,
  ANGEL_DRIFT_TICK_MS,
  ANGEL_SPAWN_INTERVAL_MS,
  GLINT_ZONE_TICK_MS,
} from '../constants'
import { tickGlintZones } from '../glintZones'

import type { GameLoopCallbacks, TickSystem } from './types'

export const angelSystems = (callbacks: GameLoopCallbacks): TickSystem[] => [
  {
    id: 'glint-zone',
    intervalMs: GLINT_ZONE_TICK_MS,
    zone: 'overworld',
    fn: (state, time) => {
      tickGlintZones(state, time)
    },
  },
  {
    id: 'angel-spawn',
    intervalMs: ANGEL_SPAWN_INTERVAL_MS,
    zone: 'overworld',
    fn: (state, time) => {
      if (spawnAngel(state, time)) {
        callbacks.onRefreshUI?.()
      }
    },
  },
  {
    id: 'angel-drift',
    intervalMs: ANGEL_DRIFT_TICK_MS,
    zone: 'overworld',
    fn: state => {
      tickAngelDrift(state)
    },
  },
  {
    id: 'angel-lifespan',
    intervalMs: 1000,
    zone: 'overworld',
    fn: (state, time) => {
      tickAngelLifespan(state, time)
    },
  },
  {
    id: 'angel-bee-aura',
    intervalMs: ANGEL_BEE_SPAWN_INTERVAL_MS,
    zone: 'overworld',
    fn: (state, time) => {
      tickAngelBeeAura(state, time)
    },
  },
  {
    id: 'angel-clover-aura',
    intervalMs: ANGEL_CLOVER_GROW_INTERVAL_MS,
    zone: 'overworld',
    fn: (state, time) => {
      tickAngelCloverAura(state, time)
    },
  },
]
