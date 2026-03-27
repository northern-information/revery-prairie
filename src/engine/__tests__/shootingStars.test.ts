import { spawnShootingStar, spawnShootingStarAtTarget, tickShootingStars } from '../celestial'
import { pickUpGroundItems } from '../entities'
import {
  EXPLOSION_DURATION_MS,
  MAP_HEIGHT,
  MAP_WIDTH,
  SHOOTING_STAR_MAX_ACTIVE,
  SHOOTING_STAR_MAX_AGE,
} from '../constants'
import { createGameState } from '../state'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

import type { GameState, ShootingStar } from '../types'

const makeStar = (overrides: Partial<ShootingStar> = {}): ShootingStar => ({
  pos: { x: 50, y: 50 },
  dx: 1,
  dy: 1,
  length: 4,
  age: 0,
  willLand: false,
  landingTarget: null,
  ...overrides,
})

const clearAroundPlayer = (state: GameState) => {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ny = state.player.y + dy
      const nx = state.player.x + dx
      if (ny >= 0 && ny < state.mapHeight && nx >= 0 && nx < state.mapWidth) {
        state.map[ny][nx] = { type: TileType.Dirt }
      }
    }
  }
}

describe('tickShootingStars', () => {
  it('advances position by (dx, dy) each tick', () => {
    const state = createGameState('Test', 20, 20)
    const star = makeStar({ pos: { x: 10, y: 10 }, dx: 1, dy: -1 })
    state.shootingStars.push(star)

    tickShootingStars(state, 1000)

    expect(star.pos.x).toBe(11)
    expect(star.pos.y).toBe(9)
  })

  it('increments age', () => {
    const state = createGameState('Test', 20, 20)
    const star = makeStar()
    state.shootingStars.push(star)

    tickShootingStars(state, 1000)

    expect(star.age).toBe(1)
  })

  it('removes stars that go off-map', () => {
    const state = createGameState('Test', 20, 20)
    state.shootingStars = [makeStar({ pos: { x: MAP_WIDTH + 10, y: 50 }, dx: 1, dy: 0, length: 3 })]

    tickShootingStars(state, 1000)

    expect(state.shootingStars).toHaveLength(0)
  })

  it('removes stars exceeding max age', () => {
    const state = createGameState('Test', 20, 20)
    state.shootingStars = [makeStar({ age: SHOOTING_STAR_MAX_AGE })]

    tickShootingStars(state, 1000)

    expect(state.shootingStars).toHaveLength(0)
  })

  it('converts willLand star to meteorite when it hits a walkable tile', () => {
    const state = createGameState('Test', 20, 20)
    state.meteorites = []
    const targetX = Math.floor(MAP_WIDTH / 2)
    const targetY = Math.floor(MAP_HEIGHT / 2)
    state.map[targetY][targetX] = { type: TileType.Dirt }

    state.shootingStars = [
      makeStar({
        pos: { x: targetX - 1, y: targetY - 1 },
        dx: 1,
        dy: 1,
        willLand: true,
      }),
    ]

    tickShootingStars(state, 5000)

    expect(state.shootingStars).toHaveLength(0)
    expect(state.meteorites).toHaveLength(1)
    expect(state.meteorites[0].pos.x).toBe(targetX)
    expect(state.meteorites[0].pos.y).toBe(targetY)
  })

  it('creates a LandingExplosion when a star lands', () => {
    const state = createGameState('Test', 20, 20)
    state.explosions = []
    const targetX = Math.floor(MAP_WIDTH / 2)
    const targetY = Math.floor(MAP_HEIGHT / 2)
    state.map[targetY][targetX] = { type: TileType.Dirt }

    state.shootingStars = [
      makeStar({
        pos: { x: targetX - 1, y: targetY - 1 },
        dx: 1,
        dy: 1,
        willLand: true,
      }),
    ]

    tickShootingStars(state, 5000)

    expect(state.explosions).toHaveLength(1)
    expect(state.explosions[0].pos.x).toBe(targetX)
    expect(state.explosions[0].pos.y).toBe(targetY)
    expect(state.explosions[0].startTime).toBe(5000)
  })

  it('cleans up expired explosions', () => {
    const state = createGameState('Test', 20, 20)
    state.explosions.push({ pos: { x: 50, y: 50 }, startTime: 1000 })

    tickShootingStars(state, 1000 + EXPLOSION_DURATION_MS + 1)

    expect(state.explosions).toHaveLength(0)
  })

  it('targeted star passes over walkable tiles until reaching its exact target', () => {
    const state = createGameState('Test', 20, 20)
    state.meteorites = []
    const targetX = Math.floor(MAP_WIDTH / 2)
    const targetY = Math.floor(MAP_HEIGHT / 2)

    // Ensure a strip of dirt from start to target
    for (let i = 0; i <= 5; i++) {
      state.map[targetY - 5 + i][targetX + 5 - i] = { type: TileType.Dirt }
    }

    // Star starts 5 tiles away, moving dx=-1 dy=1 toward target
    state.shootingStars = [
      makeStar({
        pos: { x: targetX + 5, y: targetY - 5 },
        dx: -1,
        dy: 1,
        willLand: true,
        landingTarget: { x: targetX, y: targetY },
      }),
    ]

    // Tick 4 times — star crosses walkable tiles but hasn't reached target
    for (let t = 0; t < 4; t++) {
      tickShootingStars(state, 1000 + t * 80)
    }
    expect(state.shootingStars).toHaveLength(1)
    expect(state.meteorites).toHaveLength(0)

    // One more tick — star reaches the target
    tickShootingStars(state, 1000 + 4 * 80)
    expect(state.shootingStars).toHaveLength(0)
    expect(state.meteorites).toHaveLength(1)
    expect(state.meteorites[0].pos.x).toBe(targetX)
    expect(state.meteorites[0].pos.y).toBe(targetY)
  })

  it('no-ops on empty array', () => {
    const state = createGameState('Test', 20, 20)
    state.shootingStars = []
    state.meteorites = []
    tickShootingStars(state, 1000)
    expect(state.shootingStars).toHaveLength(0)
    expect(state.meteorites).toHaveLength(0)
  })
})

describe('spawnShootingStar', () => {
  it('respects max active limit', () => {
    const state = createGameState('Test', 20, 20)
    state.shootingStars = []
    for (let i = 0; i < SHOOTING_STAR_MAX_ACTIVE; i++) {
      state.shootingStars.push(makeStar())
    }

    // Should not add more even if we call many times
    for (let i = 0; i < 100; i++) {
      spawnShootingStar(state)
    }

    expect(state.shootingStars.length).toBe(SHOOTING_STAR_MAX_ACTIVE)
  })

  it('spawned star has valid velocity (not 0,0)', () => {
    const state = createGameState('Test', 20, 20)
    // Spawn many to get at least one
    for (let i = 0; i < 1000; i++) {
      state.shootingStars = []
      spawnShootingStar(state)
      if (state.shootingStars.length > 0) {
        const star = state.shootingStars[0]
        expect(star.dx !== 0 || star.dy !== 0).toBe(true)
      }
    }
  })

  it('starts in space/off-edge area', () => {
    const state = createGameState('Test', 20, 20)
    for (let i = 0; i < 1000; i++) {
      state.shootingStars = []
      spawnShootingStar(state)
      if (state.shootingStars.length > 0) {
        const star = state.shootingStars[0]
        const onEdge =
          star.pos.x === 0 || star.pos.x === MAP_WIDTH - 1 || star.pos.y === 0 || star.pos.y === MAP_HEIGHT - 1
        expect(onEdge).toBe(true)
      }
    }
  })
})

describe('spawnShootingStarAtTarget', () => {
  it('sets landingTarget to the provided position', () => {
    const state = createGameState('Test', 20, 20)
    state.shootingStars = []
    const target = { x: 50, y: 50 }

    spawnShootingStarAtTarget(state, target)

    expect(state.shootingStars).toHaveLength(1)
    expect(state.shootingStars[0].landingTarget).toEqual(target)
    expect(state.shootingStars[0].willLand).toBe(true)
  })
})

describe('pickupMeteorite', () => {
  it('returns false (empty array) when no meteorite at player position', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    state.meteorites = [{ pos: { x: 0, y: 0 } }]

    const result = pickUpGroundItems(state)
    expect(result.pickedUp).not.toContain('meteorite')
    expect(state.meteorites).toHaveLength(1)
  })

  it('removes meteorite from array on pickup', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    state.meteorites = [{ pos: { x: state.player.x, y: state.player.y } }]

    const result = pickUpGroundItems(state)
    expect(result.pickedUp).toContain('meteorite')
    expect(state.meteorites).toHaveLength(0)
  })

  it('adds meteorite item to backpack', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    state.meteorites = [{ pos: { x: state.player.x, y: state.player.y } }]

    pickUpGroundItems(state)

    const hasMeteorite = state.backpack.items.some(item => item.definitionId === 'meteorite')
    expect(hasMeteorite).toBe(true)
  })
})
