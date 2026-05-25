import { CLOVER_LIFECYCLE_TICK_MS } from '../constants'
import { tickEgregoreLifecycle } from '../egregore/lifecycle'
import { tickEgregoreSpread } from '../egregore/spread'

import type { TickSystem } from './types'

export const egregoreSystems = (): TickSystem[] => [
  {
    id: 'egregore-lifecycle',
    intervalMs: CLOVER_LIFECYCLE_TICK_MS,
    zone: 'overworld',
    priority: 52,
    fn: (state, time) => {
      tickEgregoreLifecycle(state, time)
    },
  },
  {
    id: 'egregore-spread',
    // ~30 s wall-clock cadence; the in-game-year throttle inside
    // tickEgregoreSpread is the real gate (1–2 tiles per year).
    intervalMs: 30_000,
    zone: 'overworld',
    priority: 53,
    fn: (state, time) => {
      tickEgregoreSpread(state, time)
    },
  },
]
