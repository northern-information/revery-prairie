import { WEATHER_TICK_MS } from '../constants'
import { recordDiscovery } from '../manual'
import { MOAB_PACE_MS, tickTorchbearer } from '../torchbearer'
import { tickPrecipitationIntensity, tickWeather } from '../weather'
import { tickWind } from '../weather/wind'

import type { GameLoopCallbacks, TickSystem } from './types'
import type { GameState } from '../types'

export const weatherSystems = (callbacks: GameLoopCallbacks): TickSystem[] => [
  {
    id: 'weather',
    intervalMs: WEATHER_TICK_MS,
    zone: 'overworld',
    fn: (() => {
      let lastTime = 0
      return (state: GameState, time: number) => {
        const dt = lastTime > 0 ? time - lastTime : WEATHER_TICK_MS
        lastTime = time
        tickWeather(state, dt)
        // Refresh DOM consumers (AmbientInstruments) so the seasonal
        // phase advance, season label, wind direction/speed, and sky
        // readouts update continuously rather than only when the
        // player moves. The minimap drives its own RAF loop and is
        // unaffected.
        callbacks.onRefreshUI?.()
      }
    })(),
  },
  {
    // RP-9b — torchbearer state machine. Runs at MOAB_PACE_MS in
    // the overworld zone only; pacing pauses while the player is in
    // the cave (matches bee/ghost suppression). Season transitions
    // are detected on every call via state.lastSeenSeason.
    id: 'torchbearer',
    intervalMs: MOAB_PACE_MS,
    zone: 'overworld',
    fn: (state: GameState) => {
      tickTorchbearer(state)
    },
  },
  {
    id: 'wind',
    intervalMs: 0,
    zone: 'always',
    fn: (() => {
      let lastTime = 0
      return (state: GameState, time: number) => {
        const dt = lastTime > 0 ? time - lastTime : 0
        lastTime = time
        tickWind(state, time, dt)
        if (state.wind.smoothSpeed > 3) recordDiscovery(state, 'event:wind-sway')
      }
    })(),
  },
  {
    id: 'rain-intensity',
    intervalMs: 0,
    zone: 'overworld',
    fn: (() => {
      let lastTime = 0
      return (state: GameState, time: number) => {
        const dt = lastTime > 0 ? time - lastTime : 0
        lastTime = time
        tickPrecipitationIntensity(state, dt)
      }
    })(),
  },
]
