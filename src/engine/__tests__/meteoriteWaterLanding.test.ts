import { findShowerTargets, tickShootingStars } from '../celestial'
import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { ComponentType } from '../ecs/types'
import { posKey } from '../position'
import { createGameState } from '../state'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

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
  state.world.addComponent(e, ComponentType.EntityZone, { zone: 'overworld' })
  return e
}

const getStarCount = (state: GameState): number => state.world.query(ComponentType.ShootingStarData).length

const getMeteoriteEntities = (state: GameState): Entity[] =>
  state.world
    .query(ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')

const getExplosionEntities = (state: GameState): Entity[] =>
  state.world
    .query(ComponentType.TimedEffect, ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'explosion')

const destroyAllStars = (state: GameState): void => {
  for (const eid of state.world.query(ComponentType.ShootingStarData)) {
    state.world.destroyEntity(eid)
  }
}

const destroyAllMeteorites = (state: GameState): void => {
  for (const eid of getMeteoriteEntities(state)) {
    state.world.destroyEntity(eid)
  }
}

describe('meteorite water landing', () => {
  describe('untargeted landing', () => {
    it('does not create meteorite entity when landing on a pond', () => {
      const state = createGameState('Test', 20, 20)
      destroyAllStars(state)
      destroyAllMeteorites(state)
      const targetX = Math.floor(MAP_WIDTH / 2)
      const targetY = Math.floor(MAP_HEIGHT / 2)
      state.map[targetY][targetX] = { type: TileType.Dirt }
      state.ponds.add(posKey(targetX, targetY))

      createStarEntity(state, {
        pos: { x: targetX - 1, y: targetY - 1 },
        dx: 1,
        dy: 1,
        willLand: true,
      })

      tickShootingStars(state, 1000)

      expect(getStarCount(state)).toBe(0)
      expect(getMeteoriteEntities(state)).toHaveLength(0)
    })

    it('does not create meteorite entity when landing on a river', () => {
      const state = createGameState('Test', 20, 20)
      destroyAllStars(state)
      destroyAllMeteorites(state)
      const targetX = Math.floor(MAP_WIDTH / 2)
      const targetY = Math.floor(MAP_HEIGHT / 2)
      state.map[targetY][targetX] = { type: TileType.Dirt }
      state.rivers.add(posKey(targetX, targetY))

      createStarEntity(state, {
        pos: { x: targetX - 1, y: targetY - 1 },
        dx: 1,
        dy: 1,
        willLand: true,
      })

      tickShootingStars(state, 1000)

      expect(getStarCount(state)).toBe(0)
      expect(getMeteoriteEntities(state)).toHaveLength(0)
    })

    it('still creates explosion effect when landing on water', () => {
      const state = createGameState('Test', 20, 20)
      destroyAllStars(state)
      destroyAllMeteorites(state)
      const targetX = Math.floor(MAP_WIDTH / 2)
      const targetY = Math.floor(MAP_HEIGHT / 2)
      state.map[targetY][targetX] = { type: TileType.Dirt }
      state.ponds.add(posKey(targetX, targetY))

      createStarEntity(state, {
        pos: { x: targetX - 1, y: targetY - 1 },
        dx: 1,
        dy: 1,
        willLand: true,
      })

      tickShootingStars(state, 1000)

      const explosions = getExplosionEntities(state)
      expect(explosions).toHaveLength(1)
      const pos = state.world.getComponent(explosions[0], ComponentType.Position)
      expect(pos?.x).toBe(targetX)
      expect(pos?.y).toBe(targetY)
    })

    it('creates meteorite on dry dirt (regression guard)', () => {
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

      tickShootingStars(state, 1000)

      expect(getMeteoriteEntities(state)).toHaveLength(1)
    })
  })

  describe('targeted landing', () => {
    it('does not create meteorite entity when target is on a pond', () => {
      const state = createGameState('Test', 20, 20)
      destroyAllStars(state)
      destroyAllMeteorites(state)
      const targetX = Math.floor(MAP_WIDTH / 2)
      const targetY = Math.floor(MAP_HEIGHT / 2)
      state.map[targetY][targetX] = { type: TileType.Dirt }
      state.ponds.add(posKey(targetX, targetY))

      createStarEntity(state, {
        pos: { x: targetX - 1, y: targetY - 1 },
        dx: 1,
        dy: 1,
        willLand: true,
        landingTarget: { x: targetX, y: targetY },
      })

      tickShootingStars(state, 1000)

      expect(getStarCount(state)).toBe(0)
      expect(getMeteoriteEntities(state)).toHaveLength(0)
    })

    it('still creates explosion when target is on water', () => {
      const state = createGameState('Test', 20, 20)
      destroyAllStars(state)
      destroyAllMeteorites(state)
      const targetX = Math.floor(MAP_WIDTH / 2)
      const targetY = Math.floor(MAP_HEIGHT / 2)
      state.map[targetY][targetX] = { type: TileType.Dirt }
      state.rivers.add(posKey(targetX, targetY))

      createStarEntity(state, {
        pos: { x: targetX - 1, y: targetY - 1 },
        dx: 1,
        dy: 1,
        willLand: true,
        landingTarget: { x: targetX, y: targetY },
      })

      tickShootingStars(state, 1000)

      const explosions = getExplosionEntities(state)
      expect(explosions).toHaveLength(1)
    })
  })

  describe('findShowerTargets', () => {
    it('excludes water tiles from targets', () => {
      const state = createGameState('Test', 20, 20)
      // Add water at several positions
      for (let x = 20; x < 40; x++) {
        for (let y = 20; y < 40; y++) {
          state.ponds.add(posKey(x, y))
        }
      }

      const targets = findShowerTargets(state, 10)

      for (const t of targets) {
        const key = posKey(t.x, t.y)
        expect(state.ponds.has(key)).toBe(false)
      }
    })
  })
})
