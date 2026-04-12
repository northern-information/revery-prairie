import { describe, expect, it } from 'vitest'

import { ComponentType } from '../ecs/types'
import { tickCreatureHunger } from '../hunger'
import { createTestState } from './helpers'

import type { GameState, Position } from '../types'

const alwaysFed = (_state: GameState, _pos: Position) => true
const neverFed = (_state: GameState, _pos: Position) => false

describe('creature hunger', () => {
  it('resets hunger when near food', () => {
    const state = createTestState()
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: 5, y: 5 })
    state.world.addComponent(eid, ComponentType.EntityTag, 'bee')
    state.world.addComponent(eid, ComponentType.HungerTimer, { hungerMs: 5000 })

    const deaths = tickCreatureHunger(state, 'bee', 30000, 200, alwaysFed)

    const hunger = state.world.getComponent(eid, ComponentType.HungerTimer)
    expect(hunger?.hungerMs).toBe(0)
    expect(state.world.isAlive(eid)).toBe(true)
    expect(deaths).toHaveLength(0)
  })

  it('increments hunger when not near food', () => {
    const state = createTestState()
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: 5, y: 5 })
    state.world.addComponent(eid, ComponentType.EntityTag, 'bee')
    state.world.addComponent(eid, ComponentType.HungerTimer, { hungerMs: 0 })

    const deaths = tickCreatureHunger(state, 'bee', 30000, 200, neverFed)

    const hunger = state.world.getComponent(eid, ComponentType.HungerTimer)
    expect(hunger?.hungerMs).toBe(200)
    expect(state.world.isAlive(eid)).toBe(true)
    expect(deaths).toHaveLength(0)
  })

  it('destroys entity at starvation threshold', () => {
    const state = createTestState()
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: 5, y: 5 })
    state.world.addComponent(eid, ComponentType.EntityTag, 'bee')
    state.world.addComponent(eid, ComponentType.HungerTimer, { hungerMs: 29800 })

    const deaths = tickCreatureHunger(state, 'bee', 30000, 200, neverFed)

    expect(state.world.isAlive(eid)).toBe(false)
    expect(deaths).toHaveLength(1)
    expect(deaths[0]).toEqual({ x: 5, y: 5 })
  })

  it('returns empty array when no deaths', () => {
    const state = createTestState()
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: 5, y: 5 })
    state.world.addComponent(eid, ComponentType.EntityTag, 'bee')
    state.world.addComponent(eid, ComponentType.HungerTimer, { hungerMs: 0 })

    const deaths = tickCreatureHunger(state, 'bee', 30000, 200, alwaysFed)

    expect(deaths).toEqual([])
  })

  it('skips entities without HungerTimer', () => {
    const state = createTestState()
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: 5, y: 5 })
    state.world.addComponent(eid, ComponentType.EntityTag, 'bee')

    const deaths = tickCreatureHunger(state, 'bee', 30000, 200, neverFed)

    expect(state.world.isAlive(eid)).toBe(true)
    expect(deaths).toHaveLength(0)
  })

  it('skips entities with different tag', () => {
    const state = createTestState()
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: 5, y: 5 })
    state.world.addComponent(eid, ComponentType.EntityTag, 'ghost')
    state.world.addComponent(eid, ComponentType.HungerTimer, { hungerMs: 10000 })

    const deaths = tickCreatureHunger(state, 'bee', 30000, 200, neverFed)

    const hunger = state.world.getComponent(eid, ComponentType.HungerTimer)
    expect(hunger?.hungerMs).toBe(10000)
    expect(state.world.isAlive(eid)).toBe(true)
    expect(deaths).toHaveLength(0)
  })

  it('multiple entities tracked independently', () => {
    const state = createTestState()

    const fedBee = state.world.createEntity()
    state.world.addComponent(fedBee, ComponentType.Position, { x: 5, y: 5 })
    state.world.addComponent(fedBee, ComponentType.EntityTag, 'bee')
    state.world.addComponent(fedBee, ComponentType.HungerTimer, { hungerMs: 1000 })

    const hungryBee = state.world.createEntity()
    state.world.addComponent(hungryBee, ComponentType.Position, { x: 10, y: 10 })
    state.world.addComponent(hungryBee, ComponentType.EntityTag, 'bee')
    state.world.addComponent(hungryBee, ComponentType.HungerTimer, { hungerMs: 0 })

    const isNearFood = (_state: GameState, pos: Position) => pos.x === 5 && pos.y === 5

    const deaths = tickCreatureHunger(state, 'bee', 30000, 200, isNearFood)

    const fedHunger = state.world.getComponent(fedBee, ComponentType.HungerTimer)
    expect(fedHunger?.hungerMs).toBe(0)

    const hungryHunger = state.world.getComponent(hungryBee, ComponentType.HungerTimer)
    expect(hungryHunger?.hungerMs).toBe(200)

    expect(deaths).toHaveLength(0)
  })
})
