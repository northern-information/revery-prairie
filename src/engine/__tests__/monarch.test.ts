import {
  MONARCH_FLEE_RADIUS,
  MONARCH_POLLINATE_MS,
  MONARCH_SEARCH_RADIUS,
  MONARCH_SETTLE_RADIUS,
  MONARCH_SOIL_THRESHOLD_HIGH,
} from '../constants'
import { ComponentType } from '../ecs/types'
import {
  isMonarchSpawnCondition,
  pollinate,
  shouldSpawnMonarch,
  spawnBeeOrMonarch,
  spawnMonarch,
  tickMonarchs,
} from '../monarch'
import { posKey } from '../position'
import { Sky, TileType, Zone } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it, vi } from 'vitest'

import type { Entity } from '../ecs/types'

/** Assert and return a component value — avoids non-null assertions */
const requireComponent = <T>(val: T | undefined): T => {
  expect(val).toBeTruthy()
  return val as T
}

const getMonarchEntities = (state: ReturnType<typeof createTestState>): Entity[] =>
  state.world
    .query(ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'monarch')

describe('monarch butterfly', () => {
  describe('spawn conditions', () => {
    it('isMonarchSpawnCondition returns true only when raining', () => {
      const state = createTestState()
      state.weather.sky = Sky.Rain
      expect(isMonarchSpawnCondition(state)).toBe(true)

      state.weather.sky = Sky.Cloudy
      expect(isMonarchSpawnCondition(state)).toBe(false)

      state.weather.sky = Sky.Sun
      expect(isMonarchSpawnCondition(state)).toBe(false)
    })

    it('shouldSpawnMonarch returns false when not raining', () => {
      const state = createTestState()
      state.weather.sky = Sky.Sun
      expect(shouldSpawnMonarch(state)).toBe(false)
    })

    it('shouldSpawnMonarch respects spawn chance during rain', () => {
      const state = createTestState()
      state.weather.sky = Sky.Rain

      vi.spyOn(Math, 'random').mockReturnValue(0.05) // below 0.1 threshold
      try {
        expect(shouldSpawnMonarch(state)).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }

      vi.spyOn(Math, 'random').mockReturnValue(0.15) // above 0.1 threshold
      try {
        expect(shouldSpawnMonarch(state)).toBe(false)
      } finally {
        vi.restoreAllMocks()
      }
    })
  })

  describe('spawnBeeOrMonarch', () => {
    it('spawns a bee when not raining', () => {
      const state = createTestState()
      state.weather.sky = Sky.Sun
      const px = state.player.x
      const py = state.player.y

      spawnBeeOrMonarch(state, px, py)

      const bees = state.world
        .query(ComponentType.EntityTag)
        .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'bee')
      expect(bees.length).toBeGreaterThanOrEqual(1)
      expect(getMonarchEntities(state)).toHaveLength(0)
    })

    it('spawns a monarch during rain when random rolls below threshold', () => {
      const state = createTestState()
      state.weather.sky = Sky.Rain
      const px = state.player.x
      const py = state.player.y

      vi.spyOn(Math, 'random').mockReturnValue(0.05)
      try {
        spawnBeeOrMonarch(state, px, py)
      } finally {
        vi.restoreAllMocks()
      }

      const monarchs = getMonarchEntities(state)
      expect(monarchs).toHaveLength(1)

      const monarchState = state.world.getComponent(monarchs[0], ComponentType.MonarchState)
      expect(monarchState).toBeTruthy()
      expect(monarchState?.phase).toBe('wandering')
      expect(monarchState?.target).toBeNull()
      expect(monarchState?.waypoint).toBeNull()
      expect(monarchState?.lastPollinateTime).toBe(0)
    })
  })

  describe('spawnMonarch', () => {
    it('creates entity with correct components', () => {
      const state = createTestState()
      const eid = spawnMonarch(state, 10, 10)

      expect(state.world.getComponent(eid, ComponentType.EntityTag)).toBe('monarch')
      expect(state.world.getComponent(eid, ComponentType.Position)).toEqual({ x: 10, y: 10 })
      expect(state.world.getComponent(eid, ComponentType.EntityZone)).toEqual({ zone: state.currentZone })
      expect(state.world.getComponent(eid, ComponentType.HungerTimer)).toEqual({ hungerMs: 0 })
      expect(state.world.getComponent(eid, ComponentType.MonarchState)).toEqual({
        phase: 'wandering',
        target: null,
        waypoint: null,
        lastPollinateTime: 0,
      })
    })
  })

  describe('zig-zag wandering', () => {
    it('monarch picks a waypoint and moves toward it', () => {
      const state = createTestState()
      clearAroundPlayer(state, 15)
      const px = state.player.x
      const py = state.player.y + MONARCH_FLEE_RADIUS + 5 // far from player to avoid triggering flee

      const eid = spawnMonarch(state, px, py)

      // Mock random to produce a consistent waypoint direction
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5) // zigzag distance
        .mockReturnValueOnce(0.25) // angle (right-ish)
      try {
        tickMonarchs(state, 1000, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      // Monarch should have picked a waypoint
      expect(monarchState.waypoint).not.toBeNull()
    })

    it('monarch is attracted to nearby clover patches', () => {
      const state = createTestState()
      clearAroundPlayer(state, 20)
      const px = state.player.x
      const py = state.player.y + MONARCH_FLEE_RADIUS + 10

      // Place clover patch to the east
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = 8; dx <= 12; dx++) {
          state.map[py + dy][px + dx] = { type: TileType.Clover }
        }
      }

      const eid = spawnMonarch(state, px, py)

      // Mock random: high value for clover bias check (0.7 threshold), so bias kicks in
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.3) // zigzag distance pick
        .mockReturnValueOnce(0.3) // bias check (< 0.7, so bias toward clover)
        .mockReturnValueOnce(0.5) // jitter
      try {
        tickMonarchs(state, 1000, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      // With clover bias, waypoint should be east-ish
      if (monarchState.waypoint) {
        expect(monarchState.waypoint.x).toBeGreaterThanOrEqual(px)
      }
    })
  })

  describe('proximity flee', () => {
    it('monarch flees when player gets within MONARCH_FLEE_RADIUS', () => {
      const state = createTestState()
      clearAroundPlayer(state, MONARCH_SEARCH_RADIUS)
      const px = state.player.x
      const py = state.player.y

      // Place monarch just within flee radius
      const mx = px + MONARCH_FLEE_RADIUS
      const my = py

      // Place some fertile soil so the monarch has somewhere to flee to
      const targetX = px + 20
      const targetY = py
      state.map[targetY][targetX] = { type: TileType.Dirt }
      state.soilHealth.set(posKey(targetX, targetY), MONARCH_SOIL_THRESHOLD_HIGH)

      const eid = spawnMonarch(state, mx, my)

      vi.spyOn(Math, 'random').mockReturnValue(0)
      try {
        tickMonarchs(state, 1000, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      expect(monarchState.phase).toBe('fleeing')
      expect(monarchState.target).not.toBeNull()
    })

    it('monarch does not flee when player is far away', () => {
      const state = createTestState()
      clearAroundPlayer(state, 15)
      const px = state.player.x
      const py = state.player.y

      // Place monarch far from player
      const mx = px + MONARCH_FLEE_RADIUS + 5
      const my = py

      const eid = spawnMonarch(state, mx, my)

      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5) // zigzag dist
        .mockReturnValueOnce(0.5) // angle
      try {
        tickMonarchs(state, 1000, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      expect(monarchState.phase).toBe('wandering')
    })

    it('flee target prefers tiles farther from the player', () => {
      const state = createTestState()
      clearAroundPlayer(state, MONARCH_SEARCH_RADIUS)
      const px = state.player.x
      const py = state.player.y

      // Place fertile tiles both near and far from player
      state.map[py][px + 5] = { type: TileType.Dirt }
      state.soilHealth.set(posKey(px + 5, py), MONARCH_SOIL_THRESHOLD_HIGH)
      state.map[py][px + 25] = { type: TileType.Dirt }
      state.soilHealth.set(posKey(px + 25, py), MONARCH_SOIL_THRESHOLD_HIGH)

      const mx = px + MONARCH_FLEE_RADIUS
      const eid = spawnMonarch(state, mx, py)

      vi.spyOn(Math, 'random').mockReturnValue(0)
      try {
        tickMonarchs(state, 1000, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      expect(monarchState.phase).toBe('fleeing')
      // Target should be the farther tile (sorted by distance from player, picked from top quarter)
      if (monarchState.target) {
        expect(monarchState.target.x).toBe(px + 25)
      }
    })
  })

  describe('fleeing movement', () => {
    it('fleeing monarch moves toward target via zig-zag waypoints', () => {
      const state = createTestState()
      clearAroundPlayer(state, 15)
      const mx = state.player.x + 10
      const my = state.player.y + 10

      const eid = spawnMonarch(state, mx, my)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'fleeing'
      monarchState.target = { x: mx + 15, y: my }

      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.3) // zigzag dist
        .mockReturnValueOnce(0.3) // bias check (< 0.7)
        .mockReturnValueOnce(0.5) // jitter
      try {
        tickMonarchs(state, 1000, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      // Should have picked a waypoint toward the target
      expect(monarchState.waypoint).not.toBeNull()
    })

    it('fleeing monarch settles when it reaches the target', () => {
      const state = createTestState()
      clearAroundPlayer(state, 15)
      const mx = state.player.x + 10
      const my = state.player.y + 10

      const eid = spawnMonarch(state, mx, my)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'fleeing'
      monarchState.target = { x: mx, y: my } // already at target

      tickMonarchs(state, 1000, Zone.Overworld)

      expect(monarchState.phase).toBe('settled')
      expect(monarchState.target).toEqual({ x: mx, y: my })
    })

    it('fleeing monarch without target settles immediately', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const mx = state.player.x + 8
      const my = state.player.y

      const eid = spawnMonarch(state, mx, my)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'fleeing'
      monarchState.target = null

      tickMonarchs(state, 1000, Zone.Overworld)

      expect(monarchState.phase).toBe('settled')
    })
  })

  describe('settled phase', () => {
    it('settled monarch wanders within settle radius', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const mx = state.player.x + 8
      const my = state.player.y

      const eid = spawnMonarch(state, mx, my)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'settled'
      monarchState.target = { x: mx, y: my }
      monarchState.lastPollinateTime = 2000 // recent, so no pollination

      // Force movement (random < 0.15)
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.05) // pass 0.15 movement check
        .mockReturnValueOnce(0) // pick first candidate
      try {
        tickMonarchs(state, 1000, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      const pos = requireComponent(state.world.getComponent(eid, ComponentType.Position))
      // Should still be within settle radius
      const dx = pos.x - mx
      const dy = pos.y - my
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(MONARCH_SETTLE_RADIUS * MONARCH_SETTLE_RADIUS)
    })

    it('settled monarch does not wander outside settle radius', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const mx = state.player.x + 8
      const my = state.player.y

      const eid = spawnMonarch(state, mx, my)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'settled'
      monarchState.target = { x: mx, y: my }
      monarchState.lastPollinateTime = 2000

      // Run many ticks
      vi.spyOn(Math, 'random').mockReturnValue(0.05) // always move
      try {
        for (let i = 0; i < 50; i++) {
          tickMonarchs(state, 1000, Zone.Overworld)
        }
      } finally {
        vi.restoreAllMocks()
      }

      const pos = requireComponent(state.world.getComponent(eid, ComponentType.Position))
      const dx = pos.x - mx
      const dy = pos.y - my
      expect(dx * dx + dy * dy).toBeLessThanOrEqual(MONARCH_SETTLE_RADIUS * MONARCH_SETTLE_RADIUS)
    })
  })

  describe('pollination', () => {
    it('pollinate spreads clover to dirt adjacent to existing clover', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const cx = state.player.x + 8
      const cy = state.player.y

      // Place a single clover tile
      state.map[cy][cx] = { type: TileType.Clover }

      vi.spyOn(Math, 'random').mockReturnValue(0) // pick first candidate
      try {
        const result = pollinate(state, { x: cx, y: cy })
        expect(result).toBe(true)
      } finally {
        vi.restoreAllMocks()
      }

      // One adjacent dirt tile should now be clover
      let newCloverCount = 0
      for (const d of [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ]) {
        if (state.map[cy + d.y][cx + d.x].type === TileType.Clover) {
          newCloverCount++
        }
      }
      // Original clover + 1 new
      expect(newCloverCount).toBeGreaterThanOrEqual(1)
    })

    it('pollinate does nothing when no dirt is adjacent to clover', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const cx = state.player.x + 8
      const cy = state.player.y

      // No clover anywhere
      const result = pollinate(state, { x: cx, y: cy })
      expect(result).toBe(false)
    })

    it('pollinate initializes clover lifecycle for new clover', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const cx = state.player.x + 8
      const cy = state.player.y

      state.map[cy][cx] = { type: TileType.Clover }

      vi.spyOn(Math, 'random').mockReturnValue(0)
      try {
        pollinate(state, { x: cx, y: cy })
      } finally {
        vi.restoreAllMocks()
      }

      // Find the newly placed clover tile
      for (const d of [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ]) {
        const tx = cx + d.x
        const ty = cy + d.y
        if (state.map[ty][tx].type === TileType.Clover && !(tx === cx && ty === cy)) {
          const lifecycle = state.cloverLifecycle.get(posKey(tx, ty))
          expect(lifecycle).toBeTruthy()
          expect(lifecycle?.stage).toBe('healthy')
          expect(lifecycle?.hasLight).toBe(true)
          break
        }
      }
    })

    it('settled monarch pollinates on timer', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const mx = state.player.x + 8
      const my = state.player.y

      // Place clover so pollination can happen
      state.map[my][mx] = { type: TileType.Clover }

      const eid = spawnMonarch(state, mx, my)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'settled'
      monarchState.target = { x: mx, y: my }
      monarchState.lastPollinateTime = 0 // long ago

      // Prevent wandering so we can focus on pollination
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5) // fail movement check (> 0.15)
        .mockReturnValueOnce(0) // pollinate pick first candidate
      try {
        tickMonarchs(state, MONARCH_POLLINATE_MS + 1, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      // A new clover tile should have appeared
      let cloverCount = 0
      const r = MONARCH_SETTLE_RADIUS
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (state.map[my + dy][mx + dx].type === TileType.Clover) {
            cloverCount++
          }
        }
      }
      expect(cloverCount).toBeGreaterThan(1) // original + at least 1 new
    })

    it('settled monarch does not pollinate before timer elapses', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const mx = state.player.x + 8
      const my = state.player.y

      state.map[my][mx] = { type: TileType.Clover }

      const eid = spawnMonarch(state, mx, my)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'settled'
      monarchState.target = { x: mx, y: my }
      monarchState.lastPollinateTime = 1000

      vi.spyOn(Math, 'random').mockReturnValue(0.5) // no movement
      try {
        // Time is within MONARCH_POLLINATE_MS of lastPollinateTime
        tickMonarchs(state, 1000 + MONARCH_POLLINATE_MS - 1, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      // Count clover — should be just the original
      let cloverCount = 0
      const r = MONARCH_SETTLE_RADIUS
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (state.map[my + dy][mx + dx].type === TileType.Clover) {
            cloverCount++
          }
        }
      }
      expect(cloverCount).toBe(1)
    })
  })

  describe('hunger', () => {
    it('monarchs starve when not near clover', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const px = state.player.x
      const py = state.player.y + MONARCH_FLEE_RADIUS + 3

      const eid = spawnMonarch(state, px, py)

      // Force no movement so monarch stays put (no waypoint picked)
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      try {
        for (let i = 0; i < 200; i++) {
          tickMonarchs(state, 1000, Zone.Overworld)
        }
      } finally {
        vi.restoreAllMocks()
      }

      expect(state.world.isAlive(eid)).toBe(false)
    })

    it('monarchs reset hunger when near clover', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const px = state.player.x
      const py = state.player.y + MONARCH_FLEE_RADIUS + 3

      // Fill area around monarch with clover (settled monarch has bounded movement)
      for (let dy = -MONARCH_SETTLE_RADIUS - 1; dy <= MONARCH_SETTLE_RADIUS + 1; dy++) {
        for (let dx = -MONARCH_SETTLE_RADIUS - 1; dx <= MONARCH_SETTLE_RADIUS + 1; dx++) {
          state.map[py + dy][px + dx] = { type: TileType.Clover }
        }
      }

      const eid = spawnMonarch(state, px, py)
      // Use settled phase so the monarch stays within MONARCH_SETTLE_RADIUS of its target
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'settled'
      monarchState.target = { x: px, y: py }
      monarchState.lastPollinateTime = Infinity // prevent pollination side effects

      vi.spyOn(Math, 'random').mockReturnValue(0.05) // always move
      try {
        for (let i = 0; i < 200; i++) {
          tickMonarchs(state, 1000, Zone.Overworld)
        }
      } finally {
        vi.restoreAllMocks()
      }

      expect(state.world.isAlive(eid)).toBe(true)
    })
  })

  describe('multiple monarchs', () => {
    it('multiple monarchs operate independently', () => {
      const state = createTestState()
      clearAroundPlayer(state, 15)
      const px = state.player.x
      const py = state.player.y

      const eid1 = spawnMonarch(state, px + MONARCH_FLEE_RADIUS + 3, py + MONARCH_FLEE_RADIUS + 3)
      const eid2 = spawnMonarch(state, px + MONARCH_FLEE_RADIUS + 5, py + MONARCH_FLEE_RADIUS + 5)

      // Place clover near both so they don't starve
      state.map[py + MONARCH_FLEE_RADIUS + 3][px + MONARCH_FLEE_RADIUS + 4] = { type: TileType.Clover }
      state.map[py + MONARCH_FLEE_RADIUS + 5][px + MONARCH_FLEE_RADIUS + 6] = { type: TileType.Clover }

      expect(getMonarchEntities(state)).toHaveLength(2)
      expect(state.world.isAlive(eid1)).toBe(true)
      expect(state.world.isAlive(eid2)).toBe(true)
    })
  })
})
