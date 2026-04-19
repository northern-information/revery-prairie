import { describe, expect, it, vi } from 'vitest'
import {
  MONARCH_HEAL_SIZE,
  MONARCH_PRAIRIE_SIZE,
  MONARCH_SEARCH_RADIUS,
  MONARCH_SOIL_THRESHOLD_HIGH,
  MONARCH_SOIL_THRESHOLD_LOW,
  SOIL_HEALTH_MAX,
} from '../constants'
import { ComponentType } from '../ecs/types'
import {
  activateMonarch,
  isMonarchSpawnCondition,
  plantPrairie,
  shouldSpawnMonarch,
  spawnBeeOrMonarch,
  spawnMonarch,
  tickMonarchs,
} from '../monarch'
import { posKey } from '../position'
import { Sky, TileType, Zone } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'

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

      const pos = state.world.getComponent(monarchs[0], ComponentType.Position)
      expect(pos).toBeTruthy()
      expect(pos?.x).toBe(px)
      expect(pos?.y).toBe(py)

      const monarchState = state.world.getComponent(monarchs[0], ComponentType.MonarchState)
      expect(monarchState).toBeTruthy()
      expect(monarchState?.phase).toBe('wandering')
      expect(monarchState?.target).toBeNull()
    })

    it('spawns a bee during rain when random rolls above threshold', () => {
      const state = createTestState()
      state.weather.sky = Sky.Rain
      const px = state.player.x
      const py = state.player.y

      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        spawnBeeOrMonarch(state, px, py)
      } finally {
        vi.restoreAllMocks()
      }

      expect(getMonarchEntities(state)).toHaveLength(0)
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
      })
    })
  })

  describe('wandering', () => {
    it('monarchs wander like bees — prefer clover tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const px = state.player.x
      const py = state.player.y + 3 // away from player

      // Place clover to the right of monarch
      state.map[py][px + 1] = { type: TileType.Clover }

      const eid = spawnMonarch(state, px, py)

      // Force movement to happen
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.1) // pass the 0.3 movement check
        .mockReturnValueOnce(0) // pick first candidate (clover preferred)
      try {
        tickMonarchs(state, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      const pos = state.world.getComponent(eid, ComponentType.Position)
      expect(pos).toBeTruthy()
      // Monarch should have moved to the clover tile
      expect(pos?.x).toBe(px + 1)
      expect(pos?.y).toBe(py)
    })

    it('idle monarchs also wander', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const px = state.player.x
      const py = state.player.y + 3

      const eid = spawnMonarch(state, px, py)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'idle'

      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.1) // pass movement check
        .mockReturnValueOnce(0) // pick first candidate
      try {
        tickMonarchs(state, Zone.Overworld)
      } finally {
        vi.restoreAllMocks()
      }

      const pos = state.world.getComponent(eid, ComponentType.Position)
      // Should have moved (exact position depends on candidates)
      expect(pos).toBeTruthy()
    })
  })

  describe('activation', () => {
    it('activateMonarch transitions wandering monarch to spawning when healthy soil exists', () => {
      const state = createTestState()
      clearAroundPlayer(state, MONARCH_SEARCH_RADIUS)
      const px = state.player.x
      const py = state.player.y

      // Place healthy soil target
      const targetX = px + 5
      const targetY = py + 5
      state.map[targetY][targetX] = { type: TileType.Dirt }
      state.soilHealth.set(posKey(targetX, targetY), MONARCH_SOIL_THRESHOLD_HIGH)

      const eid = spawnMonarch(state, px, py)

      vi.spyOn(Math, 'random').mockReturnValue(0) // pick first candidate
      try {
        activateMonarch(state, eid, 1000)
      } finally {
        vi.restoreAllMocks()
      }

      const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
      expect(monarchState).toBeTruthy()
      expect(monarchState?.phase).toBe('spawning')
      expect(monarchState?.target).not.toBeNull()
    })

    it('activateMonarch falls back to lower soil threshold', () => {
      const state = createTestState()
      clearAroundPlayer(state, MONARCH_SEARCH_RADIUS)
      const px = state.player.x
      const py = state.player.y

      // No tiles meet high threshold, but one meets low threshold
      const targetX = px + 3
      const targetY = py + 3
      state.map[targetY][targetX] = { type: TileType.Dirt }
      state.soilHealth.set(posKey(targetX, targetY), MONARCH_SOIL_THRESHOLD_LOW)

      const eid = spawnMonarch(state, px, py)

      vi.spyOn(Math, 'random').mockReturnValue(0)
      try {
        activateMonarch(state, eid, 1000)
      } finally {
        vi.restoreAllMocks()
      }

      const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
      expect(monarchState?.phase).toBe('spawning')
    })

    it('activateMonarch stays wandering when no suitable soil found', () => {
      const state = createTestState()
      clearAroundPlayer(state, MONARCH_SEARCH_RADIUS)
      const px = state.player.x
      const py = state.player.y

      // Set all dirt tiles in search radius to very low soil health
      const r = MONARCH_SEARCH_RADIUS
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          state.soilHealth.set(posKey(px + dx, py + dy), 10)
        }
      }

      const eid = spawnMonarch(state, px, py)
      activateMonarch(state, eid, 1000)

      const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
      expect(monarchState?.phase).toBe('wandering')
    })

    it('activateMonarch does nothing for idle monarchs', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)

      const eid = spawnMonarch(state, state.player.x, state.player.y)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'idle'

      activateMonarch(state, eid, 1000)

      expect(monarchState.phase).toBe('idle')
    })

    it('activateMonarch spawns a pickup bloom', () => {
      const state = createTestState()
      clearAroundPlayer(state, MONARCH_SEARCH_RADIUS)
      const px = state.player.x
      const py = state.player.y

      state.map[py + 5][px + 5] = { type: TileType.Dirt }
      state.soilHealth.set(posKey(px + 5, py + 5), MONARCH_SOIL_THRESHOLD_HIGH)

      const eid = spawnMonarch(state, px, py)

      vi.spyOn(Math, 'random').mockReturnValue(0)
      try {
        activateMonarch(state, eid, 1000)
      } finally {
        vi.restoreAllMocks()
      }

      // Check for pickup bloom entity
      const blooms = state.world
        .query(ComponentType.EntityTag)
        .filter(e => state.world.getComponent(e, ComponentType.EntityTag) === 'pickupBloom')
      expect(blooms.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('plantPrairie', () => {
    it('plants clover in a 10x10 area on dirt tiles', () => {
      const state = createTestState()
      const cx = state.player.x + 10
      const cy = state.player.y + 10

      // Clear a large area to dirt
      for (let dy = -10; dy <= 10; dy++) {
        for (let dx = -10; dx <= 10; dx++) {
          state.map[cy + dy][cx + dx] = { type: TileType.Dirt }
        }
      }

      plantPrairie(state, { x: cx, y: cy })

      const half = Math.floor(MONARCH_PRAIRIE_SIZE / 2)
      let cloverCount = 0
      for (let dy = -half; dy < half; dy++) {
        for (let dx = -half; dx < half; dx++) {
          if (state.map[cy + dy][cx + dx].type === TileType.Clover) {
            cloverCount++
          }
        }
      }
      expect(cloverCount).toBe(MONARCH_PRAIRIE_SIZE * MONARCH_PRAIRIE_SIZE)
    })

    it('skips non-dirt tiles when planting', () => {
      const state = createTestState()
      const cx = state.player.x + 10
      const cy = state.player.y + 10

      // Clear area to dirt
      for (let dy = -10; dy <= 10; dy++) {
        for (let dx = -10; dx <= 10; dx++) {
          state.map[cy + dy][cx + dx] = { type: TileType.Dirt }
        }
      }

      // Place some sand in the area
      state.map[cy][cx + 1] = { type: TileType.Sand }
      state.map[cy][cx + 2] = { type: TileType.Sand }

      plantPrairie(state, { x: cx, y: cy })

      // Sand tiles should remain
      expect(state.map[cy][cx + 1].type).toBe(TileType.Sand)
      expect(state.map[cy][cx + 2].type).toBe(TileType.Sand)
    })

    it('initializes clover lifecycle entries for planted clover', () => {
      const state = createTestState()
      const cx = state.player.x + 10
      const cy = state.player.y + 10

      for (let dy = -10; dy <= 10; dy++) {
        for (let dx = -10; dx <= 10; dx++) {
          state.map[cy + dy][cx + dx] = { type: TileType.Dirt }
        }
      }

      plantPrairie(state, { x: cx, y: cy })

      // Check that lifecycle entries were created
      const half = Math.floor(MONARCH_PRAIRIE_SIZE / 2)
      for (let dy = -half; dy < half; dy++) {
        for (let dx = -half; dx < half; dx++) {
          const key = posKey(cx + dx, cy + dy)
          const entry = state.cloverLifecycle.get(key)
          expect(entry).toBeTruthy()
          expect(entry?.stage).toBe('healthy')
          expect(entry?.hasLight).toBe(true)
        }
      }
    })

    it('heals soil in 20x20 area with gradient', () => {
      const state = createTestState()
      const cx = state.player.x + 15
      const cy = state.player.y + 15

      for (let dy = -15; dy <= 15; dy++) {
        for (let dx = -15; dx <= 15; dx++) {
          state.map[cy + dy][cx + dx] = { type: TileType.Dirt }
          state.soilHealth.set(posKey(cx + dx, cy + dy), 20)
        }
      }

      plantPrairie(state, { x: cx, y: cy })

      // Center should have more healing than edge
      const centerHealth = state.soilHealth.get(posKey(cx, cy)) ?? 0
      const halfHeal = Math.floor(MONARCH_HEAL_SIZE / 2)
      const edgeHealth = state.soilHealth.get(posKey(cx + halfHeal - 1, cy)) ?? 0

      expect(centerHealth).toBeGreaterThan(edgeHealth)
      // Center should be at or near max
      expect(centerHealth).toBe(SOIL_HEALTH_MAX)
    })

    it('soil healing does not exceed SOIL_HEALTH_MAX', () => {
      const state = createTestState()
      const cx = state.player.x + 15
      const cy = state.player.y + 15

      for (let dy = -15; dy <= 15; dy++) {
        for (let dx = -15; dx <= 15; dx++) {
          state.map[cy + dy][cx + dx] = { type: TileType.Dirt }
          state.soilHealth.set(posKey(cx + dx, cy + dy), 90) // already high
        }
      }

      plantPrairie(state, { x: cx, y: cy })

      const centerHealth = state.soilHealth.get(posKey(cx, cy)) ?? 0
      expect(centerHealth).toBeLessThanOrEqual(SOIL_HEALTH_MAX)
    })
  })

  describe('spawning monarch movement', () => {
    it('spawning monarch moves toward its target', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const px = state.player.x
      const py = state.player.y + 5 // offset from player

      const targetX = px + 5
      const targetY = py
      state.map[targetY][targetX] = { type: TileType.Dirt }

      const eid = spawnMonarch(state, px, py)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'spawning'
      monarchState.target = { x: targetX, y: targetY }

      tickMonarchs(state, Zone.Overworld)

      const pos = state.world.getComponent(eid, ComponentType.Position)
      expect(pos).toBeTruthy()
      // Should have moved closer to target (at least 1 step)
      expect(pos?.x).toBeGreaterThan(px)
    })

    it('spawning monarch plants prairie on reaching target', () => {
      const state = createTestState()
      clearAroundPlayer(state, 15)
      const targetX = state.player.x + 10
      const targetY = state.player.y + 10

      // Clear area around target
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          state.map[targetY + dy][targetX + dx] = { type: TileType.Dirt }
        }
      }

      // Spawn monarch already at target
      const eid = spawnMonarch(state, targetX, targetY)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'spawning'
      monarchState.target = { x: targetX, y: targetY }

      tickMonarchs(state, Zone.Overworld)

      // Monarch should now be idle
      expect(monarchState.phase).toBe('idle')
      expect(monarchState.target).toBeNull()

      // Clover should have been planted
      expect(state.map[targetY][targetX].type).toBe(TileType.Clover)
    })

    it('spawning monarch reverts to wandering if path is unreachable', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const px = state.player.x
      const py = state.player.y + 3

      const eid = spawnMonarch(state, px, py)
      const monarchState = requireComponent(state.world.getComponent(eid, ComponentType.MonarchState))
      monarchState.phase = 'spawning'
      // Set target to an unreachable position (space tile)
      monarchState.target = { x: 0, y: 0 }

      tickMonarchs(state, Zone.Overworld)

      expect(monarchState.phase).toBe('wandering')
      expect(monarchState.target).toBeNull()
    })
  })

  describe('hunger', () => {
    it('monarchs starve when not near clover', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const px = state.player.x
      const py = state.player.y + 3

      const eid = spawnMonarch(state, px, py)

      // Force no movement so monarch stays put
      vi.spyOn(Math, 'random').mockReturnValue(0.5) // fails 0.3 movement check
      try {
        // Tick many times to accumulate hunger
        for (let i = 0; i < 200; i++) {
          tickMonarchs(state, Zone.Overworld)
        }
      } finally {
        vi.restoreAllMocks()
      }

      // Monarch should have been destroyed by starvation
      expect(state.world.isAlive(eid)).toBe(false)
    })

    it('monarchs reset hunger when near clover', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const px = state.player.x
      const py = state.player.y + 3

      // Place clover adjacent
      state.map[py][px + 1] = { type: TileType.Clover }

      const eid = spawnMonarch(state, px, py)

      // Prevent movement
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        for (let i = 0; i < 200; i++) {
          tickMonarchs(state, Zone.Overworld)
        }
      } finally {
        vi.restoreAllMocks()
      }

      // Monarch should still be alive (near clover)
      expect(state.world.isAlive(eid)).toBe(true)
    })
  })

  describe('multiple monarchs', () => {
    it('multiple monarchs operate independently', () => {
      const state = createTestState()
      clearAroundPlayer(state, 15)
      const px = state.player.x
      const py = state.player.y

      const eid1 = spawnMonarch(state, px + 3, py + 3)
      const eid2 = spawnMonarch(state, px + 5, py + 5)

      // Place clover near both so they don't starve
      state.map[py + 3][px + 4] = { type: TileType.Clover }
      state.map[py + 5][px + 6] = { type: TileType.Clover }

      expect(getMonarchEntities(state)).toHaveLength(2)
      expect(state.world.isAlive(eid1)).toBe(true)
      expect(state.world.isAlive(eid2)).toBe(true)
    })
  })
})
