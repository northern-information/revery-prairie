import { spawnShootingStar, tickMeteorShower, tickShootingStars } from './celestial'
import { tickCloverGrowth, tickCloverHives } from './clover'
import {
  BEE_TICK_MS,
  CLOVER_GROWTH_TICK_MS,
  CLOVER_HIVE_TICK_MS,
  CRUMBLE_DURATION_MS,
  GHOST_TICK_MS,
  METEOR_SHOWER_TICK_MS,
  KEYBOARD_MOVE_TICK_MS,
  PATH_TICK_MS,
  SHOOTING_STAR_SPAWN_TICK_MS,
  SHOOTING_STAR_TICK_MS,
  WEATHER_TICK_MS,
} from './constants'
import { ComponentType } from './ecs/types'
import { pickUpGroundItems, tickBees, tickCharacterBehaviors } from './entities'
import { tickDialogTransition, tickDialogTyping } from './interaction'
import { getDefinition } from './items'
import { movePlayer, tickPath } from './movement'
import { Zone } from './types'
import { tickWeather } from './weather'

import type { GameState } from './types'

export interface TickSystem {
  id: string
  intervalMs: number
  zone: 'overworld' | 'cave' | 'always'
  priority?: number
  fn: (state: GameState, time: number) => void
}

export interface GameLoopCallbacks {
  onRefreshUI?: () => void
  onPickup?: (
    name: string,
    icon: string,
    iconColor: string,
    worldX: number,
    worldY: number,
  ) => void
  onDiscovery?: (text: string, worldX: number, worldY: number, icon?: string, iconColor?: string) => void
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
  let lastDialogTypingTick = 0

  return [
    {
      id: 'path',
      intervalMs: PATH_TICK_MS,
      zone: 'always',
      priority: -10,
      fn: (state, time) => {
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
                meteoriteDef.glyphColor,
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
                meteoriteDef.glyphColor,
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
        tickBees(state, Zone.Overworld)
      },
    },
    {
      id: 'bee-cave',
      intervalMs: BEE_TICK_MS,
      zone: 'cave',
      fn: state => {
        tickBees(state, Zone.Cave)
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
        if (!wasActive && state.meteorShower.active) {
          callbacks.onDiscovery?.('meteor shower!', state.player.x, state.player.y, '*', '#FFD700')
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
      id: 'dialog',
      intervalMs: 0,
      zone: 'always',
      fn: (state, time) => {
        if (!state.activeDialog) return
        const prevTypingIndex = state.activeDialog.typingIndex
        const prevTransitioning = state.activeDialog.transitioning
        lastDialogTypingTick = tickDialogTyping(state, lastDialogTypingTick, time)
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
    for (const entry of entries) {
      if (entry.system.intervalMs === 0 || time - entry.lastTick >= entry.system.intervalMs) {
        // For zone-specific systems, temporarily swap state.map to that
        // zone's map so tick functions read the correct terrain.
        // 'always' systems use the current zone's map as-is.
        const needsSwap =
          entry.system.zone !== 'always' &&
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

  const loop = (time: number): void => {
    if (!paused) {
      tick(time)
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
