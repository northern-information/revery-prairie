import { countOverworldMeteorites, spawnShootingStar, spawnShootingStarAtTarget, tickShootingStars } from '../celestial'
import {
  EXPLOSION_DURATION_MS,
  MAP_HEIGHT,
  MAP_WIDTH,
  METEORITE_GROUND_MAX,
  SHOOTING_STAR_MAX_ACTIVE,
  SHOOTING_STAR_MAX_AGE,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { pickUpGroundItems } from '../entities'
import { createGameState } from '../state'
import { TileType, Zone } from '../types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Entity } from '../ecs/types'
import type { GameState, Position } from '../types'

const createStarEntity = (
  state: GameState,
  overrides: Partial<{
    pos: Position
    dx: number
    dy: number
    length: number
    age: number
    willLand: boolean
    landingTarget: Position | null
  }> = {}
): Entity => {
  const e = state.world.createEntity()
  const pos = overrides.pos ?? { x: 50, y: 50 }
  state.world.addComponent(e, ComponentType.Position, { x: pos.x, y: pos.y })
  state.world.addComponent(e, ComponentType.Velocity, {
    dx: overrides.dx ?? 1,
    dy: overrides.dy ?? 1,
  })
  state.world.addComponent(e, ComponentType.ShootingStarData, {
    length: overrides.length ?? 4,
    age: overrides.age ?? 0,
    willLand: overrides.willLand ?? false,
    landingTarget: overrides.landingTarget ?? null,
  })
  state.world.addComponent(e, ComponentType.EntityTag, 'shootingStar')
  return e
}

const getStarCount = (state: GameState): number => state.world.query(ComponentType.ShootingStarData).length

const destroyAllStars = (state: GameState): void => {
  for (const eid of state.world.query(ComponentType.ShootingStarData)) {
    state.world.destroyEntity(eid)
  }
}

const getMeteoriteEntities = (state: GameState): Entity[] =>
  state.world
    .query(ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')

const destroyAllMeteorites = (state: GameState): void => {
  for (const eid of getMeteoriteEntities(state)) {
    state.world.destroyEntity(eid)
  }
}

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

const createMeteoriteEntity = (state: GameState, x: number, y: number): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.Pickupable, { definitionId: 'meteorite' })
  state.world.addComponent(e, ComponentType.EntityTag, 'meteorite')
  return e
}

const createZonedMeteorite = (state: GameState, x: number, y: number, zone: Zone): Entity => {
  const e = createMeteoriteEntity(state, x, y)
  state.world.addComponent(e, ComponentType.EntityZone, { zone })
  return e
}

describe('tickShootingStars', () => {
  it('advances position by (dx, dy) each tick', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    const eid = createStarEntity(state, { pos: { x: 10, y: 10 }, dx: 1, dy: -1 })

    tickShootingStars(state, 1000)

    const pos = state.world.getComponent(eid, ComponentType.Position)
    expect(pos).toBeDefined()
    expect(pos?.x).toBe(11)
    expect(pos?.y).toBe(9)
  })

  it('increments age', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    const eid = createStarEntity(state)

    tickShootingStars(state, 1000)

    const data = state.world.getComponent(eid, ComponentType.ShootingStarData)
    expect(data).toBeDefined()
    expect(data?.age).toBe(1)
  })

  it('removes stars that go off-map', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    createStarEntity(state, { pos: { x: MAP_WIDTH + 10, y: 50 }, dx: 1, dy: 0, length: 3 })

    tickShootingStars(state, 1000)

    expect(getStarCount(state)).toBe(0)
  })

  it('removes stars exceeding max age', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    createStarEntity(state, { age: SHOOTING_STAR_MAX_AGE })

    tickShootingStars(state, 1000)

    expect(getStarCount(state)).toBe(0)
  })

  it('converts willLand star to meteorite when it hits a walkable tile', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    destroyAllMeteorites(state)
    const targetX = Math.floor(MAP_WIDTH / 2)
    const targetY = Math.floor(MAP_HEIGHT / 2)
    state.map[targetY][targetX] = { type: TileType.Dirt }

    createStarEntity(state, {
      pos: { x: targetX - 1, y: targetY - 1 },
      dx: 1,
      dy: 1,
      willLand: true,
    })

    tickShootingStars(state, 5000)

    expect(getStarCount(state)).toBe(0)
    const meteorites = getMeteoriteEntities(state)
    expect(meteorites).toHaveLength(1)
    const pos = state.world.getComponent(meteorites[0], ComponentType.Position)
    expect(pos?.x).toBe(targetX)
    expect(pos?.y).toBe(targetY)
  })

  it('creates a LandingExplosion when a star lands', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    const targetX = Math.floor(MAP_WIDTH / 2)
    const targetY = Math.floor(MAP_HEIGHT / 2)
    state.map[targetY][targetX] = { type: TileType.Dirt }

    createStarEntity(state, {
      pos: { x: targetX - 1, y: targetY - 1 },
      dx: 1,
      dy: 1,
      willLand: true,
    })

    tickShootingStars(state, 5000)

    const explosions = state.world
      .query(ComponentType.TimedEffect, ComponentType.EntityTag)
      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'explosion')
    expect(explosions).toHaveLength(1)
    const pos = state.world.getComponent(explosions[0], ComponentType.Position)
    const effect = state.world.getComponent(explosions[0], ComponentType.TimedEffect)
    expect(pos?.x).toBe(targetX)
    expect(pos?.y).toBe(targetY)
    expect(effect?.startTime).toBe(5000)
  })

  it('cleans up expired explosions', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: 50, y: 50 })
    state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'explosion', startTime: 1000 })
    state.world.addComponent(e, ComponentType.EntityTag, 'explosion')

    tickShootingStars(state, 1000 + EXPLOSION_DURATION_MS + 1)

    const explosions = state.world
      .query(ComponentType.TimedEffect, ComponentType.EntityTag)
      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'explosion')
    expect(explosions).toHaveLength(0)
  })

  it('targeted star passes over walkable tiles until reaching its exact target', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    destroyAllMeteorites(state)
    const targetX = Math.floor(MAP_WIDTH / 2)
    const targetY = Math.floor(MAP_HEIGHT / 2)

    // Ensure a strip of dirt from start to target
    for (let i = 0; i <= 5; i++) {
      state.map[targetY - 5 + i][targetX + 5 - i] = { type: TileType.Dirt }
    }

    // Star starts 5 tiles away, moving dx=-1 dy=1 toward target
    createStarEntity(state, {
      pos: { x: targetX + 5, y: targetY - 5 },
      dx: -1,
      dy: 1,
      willLand: true,
      landingTarget: { x: targetX, y: targetY },
    })

    // Tick 4 times — star crosses walkable tiles but hasn't reached target
    for (let t = 0; t < 4; t++) {
      tickShootingStars(state, 1000 + t * 80)
    }
    expect(getStarCount(state)).toBe(1)
    expect(getMeteoriteEntities(state)).toHaveLength(0)

    // One more tick — star reaches the target
    tickShootingStars(state, 1000 + 4 * 80)
    expect(getStarCount(state)).toBe(0)
    const meteorites = getMeteoriteEntities(state)
    expect(meteorites).toHaveLength(1)
    const pos = state.world.getComponent(meteorites[0], ComponentType.Position)
    expect(pos?.x).toBe(targetX)
    expect(pos?.y).toBe(targetY)
  })

  it('no-ops on empty world', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    destroyAllMeteorites(state)
    tickShootingStars(state, 1000)
    expect(getStarCount(state)).toBe(0)
    expect(getMeteoriteEntities(state)).toHaveLength(0)
  })
})

describe('spawnShootingStar', () => {
  it('respects max active limit', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    for (let i = 0; i < SHOOTING_STAR_MAX_ACTIVE; i++) {
      createStarEntity(state)
    }

    // Should not add more even if we call many times
    for (let i = 0; i < 100; i++) {
      spawnShootingStar(state)
    }

    expect(getStarCount(state)).toBe(SHOOTING_STAR_MAX_ACTIVE)
  })

  it('spawned star has valid velocity (not 0,0)', () => {
    const state = createGameState('Test', 20, 20)
    // Spawn many to get at least one
    for (let i = 0; i < 1000; i++) {
      destroyAllStars(state)
      spawnShootingStar(state)
      const stars = state.world.query(ComponentType.ShootingStarData)
      if (stars.length > 0) {
        const vel = state.world.getComponent(stars[0], ComponentType.Velocity)
        expect(vel).toBeDefined()
        expect(vel?.dx !== 0 || vel?.dy !== 0).toBe(true)
      }
    }
  })

  it('starts in space/off-edge area', () => {
    const state = createGameState('Test', 20, 20)
    for (let i = 0; i < 1000; i++) {
      destroyAllStars(state)
      spawnShootingStar(state)
      const stars = state.world.query(ComponentType.ShootingStarData)
      if (stars.length > 0) {
        const pos = state.world.getComponent(stars[0], ComponentType.Position)
        expect(pos).toBeDefined()
        if (pos) {
          const onEdge = pos.x === 0 || pos.x === MAP_WIDTH - 1 || pos.y === 0 || pos.y === MAP_HEIGHT - 1
          expect(onEdge).toBe(true)
        }
      }
    }
  })
})

describe('meteorite ground cap', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('countOverworldMeteorites counts only overworld-zoned meteorite entities', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllMeteorites(state)
    createZonedMeteorite(state, 5, 5, Zone.Overworld)
    createZonedMeteorite(state, 6, 5, Zone.Overworld)
    createZonedMeteorite(state, 7, 5, Zone.Cave)

    expect(countOverworldMeteorites(state)).toBe(2)
  })

  it('spawnShootingStar returns early when at or above METEORITE_GROUND_MAX', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    destroyAllMeteorites(state)
    vi.spyOn(Math, 'random').mockReturnValue(0) // force SPAWN_CHANCE check to pass
    for (let i = 0; i < METEORITE_GROUND_MAX; i++) {
      createZonedMeteorite(state, i % state.mapWidth, Math.floor(i / state.mapWidth), Zone.Overworld)
    }

    for (let i = 0; i < 50; i++) spawnShootingStar(state)

    expect(getStarCount(state)).toBe(0)
  })

  it('resumes spawning after a meteorite is removed from the ground', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    destroyAllMeteorites(state)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const meteorites: Entity[] = []
    for (let i = 0; i < METEORITE_GROUND_MAX; i++) {
      meteorites.push(createZonedMeteorite(state, i % state.mapWidth, Math.floor(i / state.mapWidth), Zone.Overworld))
    }
    spawnShootingStar(state)
    expect(getStarCount(state)).toBe(0)

    state.world.destroyEntity(meteorites[0])
    spawnShootingStar(state)

    expect(getStarCount(state)).toBe(1)
  })

  it('cave-zoned meteorites do not count toward the cap', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    destroyAllMeteorites(state)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    for (let i = 0; i < METEORITE_GROUND_MAX + 5; i++) {
      createZonedMeteorite(state, i % state.mapWidth, Math.floor(i / state.mapWidth), Zone.Cave)
    }

    spawnShootingStar(state)

    expect(getStarCount(state)).toBe(1)
  })

  it('spawnShootingStarAtTarget bypasses the cap (meteor shower continues)', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    destroyAllMeteorites(state)
    for (let i = 0; i < METEORITE_GROUND_MAX; i++) {
      createZonedMeteorite(state, i % state.mapWidth, Math.floor(i / state.mapWidth), Zone.Overworld)
    }

    spawnShootingStarAtTarget(state, { x: 10, y: 10 })

    expect(getStarCount(state)).toBe(1)
  })
})

describe('spawnShootingStarAtTarget', () => {
  it('sets landingTarget to the provided position', () => {
    const state = createGameState('Test', 20, 20)
    destroyAllStars(state)
    const target = { x: 50, y: 50 }

    spawnShootingStarAtTarget(state, target)

    const stars = state.world.query(ComponentType.ShootingStarData)
    expect(stars).toHaveLength(1)
    const data = state.world.getComponent(stars[0], ComponentType.ShootingStarData)
    expect(data).toBeDefined()
    expect(data?.landingTarget).toEqual(target)
    expect(data?.willLand).toBe(true)
  })
})

describe('pickupMeteorite', () => {
  it('returns false (empty array) when no meteorite at player position', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    createMeteoriteEntity(state, 0, 0)

    const result = pickUpGroundItems(state)
    expect(result.pickedUp).not.toContain('meteorite')
    expect(getMeteoriteEntities(state)).toHaveLength(1)
  })

  it('removes meteorite from world on pickup', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    createMeteoriteEntity(state, state.player.x, state.player.y)

    const result = pickUpGroundItems(state)
    expect(result.pickedUp).toContain('meteorite')
    expect(getMeteoriteEntities(state)).toHaveLength(0)
  })

  it('adds meteorite item to backpack', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    createMeteoriteEntity(state, state.player.x, state.player.y)

    pickUpGroundItems(state)

    const hasMeteorite = state.backpack.items.some(item => item.definitionId === 'meteorite')
    expect(hasMeteorite).toBe(true)
  })
})
