// RP-22 — Chronicle scan tick.
//
// Runs the species-extinction and egregore reach/advance scans on the
// weather-tick cadence (5s). The first scan in a tenure seeds the
// prior-state snapshots and emits nothing; subsequent scans diff
// against those snapshots. Scans are pure observations — they never
// mutate world state.

import { WEATHER_TICK_MS } from '../constants'
import { tickChronicle } from '../chronicle/emitters'

import type { TickSystem } from './types'

export const chronicleSystems = (): TickSystem[] => [
  {
    id: 'chronicle-scan',
    intervalMs: WEATHER_TICK_MS,
    zone: 'overworld',
    fn: state => {
      tickChronicle(state)
    },
  },
]
