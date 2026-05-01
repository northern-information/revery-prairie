import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGameLoop } from '../gameLoop'
import { clearArea, clearAroundPlayer, createGroundItemEntity, createTestState } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
})

// Tick the loop in 1ms steps from `from` (exclusive) to `to` (inclusive). The
// real game runs at ~60fps so the cadence gate must hold up under per-frame
// ticks, not just exact 50ms boundaries.
const tickEveryMs = (loop: ReturnType<typeof createGameLoop>, from: number, to: number) => {
  for (let t = from + 1; t <= to; t++) {
    loop.tick(t)
  }
}

describe('sprint tick cadence', () => {
  it('keyboard-move tick advances one tile per 50ms while sprinting', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    state.sprinting = true
    state.heldDirection = 'right'
    const startX = state.player.x
    const startY = state.player.y
    const loop = createGameLoop(state, {})

    // t=0 establishes lastMoveTime; per the scheduler convention, the
    // first move fires after one full interval has elapsed, not at t=0.
    loop.tick(0)
    expect(state.player.x).toBe(startX)

    // Sub-frame ticks before t=50 must not advance.
    tickEveryMs(loop, 0, 49)
    expect(state.player.x).toBe(startX)

    loop.tick(50)
    expect(state.player.x).toBe(startX + 1)

    // Five more 50ms intervals → five more tiles, regardless of sub-frame ticks.
    tickEveryMs(loop, 50, 300)
    expect(state.player.x).toBe(startX + 6)
    expect(state.player.y).toBe(startY)
  })

  it('non-sprinting keyboard-move tick stays at the 100ms cadence', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    state.sprinting = false
    state.heldDirection = 'right'
    const startX = state.player.x
    const loop = createGameLoop(state, {})

    loop.tick(0)
    tickEveryMs(loop, 0, 99)
    expect(state.player.x).toBe(startX)

    loop.tick(100)
    expect(state.player.x).toBe(startX + 1)

    tickEveryMs(loop, 100, 199)
    expect(state.player.x).toBe(startX + 1)

    loop.tick(200)
    expect(state.player.x).toBe(startX + 2)
  })

  it('path tick advances one tile per 50ms while sprinting', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    state.sprinting = true
    const startX = state.player.x
    const startY = state.player.y
    state.path = [
      { x: startX + 1, y: startY },
      { x: startX + 2, y: startY },
      { x: startX + 3, y: startY },
      { x: startX + 4, y: startY },
      { x: startX + 5, y: startY },
    ]
    const loop = createGameLoop(state, {})

    loop.tick(0)
    expect(state.player.x).toBe(startX)

    loop.tick(50)
    expect(state.player.x).toBe(startX + 1)

    tickEveryMs(loop, 50, 250)
    expect(state.player.x).toBe(startX + 5)
    expect(state.path).toBeNull()
  })

  it('auto-pickup fires on every sprinted tile, including odd displacements', () => {
    const state = createTestState()
    clearArea(state, state.player.x + 3, state.player.y, 6)
    state.sprinting = true
    state.heldDirection = 'right'
    const startX = state.player.x
    const startY = state.player.y
    // Drop a coin at every tile from origin+1 through origin+5.
    for (let dx = 1; dx <= 5; dx++) {
      createGroundItemEntity(state, 'coin', startX + dx, startY)
    }
    const loop = createGameLoop(state, {})

    loop.tick(0)
    for (let t = 50; t <= 300; t += 50) {
      loop.tick(t)
    }

    // Player traversed 6 tiles (5 with coins, plus one trailing empty step).
    expect(state.player.x).toBe(startX + 6)
    const coinsInBackpack = state.backpack.items.filter(item => item.definitionId === 'coin')
    expect(coinsInBackpack).toHaveLength(5)
  })

  it('releasing the key after a single sprint tick does not fire a stale second move', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    state.sprinting = true
    state.heldDirection = 'right'
    const startX = state.player.x
    const loop = createGameLoop(state, {})

    loop.tick(0)
    loop.tick(50)
    expect(state.player.x).toBe(startX + 1)

    // Simulate keyup arriving between ticks.
    state.heldDirection = null
    loop.tick(100)

    // Without the fix the player would already have moved twice in tick(50).
    // With the fix only one move ever happened, and tick(100) bails because
    // heldDirection is null.
    expect(state.player.x).toBe(startX + 1)
  })
})
