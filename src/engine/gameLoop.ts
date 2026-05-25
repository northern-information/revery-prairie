import { SCAN_DURATION_MS } from './constants'
import { tickDormancyPressure } from './omen'
import { tickProximityMusic } from './proximityMusic'
import { initiateRevery, tickRevery } from './revery'
import { commitScan } from './scan'
import { AUTO_HIDE_THRESHOLD, createDefaultSystems } from './systems'
import { OmenKind, Season, Zone } from './types'

import type { GameLoopCallbacks, TickSystem } from './systems/types'
import type { GameState } from './types'

export { AUTO_HIDE_THRESHOLD }
export type { GameLoopCallbacks, TickSystem }

export interface GameLoop {
  tick: (time: number) => void
  start: () => void
  stop: () => void
  pause: () => void
  resume: () => void
  register: (system: TickSystem) => void
  unregister: (id: string) => void
  readonly running: boolean
  readonly paused: boolean
}

interface TickEntry {
  system: TickSystem
  lastTick: number
}

const sortEntries = (entries: TickEntry[]): void => {
  entries.sort((a, b) => (a.system.priority ?? 0) - (b.system.priority ?? 0))
}

export const createGameLoop = (state: GameState, callbacks: GameLoopCallbacks): GameLoop => {
  const entries: TickEntry[] = []
  let rafId = 0
  let running = false
  let paused = false
  // RP-32 — previous frame's season, used to detect Autumn → Winter
  // transitions for the dormancy-pressure safety reset. Initialized from
  // state.weather.season at first tick to avoid a spurious reset on boot.
  let prevSeason: Season | null = null

  const register = (system: TickSystem): void => {
    const existing = entries.findIndex(e => e.system.id === system.id)
    if (existing !== -1) {
      entries[existing] = { system, lastTick: 0 }
    } else {
      entries.push({ system, lastTick: 0 })
    }
    sortEntries(entries)
  }

  const unregister = (id: string): void => {
    const idx = entries.findIndex(e => e.system.id === id)
    if (idx !== -1) {
      entries.splice(idx, 1)
    }
  }

  // Register default systems
  for (const system of createDefaultSystems(callbacks)) {
    register(system)
  }

  const tick = (time: number): void => {
    const currentPhase = state.genesis ? 'genesis' : 'gameplay'

    for (const entry of entries) {
      // Phase filtering — skip systems that don't match the current phase
      const systemPhase = entry.system.phase ?? 'gameplay'
      if (systemPhase !== 'always' && systemPhase !== currentPhase) continue

      if (entry.system.intervalMs === 0 || time - entry.lastTick >= entry.system.intervalMs) {
        // For zone-specific systems, temporarily swap state.map to that
        // zone's map so tick functions read the correct terrain.
        // 'always' systems use the current zone's map as-is.
        // Ruin ticks only run when the player is inside a ruin — skip otherwise.
        // No map swap needed because the active map is already the ruin map.
        if (entry.system.zone === 'ruin' && state.currentZone !== Zone.Ruin) continue

        const needsSwap =
          entry.system.zone !== 'always' &&
          entry.system.zone !== 'ruin' &&
          ((entry.system.zone === 'overworld' && state.currentZone !== Zone.Overworld) ||
            (entry.system.zone === 'cave' && state.currentZone !== Zone.Cave))

        if (needsSwap) {
          const savedMap = state.map
          const savedWidth = state.mapWidth
          const savedHeight = state.mapHeight
          if (entry.system.zone === 'overworld') {
            state.map = state.overworldMap
            state.mapWidth = state.overworldMapWidth
            state.mapHeight = state.overworldMapHeight
          } else {
            state.map = state.caveMap
            state.mapWidth = state.caveMapWidth
            state.mapHeight = state.caveMapHeight
          }
          entry.system.fn(state, time)
          state.map = savedMap
          state.mapWidth = savedWidth
          state.mapHeight = savedHeight
        } else {
          entry.system.fn(state, time)
        }

        entry.lastTick = time
      }
    }

    // RP-6 — auto-commit a held [f] scan once it reaches full duration.
    // Player doesn't have to time the release; releasing early aborts, but
    // holding past 100% commits immediately.
    if (state.scanInProgress && time - state.scanInProgress.startTime >= SCAN_DURATION_MS) {
      const committed = commitScan(state, time)
      state.scanInProgress = null
      if (committed) {
        callbacks.onScanComplete?.(committed)
        callbacks.onRefreshUI?.()
      }
    }

    // RP-32 — dormancy pressure + Revery state machine. Runs after
    // the standard tick block so the pressure tick sees the latest season
    // and seasonalPhase, and BEFORE the next frame's input handlers fire
    // so the Omen → Observing transition is reflected by the time
    // movePlayer / keyboard checks.
    tickDormancyPressure(state, time)
    // Threshold trigger: pressure crossing ceiling initiates the Revery.
    // The placeholder OmenKind is the legacy enum value preserved for
    // ReveryState.omenKind shape compat; RP-36 (Revery Knot) will
    // surface a real Knot-pickup kind when it ships. summons=true marks
    // this as a pressure-ceiling-path Revery for the summons sequence in
    // tickRevery.
    if (state.dormancyPressure >= 1 && state.revery === null) {
      initiateRevery(state, time, OmenKind.CloudPassingSun)
      if (state.revery) (state.revery as { summons?: boolean }).summons = true
    }
    // Safety reset: if season transitioned Autumn → Winter without a
    // Revery firing, zero dormancyPressure so it does not linger into the
    // following autumn. Should not normally occur (the ramp guarantees
    // ceiling at solstice), but documents the invariant.
    if (prevSeason === Season.Autumn && state.weather.season === Season.Winter && state.revery === null) {
      state.dormancyPressure = 0
    }
    prevSeason = state.weather.season
    tickRevery(state, 0, time)
    state.lastSky = state.weather.sky

    // Proximity music: query MusicEmitter components in the player's
    // zone, compute per-emitter gain, and drive the audio module. Run
    // last so it observes the latest player position and zone state.
    tickProximityMusic(state)
  }

  const loop = (rawTime: number): void => {
    if (!paused) {
      try {
        tick(rawTime)
      } catch (err) {
        console.error('[gameLoop] tick error:', err)
      }
    }
    callbacks.onFrame?.(rawTime)
    rafId = requestAnimationFrame(loop)
  }

  return {
    tick,
    start: () => {
      running = true
      paused = false
      rafId = requestAnimationFrame(loop)
    },
    stop: () => {
      running = false
      cancelAnimationFrame(rafId)
    },
    pause: () => {
      paused = true
    },
    resume: () => {
      paused = false
    },
    register,
    unregister,
    get running() {
      return running
    },
    get paused() {
      return paused
    },
  }
}
