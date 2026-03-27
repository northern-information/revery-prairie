import { pickUpGroundItems, spawnChainMeteorites } from '../actions'
import { placeItem } from '../inventory'
import { TileType } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

describe('chain explosion', () => {
  describe('spawnChainMeteorites', () => {
    it('spawns up to 3 meteorites on nearby walkable tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const origin = { x: state.player.x, y: state.player.y }

      const spawned = spawnChainMeteorites(state, origin, 1000)

      expect(spawned).toBe(3)
      expect(state.meteorites).toHaveLength(3)
      expect(state.explosions).toHaveLength(3)
    })

    it('marks spawned meteorites with fromChain: true', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const origin = { x: state.player.x, y: state.player.y }

      spawnChainMeteorites(state, origin, 1000)

      for (const m of state.meteorites) {
        expect(m.fromChain).toBe(true)
      }
    })

    it('creates a LandingExplosion for each spawned meteorite', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const origin = { x: state.player.x, y: state.player.y }

      spawnChainMeteorites(state, origin, 5000)

      for (const explosion of state.explosions) {
        expect(explosion.startTime).toBe(5000)
      }
      // Each explosion position matches a meteorite position
      const meteoriteKeys = new Set(state.meteorites.map((m) => `${String(m.pos.x)},${String(m.pos.y)}`))
      for (const explosion of state.explosions) {
        expect(meteoriteKeys.has(`${String(explosion.pos.x)},${String(explosion.pos.y)}`)).toBe(true)
      }
    })

    it('spawns meteorites on distinct tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const origin = { x: state.player.x, y: state.player.y }

      spawnChainMeteorites(state, origin, 1000)

      const keys = state.meteorites.map((m) => `${String(m.pos.x)},${String(m.pos.y)}`)
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
      expect(state.meteorites[0].pos).toEqual({ x: px, y: py - 1 })
    })

    it('does not spawn on the player tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const origin = { x: state.player.x, y: state.player.y }

      spawnChainMeteorites(state, origin, 1000)

      for (const m of state.meteorites) {
        expect(m.pos.x === origin.x && m.pos.y === origin.y).toBe(false)
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

      state.meteorites.push({ pos: { x: px, y: py - 1 } })
      state.meteorites.push({ pos: { x: px + 1, y: py } })
      state.meteorites.push({ pos: { x: px - 1, y: py } })

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(1)
      expect(state.meteorites[state.meteorites.length - 1].pos).toEqual({ x: px, y: py + 1 })
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

      state.groundItems.push({ definitionId: 'clover', pos: { x: px, y: py - 1 } })

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(1)
      expect(state.meteorites[0].pos).toEqual({ x: px, y: py + 1 })
    })

    it('does not spawn on tiles occupied by ground omniboxes', () => {
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

      state.groundOmniboxes.push({ uid: 'test-uid', pos: { x: px, y: py - 1 } })

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(1)
      expect(state.meteorites[0].pos).toEqual({ x: px, y: py + 1 })
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

      state.characters.push({
        definitionId: 'test-char',
        pos: { x: px, y: py - 1 },
      })

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(1)
      expect(state.meteorites[0].pos).toEqual({ x: px, y: py + 1 })
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

      state.ghosts.push({ pos: { x: px, y: py - 1 }, number: 1 })

      const spawned = spawnChainMeteorites(state, { x: px, y: py }, 1000)

      expect(spawned).toBe(1)
      expect(state.meteorites[0].pos).toEqual({ x: px, y: py + 1 })
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
      expect(state.meteorites).toHaveLength(0)
      expect(state.explosions).toHaveLength(0)
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
      expect(state.meteorites).toHaveLength(2)
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

  describe('pickUpGroundItems chain explosion roll', () => {
    it('returns chainExplosions > 0 when roll succeeds', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      state.meteorites.push({ pos: { x: state.player.x, y: state.player.y } })

      // Force Math.random to always trigger (< 1/7)
      const orig = Math.random
      Math.random = () => 0.1
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.chainExplosions).toBe(3)
        // Exploded meteorite is consumed, not picked up
        expect(result.pickedUp).not.toContain('meteorite')
      } finally {
        Math.random = orig
      }
    })

    it('returns chainExplosions 0 when roll fails', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      state.meteorites.push({ pos: { x: state.player.x, y: state.player.y } })

      const orig = Math.random
      Math.random = () => 0.9
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.chainExplosions).toBe(0)
        expect(result.pickedUp).toContain('meteorite')
      } finally {
        Math.random = orig
      }
    })

    it('does not roll when time is undefined', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      state.meteorites.push({ pos: { x: state.player.x, y: state.player.y } })

      const orig = Math.random
      Math.random = () => 0.1
      try {
        const result = pickUpGroundItems(state)
        expect(result.chainExplosions).toBe(0)
      } finally {
        Math.random = orig
      }
    })

    it('still rolls when backpack is full', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      state.meteorites.push({ pos: { x: state.player.x, y: state.player.y } })

      // Fill backpack completely (4x6 = 24 slots, clover is 1x1)
      for (let y = 0; y < state.backpack.height; y++) {
        for (let x = 0; x < state.backpack.width; x++) {
          placeItem(state.backpack, 'clover', 0, x, y)
        }
      }

      const orig = Math.random
      Math.random = () => 0.1
      try {
        const result = pickUpGroundItems(state, 1000)
        // Meteorite not captured (consumed by explosion)
        expect(result.pickedUp).not.toContain('meteorite')
        // Chain explosion fires
        expect(result.chainExplosions).toBe(3)
        // Original meteorite consumed — only the 3 spawned ones remain
        expect(
          state.meteorites.filter((m) => m.pos.x === state.player.x && m.pos.y === state.player.y)
        ).toHaveLength(0)
      } finally {
        Math.random = orig
      }
    })

    it('rolls independently for multiple meteorites at same position', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      state.meteorites.push({ pos: { x: state.player.x, y: state.player.y } })
      state.meteorites.push({ pos: { x: state.player.x, y: state.player.y } })

      const orig = Math.random
      Math.random = () => 0.1
      try {
        const result = pickUpGroundItems(state, 1000)
        // Both rolled, both triggered — but second spawn has fewer open tiles
        expect(result.chainExplosions).toBeGreaterThan(3)
        // Both consumed by explosion, not picked up
        expect(result.pickedUp).not.toContain('meteorite')
      } finally {
        Math.random = orig
      }
    })

    it('does not roll chain explosion for fromChain meteorites', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      state.meteorites.push({ pos: { x: state.player.x, y: state.player.y }, fromChain: true })

      const orig = Math.random
      Math.random = () => 0.0 // would always trigger if checked
      try {
        const result = pickUpGroundItems(state, 1000)
        expect(result.chainExplosions).toBe(0)
        expect(result.pickedUp).toContain('meteorite')
      } finally {
        Math.random = orig
      }
    })

    it('returns chainExplosions 0 when no meteorites at player', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)

      const result = pickUpGroundItems(state, 1000)
      expect(result.chainExplosions).toBe(0)
    })
  })
})
