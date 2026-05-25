import { spawnShootingStar, tickMeteorShower, tickShootingStars } from '../celestial'
import {
  LIGHTNING_TICK_MS,
  METEOR_SHOWER_TICK_MS,
  SATELLITE_SHAKE_DURATION_MS,
  SATELLITE_SPAWN_TICK_MS,
  SATELLITE_TICK_MS,
  SHOOTING_STAR_SPAWN_TICK_MS,
  SHOOTING_STAR_TICK_MS,
} from '../constants'
import { spawnLightningStrike } from '../lightning'
import { spawnSatellite, tickSatellites } from '../satellites'
import { Zone } from '../types'
import { isTileInVisibleViewport } from '../viewportBounds'

import type { TickSystem } from './types'

export const celestialSystems = (): TickSystem[] => [
  {
    id: 'shooting-star-spawn',
    intervalMs: SHOOTING_STAR_SPAWN_TICK_MS,
    zone: 'overworld',
    fn: state => {
      spawnShootingStar(state)
    },
  },
  {
    id: 'shooting-star-tick',
    intervalMs: SHOOTING_STAR_TICK_MS,
    zone: 'overworld',
    fn: (state, time) => {
      tickShootingStars(state, time)
    },
  },
  {
    id: 'meteor-shower',
    intervalMs: METEOR_SHOWER_TICK_MS,
    zone: 'overworld',
    fn: (state, time) => {
      tickMeteorShower(state, time)
    },
  },
  {
    id: 'satellite-spawn',
    intervalMs: SATELLITE_SPAWN_TICK_MS,
    zone: 'overworld',
    fn: (state, time) => {
      spawnSatellite(state, time)
    },
  },
  {
    id: 'satellite-tick',
    intervalMs: SATELLITE_TICK_MS,
    zone: 'overworld',
    fn: (state, time) => {
      const impact = tickSatellites(state, time)
      if (impact && state.currentZone === Zone.Overworld) {
        const vx = impact.x - state.camera.x
        const vy = impact.y - state.camera.y
        const inViewport = isTileInVisibleViewport(vx, vy, state.viewportWidth, state.viewportHeight)
        if (inViewport) {
          state.screenShakeUntil = time + SATELLITE_SHAKE_DURATION_MS
        }
      }
    },
  },
  {
    id: 'lightning-spawn',
    intervalMs: LIGHTNING_TICK_MS,
    zone: 'overworld',
    priority: 60,
    fn: (state, time) => {
      spawnLightningStrike(state, time)
    },
  },
]
