import { spawnAngel, tickAngelBeeAura, tickAngelCloverAura, tickAngelDrift, tickAngelLifespan } from './angels'
import { spawnShootingStar, tickMeteorShower, tickShootingStars } from './celestial'
import { tickCoyote } from './coyote'
import { tickCloverGrowth, tickCloverHives } from './clover'
import { tickCloverLifecycle } from './cloverLifecycle'
import {
  ANGEL_BEE_SPAWN_INTERVAL_MS,
  ANGEL_CLOVER_GROW_INTERVAL_MS,
  ANGEL_DRIFT_TICK_MS,
  ANGEL_SPAWN_INTERVAL_MS,
  BEE_TICK_MS,
  CLOVER_GROWTH_TICK_MS,
  CLOVER_HIVE_TICK_MS,
  CLOVER_LIFECYCLE_TICK_MS,
  CRUMBLE_DURATION_MS,
  COYOTE_TICK_MS,
  GHOST_TICK_MS,
  GLINT_ZONE_TICK_MS,
  KEYBOARD_MOVE_TICK_MS,
  LIGHTNING_TICK_MS,
  METEOR_SHOWER_TICK_MS,
  PATH_TICK_MS,
  SHOOTING_STAR_SPAWN_TICK_MS,
  SHOOTING_STAR_TICK_MS,
  WEATHER_TICK_MS,
} from './constants'
import { tickDeepTime } from './deepTime'
import { ComponentType } from './ecs/types'
import { pickUpGroundItems, tickBees, tickCharacterBehaviors } from './entities'
import { completeGenesis, GENESIS_EPOCHS, tickGenesis } from './genesis'
import { tickGlintZones } from './glintZones'
import { tickDialogTransition, tickDialogTyping } from './interaction'
import { getDefinition } from './items'
import { spawnLightningStrike, tickLightning } from './lightning'
import { movePlayer, tickPath } from './movement'
import { getReveryDefinition } from './reveries'
import { tickTileWater } from './tileWater'
import { tickDormantGardenDecay, tickResonanceDeactivation, tickSubsidenceCollapse } from './ruins'
import { DeepTimePhase, Zone } from './types'
import { tickRainIntensity, tickWeather } from './weather'

import type { GameState } from './types'

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
  onPickup?: (name: string, icon: string, iconColor: string, worldX: number, worldY: number) => void
  onDiscovery?: (text: string, worldX: number, worldY: number, icon?: string, iconColor?: string) => void
  onBeeDeath?: (worldX: number, worldY: number) => void
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
            // Throttled refresh — keeps year counter and progress bar ticking
            lastRefresh = time
            callbacks.onRefreshUI?.()
          }
        }
      })(),
    },
    {
      id: 'genesisTransitionCleanup',
      intervalMs: 100,
      zone: 'always' as const,
      phase: 'gameplay' as const,
      priority: -20,
      fn: (state: GameState, time: number) => {
        if (!state.genesisTransition) return
        const elapsed = time - state.genesisTransition.startTime
        // Safety clamp: clear after 2x duration
        if (elapsed >= state.genesisTransition.duration * 2 || elapsed >= state.genesisTransition.duration) {
          state.genesisTransition = null
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
      id: 'path',
      intervalMs: PATH_TICK_MS,
      zone: 'always',
      priority: -10,
      fn: (state, time) => {
        if (state.deepTime?.active && state.deepTime.phase !== DeepTimePhase.Wandering) return
        const moves = state.sprinting ? 2 : 1
        let moved = false
        for (let i = 0; i < moves; i++) {
          if (!state.path) break
          if (tickPath(state)) {
            moved = true
            const result = pickUpGroundItems(state, time)
            for (const defId of result.pickedUp) {
              const def = getDefinition(defId)
              callbacks.onPickup?.(def.name, def.glyph, def.glyphColor, state.player.x, state.player.y)
            }
            if (result.chainExplosions > 0) {
              const meteoriteDef = getDefinition('meteorite')
              callbacks.onDiscovery?.(
                'oh my!',
                state.player.x,
                state.player.y,
                meteoriteDef.glyph,
                meteoriteDef.glyphColor
              )
            }
          }
        }
        if (moved) {
          callbacks.onRefreshUI?.()
        }
      },
    },
    {
      id: 'keyboard-move',
      intervalMs: KEYBOARD_MOVE_TICK_MS,
      zone: 'always',
      priority: -5,
      fn: (state, time) => {
        if (state.deepTime?.active && state.deepTime.phase !== DeepTimePhase.Wandering) return
        if (!state.heldDirection) return
        if (state.activeDialog) return
        if (state.path) return
        const moves = state.sprinting ? 2 : 1
        let moved = false
        for (let i = 0; i < moves; i++) {
          if (!state.heldDirection) break
          if (movePlayer(state, state.heldDirection)) {
            moved = true
            const result = pickUpGroundItems(state, time)
            for (const defId of result.pickedUp) {
              const def = getDefinition(defId)
              callbacks.onPickup?.(def.name, def.glyph, def.glyphColor, state.player.x, state.player.y)
            }
            if (result.chainExplosions > 0) {
              const meteoriteDef = getDefinition('meteorite')
              callbacks.onDiscovery?.(
                'oh my!',
                state.player.x,
                state.player.y,
                meteoriteDef.glyph,
                meteoriteDef.glyphColor
              )
            }
          }
        }
        if (moved) {
          callbacks.onRefreshUI?.()
        }
      },
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
        if (result.pickedUp) {
          const def = getDefinition(result.pickedUp.definitionId)
          callbacks.onDiscovery?.(
            `coyote found ${def.name.toLowerCase()}`,
            result.pickedUp.x,
            result.pickedUp.y,
            def.glyph,
            def.glyphColor,
          )
        }
        if (result.delivered) {
          const def = getDefinition(result.delivered.definitionId)
          const dest = result.delivered.toGron ? 'near gron' : 'to backpack'
          callbacks.onDiscovery?.(
            `coyote delivered ${def.name.toLowerCase()} ${dest}`,
            result.delivered.x,
            result.delivered.y,
            def.glyph,
            def.glyphColor,
          )
          callbacks.onRefreshUI?.()
        }
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
        const wasActive = state.meteorShower.active
        tickMeteorShower(state, time)
        if (!wasActive && state.meteorShower.active && state.currentZone === Zone.Overworld) {
          callbacks.onDiscovery?.('meteor shower!', state.player.x, state.player.y, '*', '#FFD700')
        }
      },
    },
    {
      id: 'lightning-spawn',
      intervalMs: LIGHTNING_TICK_MS,
      zone: 'overworld',
      priority: 60,
      fn: (state, time) => {
        const struck = spawnLightningStrike(state, time)
        if (struck) {
          if (state.currentZone === Zone.Overworld) {
            callbacks.onDiscovery?.('lightning strikes!', struck.x, struck.y, '|', '#FFFFFF')
            // Check if wildfire spread happened (wildfire entity just created)
            for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
              const tag = state.world.getComponent(eid, ComponentType.EntityTag)
              const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
              if (tag === 'wildfire' && effect?.startTime === time) {
                callbacks.onDiscovery?.('wildfire!', struck.x, struck.y, '^', '#FF4500')
                break
              }
            }
          }
        }
      },
    },
    {
      id: 'weather',
      intervalMs: WEATHER_TICK_MS,
      zone: 'overworld',
      fn: state => {
        tickWeather(state.weather)
      },
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
          tickRainIntensity(state, dt)
        }
      })(),
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
        tickCloverLifecycle(state, Zone.Overworld, time)
      },
    },
    {
      id: 'clover-lifecycle-cave',
      intervalMs: CLOVER_LIFECYCLE_TICK_MS,
      zone: 'cave',
      priority: 52,
      fn: (state, time) => {
        tickCloverLifecycle(state, Zone.Cave, time)
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
      id: 'revery-cast-cleanup',
      intervalMs: 0,
      zone: 'always',
      priority: 100,
      fn: (state, time) => {
        for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
          const tag = state.world.getComponent(eid, ComponentType.EntityTag)
          if (tag !== 'reveryCast') continue
          const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
          if (!effect?.reveryId) continue
          const def = getReveryDefinition(effect.reveryId)
          if (time - effect.startTime > def.castDurationMs) {
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
          callbacks.onDiscovery?.('be not afraid', state.player.x, state.player.y, 'O', '#FFFFFF')
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
      id: 'ruin-subsidence',
      intervalMs: 500,
      zone: 'ruin',
      fn: (state: GameState, _time: number) => {
        const result = tickSubsidenceCollapse(state, 500)
        if (result === 'ejected') {
          callbacks.onDiscovery?.('the ruins crumbled', state.player.x, state.player.y, '!', '#FF6B6B')
          callbacks.onRefreshUI?.()
        }
      },
    },
    {
      id: 'ruin-dormant-garden',
      intervalMs: 1000,
      zone: 'ruin',
      fn: (state: GameState, _time: number) => {
        tickDormantGardenDecay(state, 1000)
      },
    },
    {
      id: 'ruin-resonance',
      intervalMs: 200,
      zone: 'ruin',
      fn: (state: GameState, time: number) => {
        tickResonanceDeactivation(state, time)
      },
    },
  ]
}

const sortEntries = (entries: TickEntry[]): void => {
  entries.sort((a, b) => (a.system.priority ?? 0) - (b.system.priority ?? 0))
}

// Maximum time delta per frame (ms). Prevents huge jumps when a
// backgrounded tab resumes and rAF delivers a stale timestamp.
const MAX_FRAME_DELTA_MS = 200

export const createGameLoop = (state: GameState, callbacks: GameLoopCallbacks): GameLoop => {
  const entries: TickEntry[] = []
  let rafId = 0
  let running = false
  let paused = false
  let lastLoopTime = 0

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
  }

  const loop = (rawTime: number): void => {
    // Clamp large time jumps (e.g. tab was backgrounded) so systems
    // never see a delta larger than MAX_FRAME_DELTA_MS.
    let time = rawTime
    if (lastLoopTime > 0) {
      const delta = rawTime - lastLoopTime
      if (delta > MAX_FRAME_DELTA_MS) {
        // Advance by at most MAX_FRAME_DELTA_MS from the last frame
        time = lastLoopTime + MAX_FRAME_DELTA_MS
      }
    }
    lastLoopTime = time

    if (!paused) {
      try {
        tick(time)
      } catch (err) {
        console.error('[gameLoop] tick error:', err)
      }
    }
    callbacks.onFrame?.(time)
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
