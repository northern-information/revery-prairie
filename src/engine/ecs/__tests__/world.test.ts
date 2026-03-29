import { describe, expect, it } from 'vitest'

import { ComponentType } from '../types'
import { createWorld } from '../world'

describe('World', () => {
  it('creates entities with incrementing IDs', () => {
    const world = createWorld()
    const e1 = world.createEntity()
    const e2 = world.createEntity()
    expect(e2).toBe(e1 + 1)
  })

  it('tracks entity lifecycle with isAlive', () => {
    const world = createWorld()
    const e = world.createEntity()
    expect(world.isAlive(e)).toBe(true)
    world.destroyEntity(e)
    expect(world.isAlive(e)).toBe(false)
  })

  it('adds and gets components', () => {
    const world = createWorld()
    const e = world.createEntity()
    world.addComponent(e, ComponentType.Position, { x: 5, y: 10 })
    const pos = world.getComponent(e, ComponentType.Position)
    expect(pos).toEqual({ x: 5, y: 10 })
  })

  it('returns undefined for missing components', () => {
    const world = createWorld()
    const e = world.createEntity()
    expect(world.getComponent(e, ComponentType.Position)).toBeUndefined()
  })

  it('removes components', () => {
    const world = createWorld()
    const e = world.createEntity()
    world.addComponent(e, ComponentType.Position, { x: 0, y: 0 })
    world.removeComponent(e, ComponentType.Position)
    expect(world.getComponent(e, ComponentType.Position)).toBeUndefined()
    expect(world.hasComponent(e, ComponentType.Position)).toBe(false)
  })

  it('checks component presence with hasComponent', () => {
    const world = createWorld()
    const e = world.createEntity()
    expect(world.hasComponent(e, ComponentType.Position)).toBe(false)
    world.addComponent(e, ComponentType.Position, { x: 0, y: 0 })
    expect(world.hasComponent(e, ComponentType.Position)).toBe(true)
  })

  it('queries entities with all specified components', () => {
    const world = createWorld()
    const e1 = world.createEntity()
    world.addComponent(e1, ComponentType.Position, { x: 0, y: 0 })
    world.addComponent(e1, ComponentType.EntityTag, 'bee')

    const e2 = world.createEntity()
    world.addComponent(e2, ComponentType.Position, { x: 1, y: 1 })

    const e3 = world.createEntity()
    world.addComponent(e3, ComponentType.EntityTag, 'character')

    // Query for entities with both Position and EntityTag
    const result = world.query(ComponentType.Position, ComponentType.EntityTag)
    expect(result).toEqual([e1])
  })

  it('returns empty array when no entities match query', () => {
    const world = createWorld()
    const e = world.createEntity()
    world.addComponent(e, ComponentType.Position, { x: 0, y: 0 })
    const result = world.query(ComponentType.Velocity)
    expect(result).toEqual([])
  })

  it('auto-inserts into spatial index on Position add', () => {
    const world = createWorld()
    const e = world.createEntity()
    world.addComponent(e, ComponentType.Position, { x: 3, y: 7 })
    expect(world.spatial.at(3, 7)).toEqual([e])
  })

  it('auto-removes from spatial index on Position remove', () => {
    const world = createWorld()
    const e = world.createEntity()
    world.addComponent(e, ComponentType.Position, { x: 3, y: 7 })
    world.removeComponent(e, ComponentType.Position)
    expect(world.spatial.at(3, 7)).toEqual([])
  })

  it('updates spatial index on moveEntity', () => {
    const world = createWorld()
    const e = world.createEntity()
    world.addComponent(e, ComponentType.Position, { x: 0, y: 0 })
    world.moveEntity(e, 5, 10)
    expect(world.spatial.at(0, 0)).toEqual([])
    expect(world.spatial.at(5, 10)).toEqual([e])
    const pos = world.getComponent(e, ComponentType.Position)
    expect(pos).toEqual({ x: 5, y: 10 })
  })

  it('cleans up spatial index on destroyEntity', () => {
    const world = createWorld()
    const e = world.createEntity()
    world.addComponent(e, ComponentType.Position, { x: 2, y: 3 })
    world.destroyEntity(e)
    expect(world.spatial.at(2, 3)).toEqual([])
  })

  it('excludes destroyed entities from query results', () => {
    const world = createWorld()
    const e1 = world.createEntity()
    world.addComponent(e1, ComponentType.Position, { x: 0, y: 0 })
    const e2 = world.createEntity()
    world.addComponent(e2, ComponentType.Position, { x: 1, y: 1 })
    world.destroyEntity(e1)
    const result = world.query(ComponentType.Position)
    expect(result).toEqual([e2])
  })
})
