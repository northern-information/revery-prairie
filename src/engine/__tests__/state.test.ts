import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { ComponentType } from '../ecs/types'
import { RuinGenerationMode } from '../genesisTypes'
import { createGameState } from '../state'
import { MainQuestPhase } from '../types'
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

  it('spawns the player one tile west of the exact map center', () => {
    // RP-33 — createGameState defaults to overworld; the production
    // hook then calls enterHouseAtTenureStart. This test verifies the
    // legacy posture.
    const state = createGameState('Willow', 80, 40)
    expect(state.player.x).toBe(Math.floor(MAP_WIDTH / 2) - 1)
    expect(state.player.y).toBe(Math.floor(MAP_HEIGHT / 2))
  })

  it('starts with an empty backpack', () => {
    const state = createGameState('Willow', 80, 40)
    expect(state.backpack.items).toHaveLength(0)
  })

  it('starts with mainQuestPhase awaiting-coyote and ruinGenerationMode starter', () => {
    const state = createGameState('Willow', 80, 40)
    expect(state.mainQuestPhase).toBe(MainQuestPhase.AwaitingCoyote)
    expect(state.ruinGenerationMode).toBe(RuinGenerationMode.Starter)
  })

  it('does not spawn a coyote on the overworld at game start', () => {
    const state = createGameState('Willow', 80, 40)
    const coyotes = state.world.query(ComponentType.CharacterIdentity).filter(eid => {
      const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
      return ident?.definitionId === 'coyote'
    })
    expect(coyotes).toHaveLength(0)
  })

  it('starts with no gifts received', () => {
    const state = createGameState('Willow', 80, 40)
    expect(state.giftsReceived.size).toBe(0)
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
