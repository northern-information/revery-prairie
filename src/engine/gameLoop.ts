import { spawnAngel, tickAngelBeeAura, tickAngelCloverAura, tickAngelDrift, tickAngelLifespan } from './angels'
import { spawnShootingStar, tickMeteorShower, tickShootingStars, triggerPlayerSpawnShower } from './celestial'
import { tickCloverGrowth, tickCloverHives } from './clover'
import { tickEgregoreLifecycle } from './egregore/lifecycle'
import { tickEgregoreSpread } from './egregore/spread'
import { tickFloraLifecycle } from './floraLifecycle'
import {
  ANGEL_BEE_SPAWN_INTERVAL_MS,
  ANGEL_CLOVER_GROW_INTERVAL_MS,
  ANGEL_DRIFT_TICK_MS,
  ANGEL_SPAWN_INTERVAL_MS,
  BEE_TICK_MS,
  CLOVER_GROWTH_TICK_MS,
  CLOVER_HIVE_TICK_MS,
  CLOVER_LIFECYCLE_TICK_MS,
  COYOTE_TICK_MS,
  CRUMBLE_DURATION_MS,
  GHOST_TICK_MS,
  GLINT_ZONE_TICK_MS,
  KEYBOARD_MOVE_TICK_MS,
  LIGHTNING_TICK_MS,
  METEOR_SHOWER_TICK_MS,
  MONARCH_TICK_MS,
  PATH_TICK_MS,
  SATELLITE_SHAKE_DURATION_MS,
  SATELLITE_SPAWN_TICK_MS,
  SATELLITE_TICK_MS,
  SCAN_DURATION_MS,
  SHOOTING_STAR_SPAWN_TICK_MS,
  SHOOTING_STAR_TICK_MS,
  SPRINT_MOVE_TICK_MS,
  UNIT_COMMAND_TICK_MS,
  WEATHER_TICK_MS,
  ZONE_TRANSITION_FADE_IN_MS,
  ZONE_TRANSITION_FADE_OUT_MS,
  ZONE_TRANSITION_HOLD_MS,
} from './constants'
import { tickCoyote } from './coyote'
import { tickDeepTime } from './deepTime'
import { ComponentType } from './ecs/types'
import { pickUpGroundItems, tickBees, tickCharacterBehaviors } from './entities'
import { tickPollenDrift, tickPollenEmit } from './flora'
import { commitScan } from './scan'
import { completeGenesis, finalizeGenesisHandoff, GENESIS_EPOCHS, tickGenesis } from './genesis'
import { tickGlintZones } from './glintZones'
import { tickDialogTransition, tickDialogTyping } from './interaction'
import { spawnLightningStrike, tickLightning } from './lightning'
import { recordDiscovery } from './manual'
import { detectOmen } from './omen'
import { initiateRevery, tickRevery } from './revery'
import { tickMonarchs } from './monarch'
import { movePlayer, tickPath } from './movement'
import { tickDormantGardenDecay } from './ruins'
import { spawnSatellite, tickSatellites } from './satellites'
import { pruneSelection } from './selection'
import { tickTileWater } from './tileWater'
import { DeepTimePhase, Zone } from './types'
import { cleanupMoveOrderMarkers, tickUnitCommands } from './unitCommands'
import { isTileInVisibleViewport } from './viewportBounds'
import { MOAB_PACE_MS, tickTorchbearer } from './torchbearer'
import { tickPrecipitationIntensity, tickWeather } from './weather'
import { tickWind } from './weather/wind'
import { tickZoneTransition } from './zoneTransition'

import type { FloraSpecies, GameState } from './types'

export interface TickSystem {
  id: string
  intervalMs: number
  zone: 'overworld' | 'cave' | 'ruin' | 'always'
  /** Which game phase this system runs in. Defaults to 'gameplay'. */
  phase?: 'genesis' | 'gameplay' | 'always'
  priority?: number
  fn: (state: GameState, time: number) => void
}

export interface GameLoopCallbacks {
  onRefreshUI?: () => void
  onBeeDeath?: (worldX: number, worldY: number) => void
  onAutoHidePanel?: () => void
  // Precis #6 — fires from tick when a held [f] scan reaches 100% and
  // commits successfully. The React layer opens the ScanResultModal with
  // the just-scanned species + identity (the modal renders the latin
  // binomial + gel-band sequence with a ceremonial row-by-row reveal).
  onScanComplete?: (species: FloraSpecies, identity: string) => void
  // Oak scans commit to the manual rather than the flora-only modal —
  // the React layer opens the manual with the entry:oak entry highlighted.
  onOakScanComplete?: (identity: string) => void
  onFrame?: (time: number) => void
}

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

export const AUTO_HIDE_THRESHOLD = 5

const checkAutoHide = (state: GameState, callbacks: GameLoopCallbacks) => {
  state.panelOpenMoveCount++
  if (state.autoHidePanels && state.panelOpenMoveCount >= AUTO_HIDE_THRESHOLD) {
    callbacks.onAutoHidePanel?.()
  }
}

const createDefaultSystems = (callbacks: GameLoopCallbacks): TickSystem[] => {
  return [
    {
      id: 'genesis',
      intervalMs: 0,
      zone: 'always' as const,
      phase: 'genesis' as const,
      priority: -25,
      fn: (() => {
        let lastRefresh = 0
        return (state: GameState, time: number) => {
          if (!state.genesis) return
          if (state.genesis.epochIndex >= GENESIS_EPOCHS.length) return

          const done = tickGenesis(state.genesis, GENESIS_EPOCHS, time)
          if (done) {
            completeGenesis(state)
            callbacks.onRefreshUI?.()
          } else if (time - lastRefresh >= 100) {
            // Throttled refresh — keeps the year readout ticking under the lerp
            lastRefresh = time
            callbacks.onRefreshUI?.()
          }
        }
      })(),
    },
    {
      id: 'bootTitleCardTick',
      // Fast tick — the midpoint swap should land within ~1 frame of
      // its scheduled time so the renderer change is invisible under
      // full-black cover.
      intervalMs: 16,
      zone: 'always' as const,
      // 'always' so this fires both while state.genesis is set (during
      // the fade-in) and after it's cleared (during the fade-out).
      phase: 'always' as const,
      priority: -20,
      fn: (state: GameState, time: number) => {
        if (!state.bootTitleCard) return
        const elapsed = time - state.bootTitleCard.startTime
        const holdMidpoint = ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS / 2
        const total = ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS + ZONE_TRANSITION_FADE_OUT_MS

        // Hold-midpoint swap: clear genesis under full-black cover so the
        // renderer change is invisible. finalizeGenesisHandoff is a
        // no-op if state.genesis is already null.
        if (state.genesis && elapsed >= holdMidpoint) {
          finalizeGenesisHandoff(state, time)
          callbacks.onRefreshUI?.()
        }

        if (elapsed >= total) {
          state.bootTitleCard = null
          callbacks.onRefreshUI?.()
        }
      },
    },
    {
      // Drives the iris + ASCII dissolve transition between overworld
      // and cave / ruin interiors. Fires the deferred map swap at
      // midpoint and clears state.zoneTransition at progress >= 1.
      id: 'zoneTransitionTick',
      intervalMs: 0,
      zone: 'always' as const,
      phase: 'gameplay' as const,
      priority: -19,
      fn: (state: GameState, time: number) => {
        if (!state.zoneTransition) return
        tickZoneTransition(state, time)
        // When the transition clears, request a UI refresh so the
        // sidebar / cursor info update against the new zone.
        if (state.zoneTransition === null) {
          callbacks.onRefreshUI?.()
        }
      },
    },
    {
      id: 'deepTimeTransitionCleanup',
      intervalMs: 100,
      zone: 'always' as const,
      phase: 'gameplay' as const,
      priority: -19,
      fn: (state: GameState, time: number) => {
        if (!state.deepTimeTransition) return
        const elapsed = time - state.deepTimeTransition.startTime
        if (elapsed >= state.deepTimeTransition.duration) {
          state.deepTimeTransition = null
          callbacks.onRefreshUI?.()
        }
      },
    },
    {
      // Sprint runs at SPRINT_MOVE_TICK_MS with one move per tick instead of
      // two moves per PATH_TICK_MS — keeps the 2x speed but makes every tile
      // a discrete stop point so keyup never overshoots an item.
      id: 'path',
      intervalMs: 0,
      zone: 'always',
      priority: -10,
      fn: (() => {
        let lastMoveTime = 0
        return (state: GameState, time: number) => {
          if (state.deepTime?.active && state.deepTime.phase !== DeepTimePhase.Wandering) return
          if (!state.path) return
          const interval = state.sprinting ? SPRINT_MOVE_TICK_MS : PATH_TICK_MS
          if (time - lastMoveTime < interval) return
          if (!tickPath(state)) return
          lastMoveTime = time
          checkAutoHide(state, callbacks)
          pickUpGroundItems(state, time)
          callbacks.onRefreshUI?.()
        }
      })(),
    },
    {
      id: 'keyboard-move',
      intervalMs: 0,
      zone: 'always',
      priority: -5,
      fn: (() => {
        let lastMoveTime = 0
        return (state: GameState, time: number) => {
          if (state.deepTime?.active && state.deepTime.phase !== DeepTimePhase.Wandering) return
          if (!state.heldDirection) return
          if (state.activeDialog) return
          if (state.path) return
          const interval = state.sprinting ? SPRINT_MOVE_TICK_MS : KEYBOARD_MOVE_TICK_MS
          if (time - lastMoveTime < interval) return
          if (!movePlayer(state, state.heldDirection)) return
          lastMoveTime = time
          // RTS pan: WASD does NOT auto-recenter. Only spacebar and
          // click-to-move pull the camera back to the player; WASD lets
          // the user walk while leaving the camera wherever they panned it.
          checkAutoHide(state, callbacks)
          pickUpGroundItems(state, time)
          callbacks.onRefreshUI?.()
        }
      })(),
    },
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
    {
      id: 'unit-commands',
      intervalMs: UNIT_COMMAND_TICK_MS,
      zone: 'always',
      fn: state => {
        tickUnitCommands(state)
        pruneSelection(state)
      },
    },
    {
      id: 'move-order-markers',
      intervalMs: 0,
      zone: 'always',
      fn: (state, time) => {
        cleanupMoveOrderMarkers(state, time)
      },
    },
    {
      id: 'player-spawn-trigger',
      intervalMs: 0,
      zone: 'always' as const,
      phase: 'gameplay' as const,
      priority: -19,
      fn: (state: GameState, time: number) => {
        if (state.playerSpawn.triggeredAt !== 0) return
        triggerPlayerSpawnShower(state, state.player, time)
      },
    },
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
        }
      })(),
    },
    {
      // Precis #9b — torchbearer state machine. Runs at MOAB_PACE_MS in
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
    {
      id: 'dialog',
      intervalMs: 0,
      zone: 'always',
      fn: (state, time) => {
        if (!state.activeDialog) return
        const prevTypingIndex = state.activeDialog.typingIndex
        const prevTransitioning = state.activeDialog.transitioning
        tickDialogTyping(state, time)
        tickDialogTransition(state, time)
        if (
          state.activeDialog.typingIndex !== prevTypingIndex ||
          state.activeDialog.transitioning !== prevTransitioning
        ) {
          callbacks.onRefreshUI?.()
        }
      },
    },
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
      id: 'lightning-cleanup',
      intervalMs: 0,
      zone: 'always',
      priority: 100,
      fn: (state, time) => {
        tickLightning(state, time)
      },
    },
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
    {
      id: 'deep-time',
      intervalMs: 0,
      zone: 'always',
      priority: -20,
      fn: (() => {
        let lastRefresh = 0
        return (state: GameState, time: number) => {
          if (!state.deepTime?.active) return
          tickDeepTime(state, time)
          if (state.deepTime.phase !== DeepTimePhase.Wandering && time - lastRefresh >= 100) {
            lastRefresh = time
            callbacks.onRefreshUI?.()
          }
        }
      })(),
    },
    {
      id: 'ruin-dormant-garden',
      intervalMs: 1000,
      zone: 'ruin',
      fn: (state: GameState, _time: number) => {
        tickDormantGardenDecay(state, 1000)
      },
    },
  ]
}

const sortEntries = (entries: TickEntry[]): void => {
  entries.sort((a, b) => (a.system.priority ?? 0) - (b.system.priority ?? 0))
}

export const createGameLoop = (state: GameState, callbacks: GameLoopCallbacks): GameLoop => {
  const entries: TickEntry[] = []
  let rafId = 0
  let running = false
  let paused = false

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

    // Precis #6 — auto-commit a held [f] scan once it reaches full duration.
    // Player doesn't have to time the release; releasing early aborts, but
    // holding past 100% commits immediately.
    if (state.scanInProgress && time - state.scanInProgress.startTime >= SCAN_DURATION_MS) {
      const committed = commitScan(state, time)
      state.scanInProgress = null
      if (committed) {
        if (committed.kind === 'flora') {
          callbacks.onScanComplete?.(committed.species, committed.identity)
        } else {
          callbacks.onOakScanComplete?.(committed.identity)
        }
        callbacks.onRefreshUI?.()
      }
    }

    // Precis #4 — omen detection + Revery state machine. Runs after the
    // standard tick block so detectOmen sees the latest world state, and
    // BEFORE the next frame's input handlers fire so the Omen → Observing
    // transition is reflected by the time movePlayer / keyboard checks.
    // detectOmen also reads state.lastSky vs state.weather.sky; we update
    // state.lastSky at the very end so the NEXT frame's check sees the
    // current frame's sky as "previous."
    const omen = detectOmen(state, time)
    if (omen) initiateRevery(state, time, omen)
    tickRevery(state, 0, time)
    state.lastSky = state.weather.sky
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
