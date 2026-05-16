import { vi } from 'vitest'
import { spawnChainMeteorites } from '../celestial'
import { ComponentType } from '../ecs/types'
import { pickUpGroundItems } from '../entities'
import { placeItem } from '../inventory'
import { TileType } from '../types'
import {
  clearAroundPlayer,
  createCharacterTestEntity,
  createGroundItemEntity,
  createMeteoriteEntity,
  createTestState,
  getMeteoriteEntities,
} from './helpers'

describe('unstable meteorite', () => {
  describe('spawnChainMeteorites', () => {
    it('spawns up to 3 meteorites on nearby walkable tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const origin = { x: state.player.x, y: state.player.y }

      const spawned = spawnChainMeteorites(state, origin, 1000)

      expect(spawned).toBe(3)
      expect(getMeteoriteEntities(state)).toHaveLength(3)
      const explosions = state.world
        .query(ComponentType.TimedEffect, ComponentType.EntityTag)
        .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'explosion')
      expect(explosions).toHaveLength(3)
    })

    it('marks spawned meteorites with fromChain: true', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const origin = { x: state.player.x, y: state.player.y }

      spawnChainMeteorites(state, origin, 1000)

      for (const eid of getMeteoriteEntities(state)) {
        const chain = state.world.getComponent(eid, ComponentType.ChainSource)
        expect(chain?.fromChain).toBe(true)
      }
    })

    it('creates a LandingExplosion for each spawned meteorite', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const origin = { x: state.player.x, y: state.player.y }

      spawnChainMeteorites(state, origin, 5000)

      const explosionEids = state.world
        .query(ComponentType.TimedEffect, ComponentType.EntityTag)
        .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'explosion')
      for (const eid of explosionEids) {
        const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
        expect(effect?.startTime).toBe(5000)
      }
      // Each explosion position matches a meteorite position
      const meteoriteKeys = new Set(
        getMeteoriteEntities(state).map(eid => {
          const pos = state.world.getComponent(eid, ComponentType.Position)
          return `${String(pos?.x)},${String(pos?.y)}`
        })
      )
      for (const eid of explosionEids) {
        const pos = state.world.getComponent(eid, ComponentType.Position)
        expect(pos).toBeDefined()
        if (pos) {
          expect(meteoriteKeys.has(`${String(pos.x)},${String(pos.y)}`)).toBe(true)
        }
      }
    })

    it('spawns meteorites on distinct tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const origin = { x: state.player.x, y: state.player.y }

      spawnChainMeteorites(state, origin, 1000)

      const keys = getMeteoriteEntities(state).map(eid => {
        const pos = state.world.getComponent(eid, ComponentType.Position)
        return `${String(pos?.x)},${String(pos?.y)}`
      })
      expect(new Set(keys).size).toBe(keys.length)
    })

    it('does not spawn on non-walkable tiles', () => {
      const state = createTestState()
      const px = state.player.x
      const py = state.player.y

      // Surround player with space except one dirt tile
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue
          state.map[py + dy][px + dx] = { type: TileType.Space }
        }
      }
      state.map[py - 1][px] = { type: TileType.Dirt }

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(1)
      const meteorites = getMeteoriteEntities(state)
      expect(meteorites).toHaveLength(1)
      const pos = state.world.getComponent(meteorites[0], ComponentType.Position)
      expect(pos).toEqual({ x: px, y: py - 1 })
    })

    it('does not spawn on the player tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const origin = { x: state.player.x, y: state.player.y }

      spawnChainMeteorites(state, origin, 1000)

      for (const eid of getMeteoriteEntities(state)) {
        const pos = state.world.getComponent(eid, ComponentType.Position)
        expect(pos?.x === origin.x && pos?.y === origin.y).toBe(false)
      }
    })

    it('does not spawn on tiles occupied by existing meteorites', () => {
      const state = createTestState()
      const px = state.player.x
      const py = state.player.y

      // Only 4 dirt tiles in radius, 3 already have meteorites
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue
          state.map[py + dy][px + dx] = { type: TileType.Space }
        }
      }
      state.map[py - 1][px] = { type: TileType.Dirt }
      state.map[py + 1][px] = { type: TileType.Dirt }
      state.map[py][px + 1] = { type: TileType.Dirt }
      state.map[py][px - 1] = { type: TileType.Dirt }

      createMeteoriteEntity(state, px, py - 1)
      createMeteoriteEntity(state, px + 1, py)
      createMeteoriteEntity(state, px - 1, py)

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(1)
      // The newly spawned meteorite should be at the only remaining open tile
      const allMeteors = getMeteoriteEntities(state)
      const lastPos = state.world.getComponent(allMeteors[allMeteors.length - 1], ComponentType.Position)
      expect(lastPos).toEqual({ x: px, y: py + 1 })
    })

    it('does not spawn on tiles occupied by ground items', () => {
      const state = createTestState()
      const px = state.player.x
      const py = state.player.y

      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue
          state.map[py + dy][px + dx] = { type: TileType.Space }
        }
      }
      state.map[py - 1][px] = { type: TileType.Dirt }
      state.map[py + 1][px] = { type: TileType.Dirt }

      createGroundItemEntity(state, 'clover', px, py - 1)

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(1)
      const meteorites = getMeteoriteEntities(state)
      const pos = state.world.getComponent(meteorites[0], ComponentType.Position)
      expect(pos).toEqual({ x: px, y: py + 1 })
    })

    it('does not spawn on tiles occupied by characters', () => {
      const state = createTestState()
      const px = state.player.x
      const py = state.player.y

      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue
          state.map[py + dy][px + dx] = { type: TileType.Space }
        }
      }
      state.map[py - 1][px] = { type: TileType.Dirt }
      state.map[py + 1][px] = { type: TileType.Dirt }

      createCharacterTestEntity(state, 'test-char', px, py - 1)

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(1)
      const meteorites = getMeteoriteEntities(state)
      const pos = state.world.getComponent(meteorites[0], ComponentType.Position)
      expect(pos).toEqual({ x: px, y: py + 1 })
    })

    it('does not spawn on tiles occupied by ghosts', () => {
      const state = createTestState()
      const px = state.player.x
      const py = state.player.y

      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue
          state.map[py + dy][px + dx] = { type: TileType.Space }
        }
      }
      state.map[py - 1][px] = { type: TileType.Dirt }
      state.map[py + 1][px] = { type: TileType.Dirt }

      createCharacterTestEntity(state, 'ghost-99', px, py - 1, {
        behavior: { type: 'drift', moveChance: 0.15, freezeOnDialog: true },
      })

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(1)
      const meteorites = getMeteoriteEntities(state)
      const pos = state.world.getComponent(meteorites[0], ComponentType.Position)
      expect(pos).toEqual({ x: px, y: py + 1 })
    })

    it('returns 0 when no valid tiles exist', () => {
      const state = createTestState()
      const px = state.player.x
      const py = state.player.y

      // Surround with space
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue
          state.map[py + dy][px + dx] = { type: TileType.Space }
        }
      }

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(0)
      expect(getMeteoriteEntities(state)).toHaveLength(0)
      const explosions = state.world
        .query(ComponentType.TimedEffect, ComponentType.EntityTag)
        .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'explosion')
      expect(explosions).toHaveLength(0)
    })

    it('spawns fewer than 3 when only 1-2 valid tiles', () => {
      const state = createTestState()
      const px = state.player.x
      const py = state.player.y

      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue
          state.map[py + dy][px + dx] = { type: TileType.Space }
        }
      }
      state.map[py - 1][px] = { type: TileType.Dirt }
      state.map[py + 1][px] = { type: TileType.Dirt }

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(2)
      expect(getMeteoriteEntities(state)).toHaveLength(2)
    })

    it('works in cave zone with caveFloor tiles', () => {
      const state = createTestState()
      const px = state.player.x
      const py = state.player.y

      // Set all to cave wall, then open some floor
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          state.map[py + dy][px + dx] = { type: TileType.CaveWall }
        }
      }
      state.map[py][px] = { type: TileType.CaveFloor }
      state.map[py - 1][px] = { type: TileType.CaveFloor }
      state.map[py + 1][px] = { type: TileType.CaveFloor }
      state.map[py][px + 1] = { type: TileType.CaveFloor }

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(3)
    })
  })

  describe('pickUpGroundItems unstable meteorite roll', () => {
    it('returns chainExplosions > 0 when roll succeeds', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      createMeteoriteEntity(state, state.player.x, state.player.y)

      // Force Math.random to always trigger (< 1/7)
      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.chainExplosions).toBe(3)
        // Exploded meteorite is consumed, not picked up
        expect(result.pickedUp).not.toContain('meteorite')
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('returns chainExplosions 0 when roll fails', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      createMeteoriteEntity(state, state.player.x, state.player.y)

      vi.spyOn(Math, 'random').mockReturnValue(0.9)
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.chainExplosions).toBe(0)
        expect(result.pickedUp).toContain('meteorite')
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('does not roll when time is undefined', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      createMeteoriteEntity(state, state.player.x, state.player.y)

      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      try {
        const result = pickUpGroundItems(state)
        expect(result.chainExplosions).toBe(0)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('still rolls when backpack is full', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      createMeteoriteEntity(state, state.player.x, state.player.y)

      // Fill backpack completely (4x6 = 24 slots, clover is 1x1)
      for (let y = 0; y < state.backpack.height; y++) {
        for (let x = 0; x < state.backpack.width; x++) {
          placeItem(state.backpack, 'clover', x, y)
        }
      }

      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      try {
        const result = pickUpGroundItems(state, 1000)
        // Meteorite not captured (consumed by explosion)
        expect(result.pickedUp).not.toContain('meteorite')
        // Chain explosion fires
        expect(result.chainExplosions).toBe(3)
        // Original meteorite consumed — no meteorites at player position
        const meteoritesAtPlayer = state.world.spatial
          .at(state.player.x, state.player.y)
          .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')
        expect(meteoritesAtPlayer).toHaveLength(0)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('rolls independently for multiple meteorites at same position', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      createMeteoriteEntity(state, state.player.x, state.player.y)
      createMeteoriteEntity(state, state.player.x, state.player.y)

      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      try {
        const result = pickUpGroundItems(state, 1000)
        // Both rolled, both triggered — but second spawn has fewer open tiles
        expect(result.chainExplosions).toBeGreaterThan(3)
        // Both consumed by explosion, not picked up
        expect(result.pickedUp).not.toContain('meteorite')
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('does not roll chain explosion for fromChain meteorites', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      createMeteoriteEntity(state, state.player.x, state.player.y, true)

      vi.spyOn(Math, 'random').mockReturnValue(0.0) // would always trigger if checked
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.chainExplosions).toBe(0)
        expect(result.pickedUp).toContain('meteorite')
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('returns chainExplosions 0 when no meteorites at player', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)

      const result = pickUpGroundItems(state, 1000)
      expect(result.chainExplosions).toBe(0)
    })

    it('rolls chain explosion for meteorite within 3x3 of player', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      // Meteorite one tile NE of player — not on player tile
      const mx = state.player.x + 1
      const my = state.player.y - 1
      createMeteoriteEntity(state, mx, my)

      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.chainExplosions).toBe(3)
        expect(result.pickedUp).not.toContain('meteorite')
        // Original meteorite consumed
        const remaining = state.world.spatial
          .at(mx, my)
          .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')
        expect(remaining).toHaveLength(0)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('centers chain explosion on the meteorite tile, not the player tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const mx = state.player.x + 1
      const my = state.player.y - 1
      createMeteoriteEntity(state, mx, my)

      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      try {
        pickUpGroundItems(state, 1000)
        // Spawned chain meteorites should be within CHAIN_EXPLOSION_RADIUS (3)
        // of (mx, my), and never on the meteorite's own tile.
        const spawned = getMeteoriteEntities(state)
        expect(spawned.length).toBeGreaterThan(0)
        // At least one chain meteorite should land outside the player's 3x3
        // pickup footprint — proving the chain centered on (mx, my), not (px, py).
        let outsidePlayer3x3 = 0
        for (const eid of spawned) {
          const pos = state.world.getComponent(eid, ComponentType.Position)
          expect(pos).toBeDefined()
          if (!pos) continue
          // Within Chebyshev distance 3 of the source meteorite tile
          expect(Math.abs(pos.x - mx)).toBeLessThanOrEqual(3)
          expect(Math.abs(pos.y - my)).toBeLessThanOrEqual(3)
          // Not on the source meteorite tile itself
          expect(pos.x === mx && pos.y === my).toBe(false)
          // Count spawns outside the player's 3x3 pickup footprint
          if (Math.abs(pos.x - state.player.x) > 1 || Math.abs(pos.y - state.player.y) > 1) {
            outsidePlayer3x3++
          }
        }
        // If chain centered on the player instead of the meteorite, spawns
        // would all be within Chebyshev radius 3 of (px, py), but some would
        // still land outside the 3x3 since CHAIN_EXPLOSION_RADIUS > 1. The
        // stronger signal: at least one spawn lands at a tile that is within
        // radius 3 of (mx, my) but more than radius 3 from (px, py) is
        // impossible since (mx, my) is 1 tile from (px, py). Instead assert
        // the reverse: chain centered on meteorite tile means at least one
        // spawn lands at a tile farther from player than from meteorite.
        const fartherFromPlayer = spawned.some(eid => {
          const pos = state.world.getComponent(eid, ComponentType.Position)
          if (!pos) return false
          const distPlayer = Math.max(Math.abs(pos.x - state.player.x), Math.abs(pos.y - state.player.y))
          const distMeteor = Math.max(Math.abs(pos.x - mx), Math.abs(pos.y - my))
          return distPlayer > distMeteor
        })
        expect(fartherFromPlayer).toBe(true)
        expect(outsidePlayer3x3).toBeGreaterThan(0)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('does not roll chain explosion when forced random is above threshold (3x3 footprint)', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      // Two adjacent meteorites — both eligible under 3x3
      createMeteoriteEntity(state, state.player.x + 1, state.player.y)
      createMeteoriteEntity(state, state.player.x - 1, state.player.y)

      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.chainExplosions).toBe(0)
        expect(result.disintegrations).toBe(0)
        // Both should be picked up since neither chained
        expect(result.pickedUp.filter(id => id === 'meteorite')).toHaveLength(2)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('returns disintegrations 1 when unstable triggers and sub-roll picks disintegrate', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      createMeteoriteEntity(state, state.player.x, state.player.y)

      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.05) // first roll: < 1/7, unstable triggers
        .mockReturnValueOnce(0.75) // sub-roll: >= 0.5, disintegrate
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.chainExplosions).toBe(0)
        expect(result.disintegrations).toBe(1)
        expect(result.pickedUp).not.toContain('meteorite')
        // Original meteorite consumed, no chain meteorites spawned
        expect(getMeteoriteEntities(state)).toHaveLength(0)
        // No explosion entities either
        const explosions = state.world
          .query(ComponentType.TimedEffect, ComponentType.EntityTag)
          .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'explosion')
        expect(explosions).toHaveLength(0)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('disintegrate outcome consumes meteorite even when backpack is full', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      createMeteoriteEntity(state, state.player.x, state.player.y)

      for (let y = 0; y < state.backpack.height; y++) {
        for (let x = 0; x < state.backpack.width; x++) {
          placeItem(state.backpack, 'clover', x, y)
        }
      }

      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.05) // unstable triggers
        .mockReturnValueOnce(0.9) // disintegrate
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.disintegrations).toBe(1)
        expect(result.chainExplosions).toBe(0)
        expect(result.pickedUp).not.toContain('meteorite')
        const meteoritesAtPlayer = state.world.spatial
          .at(state.player.x, state.player.y)
          .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')
        expect(meteoritesAtPlayer).toHaveLength(0)
      } finally {
        vi.restoreAllMocks()
      }
    })

    it('does not roll sub-roll for fromChain meteorites (no disintegrate either)', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      createMeteoriteEntity(state, state.player.x, state.player.y, true)

      vi.spyOn(Math, 'random').mockReturnValue(0.0)
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.chainExplosions).toBe(0)
        expect(result.disintegrations).toBe(0)
        expect(result.pickedUp).toContain('meteorite')
      } finally {
        vi.restoreAllMocks()
      }
    })
  })
})
