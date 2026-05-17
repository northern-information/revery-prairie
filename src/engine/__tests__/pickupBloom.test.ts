import { harvestClover } from '../cloverLifecycle'
import { tickCoyote } from '../coyote'
import { executeCombine } from '../drag'
import { ComponentType } from '../ecs/types'
import { spawnPickupBloom } from '../effects'
import { pickUpGroundItems } from '../entities'
import { giveCharacterGift, givePostGift, updateFacingEntity } from '../interaction'
import { placeItem } from '../inventory'
import { RECIPES } from '../recipes'
import { CoyoteMode, TileType, Zone } from '../types'
import {
  clearAroundPlayer,
  createBeeEntity,
  createCharacterTestEntity,
  createGroundItemEntity,
  createMeteoriteEntity,
  createTestState,
} from './helpers'
import { describe, expect, it, vi } from 'vitest'

import type { Recipe } from '../recipes'
import type { GameState, ItemInstance } from '../types'

/** Assert a value is truthy and return it typed — avoids non-null assertions */
const requireValue = <T>(val: T | null | undefined): T => {
  expect(val).toBeTruthy()
  return val as T
}

const queryPickupBlooms = (state: GameState) =>
  state.world
    .query(ComponentType.TimedEffect, ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'pickupBloom')

describe('spawnPickupBloom', () => {
  it('creates a pickupBloom entity at the given position', () => {
    const state = createTestState()
    spawnPickupBloom(state, 5, 5, 1000)

    const blooms = queryPickupBlooms(state)
    expect(blooms).toHaveLength(1)
    expect(state.world.getComponent(blooms[0], ComponentType.Position)).toEqual({ x: 5, y: 5 })
    expect(state.world.getComponent(blooms[0], ComponentType.TimedEffect)).toEqual({
      kind: 'pickupBloom',
      startTime: 1000,
    })
    expect(state.world.getComponent(blooms[0], ComponentType.EntityZone)).toEqual({
      zone: state.currentZone,
    })
  })

  it('uses the current zone', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    spawnPickupBloom(state, 5, 5, 1000)

    const blooms = queryPickupBlooms(state)
    expect(state.world.getComponent(blooms[0], ComponentType.EntityZone)).toEqual({
      zone: Zone.Cave,
    })
  })
})

describe('ground item pickup bloom', () => {
  it('spawns bloom when picking up a ground item', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createGroundItemEntity(state, 'honey', state.player.x, state.player.y)

    pickUpGroundItems(state, 5000)

    const blooms = queryPickupBlooms(state)
    expect(blooms).toHaveLength(1)
    expect(state.world.getComponent(blooms[0], ComponentType.Position)).toEqual({
      x: state.player.x,
      y: state.player.y,
    })
  })

  it('does not spawn bloom when time is omitted', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createGroundItemEntity(state, 'honey', state.player.x, state.player.y)

    pickUpGroundItems(state)

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })

  it('does not spawn bloom when nothing is picked up', () => {
    const state = createTestState()
    clearAroundPlayer(state)

    pickUpGroundItems(state, 5000)

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })
})

describe('bee pickup bloom', () => {
  it('spawns bloom when picking up a bee', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createBeeEntity(state, state.player.x, state.player.y)

    pickUpGroundItems(state, 5000)

    const blooms = queryPickupBlooms(state)
    expect(blooms).toHaveLength(1)
  })
})

describe('meteorite pickup bloom', () => {
  it('spawns bloom when picking up a meteorite', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createMeteoriteEntity(state, state.player.x, state.player.y)

    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    try {
      pickUpGroundItems(state, 5000)

      const blooms = queryPickupBlooms(state)
      expect(blooms).toHaveLength(1)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('single bloom per event', () => {
  it('spawns exactly one bloom when multiple items are picked up', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createGroundItemEntity(state, 'honey', state.player.x, state.player.y)
    createGroundItemEntity(state, 'coin', state.player.x, state.player.y)
    createBeeEntity(state, state.player.x, state.player.y)

    pickUpGroundItems(state, 5000)

    const blooms = queryPickupBlooms(state)
    expect(blooms).toHaveLength(1)
  })

  it('spawns exactly one bloom when items are spread across the 3x3 footprint', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    // Items at 4 distinct neighbor tiles + a bee at a 5th — all within Chebyshev 1
    createGroundItemEntity(state, 'honey', state.player.x - 1, state.player.y - 1)
    createGroundItemEntity(state, 'coin', state.player.x + 1, state.player.y - 1)
    createGroundItemEntity(state, 'honey', state.player.x - 1, state.player.y + 1)
    createGroundItemEntity(state, 'coin', state.player.x + 1, state.player.y + 1)
    createBeeEntity(state, state.player.x, state.player.y + 1)

    const result = pickUpGroundItems(state, 5000)
    // All 5 items should be picked up
    expect(result.pickedUp).toHaveLength(5)

    const blooms = queryPickupBlooms(state)
    expect(blooms).toHaveLength(1)
  })
})

describe('harvest bloom', () => {
  it('spawns bloom when harvesting clover', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    // Place clover in front of player and update facing entity
    const fx = state.player.x
    const fy = state.player.y + 1
    state.map[fy][fx] = { type: TileType.Clover }
    updateFacingEntity(state)

    harvestClover(state, 5000)

    const blooms = queryPickupBlooms(state)
    expect(blooms).toHaveLength(1)
    expect(state.world.getComponent(blooms[0], ComponentType.Position)).toEqual({
      x: state.player.x,
      y: state.player.y,
    })
  })

  it('does not spawn bloom when time is omitted', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const fx = state.player.x
    const fy = state.player.y + 1
    state.map[fy][fx] = { type: TileType.Clover }
    updateFacingEntity(state)

    harvestClover(state)

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })

  it('does not spawn bloom when harvest fails (no clover)', () => {
    const state = createTestState()
    clearAroundPlayer(state)

    harvestClover(state, 5000)

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })
})

describe('coyote delivery bloom', () => {
  it('spawns bloom at player position when coyote delivers to backpack', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    // Place coyote adjacent to player
    createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
      behavior: { type: 'follow' },
    })
    state.coyoteMode = CoyoteMode.Collect
    state.coyoteCargo = 'meteorite'

    const result = tickCoyote(state, 5000)

    expect(result.delivered).toBeTruthy()
    expect(result.delivered?.toGron).toBe(false)
    const blooms = queryPickupBlooms(state)
    expect(blooms).toHaveLength(1)
    expect(state.world.getComponent(blooms[0], ComponentType.Position)).toEqual({
      x: state.player.x,
      y: state.player.y,
    })
  })

  it('does not spawn bloom when coyote delivers to Gron', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    // Place coyote and Gron — fill backpack so delivery goes to Gron
    createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
      behavior: { type: 'follow' },
    })
    createCharacterTestEntity(state, 'gron', state.player.x - 1, state.player.y)
    state.coyoteMode = CoyoteMode.Collect
    state.coyoteCargo = 'meteorite'
    // Fill the backpack completely
    for (let y = 0; y < state.backpack.height; y++) {
      for (let x = 0; x < state.backpack.width; x++) {
        placeItem(state.backpack, 'coin', x, y)
      }
    }

    const result = tickCoyote(state, 5000)

    // Coyote should deliver to Gron (backpack full)
    if (result.delivered) {
      expect(result.delivered.toGron).toBe(true)
    }
    expect(queryPickupBlooms(state)).toHaveLength(0)
  })

  it('does not spawn bloom when time is omitted', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
      behavior: { type: 'follow' },
    })
    state.coyoteMode = CoyoteMode.Collect
    state.coyoteCargo = 'meteorite'

    tickCoyote(state)

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })
})

describe('craft bloom', () => {
  const setupCombine = () => {
    const state = createTestState()
    clearAroundPlayer(state, 1)
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    const bee = requireValue<ItemInstance>(state.backpack.items.find(i => i.definitionId === 'bee'))
    const clover = requireValue<ItemInstance>(state.backpack.items.find(i => i.definitionId === 'clover'))
    const prairieRecipe = requireValue<Recipe>(RECIPES.find(r => r.resultName === 'Prairie'))
    return { state, bee, clover, prairieRecipe }
  }

  it('spawns bloom at player position on successful combine', () => {
    const { state, bee, clover, prairieRecipe } = setupCombine()

    const result = executeCombine(
      state,
      state.backpack,
      state.backpack,
      bee,
      { uid: clover.uid, recipe: prairieRecipe },
      5000
    )

    expect(result.outcome).toBe('success')
    const blooms = queryPickupBlooms(state)
    expect(blooms).toHaveLength(1)
    expect(state.world.getComponent(blooms[0], ComponentType.Position)).toEqual({
      x: state.player.x,
      y: state.player.y,
    })
  })

  it('does not spawn bloom on failed combine', () => {
    const { state, bee, clover, prairieRecipe } = setupCombine()
    const failRecipe = { ...prairieRecipe, execute: () => false }

    const result = executeCombine(
      state,
      state.backpack,
      state.backpack,
      bee,
      { uid: clover.uid, recipe: failRecipe },
      5000
    )

    expect(result.outcome).toBe('failed')
    expect(queryPickupBlooms(state)).toHaveLength(0)
  })

  it('does not spawn bloom when time is omitted', () => {
    const { state, bee, clover, prairieRecipe } = setupCombine()

    executeCombine(state, state.backpack, state.backpack, bee, { uid: clover.uid, recipe: prairieRecipe })

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })
})

describe('character gift bloom', () => {
  it('does not spawn bloom for moab — gift removed in precis #0', () => {
    const state = createTestState()

    giveCharacterGift(state, 'moab', 5000)

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })

  it('does not spawn bloom for characters without postGift', () => {
    const state = createTestState()

    givePostGift(state, 'moab', 6000)

    expect(queryPickupBlooms(state)).toHaveLength(0)
  })
})
