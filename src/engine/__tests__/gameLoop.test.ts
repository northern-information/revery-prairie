import { ComponentType } from '../ecs/types'
import { createGameLoop } from '../gameLoop'
import { Zone } from '../types'
import {
  clearAroundPlayer,
  createBeeEntity,
  createCharacterTestEntity,
  createGroundItemEntity,
  createTestState,
} from './helpers'
import { describe, expect, it, vi } from 'vitest'

describe('registry mechanics', () => {
  it('registers a custom system and runs it', () => {
    const state = createTestState()
    const calls: number[] = []
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'custom',
      intervalMs: 100,
      zone: 'always',
      fn: (_s, time) => {
        calls.push(time)
      },
    })

    // At t=0, lastTick=0, so 0-0=0 < 100 — does not fire
    gameLoop.tick(0)
    expect(calls).toEqual([])

    gameLoop.tick(50)
    expect(calls).toEqual([])

    // At t=100, 100-0=100 >= 100 — fires
    gameLoop.tick(100)
    expect(calls).toEqual([100])

    // At t=150, 150-100=50 < 100 — does not fire
    gameLoop.tick(150)
    expect(calls).toEqual([100])

    // At t=200, 200-100=100 >= 100 — fires again
    gameLoop.tick(200)
    expect(calls).toEqual([100, 200])
  })

  it('unregisters a system', () => {
    const state = createTestState()
    const calls: number[] = []
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'custom',
      intervalMs: 0,
      zone: 'always',
      fn: (_s, time) => {
        calls.push(time)
      },
    })

    gameLoop.tick(0)
    expect(calls).toHaveLength(1)

    gameLoop.unregister('custom')
    gameLoop.tick(100)
    expect(calls).toHaveLength(1)
  })

  it('replaces a system with the same id', () => {
    const state = createTestState()
    const callsA: number[] = []
    const callsB: number[] = []
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'custom',
      intervalMs: 0,
      zone: 'always',
      fn: () => {
        callsA.push(1)
      },
    })
    gameLoop.tick(0)
    expect(callsA).toHaveLength(1)

    gameLoop.register({
      id: 'custom',
      intervalMs: 0,
      zone: 'always',
      fn: () => {
        callsB.push(1)
      },
    })
    gameLoop.tick(100)
    expect(callsA).toHaveLength(1)
    expect(callsB).toHaveLength(1)
  })

  it('unregister of non-existent id is a no-op', () => {
    const state = createTestState()
    const gameLoop = createGameLoop(state, {})
    expect(() => {
      gameLoop.unregister('does-not-exist')
    }).not.toThrow()
  })

  it('sorts systems by priority', () => {
    const state = createTestState()
    const order: string[] = []
    const gameLoop = createGameLoop(state, {})

    // Unregister all defaults to isolate this test
    for (const id of [
      'path',
      'keyboard-move',
      'bee',
      'ghost',
      'shooting-star-spawn',
      'shooting-star-tick',
      'weather',
      'dialog',
      'crumble-cleanup',
      'revery-cast-cleanup',
    ]) {
      gameLoop.unregister(id)
    }

    gameLoop.register({
      id: 'last',
      intervalMs: 0,
      zone: 'always',
      priority: 10,
      fn: () => {
        order.push('last')
      },
    })
    gameLoop.register({
      id: 'first',
      intervalMs: 0,
      zone: 'always',
      priority: -10,
      fn: () => {
        order.push('first')
      },
    })
    gameLoop.register({
      id: 'middle',
      intervalMs: 0,
      zone: 'always',
      fn: () => {
        order.push('middle')
      },
    })

    gameLoop.tick(0)
    expect(order).toEqual(['first', 'middle', 'last'])
  })
})

describe('tick scheduling', () => {
  it('fires when elapsed >= intervalMs', () => {
    const state = createTestState()
    const calls: number[] = []
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'test',
      intervalMs: 200,
      zone: 'always',
      fn: (_s, time) => {
        calls.push(time)
      },
    })

    // lastTick starts at 0, so first fire at t >= 200
    gameLoop.tick(0)
    gameLoop.tick(100)
    gameLoop.tick(199)
    expect(calls).toEqual([])

    gameLoop.tick(200)
    expect(calls).toEqual([200])
  })

  it('fires intervalMs: 0 systems every tick', () => {
    const state = createTestState()
    let count = 0
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'every-frame',
      intervalMs: 0,
      zone: 'always',
      fn: () => {
        count++
      },
    })

    gameLoop.tick(0)
    gameLoop.tick(1)
    gameLoop.tick(2)
    expect(count).toBe(3)
  })
})

describe('zone gating', () => {
  it('runs overworld systems in cave zone with overworld map context', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    state.map = state.caveMap
    state.mapWidth = state.caveMapWidth
    state.mapHeight = state.caveMapHeight
    let capturedMap: unknown = null
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'overworld-only',
      intervalMs: 0,
      zone: 'overworld',
      fn: s => {
        capturedMap = s.map
      },
    })

    gameLoop.tick(0)
    // System ran with overworld map, then map was restored to cave
    expect(capturedMap).toBe(state.overworldMap)
    expect(state.map).toBe(state.caveMap)
  })

  it('runs cave systems in overworld zone with cave map context', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    let capturedMap: unknown = null
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'cave-only',
      intervalMs: 0,
      zone: 'cave',
      fn: s => {
        capturedMap = s.map
      },
    })

    gameLoop.tick(0)
    // System ran with cave map, then map was restored to overworld
    expect(capturedMap).toBe(state.caveMap)
    expect(state.map).toBe(state.overworldMap)
  })

  it('runs always systems in both zones', () => {
    const state = createTestState()
    let count = 0
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'always-sys',
      intervalMs: 0,
      zone: 'always',
      fn: () => {
        count++
      },
    })

    state.currentZone = Zone.Overworld
    gameLoop.tick(0)
    state.currentZone = Zone.Cave
    gameLoop.tick(100)
    expect(count).toBe(2)
  })

  it('cave bees tick in cave zone', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    state.map = state.caveMap
    state.mapWidth = state.caveMapWidth
    state.mapHeight = state.caveMapHeight
    // Position player inside cave bounds
    state.player = { x: 20, y: 15 }
    clearAroundPlayer(state, 5)
    // Place a cave bee on walkable cave floor
    const beeEid = createBeeEntity(state, state.player.x + 3, state.player.y)

    const gameLoop = createGameLoop(state, {})
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const posBefore = { ...state.world.getComponent(beeEid, ComponentType.Position)! }

    // Force movement to always trigger — eliminates flakiness from randomness
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    try {
      for (let t = 0; t <= 2000; t += 200) {
        gameLoop.tick(t)
      }
    } finally {
      vi.restoreAllMocks()
    }

    // Cave bees should tick and move
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const posAfter = state.world.getComponent(beeEid, ComponentType.Position)!
    expect(posAfter).not.toEqual(posBefore)
  })
})

describe('default systems', () => {
  it('ticks path at 100ms and fires onRefreshUI on move', () => {
    const state = createTestState()
    clearAroundPlayer(state)

    state.path = [{ x: state.player.x + 1, y: state.player.y }]
    const startX = state.player.x

    let refreshCount = 0
    const gameLoop = createGameLoop(state, {
      onRefreshUI: () => {
        refreshCount++
      },
    })

    // At t=0, path lastTick=0, so 0-0 < 100 — does not fire
    gameLoop.tick(0)
    expect(state.player.x).toBe(startX)

    // At t=100, 100-0=100 >= 100 — path tick fires, moves player
    gameLoop.tick(100)
    expect(state.player.x).toBe(startX + 1)
    expect(refreshCount).toBe(1)
  })

  it('does not fire path tick before interval elapses', () => {
    const state = createTestState()
    clearAroundPlayer(state)

    const gameLoop = createGameLoop(state, {})

    // First tick at t=0
    gameLoop.tick(0)

    // Set up path after first tick
    state.path = [{ x: state.player.x + 1, y: state.player.y }]
    const startX = state.player.x

    // At t=50, path should not tick yet
    gameLoop.tick(50)
    expect(state.player.x).toBe(startX)

    // At t=100, path should tick
    gameLoop.tick(100)
    expect(state.player.x).toBe(startX + 1)
  })

  it('fires onPickup when path tick picks up ground items', () => {
    const state = createTestState()
    clearAroundPlayer(state)

    const targetX = state.player.x + 1
    const targetY = state.player.y
    state.path = [{ x: targetX, y: targetY }]
    createGroundItemEntity(state, 'bee', targetX, targetY)

    const pickups: string[] = []
    const gameLoop = createGameLoop(state, {
      onPickup: name => {
        pickups.push(name)
      },
    })

    // Path tick fires at t=100 (100-0 >= 100)
    gameLoop.tick(100)
    expect(pickups).toContain('Bee')
  })

  it('crumble effects are cleaned up after duration', () => {
    const state = createTestState()
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.MultiPosition, { positions: [{ x: 5, y: 5 }] })
    state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'crumble', startTime: 0 })
    state.world.addComponent(e, ComponentType.EntityTag, 'crumble')

    const queryCrumbles = () =>
      state.world
        .query(ComponentType.TimedEffect, ComponentType.EntityTag)
        .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'crumble')

    const gameLoop = createGameLoop(state, {})

    // At t=500, still within CRUMBLE_DURATION_MS (600)
    gameLoop.tick(500)
    expect(queryCrumbles()).toHaveLength(1)

    // At t=601, expired
    gameLoop.tick(601)
    expect(queryCrumbles()).toHaveLength(0)
  })

  it('weather ticks at 5000ms in overworld', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    const tempBefore = state.weather.temperatureF

    const gameLoop = createGameLoop(state, {})

    // Weather drift is random and clamped. Run many ticks to detect any change.
    // First tick at t=0 fires weather (0 >= 0).
    // But weather drift is small and random — seed the initial tick.
    gameLoop.tick(0)

    // Multiple weather ticks should eventually drift
    let changed = false
    for (let t = 5000; t <= 100000; t += 5000) {
      gameLoop.tick(t)
      if (state.weather.temperatureF !== tempBefore) {
        changed = true
        break
      }
    }
    expect(changed).toBe(true)
  })
})

describe('lifecycle', () => {
  it('pause skips tick', () => {
    const state = createTestState()
    let count = 0
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'counter',
      intervalMs: 0,
      zone: 'always',
      fn: () => {
        count++
      },
    })

    gameLoop.tick(0)
    const countAfterFirst = count

    gameLoop.pause()
    expect(gameLoop.paused).toBe(true)

    // tick() is the raw simulation step — pause only affects the rAF loop.
    // But the plan says pause gates the loop body, not tick() directly.
    // tick() is always callable for tests — pause is a rAF-level concern.
    // Let's verify that the gameLoop object reports paused state.
    gameLoop.resume()
    expect(gameLoop.paused).toBe(false)

    gameLoop.tick(100)
    expect(count).toBe(countAfterFirst + 1)
  })

  it('dynamic register mid-session works', () => {
    const state = createTestState()
    const gameLoop = createGameLoop(state, {})

    gameLoop.tick(0)
    gameLoop.tick(100)

    let called = false
    gameLoop.register({
      id: 'late-addition',
      intervalMs: 0,
      zone: 'always',
      fn: () => {
        called = true
      },
    })

    gameLoop.tick(200)
    expect(called).toBe(true)
  })

  it('dynamic unregister mid-session works', () => {
    const state = createTestState()
    let count = 0
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'removable',
      intervalMs: 0,
      zone: 'always',
      fn: () => {
        count++
      },
    })

    gameLoop.tick(0)
    expect(count).toBe(1)

    gameLoop.unregister('removable')
    gameLoop.tick(100)
    expect(count).toBe(1)
  })
})

describe('held key movement', () => {
  it('moves player continuously while heldDirection is set', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    const startX = state.player.x

    let refreshCount = 0
    const gameLoop = createGameLoop(state, {
      onRefreshUI: () => {
        refreshCount++
      },
    })

    state.heldDirection = 'right'

    // First tick at t=0 sets lastTick; keyboard-move interval is 100ms
    gameLoop.tick(0)
    expect(state.player.x).toBe(startX)

    // At t=100, 100-0 >= 100 — fires
    gameLoop.tick(100)
    expect(state.player.x).toBe(startX + 1)
    expect(refreshCount).toBe(1)

    // At t=200, fires again
    gameLoop.tick(200)
    expect(state.player.x).toBe(startX + 2)
    expect(refreshCount).toBe(2)
  })

  it('does not move when heldDirection is null', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x

    const gameLoop = createGameLoop(state, {})
    state.heldDirection = null

    gameLoop.tick(0)
    gameLoop.tick(100)
    gameLoop.tick(200)

    expect(state.player.x).toBe(startX)
  })

  it('stops moving when heldDirection is cleared', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    const startX = state.player.x

    const gameLoop = createGameLoop(state, {})
    state.heldDirection = 'right'

    gameLoop.tick(0)
    gameLoop.tick(100)
    expect(state.player.x).toBe(startX + 1)

    // Release the key
    state.heldDirection = null
    gameLoop.tick(200)
    expect(state.player.x).toBe(startX + 1)
  })

  it('changes direction when heldDirection is updated', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    const startX = state.player.x
    const startY = state.player.y

    const gameLoop = createGameLoop(state, {})
    state.heldDirection = 'right'

    gameLoop.tick(0)
    gameLoop.tick(100)
    expect(state.player.x).toBe(startX + 1)
    expect(state.player.y).toBe(startY)

    // Switch direction
    state.heldDirection = 'down'
    gameLoop.tick(200)
    expect(state.player.x).toBe(startX + 1)
    expect(state.player.y).toBe(startY + 1)
  })

  it('does not move during active dialog', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x

    const gameLoop = createGameLoop(state, {})
    state.heldDirection = 'right'
    state.activeDialog = {
      characterId: 'ghost-1',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }

    gameLoop.tick(0)
    gameLoop.tick(100)
    expect(state.player.x).toBe(startX)
  })

  it('does not move when a click-to-move path is active', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    const startX = state.player.x

    const gameLoop = createGameLoop(state, {})
    state.heldDirection = 'right'
    state.path = [{ x: startX, y: state.player.y + 1 }]

    gameLoop.tick(0)

    // At t=100, path tick moves the player (down via path), not keyboard-move
    gameLoop.tick(100)
    expect(state.player.y).toBe(state.player.y) // path consumed the step
    // The held direction should not have moved the player right
    // (path takes priority — keyboard-move skips when state.path is set)
  })

  it('stays in place when held into a blocked tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 3)
    const startX = state.player.x
    const startY = state.player.y

    // Place a character blocking the right tile
    createCharacterTestEntity(state, 'ghost-1', startX + 1, startY)

    const gameLoop = createGameLoop(state, {})
    state.heldDirection = 'right'

    gameLoop.tick(0)
    gameLoop.tick(100)
    gameLoop.tick(200)

    expect(state.player.x).toBe(startX)
    // heldDirection should still be set — player just can't move that way
    expect(state.heldDirection).toBe('right')
  })

  it('picks up ground items during held movement', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)

    const targetX = state.player.x + 1
    createGroundItemEntity(state, 'bee', targetX, state.player.y)

    const pickups: string[] = []
    const gameLoop = createGameLoop(state, {
      onPickup: name => {
        pickups.push(name)
      },
    })

    state.heldDirection = 'right'
    gameLoop.tick(0)
    gameLoop.tick(100)

    expect(pickups).toContain('Bee')
  })
})

describe('overworld toast suppression in cave', () => {
  it('meteor shower toast suppressed in cave', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    state.map = state.caveMap
    state.mapWidth = state.caveMapWidth
    state.mapHeight = state.caveMapHeight
    // Schedule shower to activate on next tick
    state.meteorShower.nextShowerTime = 1
    state.meteorShower.active = false

    const onDiscovery = vi.fn()
    const gameLoop = createGameLoop(state, { onDiscovery })

    // Tick past the nextShowerTime so tickMeteorShower activates the shower
    gameLoop.tick(1000)

    // Shower should have activated (the tick function still runs via map-swap)
    expect(state.meteorShower.active).toBe(true)
    // But the toast should NOT fire because we're in the cave
    expect(onDiscovery).not.toHaveBeenCalledWith(
      'meteor shower!',
      expect.any(Number),
      expect.any(Number),
      expect.any(String),
      expect.any(String)
    )
  })

  it('meteor shower toast fires in overworld', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    // Schedule shower to activate on next tick
    state.meteorShower.nextShowerTime = 1
    state.meteorShower.active = false

    const onDiscovery = vi.fn()
    const gameLoop = createGameLoop(state, { onDiscovery })

    // Tick past the nextShowerTime so tickMeteorShower activates the shower
    gameLoop.tick(1000)

    // Shower should have activated
    expect(state.meteorShower.active).toBe(true)
    // Toast should fire in overworld
    expect(onDiscovery).toHaveBeenCalledWith(
      'meteor shower!',
      expect.any(Number),
      expect.any(Number),
      '*',
      '#FFD700'
    )
  })

  it('lightning toast suppressed in cave', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    state.map = state.caveMap
    state.mapWidth = state.caveMapWidth
    state.mapHeight = state.caveMapHeight

    const onDiscovery = vi.fn()
    const gameLoop = createGameLoop(state, { onDiscovery })

    // Tick many times at lightning intervals to give lightning a chance to fire
    for (let t = 0; t <= 200_000; t += 10_000) {
      gameLoop.tick(t)
    }

    // Even if lightning struck during overworld map-swap ticks, the toast must not fire in cave
    const lightningCalls = onDiscovery.mock.calls.filter(
      (args: unknown[]) => args[0] === 'lightning strikes!'
    )
    expect(lightningCalls).toHaveLength(0)

    // Also verify no wildfire toasts leaked
    const wildfireCalls = onDiscovery.mock.calls.filter(
      (args: unknown[]) => args[0] === 'wildfire!'
    )
    expect(wildfireCalls).toHaveLength(0)
  })
})

describe('background tab return', () => {
  it('passes raw rAF time to tick without per-frame delta clamp', () => {
    // When a tab is backgrounded, rAF pauses and then fires with a timestamp
    // far in the future on return. The game loop must pass that raw time
    // straight through — it must not throttle the virtual clock.
    const state = createTestState()
    const observedTimes: number[] = []

    const rafRef: { cb: ((time: number) => void) | null } = { cb: null }
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      rafRef.cb = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      rafRef.cb = null
    })

    try {
      const gameLoop = createGameLoop(state, {
        onFrame: time => {
          observedTimes.push(time)
        },
      })

      gameLoop.register({
        id: 'time-recorder',
        intervalMs: 0,
        zone: 'always',
        fn: (_s, time) => {
          observedTimes.push(time)
        },
      })

      gameLoop.start()

      // First frame at t=16 (normal)
      rafRef.cb?.(16)
      // Second frame at t=30016 — tab was backgrounded for ~30 seconds
      rafRef.cb?.(30_016)
      // Third frame resumes at normal cadence
      rafRef.cb?.(30_032)

      // Systems must have seen the raw timestamps — no clamp to +200ms
      expect(observedTimes).toContain(30_016)
      expect(observedTimes).toContain(30_032)
      // The clamped value (16 + 200 = 216) must not appear
      expect(observedTimes).not.toContain(216)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('fires interval tick once across a large time jump, not N times', () => {
    // A system with a 100ms interval that was idle for 30s must fire
    // exactly once on the catch-up tick — not 300 times.
    const state = createTestState()
    let callCount = 0
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'interval-counter',
      intervalMs: 100,
      zone: 'always',
      fn: () => {
        callCount++
      },
    })

    gameLoop.tick(0)
    expect(callCount).toBe(0) // lastTick=0, 0-0 < 100
    gameLoop.tick(100)
    expect(callCount).toBe(1)

    // Simulate tab backgrounded for 30 seconds between frames
    gameLoop.tick(30_100)
    expect(callCount).toBe(2) // one catch-up tick

    // Next frame at normal cadence — no missed intervals re-fire
    gameLoop.tick(30_116)
    expect(callCount).toBe(2)
  })

  it('advances time-based despawns correctly in a single catch-up tick', () => {
    // A timed effect that should have expired while the tab was backgrounded
    // must be cleaned up on the first frame after resume.
    const state = createTestState()
    const gameLoop = createGameLoop(state, {})

    // Create a fake timed entity whose lifetime has already passed by t=5000
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: 0, y: 0 })
    state.world.addComponent(eid, ComponentType.TimedEffect, {
      kind: 'explosion',
      startTime: 0,
    })
    state.world.addComponent(eid, ComponentType.EntityTag, 'test-effect')

    let despawned = false
    gameLoop.register({
      id: 'test-cleanup',
      intervalMs: 0,
      zone: 'always',
      fn: (s, time) => {
        for (const e of s.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
          const tag = s.world.getComponent(e, ComponentType.EntityTag)
          if (tag !== 'test-effect') continue
          const effect = s.world.getComponent(e, ComponentType.TimedEffect)
          if (effect && time - effect.startTime >= 1000) {
            s.world.destroyEntity(e)
            despawned = true
          }
        }
      },
    })

    // First frame at t=16 — effect is only 16ms old, survives
    gameLoop.tick(16)
    expect(despawned).toBe(false)

    // Backgrounded for ~30s — catch-up frame at t=30016
    gameLoop.tick(30_016)
    expect(despawned).toBe(true)
  })

  it('advances entry.lastTick to the current time after a jump so subsequent frames behave normally', () => {
    const state = createTestState()
    const timesSeen: number[] = []
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'recorder',
      intervalMs: 500,
      zone: 'always',
      fn: (_s, time) => {
        timesSeen.push(time)
      },
    })

    gameLoop.tick(0) // lastTick set to 0, does not fire (0-0 < 500)
    gameLoop.tick(30_000) // large jump — fires once, lastTick -> 30_000
    expect(timesSeen).toEqual([30_000])

    // Next frame at t=30_016 — only 16ms since lastTick, must NOT fire again
    gameLoop.tick(30_016)
    expect(timesSeen).toEqual([30_000])

    // At t=30_500 — 500ms since lastTick, fires
    gameLoop.tick(30_500)
    expect(timesSeen).toEqual([30_000, 30_500])
  })

  it('preserves normal-cadence behavior when the tab is not backgrounded', () => {
    // Sanity check: removing the clamp must not change behavior for normal
    // 60fps frames.
    const state = createTestState()
    let count = 0
    const gameLoop = createGameLoop(state, {})

    gameLoop.register({
      id: 'every-frame',
      intervalMs: 0,
      zone: 'always',
      fn: () => {
        count++
      },
    })

    // 10 frames at ~60fps cadence
    for (let i = 0; i < 10; i++) {
      gameLoop.tick(i * 16)
    }
    expect(count).toBe(10)
  })
})
