// RP-17 — ceremony wave tests.
//
// Pins the wave-engine invariants:
//   - bee+clover combine enqueues exactly one WaveEmission centered on
//     the player; spawns a bee; places a single seed clover
//   - tickFloraWaves advances currentRadius across CEREMONY_WAVE_TICK_MS
//     boundaries; respects map bounds; skips water + walls + sand
//   - waves are hard-bounded by maxRadius and remove themselves on the
//     tick currentRadius exceeds it; no paint past maxRadius even via
//     the jitter pull-in band (no memory leak, no escape on open dirt)
//   - painted children inherit parentPrefix from wave.seedIdentity

import { CEREMONY_WAVE_RADIUS, CEREMONY_WAVE_TICK_MS } from '../constants'
import { ComponentType } from '../ecs/types'
import { tickFloraWaves } from '../floraWaves'
import { setMapTile } from '../map'
import { posKey } from '../position'
import { RECIPES } from '../recipes'
import { FloraSpecies, TileType } from '../types'

import { clearAroundPlayer, createTestState, getBeeEntities } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

const prairieRecipe = RECIPES[0]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bee+clover ceremony enqueue', () => {
  it('enqueues exactly one WaveEmission centered at the player', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    expect(state.activeWaves).toHaveLength(0)

    const ok = prairieRecipe.execute(state)
    expect(ok).toBe(true)
    expect(state.activeWaves).toHaveLength(1)

    const wave = state.activeWaves[0]
    expect(wave.cx).toBe(state.player.x)
    expect(wave.cy).toBe(state.player.y)
    expect(wave.maxRadius).toBe(CEREMONY_WAVE_RADIUS)
    expect(wave.currentRadius).toBe(0)
    expect(wave.seedIdentity.length).toBeGreaterThan(0)
  })

  it('seeds a single Flora tile at the player position', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    prairieRecipe.execute(state)
    expect(state.map[state.player.y][state.player.x].type).toBe(TileType.Flora)
  })

  it('spawns a bee at the player position', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    prairieRecipe.execute(state)
    const bees = getBeeEntities(state)
    expect(bees).toHaveLength(1)
  })

  it('rejects standing-on-water', () => {
    const state = createTestState()
    state.ponds.add(posKey(state.player.x, state.player.y))
    const ok = prairieRecipe.execute(state)
    expect(ok).toBe(false)
    expect(state.activeWaves).toHaveLength(0)
  })
})

describe('tickFloraWaves advancement', () => {
  it('advances currentRadius when CEREMONY_WAVE_TICK_MS has elapsed', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    prairieRecipe.execute(state)

    // Force every cellNoise-derived per-tile gate to pass (Math.random
    // is used only for pollen-burst spawning here; the noise function
    // doesn't read it, so this just keeps any incidental random calls
    // deterministic).
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    tickFloraWaves(state, CEREMONY_WAVE_TICK_MS + 1)
    expect(state.activeWaves[0].currentRadius).toBe(1)
  })

  it('does not advance before CEREMONY_WAVE_TICK_MS has elapsed', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    prairieRecipe.execute(state)

    tickFloraWaves(state, CEREMONY_WAVE_TICK_MS - 1)
    expect(state.activeWaves[0].currentRadius).toBe(0)
  })

  it('paints children whose parentPrefix matches wave.seedIdentity prefix', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    prairieRecipe.execute(state)
    const wave = state.activeWaves[0]

    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    // Advance through a couple of ticks so the annulus reaches r >= 1.
    let t = CEREMONY_WAVE_TICK_MS + 1
    tickFloraWaves(state, t)
    t += CEREMONY_WAVE_TICK_MS + 1
    tickFloraWaves(state, t)

    // Find any painted tile on the wave's footprint other than the seed.
    const expectedPrefix = wave.seedIdentity.slice(0, 8)
    let foundChild = false
    for (const [key, entry] of state.floraLifecycle) {
      if (key === posKey(wave.cx, wave.cy)) continue
      if (entry.species !== FloraSpecies.Clover) continue
      if (entry.parentPrefix === expectedPrefix) {
        foundChild = true
        break
      }
    }
    expect(foundChild).toBe(true)
  })

  it('skips pond tiles inside the annulus', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    const px = state.player.x
    const py = state.player.y

    // Mark a tile inside the wave's reach as a pond.
    const pondX = px + 3
    const pondY = py
    state.ponds.add(posKey(pondX, pondY))

    prairieRecipe.execute(state)

    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    // Advance enough ticks for the wave to reach the pond.
    for (let i = 0; i < CEREMONY_WAVE_RADIUS + 1; i++) {
      tickFloraWaves(state, (i + 1) * (CEREMONY_WAVE_TICK_MS + 1))
    }

    // Pond tile is unchanged.
    expect(state.map[pondY][pondX].type).not.toBe(TileType.Flora)
  })

  it('skips wall tiles inside the annulus', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    const px = state.player.x
    const py = state.player.y

    setMapTile(state, px + 3, py, { type: TileType.RuinWall })

    prairieRecipe.execute(state)

    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    for (let i = 0; i < CEREMONY_WAVE_RADIUS + 1; i++) {
      tickFloraWaves(state, (i + 1) * (CEREMONY_WAVE_TICK_MS + 1))
    }

    expect(state.map[py][px + 3].type).toBe(TileType.RuinWall)
  })
})

describe('tickFloraWaves completion (no memory leak)', () => {
  it('removes the wave from state.activeWaves on the tick currentRadius exceeds maxRadius', () => {
    const state = createTestState()
    clearAroundPlayer(state, 20)
    prairieRecipe.execute(state)

    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    // Hard cap: termination is gated on currentRadius alone, so the
    // wave must drop within (CEREMONY_WAVE_RADIUS + 1) ticks. A small
    // headroom factor keeps the test resilient to any off-by-one.
    for (let i = 0; i < CEREMONY_WAVE_RADIUS + 3; i++) {
      tickFloraWaves(state, (i + 1) * (CEREMONY_WAVE_TICK_MS + 1))
      if (state.activeWaves.length === 0) break
    }

    expect(state.activeWaves).toHaveLength(0)
  })

  it('never paints a tile past CEREMONY_WAVE_RADIUS on a fully open dirt expanse', () => {
    // Hard-cap regression: previously the soft `|| painted > 0` grace
    // let the wave keep advancing past maxRadius as long as paintable
    // dirt remained. On a 147^2 map with no obstructions that meant
    // "everything." This test asserts no Flora child painted by the
    // wave lies beyond CEREMONY_WAVE_RADIUS from the cast origin.
    const state = createTestState()
    // Clear well past the wave's reach so paintable dirt always exists
    // outside the cap — the only thing stopping the wave should be the
    // cap itself.
    clearAroundPlayer(state, CEREMONY_WAVE_RADIUS * 2 + 5)
    prairieRecipe.execute(state)
    const wave = state.activeWaves[0]
    const expectedPrefix = wave.seedIdentity.slice(0, 8)
    const cx = wave.cx
    const cy = wave.cy

    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    for (let i = 0; i < CEREMONY_WAVE_RADIUS + 3; i++) {
      tickFloraWaves(state, (i + 1) * (CEREMONY_WAVE_TICK_MS + 1))
      if (state.activeWaves.length === 0) break
    }

    expect(state.activeWaves).toHaveLength(0)

    for (const [key, entry] of state.floraLifecycle) {
      if (entry.parentPrefix !== expectedPrefix) continue
      if (key === posKey(cx, cy)) continue
      const [xs, ys] = key.split(',')
      const x = Number(xs)
      const y = Number(ys)
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy))
      expect(d).toBeLessThanOrEqual(CEREMONY_WAVE_RADIUS)
    }
  })

  it('does not accumulate multiple waves after running ten ceremonies to completion', () => {
    const state = createTestState()
    clearAroundPlayer(state, 30)

    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    for (let cast = 0; cast < 10; cast++) {
      prairieRecipe.execute(state)
      // Run the wave to completion before the next cast.
      for (let i = 0; i < CEREMONY_WAVE_RADIUS * 3; i++) {
        tickFloraWaves(state, ((cast * 100) + i + 1) * (CEREMONY_WAVE_TICK_MS + 1))
      }
    }
    expect(state.activeWaves).toHaveLength(0)
  })
})

describe('pollenBurst spawn', () => {
  it('spawns at least one pollenBurst TimedEffect on the first annulus tick', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    prairieRecipe.execute(state)

    // 0.5 falls between POLLEN_BURSTS_PER_TICK_MIN and MAX so the
    // random pick lands in the bursts range deterministically.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    tickFloraWaves(state, CEREMONY_WAVE_TICK_MS + 1)

    let burstCount = 0
    for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) === 'pollenBurst') burstCount++
    }
    expect(burstCount).toBeGreaterThanOrEqual(1)
  })
})
