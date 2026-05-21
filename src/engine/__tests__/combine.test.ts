import { checkCombine, combineFromBackpack } from '../combine'
import { ComponentType } from '../ecs/types'
import { containerHasItem, placeItem } from '../inventory'
import { posKey } from '../position'
import { TileType } from '../types'
import { clearAroundPlayer, createTestState, getBeeEntities } from './helpers'
import { describe, expect, it } from 'vitest'

import type { Container, ItemInstance } from '../types'

const makeItem = (definitionId: string, overrides?: Partial<ItemInstance>): ItemInstance => ({
  uid: crypto.randomUUID(),
  definitionId,
  gridX: 0,
  gridY: 0,
  ...overrides,
})

describe('checkCombine', () => {
  it('detects recipe when items are in different containers', () => {
    const state = createTestState()

    // clover in another container (target)
    const otherContainer: Container = {
      id: 'other-1',
      name: 'other #1',
      width: 5,
      height: 5,
      items: [],
    }
    placeItem(otherContainer, 'clover', 0, 0)

    // bee dragged from backpack onto the other grid at (0,0)
    const bee = makeItem('bee')

    const result = checkCombine(
      otherContainer,
      bee,
      0,
      0,
      state.backpack.id, // source: backpack
      otherContainer.id, // target: other container
      state.discoveredRecipes
    )

    expect(result.kind).toBe('recipe')
    if (result.kind === 'recipe') {
      expect(result.recipe.resultName).toBe('Prairie')
    }
  })

  it('detects recipe in same container', () => {
    const state = createTestState()
    // place clover in backpack at (0,0) - it's 1x1
    placeItem(state.backpack, 'clover', 0, 0)

    // drag bee from backpack onto (0,0) overlapping the clover
    const bee = makeItem('bee')

    const result = checkCombine(
      state.backpack,
      bee,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    expect(result.kind).toBe('recipe')
  })

  it('returns no-recipe for incompatible items', () => {
    const state = createTestState()
    // place a meteorite in the backpack at (0,0)
    placeItem(state.backpack, 'meteorite', 0, 0)

    // drag another meteorite onto it
    const meteorite2 = makeItem('meteorite')

    const result = checkCombine(
      state.backpack,
      meteorite2,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    expect(result.kind).toBe('no-recipe')
  })
})

describe('combineFromBackpack', () => {
  it('returns true and seeds a single clover at the player position (precis-17 ceremony)', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)

    const result = combineFromBackpack(state, 'bee', 'clover')

    expect(result).toBe(true)

    const px = state.player.x
    const py = state.player.y
    expect(state.map[py][px].type).toBe(TileType.Flora)
    // Neighbors are not painted immediately — the wave handles them.
    expect(state.activeWaves).toHaveLength(1)
  })

  it('returns false when standing on sand', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    state.map[state.player.y][state.player.x] = { type: TileType.Sand }
    const result = combineFromBackpack(state, 'bee', 'clover')
    expect(result).toBe(false)
    // Items should not be consumed
    expect(containerHasItem(state.backpack, 'bee')).toBe(true)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('does not paint neighbors immediately — only the seed tile changes', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)
    const px = state.player.x
    const py = state.player.y

    state.map[py][px - 1] = { type: TileType.Sand }
    state.map[py + 1][px] = { type: TileType.Dirt }

    combineFromBackpack(state, 'bee', 'clover')

    // Sand is unchanged by the ceremony seed (only the player tile is
    // converted). The wave will skip sand later too.
    expect(state.map[py][px - 1].type).toBe(TileType.Sand)
    // Adjacent dirt is NOT painted at execute time — the wave hasn't
    // ticked yet. This is the new ceremony semantic.
    expect(state.map[py + 1][px].type).toBe(TileType.Dirt)
    expect(state.map[py][px].type).toBe(TileType.Flora)
  })

  it('removes one bee and one clover from backpack', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'bee', 1, 0)
    placeItem(state.backpack, 'clover', 2, 0)
    placeItem(state.backpack, 'clover', 3, 0)
    clearAroundPlayer(state, 1)
    combineFromBackpack(state, 'bee', 'clover')
    expect(state.backpack.items.filter(i => i.definitionId === 'bee')).toHaveLength(1)
    expect(state.backpack.items.filter(i => i.definitionId === 'clover')).toHaveLength(1)
  })

  it('spawns a bee entity', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)
    combineFromBackpack(state, 'bee', 'clover')
    const bees = getBeeEntities(state)
    expect(bees).toHaveLength(1)
    const beePos = state.world.getComponent(bees[0], ComponentType.Position)
    expect(beePos).toBeTruthy()
    expect(beePos?.x).toBe(state.player.x)
    expect(beePos?.y).toBe(state.player.y)
  })

  it('returns false if no bees in backpack', () => {
    const state = createTestState()
    placeItem(state.backpack, 'clover', 0, 0)
    const result = combineFromBackpack(state, 'bee', 'clover')
    expect(result).toBe(false)
  })

  it('returns false if no clovers in backpack', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    const result = combineFromBackpack(state, 'bee', 'clover')
    expect(result).toBe(false)
  })

  it('returns false and consumes nothing for an unregistered ingredient pair', () => {
    const state = createTestState()
    placeItem(state.backpack, 'meteorite', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)
    const result = combineFromBackpack(state, 'meteorite', 'clover')
    expect(result).toBe(false)
    expect(containerHasItem(state.backpack, 'meteorite')).toBe(true)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('seeds clover on cratered dirt and preserves the crater entries', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)

    const px = state.player.x
    const py = state.player.y

    state.craters.add(posKey(px, py))

    const result = combineFromBackpack(state, 'bee', 'clover')
    expect(result).toBe(true)

    expect(state.map[py][px].type).toBe(TileType.Flora)
    expect(state.craters.has(posKey(px, py))).toBe(true)
  })

  it('does not paint sand-adjacent tiles at execute time (wave handles them)', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)

    const px = state.player.x
    const py = state.player.y

    state.craters.add(posKey(px, py))
    state.map[py][px + 1] = { type: TileType.Sand }

    const result = combineFromBackpack(state, 'bee', 'clover')
    expect(result).toBe(true)

    expect(state.map[py][px].type).toBe(TileType.Flora)
    expect(state.map[py][px + 1].type).toBe(TileType.Sand)
    expect(state.craters.has(posKey(px, py))).toBe(true)
  })
})
