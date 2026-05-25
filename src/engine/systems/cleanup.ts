import { CRUMBLE_DURATION_MS, POLLEN_BURST_DURATION_MS } from '../constants'
import { ComponentType } from '../ecs/types'
import { tickLightning } from '../lightning'

import type { TickSystem } from './types'

export const cleanupSystems = (): TickSystem[] => [
  {
    id: 'crumble-cleanup',
    intervalMs: 0,
    zone: 'always',
    priority: 100,
    fn: (state, time) => {
      for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
        const tag = state.world.getComponent(eid, ComponentType.EntityTag)
        if (tag !== 'crumble') continue
        const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
        if (effect && time - effect.startTime > CRUMBLE_DURATION_MS) {
          state.world.destroyEntity(eid)
        }
      }
    },
  },
  {
    id: 'pollen-burst-cleanup',
    intervalMs: 0,
    zone: 'always',
    priority: 100,
    fn: (state, time) => {
      for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
        const tag = state.world.getComponent(eid, ComponentType.EntityTag)
        if (tag !== 'pollenBurst') continue
        const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
        if (effect && time - effect.startTime > POLLEN_BURST_DURATION_MS) {
          state.world.destroyEntity(eid)
        }
      }
    },
  },
  {
    id: 'lightning-cleanup',
    intervalMs: 0,
    zone: 'always',
    priority: 100,
    fn: (state, time) => {
      tickLightning(state, time)
    },
  },
]
