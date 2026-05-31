import { findShowerTargets, spawnShootingStar, tickMeteorShower } from '../celestial'
import {
  METEOR_SHOWER_ANCHORS,
  METEOR_SHOWER_JITTER_PHASE,
  METEOR_SHOWER_SPAWN_WINDOW_MS,
  METEOR_SHOWER_STAR_COUNT_MAX,
  METEOR_SHOWER_STAR_COUNT_MIN,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { TileType } from '../types'
import { createTestState as createBaseTestState } from './helpers'
import { afterEach, vi } from 'vitest'

import type { GameState } from '../types'

// Wraps helpers.createTestState (which clones a cached genesis ~1.8ms
// instead of running a fresh ~180ms genesis) and resets the bits
// meteorShower tests depend on: no shooting-star entities, and
// seasonalPhase=0 so the spring anchor sits at the test starting point.
const createTestState = (): GameState => {
  const state = createBaseTestState()
  for (const eid of state.world.query(ComponentType.ShootingStarData)) {
    state.world.destroyEntity(eid)
  }
  state.seasonalPhase = 0
  state.meteorShower.pendingAnchorPhase = 0
  return state
}

const getStarCount = (state: GameState): number => state.world.query(ComponentType.ShootingStarData).length

// Drive a shower to completion in one helper. Useful when a test cares about
// the post-shower state (next anchor queued, year wrap) and not the
// star-by-star spawning behavior.
const drainShower = (state: GameState, time: number): void => {
  // Start the shower
  tickMeteorShower(state, time)
  // Force completion: zero the remaining stars and re-tick so the scheduler
  // queues the next anchor.
  state.meteorShower.remainingStars = 0
  state.meteorShower.lastSpawnTime = time
  tickMeteorShower(state, time + 1)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cardinal shower scheduling', () => {
  it('fires the spring anchor at exactly seasonalPhase 0.0', () => {
    const state = createTestState()
    // Fresh state: seasonalPhase=0, pendingAnchorPhase=0
    expect(state.seasonalPhase).toBe(0)
    expect(state.meteorShower.pendingAnchorPhase).toBe(0)

    tickMeteorShower(state, 1000)

    expect(state.meteorShower.active).toBe(true)
    expect(state.meteorShower.lastFiredAnchorIndex).toBe(0)
  })

  it('does not fire while seasonalPhase has not reached the pending anchor', () => {
    const state = createTestState()
    // Move past spring; queue summer anchor (with no jitter for determinism)
    state.seasonalPhase = 0.1
    state.meteorShower.lastFiredAnchorIndex = 0
    state.meteorShower.pendingAnchorPhase = METEOR_SHOWER_ANCHORS[1] // 0.25

    tickMeteorShower(state, 1000)

    expect(state.meteorShower.active).toBe(false)
  })

  it('fires the summer anchor only after seasonalPhase reaches it', () => {
    const state = createTestState()
    state.seasonalPhase = 0.24
    state.meteorShower.lastFiredAnchorIndex = 0
    state.meteorShower.pendingAnchorPhase = 0.25

    tickMeteorShower(state, 1000)
    expect(state.meteorShower.active).toBe(false)

    state.seasonalPhase = 0.25
    tickMeteorShower(state, 1100)

    expect(state.meteorShower.active).toBe(true)
    expect(state.meteorShower.lastFiredAnchorIndex).toBe(1)
  })

  it('queues the next cardinal anchor after the current shower completes', () => {
    const state = createTestState()
    // Spring fires
    tickMeteorShower(state, 1000)
    expect(state.meteorShower.lastFiredAnchorIndex).toBe(0)

    // Force completion
    state.meteorShower.remainingStars = 0
    state.meteorShower.lastSpawnTime = 1000
    tickMeteorShower(state, 2000)

    expect(state.meteorShower.active).toBe(false)
    // Summer should be queued, ±jitter around 0.25
    expect(state.meteorShower.pendingAnchorPhase).toBeGreaterThanOrEqual(
      METEOR_SHOWER_ANCHORS[1] - METEOR_SHOWER_JITTER_PHASE
    )
    expect(state.meteorShower.pendingAnchorPhase).toBeLessThanOrEqual(
      METEOR_SHOWER_ANCHORS[1] + METEOR_SHOWER_JITTER_PHASE
    )
  })

  it('non-spring anchors carry jitter within ±METEOR_SHOWER_JITTER_PHASE', () => {
    // Maximum jitter on the high side
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const state = createTestState()
    drainShower(state, 1000)

    // After spring completes the summer anchor was queued with random jitter.
    const queued = state.meteorShower.pendingAnchorPhase
    expect(queued).toBeGreaterThan(METEOR_SHOWER_ANCHORS[1])
    expect(queued).toBeLessThanOrEqual(METEOR_SHOWER_ANCHORS[1] + METEOR_SHOWER_JITTER_PHASE)
  })

  it('exactly four showers fire per year across all anchors', () => {
    const state = createTestState()
    // Force min star count so each shower deactivates after one tick of forced drain
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const fired: number[] = []
    // Drive each of the 4 anchors. After the previous anchor completes,
    // advance seasonalPhase past the next pending anchor and tick.
    let time = 1000
    for (let i = 0; i < 4; i++) {
      // Make sure the current phase has crossed the pending anchor.
      if (state.meteorShower.pendingAnchorPhase === 0.0 && i > 0) {
        state.seasonalPhase = 0.0 // year-wrap path
      } else {
        state.seasonalPhase = state.meteorShower.pendingAnchorPhase
      }
      tickMeteorShower(state, time)
      expect(state.meteorShower.active).toBe(true)
      fired.push(state.meteorShower.lastFiredAnchorIndex)
      // Drain
      state.meteorShower.remainingStars = 0
      state.meteorShower.lastSpawnTime = time
      tickMeteorShower(state, time + 1)
      time += 2
    }
    expect(fired).toEqual([0, 1, 2, 3])
  })

  it('year wraps to spring (index 0) after winter completes', () => {
    const state = createTestState()
    state.meteorShower.lastFiredAnchorIndex = 3 // last anchor was winter
    state.meteorShower.lastFiredAnchorYear = 0
    state.meteorShower.active = true
    state.meteorShower.remainingStars = 0
    state.meteorShower.lastSpawnTime = 1000

    tickMeteorShower(state, 2000)

    // Spring of the next year is queued, the year counter advanced.
    expect(state.meteorShower.pendingAnchorPhase).toBe(0.0)
    expect(state.meteorShower.lastFiredAnchorYear).toBe(1)
  })

  it('does not fire intermittently between anchors', () => {
    const state = createTestState()
    // After spring fires and completes, queue summer at 0.25 + 0
    state.meteorShower.lastFiredAnchorIndex = 0
    state.meteorShower.pendingAnchorPhase = 0.25

    // Tick at every 0.01 step from 0.05 to 0.24 — none of these phases
    // should trigger a shower.
    for (let phase = 0.05; phase < 0.25; phase += 0.01) {
      state.seasonalPhase = phase
      tickMeteorShower(state, 5000)
      expect(state.meteorShower.active).toBe(false)
    }
  })

  it('the same anchor does not re-fire within a year', () => {
    const state = createTestState()
    // Spring fires
    tickMeteorShower(state, 1000)
    expect(state.meteorShower.lastFiredAnchorIndex).toBe(0)
    // Drain
    state.meteorShower.remainingStars = 0
    state.meteorShower.lastSpawnTime = 1000
    tickMeteorShower(state, 2000)
    expect(state.meteorShower.active).toBe(false)

    // Hold seasonalPhase at 0.0 — pendingAnchorPhase is now summer, so
    // tickMeteorShower must not retrigger spring.
    state.seasonalPhase = 0.0
    tickMeteorShower(state, 3000)
    expect(state.meteorShower.active).toBe(false)
  })

  it('deep time suppresses scheduling entirely', () => {
    const state = createTestState()
    state.deepTime = { active: true, startTime: 0, totalElapsedYears: 0, shakeUntil: 0 } as never
    tickMeteorShower(state, 1000)
    expect(state.meteorShower.active).toBe(false)
  })

  it('skipped anchor during deep time does not re-fire when deep time ends', () => {
    const state = createTestState()
    // Spring fires + completes; summer queued at 0.25 (no jitter for determinism).
    drainShower(state, 1000)
    state.meteorShower.pendingAnchorPhase = 0.25

    // Deep time skips over summer.
    state.deepTime = { active: true, startTime: 0, totalElapsedYears: 0, shakeUntil: 0 } as never
    state.seasonalPhase = 0.6
    tickMeteorShower(state, 2000)
    expect(state.meteorShower.active).toBe(false)

    // Deep time ends past summer. Summer should not retro-fire.
    state.deepTime = null as never
    tickMeteorShower(state, 3000)
    // The crossing window for summer (0.25, 0.5) is now behind us; phase is
    // 0.6 which is in the autumn window (0.5, 0.75), but pendingAnchorPhase is
    // still summer's 0.25. The phaseCrossed lookahead is 0.25, so 0.6 is just
    // past the window — summer does not fire.
    expect(state.meteorShower.active).toBe(false)
  })
})

describe('active shower', () => {
  it('spawns one star per interval tick', () => {
    const state = createTestState()
    tickMeteorShower(state, 1000)
    const initialRemaining = state.meteorShower.remainingStars
    const interval = state.meteorShower.spawnIntervalMs

    tickMeteorShower(state, 1000 + interval)
    expect(state.meteorShower.remainingStars).toBe(initialRemaining - 1)
  })

  it('does not spawn before interval elapses', () => {
    const state = createTestState()
    tickMeteorShower(state, 1000)
    tickMeteorShower(state, 1001)
    const remaining = state.meteorShower.remainingStars
    tickMeteorShower(state, 1002)
    expect(state.meteorShower.remainingStars).toBe(remaining)
  })

  it('deactivates when remainingStars reaches 0', () => {
    const state = createTestState()
    tickMeteorShower(state, 1000)
    state.meteorShower.remainingStars = 1
    state.meteorShower.lastSpawnTime = 0
    tickMeteorShower(state, 2000)
    expect(state.meteorShower.remainingStars).toBe(0)
    expect(state.meteorShower.active).toBe(false)
  })

  it('every shower star descends from due north with velocity { dx: 1, dy: 1 }', () => {
    const state = createTestState()
    tickMeteorShower(state, 1000)
    const interval = state.meteorShower.spawnIntervalMs
    let time = 1000
    for (let i = 0; i < 3; i++) {
      time += interval
      tickMeteorShower(state, time)
    }

    const stars = state.world.query(ComponentType.ShootingStarData, ComponentType.Velocity)
    expect(stars.length).toBeGreaterThan(0)
    for (const eid of stars) {
      const vel = state.world.getComponent(eid, ComponentType.Velocity)
      expect(vel?.dx).toBe(1)
      expect(vel?.dy).toBe(1)
    }
  })

  it('shower stars are targeted (willLand: true, landingTarget set)', () => {
    const state = createTestState()
    tickMeteorShower(state, 1000)
    const interval = state.meteorShower.spawnIntervalMs
    tickMeteorShower(state, 1000 + interval)

    const stars = state.world.query(ComponentType.ShootingStarData)
    let hasTargeted = false
    for (const eid of stars) {
      const data = state.world.getComponent(eid, ComponentType.ShootingStarData)
      if (data?.willLand && data.landingTarget) {
        hasTargeted = true
        break
      }
    }
    expect(hasTargeted).toBe(true)
  })

  it('star count is between STAR_COUNT_MIN and STAR_COUNT_MAX', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const stateMin = createTestState()
    tickMeteorShower(stateMin, 1000)
    expect(stateMin.meteorShower.remainingStars).toBe(METEOR_SHOWER_STAR_COUNT_MIN)

    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const stateMax = createTestState()
    tickMeteorShower(stateMax, 1000)
    expect(stateMax.meteorShower.remainingStars).toBe(METEOR_SHOWER_STAR_COUNT_MAX)
  })

  it('computes spawnIntervalMs from window / count', () => {
    const state = createTestState()
    tickMeteorShower(state, 1000)
    const expected = METEOR_SHOWER_SPAWN_WINDOW_MS / state.meteorShower.remainingStars
    expect(state.meteorShower.spawnIntervalMs).toBeCloseTo(expected, 5)
  })
})

describe('target selection (findShowerTargets)', () => {
  it('returns positions on dirt/clover tiles', () => {
    const state = createTestState()
    const targets = findShowerTargets(state, 5)
    for (const t of targets) {
      const tile = state.map[t.y][t.x].type
      expect(tile === TileType.Dirt || tile === TileType.Flora).toBe(true)
    }
  })

  it('avoids space, sand, cave entrance', () => {
    const state = createTestState()
    const targets = findShowerTargets(state, 10)
    for (const t of targets) {
      const tile = state.map[t.y][t.x].type
      expect(tile).not.toBe(TileType.Space)
      expect(tile).not.toBe(TileType.Sand)
      expect(tile).not.toBe(TileType.CaveEntrance)
    }
  })

  it('avoids player position', () => {
    const state = createTestState()
    const targets = findShowerTargets(state, 20)
    for (const t of targets) {
      expect(t.x === state.player.x && t.y === state.player.y).toBe(false)
    }
  })

  it('respects minimum distance between targets', () => {
    const state = createTestState()
    const targets = findShowerTargets(state, 10)
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const dist = Math.abs(targets[i].x - targets[j].x) + Math.abs(targets[i].y - targets[j].y)
        expect(dist).toBeGreaterThanOrEqual(5)
      }
    }
  })

  it('returns fewer targets when valid tiles are scarce', () => {
    const state = createTestState()
    for (let y = 0; y < state.mapHeight; y++) {
      for (let x = 0; x < state.mapWidth; x++) {
        state.map[y][x] = { type: TileType.Space }
      }
    }
    state.map[state.player.y + 2][state.player.x + 2] = { type: TileType.Dirt }
    state.map[state.player.y + 10][state.player.x + 10] = { type: TileType.Dirt }
    const targets = findShowerTargets(state, 10)
    expect(targets.length).toBeLessThanOrEqual(2)
  })
})

describe('ambient suppression', () => {
  it('spawnShootingStar returns early when shower is active', () => {
    const state = createTestState()
    state.meteorShower.active = true
    const before = getStarCount(state)
    for (let i = 0; i < 100; i++) spawnShootingStar(state)
    expect(getStarCount(state)).toBe(before)
  })

  it('resumes after shower ends', () => {
    const state = createTestState()
    state.meteorShower.active = false
    let spawned = false
    for (let i = 0; i < 1000; i++) {
      const before = getStarCount(state)
      spawnShootingStar(state)
      if (getStarCount(state) > before) {
        spawned = true
        break
      }
    }
    expect(spawned).toBe(true)
  })
})

describe('discovery', () => {
  it('records event:meteor-shower on first shower start', () => {
    const state = createTestState()
    expect(state.manualDiscoveries.has('event:meteor-shower')).toBe(false)
    tickMeteorShower(state, 1000)
    expect(state.manualDiscoveries.has('event:meteor-shower')).toBe(true)
  })

  it('does not re-record on subsequent showers', () => {
    const state = createTestState()
    drainShower(state, 1000)
    expect(state.manualDiscoveries.has('event:meteor-shower')).toBe(true)
    const sizeBefore = state.manualDiscoveries.size

    // Advance to summer anchor and fire it
    state.seasonalPhase = state.meteorShower.pendingAnchorPhase
    drainShower(state, 2000)
    expect(state.manualDiscoveries.size).toBe(sizeBefore)
  })
})
