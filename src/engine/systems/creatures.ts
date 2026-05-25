import { BEE_TICK_MS, COYOTE_TICK_MS, GHOST_TICK_MS, MONARCH_TICK_MS } from '../constants'
import { tickCoyote } from '../coyote'
import { tickBees, tickCharacterBehaviors } from '../entities'
import { tickMonarchs } from '../monarch'
import { Zone } from '../types'

import type { GameLoopCallbacks, TickSystem } from './types'

export const creatureSystems = (callbacks: GameLoopCallbacks): TickSystem[] => [
  {
    id: 'bee',
    intervalMs: BEE_TICK_MS,
    zone: 'overworld',
    fn: state => {
      const deaths = tickBees(state, Zone.Overworld)
      for (const pos of deaths) {
        callbacks.onBeeDeath?.(pos.x, pos.y)
      }
    },
  },
  {
    id: 'bee-cave',
    intervalMs: BEE_TICK_MS,
    zone: 'cave',
    fn: state => {
      const deaths = tickBees(state, Zone.Cave)
      for (const pos of deaths) {
        callbacks.onBeeDeath?.(pos.x, pos.y)
      }
    },
  },
  {
    id: 'monarch',
    intervalMs: MONARCH_TICK_MS,
    zone: 'overworld',
    fn: (state, time) => {
      tickMonarchs(state, time, Zone.Overworld)
    },
  },
  {
    id: 'character-behaviors',
    intervalMs: GHOST_TICK_MS,
    zone: 'overworld',
    fn: state => {
      tickCharacterBehaviors(state, Zone.Overworld)
    },
  },
  {
    id: 'coyote',
    intervalMs: COYOTE_TICK_MS,
    zone: 'always',
    fn: (state, time) => {
      const result = tickCoyote(state, time)
      if (result.delivered) {
        callbacks.onRefreshUI?.()
      }
    },
  },
]
