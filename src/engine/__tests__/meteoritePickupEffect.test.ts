import { vi } from 'vitest'
import { tickShootingStars } from '../celestial'
import { PICKUP_EFFECT_DURATION_MS } from '../constants'
import { ComponentType } from '../ecs/types'
import { pickUpGroundItems } from '../entities'
import { clearAroundPlayer, createMeteoriteEntity, createTestState, getMeteoriteEntities } from './helpers'

const queryPickupBlooms = (state: ReturnType<typeof createTestState>) =>
  state.world
    .query(ComponentType.TimedEffect, ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'pickupBloom')

describe('meteoritePickupEffect', () => {
  it('creates a pickup effect when a meteorite is picked up with time', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createMeteoriteEntity(state, state.player.x, state.player.y)

    // Prevent chain explosion from consuming the meteorite before pickup
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    try {
      pickUpGroundItems(state, 5000)

      const blooms = queryPickupBlooms(state)
      expect(blooms).toHaveLength(1)
      const pos = state.world.getComponent(blooms[0], ComponentType.Position)
      const effect = state.world.getComponent(blooms[0], ComponentType.TimedEffect)
      expect(pos).toEqual({
        x: state.player.x,
        y: state.player.y,
      })
      expect(effect?.startTime).toBe(5000)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('does not create an effect when no meteorite is present', () => {
    const state = createTestState()
    clearAroundPlayer(state)

    pickUpGroundItems(state, 5000)

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })

  it('does not create an effect when time is omitted', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createMeteoriteEntity(state, state.player.x, state.player.y)

    pickUpGroundItems(state)

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })

  it('cleans up expired effects in tickShootingStars', () => {
    const state = createTestState()
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: 10, y: 10 })
    state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'pickupBloom', startTime: 1000 })
    state.world.addComponent(e, ComponentType.EntityTag, 'pickupBloom')

    tickShootingStars(state, 1000 + PICKUP_EFFECT_DURATION_MS + 1)

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })

  it('retains non-expired effects in tickShootingStars', () => {
    const state = createTestState()
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: 10, y: 10 })
    state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'pickupBloom', startTime: 1000 })
    state.world.addComponent(e, ComponentType.EntityTag, 'pickupBloom')

    tickShootingStars(state, 1000 + PICKUP_EFFECT_DURATION_MS - 100)

    expect(queryPickupBlooms(state)).toHaveLength(1)
  })

  it('still picks up the meteorite normally', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createMeteoriteEntity(state, state.player.x, state.player.y)

    // Prevent chain explosion from spawning extra meteorites
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    try {
      const result = pickUpGroundItems(state, 5000)

      expect(result.pickedUp).toContain('meteorite')
      expect(getMeteoriteEntities(state)).toHaveLength(0)
      expect(state.backpack.items.some(i => i.definitionId === 'meteorite')).toBe(true)
    } finally {
      vi.restoreAllMocks()
    }
  })
})
