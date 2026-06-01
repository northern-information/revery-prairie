// RP-25 — Egregoric fauna tests.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { pickUpGroundItems } from '../entities'
import { ComponentType } from '../ecs/types'
import {
  attemptPierceWalkerSpawn,
  attemptWrongBeeSpawn,
  enumerateSeamClusters,
  isSeamCluster,
  PIERCE_WALKER_CAP,
  PIERCE_WALKER_MOVE_CHANCE,
  PIERCE_WALKER_SPAWN_CHANCE,
  PIERCE_WALKER_TAG,
  tickEgregoreFauna,
  WRONG_BEE_CAP,
  WRONG_BEE_LIFESPAN_TICKS,
  WRONG_BEE_SPAWN_CHANCE,
  WRONG_BEE_TAG,
} from '../egregoreFauna'
import { getBlockedPositions } from '../movement'
import { posKey } from '../position'
import { TileType, Zone } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

import type { GameState, Position } from '../types'

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Helpers ──────────────────────────────────────────────────────────────

// Place a cluster of egregoric tiles around (cx, cy): one center, plus
// `count` neighbors within Chebyshev distance 2. The neighbors are laid
// out at fixed offsets so isSeamCluster sees the center as a cluster.
const placeSeamCluster = (state: GameState, cx: number, cy: number, count = 3): Position[] => {
  const placed: Position[] = []
  const offsets: Position[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 2, y: 1 },
    { x: -2, y: -1 },
  ]
  for (let i = 0; i < count && i < offsets.length; i++) {
    const p = { x: cx + offsets[i].x, y: cy + offsets[i].y }
    state.map[p.y][p.x] = { type: TileType.Egregore }
    state.egregorePositions.push(p)
    placed.push(p)
  }
  return placed
}

const countTag = (state: GameState, tag: string): number => {
  let count = 0
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === tag) count++
  }
  return count
}

const findFirstByTag = (state: GameState, tag: string): number | null => {
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === tag) return eid
  }
  return null
}

// ─── Seam-cluster detection ───────────────────────────────────────────────

describe('egregore fauna seam-cluster detection', () => {
  it('isolated egregore tile is not a cluster', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    const p = { x: state.player.x + 4, y: state.player.y }
    state.map[p.y][p.x] = { type: TileType.Egregore }
    state.egregorePositions.push(p)
    expect(isSeamCluster(state, p.x, p.y)).toBe(false)
    expect(enumerateSeamClusters(state)).toEqual([])
  })

  it('three adjacent egregoric tiles form a cluster', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    const placed = placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    for (const p of placed) {
      expect(isSeamCluster(state, p.x, p.y)).toBe(true)
    }
    expect(enumerateSeamClusters(state).length).toBe(3)
  })

  it('Chebyshev-2 corner tile counts as a neighbor', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    const center = { x: state.player.x + 4, y: state.player.y }
    const a = { x: center.x + 2, y: center.y + 2 } // exactly Chebyshev 2
    const b = { x: center.x - 2, y: center.y } // also Chebyshev 2
    state.map[center.y][center.x] = { type: TileType.Egregore }
    state.map[a.y][a.x] = { type: TileType.Egregore }
    state.map[b.y][b.x] = { type: TileType.Egregore }
    state.egregorePositions.push(center, a, b)
    expect(isSeamCluster(state, center.x, center.y)).toBe(true)
  })

  it('non-egregoric tile is never a cluster, even with neighbors', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    // A dirt tile adjacent to the cluster — not in egregorePositions
    const p = { x: state.player.x + 4 + 3, y: state.player.y }
    expect(isSeamCluster(state, p.x, p.y)).toBe(false)
  })
})

// ─── wrongBee ──────────────────────────────────────────────────────────────

describe('egregore fauna wrongBee', () => {
  it('spawn requires Zone.Overworld', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    state.currentZone = Zone.Cave
    const rng = vi.fn().mockReturnValue(0)
    expect(attemptWrongBeeSpawn(state, rng)).toBe(false)
    expect(countTag(state, WRONG_BEE_TAG)).toBe(0)
  })

  it('spawn requires at least one seam cluster', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    const rng = vi.fn().mockReturnValue(0)
    expect(attemptWrongBeeSpawn(state, rng)).toBe(false)
    expect(countTag(state, WRONG_BEE_TAG)).toBe(0)
  })

  it('spawn respects WRONG_BEE_CAP', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    const rng = vi.fn().mockReturnValue(0)
    let attempts = 0
    while (countTag(state, WRONG_BEE_TAG) < WRONG_BEE_CAP && attempts < 100) {
      attemptWrongBeeSpawn(state, rng)
      attempts++
    }
    expect(countTag(state, WRONG_BEE_TAG)).toBe(WRONG_BEE_CAP)
    // Further attempts are suppressed
    for (let i = 0; i < 50; i++) attemptWrongBeeSpawn(state, rng)
    expect(countTag(state, WRONG_BEE_TAG)).toBe(WRONG_BEE_CAP)
  })

  it('spawn records discovery exactly once', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    const rng = vi.fn().mockReturnValue(0)
    expect(state.manualDiscoveries.has('fauna:wrongBee')).toBe(false)
    attemptWrongBeeSpawn(state, rng)
    expect(state.manualDiscoveries.has('fauna:wrongBee')).toBe(true)
    const beforeChronicleLen = state.chronicle.length
    attemptWrongBeeSpawn(state, rng)
    // Discovery key was already added; chronicle should not get a second sighting.
    expect(state.chronicle.length).toBe(beforeChronicleLen)
  })

  it('spawn roll above threshold suppresses spawn', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    const rng = vi.fn().mockReturnValue(WRONG_BEE_SPAWN_CHANCE + 0.001)
    expect(attemptWrongBeeSpawn(state, rng)).toBe(false)
    expect(countTag(state, WRONG_BEE_TAG)).toBe(0)
  })

  it('motion steps strictly toward the nearest seam tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    state.egregorePositions = []
    // One seam cluster at (px+8, py); wrongBee starts at (px+3, py).
    placeSeamCluster(state, state.player.x + 8, state.player.y, 3)
    const beeX = state.player.x + 3
    const beeY = state.player.y
    // Manually create a wrongBee for the motion test (skip the spawn rng).
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: beeX, y: beeY })
    state.world.addComponent(eid, ComponentType.EntityTag, WRONG_BEE_TAG)
    state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })
    state.world.addComponent(eid, ComponentType.WrongBeeLifecycle, {
      ticksRemaining: WRONG_BEE_LIFESPAN_TICKS,
    })

    const beforeDist = Math.max(
      Math.abs(beeX - (state.player.x + 8)),
      Math.abs(beeY - state.player.y)
    )
    // rng returns 0 → picks first candidate in the improving set
    const rng = vi.fn().mockReturnValue(0)
    tickEgregoreFauna(state, 0, rng)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    expect(pos).toBeDefined()
    if (pos) {
      const afterDist = Math.max(
        Math.abs(pos.x - (state.player.x + 8)),
        Math.abs(pos.y - state.player.y)
      )
      expect(afterDist).toBeLessThan(beforeDist)
    }
  })

  it('lifespan decrements each tick and the entity is destroyed at zero', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)

    // Manually spawn a wrongBee with ticksRemaining = 2 and disable
    // spawn rolls so only lifespan + motion run.
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: state.player.x + 2, y: state.player.y })
    state.world.addComponent(eid, ComponentType.EntityTag, WRONG_BEE_TAG)
    state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })
    state.world.addComponent(eid, ComponentType.WrongBeeLifecycle, { ticksRemaining: 2 })

    const rng = vi.fn().mockReturnValue(0.99) // suppress further spawns and drift
    tickEgregoreFauna(state, 0, rng)
    let life = state.world.getComponent(eid, ComponentType.WrongBeeLifecycle)
    expect(life?.ticksRemaining).toBe(1)
    tickEgregoreFauna(state, 0, rng)
    life = state.world.getComponent(eid, ComponentType.WrongBeeLifecycle)
    expect(life).toBeUndefined()
    expect(state.world.isAlive(eid)).toBe(false)
  })

  it('walk-over does not capture a wrongBee (pickup excludes it)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 6)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: state.player.x + 1, y: state.player.y })
    state.world.addComponent(eid, ComponentType.EntityTag, WRONG_BEE_TAG)
    state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })
    state.world.addComponent(eid, ComponentType.WrongBeeLifecycle, {
      ticksRemaining: WRONG_BEE_LIFESPAN_TICKS,
    })
    const before = state.backpack.items.length
    const result = pickUpGroundItems(state)
    expect(result.pickedUp).toEqual([])
    expect(state.backpack.items.length).toBe(before)
    expect(state.world.isAlive(eid)).toBe(true)
  })
})

// ─── pierceWalker ──────────────────────────────────────────────────────────

describe('egregore fauna pierceWalker', () => {
  it('spawn requires overworld, cluster, and capacity', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []

    // No clusters: no spawn even with rng=0.
    const rng = vi.fn().mockReturnValue(0)
    expect(attemptPierceWalkerSpawn(state, rng)).toBe(false)

    // Add a cluster: spawn succeeds.
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    expect(attemptPierceWalkerSpawn(state, rng)).toBe(true)
    expect(countTag(state, PIERCE_WALKER_TAG)).toBe(PIERCE_WALKER_CAP)

    // Capacity saturated: further spawns suppressed.
    expect(attemptPierceWalkerSpawn(state, rng)).toBe(false)
    expect(countTag(state, PIERCE_WALKER_TAG)).toBe(PIERCE_WALKER_CAP)
  })

  it('spawn lands ON an egregoric tile and records discovery', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    const rng = vi.fn().mockReturnValue(0)
    attemptPierceWalkerSpawn(state, rng)
    const eid = findFirstByTag(state, PIERCE_WALKER_TAG)
    expect(eid).not.toBeNull()
    if (eid !== null) {
      const pos = state.world.getComponent(eid, ComponentType.Position)
      expect(pos).toBeDefined()
      if (pos) {
        const onSeam = state.egregorePositions.some(p => p.x === pos.x && p.y === pos.y)
        expect(onSeam).toBe(true)
      }
    }
    expect(state.manualDiscoveries.has('fauna:pierceWalker')).toBe(true)
  })

  it('spawn roll above threshold suppresses spawn', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    const rng = vi.fn().mockReturnValue(PIERCE_WALKER_SPAWN_CHANCE + 0.001)
    expect(attemptPierceWalkerSpawn(state, rng)).toBe(false)
  })

  it('motion stays on the seam (never steps to a non-egregoric tile)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    // Spawn the walker on the cluster.
    const spawnRng = vi.fn().mockReturnValue(0)
    attemptPierceWalkerSpawn(state, spawnRng)
    const eid = findFirstByTag(state, PIERCE_WALKER_TAG)
    expect(eid).not.toBeNull()
    if (eid === null) return
    const startPos = state.world.getComponent(eid, ComponentType.Position)
    expect(startPos).toBeDefined()
    if (!startPos) return
    // rng for motion: 0 → roll < PIERCE_WALKER_MOVE_CHANCE (step), then 0 picks first candidate.
    const motionRng = vi.fn().mockReturnValue(0)
    tickEgregoreFauna(state, 0, motionRng)
    const after = state.world.getComponent(eid, ComponentType.Position)
    expect(after).toBeDefined()
    if (!after) return
    const onSeam = state.egregorePositions.some(p => p.x === after.x && p.y === after.y)
    expect(onSeam).toBe(true)
  })

  it('motion respects PIERCE_WALKER_MOVE_CHANCE (no-step when rng above threshold)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    const eid = state.world.createEntity()
    const start = { x: state.player.x + 4, y: state.player.y }
    state.world.addComponent(eid, ComponentType.Position, start)
    state.world.addComponent(eid, ComponentType.EntityTag, PIERCE_WALKER_TAG)
    state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })
    state.world.addComponent(eid, ComponentType.PierceWalkerGlyph, { codepoint: '\u{F166}' })
    state.world.addComponent(eid, ComponentType.Blocking, { blockMovement: true })

    // rng returns just above PIERCE_WALKER_MOVE_CHANCE for spawn AND motion;
    // both spawn and motion gates fail, so the walker stays put.
    const rng = vi.fn().mockReturnValue(PIERCE_WALKER_MOVE_CHANCE + 0.01)
    tickEgregoreFauna(state, 0, rng)
    const after = state.world.getComponent(eid, ComponentType.Position)
    expect(after?.x).toBe(start.x)
    expect(after?.y).toBe(start.y)
  })

  it('pierceWalker blocks pathfinding (Blocking component)', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    const rng = vi.fn().mockReturnValue(0)
    attemptPierceWalkerSpawn(state, rng)
    const eid = findFirstByTag(state, PIERCE_WALKER_TAG)
    expect(eid).not.toBeNull()
    if (eid === null) return
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) return
    const blocked = getBlockedPositions(state)
    expect(blocked.has(posKey(pos.x, pos.y))).toBe(true)
  })

  it('walk-over does not capture a pierceWalker', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 1, state.player.y, 3)
    const rng = vi.fn().mockReturnValue(0)
    attemptPierceWalkerSpawn(state, rng)
    const before = state.backpack.items.length
    const result = pickUpGroundItems(state)
    expect(result.pickedUp).toEqual([])
    expect(state.backpack.items.length).toBe(before)
    expect(countTag(state, PIERCE_WALKER_TAG)).toBe(1)
  })
})

// ─── Chronicle + manual ────────────────────────────────────────────────────

describe('egregore fauna chronicle + manual', () => {
  it('first wrongBee spawn appends one chronicle event', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    const beforeLen = state.chronicle.length
    const rng = vi.fn().mockReturnValue(0)
    attemptWrongBeeSpawn(state, rng)
    expect(state.chronicle.length).toBe(beforeLen + 1)
    const event = state.chronicle[state.chronicle.length - 1]
    expect(event.slots.faunaKind).toBe('wrongBee')
    expect(event.templateId === 'wrong-thing-walked' || event.templateId === 'script-took-shape').toBe(true)
  })

  it('first pierceWalker spawn appends one chronicle event', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    const beforeLen = state.chronicle.length
    const rng = vi.fn().mockReturnValue(0)
    attemptPierceWalkerSpawn(state, rng)
    expect(state.chronicle.length).toBe(beforeLen + 1)
    const event = state.chronicle[state.chronicle.length - 1]
    expect(event.slots.faunaKind).toBe('pierceWalker')
  })

  it('cave-zone spawn attempts do not emit chronicle events', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    state.currentZone = Zone.Cave
    const beforeLen = state.chronicle.length
    const rng = vi.fn().mockReturnValue(0)
    attemptWrongBeeSpawn(state, rng)
    attemptPierceWalkerSpawn(state, rng)
    expect(state.chronicle.length).toBe(beforeLen)
  })

  it('manual entries become discovered after first spawn', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.egregorePositions = []
    placeSeamCluster(state, state.player.x + 4, state.player.y, 3)
    expect(state.manualDiscoveries.has('fauna:wrongBee')).toBe(false)
    expect(state.manualDiscoveries.has('fauna:pierceWalker')).toBe(false)
    const rng = vi.fn().mockReturnValue(0)
    attemptWrongBeeSpawn(state, rng)
    attemptPierceWalkerSpawn(state, rng)
    expect(state.manualDiscoveries.has('fauna:wrongBee')).toBe(true)
    expect(state.manualDiscoveries.has('fauna:pierceWalker')).toBe(true)
  })
})
