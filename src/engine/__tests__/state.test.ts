import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { ComponentType } from '../ecs/types'
import { containerHasItem } from '../inventory'
import { createGameState } from '../state'
import { describe, expect, it } from 'vitest'

describe('createGameState', () => {
  it('sets the steward name', () => {
    const state = createGameState('Willow', 80, 40)
    expect(state.stewardName).toBe('Willow')
  })

  it('creates a map of the correct dimensions', () => {
    const state = createGameState('Willow', 80, 40)
    expect(state.mapWidth).toBe(MAP_WIDTH)
    expect(state.mapHeight).toBe(MAP_HEIGHT)
    expect(state.map.length).toBe(MAP_HEIGHT)
    expect(state.map[0].length).toBe(MAP_WIDTH)
  })

  it('places the player at the center of the map', () => {
    const state = createGameState('Willow', 80, 40)
    expect(state.player.x).toBe(Math.floor(MAP_WIDTH / 2))
    expect(state.player.y).toBe(Math.floor(MAP_HEIGHT / 2))
  })

  it('starts with bees and clovers in backpack', () => {
    const state = createGameState('Willow', 80, 40)
    expect(state.backpack.items.length).toBeGreaterThan(0)
    expect(containerHasItem(state.backpack, 'bee')).toBe(true)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('starts with earth revery pre-assigned', () => {
    const state = createGameState('Willow', 80, 40)
    expect(state.reveries).toEqual(['earth'])
    expect(state.actionBar[0]).toEqual({
      kind: 'revery',
      id: 'earth',
      cooldownEndTime: 0,
      cooldownDurationMs: 0,
    })
    expect(state.actionBar[1]).toBeNull()
    expect(state.actionBar[2]).toBeNull()
    expect(state.actionBar[3]).toBeNull()
    expect(state.giftsReceived.size).toBe(0)
  })

  it('starts with no open containers', () => {
    const state = createGameState('Willow', 80, 40)
    expect(state.openContainer).toBeNull()
  })

  it('starts with no bee entities', () => {
    const state = createGameState('Willow', 80, 40)
    const bees = state.world
      .query(ComponentType.EntityTag)
      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'bee')
    expect(bees).toHaveLength(0)
  })

  it('sets viewport dimensions from arguments', () => {
    const state = createGameState('Willow', 60, 30)
    expect(state.viewportWidth).toBe(60)
    expect(state.viewportHeight).toBe(30)
  })

  it('centers camera on player', () => {
    const state = createGameState('Willow', 80, 40)
    expect(state.camera.x).toBe(state.player.x - 40)
    expect(state.camera.y).toBe(state.player.y - 20)
  })
})
