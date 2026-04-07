import { describe, expect, it } from 'vitest'

import { COIN_GLINTING_COLOR } from '../constants'
import { ComponentType } from '../ecs/types'
import { pickUpGroundItems } from '../entities'
import {
  canCast,
  completeCast,
  consumeGlint,
  getGlintingBackpackCoins,
  HEXAGRAMS,
  lineFromValue,
  LineType,
  lookupHexagram,
  tossThreeCoins,
} from '../hexagram'
import { placeItem } from '../inventory'
import { ITEM_DEFINITIONS } from '../items'
import { createGameState } from '../state'
import { Rotation } from '../types'
import type { Container } from '../types'
import { clearAroundPlayer, createGroundItemEntity, createTestState } from './helpers'

describe('coin item definition', () => {
  it('exists in the item registry', () => {
    const coin = ITEM_DEFINITIONS.coin
    expect(coin).toBeDefined()
    expect(coin.id).toBe('coin')
    expect(coin.glyph).toBe('¤')
    expect(coin.glyphColor).toBe(COIN_GLINTING_COLOR)
    expect(coin.category).toBe('tool')
    expect(coin.shape).toEqual([[true]])
  })
})

describe('hexagram data', () => {
  it('has exactly 64 hexagrams', () => {
    expect(HEXAGRAMS).toHaveLength(64)
  })

  it('each hexagram has a unique id from 1-64', () => {
    const ids = HEXAGRAMS.map(h => h.id)
    expect(new Set(ids).size).toBe(64)
    expect(Math.min(...ids)).toBe(1)
    expect(Math.max(...ids)).toBe(64)
  })

  it('each hexagram has exactly 6 lines', () => {
    for (const h of HEXAGRAMS) {
      expect(h.lines).toHaveLength(6)
    }
  })

  it('each hexagram has a non-empty name and meaning', () => {
    for (const h of HEXAGRAMS) {
      expect(h.name.length).toBeGreaterThan(0)
      expect(h.meaning.length).toBeGreaterThan(0)
    }
  })

  it('all 64 line patterns are unique', () => {
    const patterns = HEXAGRAMS.map(h => h.lines.map(l => (l ? '1' : '0')).join(''))
    expect(new Set(patterns).size).toBe(64)
  })
})

describe('tossThreeCoins', () => {
  it('returns values in the range 6-9', () => {
    const results = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      results.add(tossThreeCoins())
    }
    for (const v of results) {
      expect(v).toBeGreaterThanOrEqual(6)
      expect(v).toBeLessThanOrEqual(9)
    }
  })
})

describe('lineFromValue', () => {
  it('6 = old yin (broken, changing)', () => {
    const line = lineFromValue(LineType.OldYin)
    expect(line.yang).toBe(false)
    expect(line.changing).toBe(true)
  })

  it('7 = young yang (solid, stable)', () => {
    const line = lineFromValue(LineType.YoungYang)
    expect(line.yang).toBe(true)
    expect(line.changing).toBe(false)
  })

  it('8 = young yin (broken, stable)', () => {
    const line = lineFromValue(LineType.YoungYin)
    expect(line.yang).toBe(false)
    expect(line.changing).toBe(false)
  })

  it('9 = old yang (solid, changing)', () => {
    const line = lineFromValue(LineType.OldYang)
    expect(line.yang).toBe(true)
    expect(line.changing).toBe(true)
  })
})

describe('lookupHexagram', () => {
  it('finds hexagram 1 (all yang)', () => {
    const h = lookupHexagram([true, true, true, true, true, true])
    expect(h.id).toBe(1)
    expect(h.name).toBe('The Creative')
  })

  it('finds hexagram 2 (all yin)', () => {
    const h = lookupHexagram([false, false, false, false, false, false])
    expect(h.id).toBe(2)
    expect(h.name).toBe('The Receptive')
  })

  it('throws for invalid pattern', () => {
    expect(() => lookupHexagram([true, true, true, true, true, true, true])).toThrow()
  })
})

describe('completeCast', () => {
  it('produces a primary hexagram from 6 stable lines', () => {
    // All 7s = all yang = hexagram 1
    const result = completeCast([7, 7, 7, 7, 7, 7])
    expect(result.primary.id).toBe(1)
    expect(result.transformed).toBeNull()
  })

  it('produces a transformed hexagram when changing lines exist', () => {
    // All 9s = all old yang → changes to all yin = hexagram 2
    const result = completeCast([9, 9, 9, 9, 9, 9])
    expect(result.primary.id).toBe(1)
    expect(result.transformed).not.toBeNull()
    expect(result.transformed?.id).toBe(2)
  })

  it('all 6s = hexagram 2 → transforms to hexagram 1', () => {
    const result = completeCast([6, 6, 6, 6, 6, 6])
    expect(result.primary.id).toBe(2)
    expect(result.transformed?.id).toBe(1)
  })

  it('mixed stable lines produce no transformation', () => {
    // 7,8,7,8,7,8 = alternating yang/yin
    const result = completeCast([7, 8, 7, 8, 7, 8])
    expect(result.transformed).toBeNull()
  })
})

describe('glinting coins', () => {
  it('canCast returns false with no coins', () => {
    const state = createTestState()
    expect(canCast(state)).toBe(false)
  })

  it('canCast returns false with fewer than 3 glinting coins', () => {
    const state = createTestState()
    placeItem(state.backpack, 'coin', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 1, 0)
    // Add only 2 to glintingCoins
    state.glintingCoins.add(state.backpack.items[0].uid)
    state.glintingCoins.add(state.backpack.items[1].uid)
    expect(canCast(state)).toBe(false)
  })

  it('canCast returns true with 3 glinting coins', () => {
    const state = createTestState()
    placeItem(state.backpack, 'coin', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 1, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 2, 0)
    for (const item of state.backpack.items) {
      state.glintingCoins.add(item.uid)
    }
    expect(canCast(state)).toBe(true)
  })

  it('canCast returns false when 3 coins exist but none are glinting', () => {
    const state = createTestState()
    placeItem(state.backpack, 'coin', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 1, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 2, 0)
    // Don't add to glintingCoins
    expect(canCast(state)).toBe(false)
  })

  it('consumeGlint removes 3 coin uids from glintingCoins', () => {
    const state = createTestState()
    placeItem(state.backpack, 'coin', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 1, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 2, 0)
    for (const item of state.backpack.items) {
      state.glintingCoins.add(item.uid)
    }
    expect(state.glintingCoins.size).toBe(3)
    consumeGlint(state)
    expect(state.glintingCoins.size).toBe(0)
  })

  it('coins remain in backpack after consumeGlint', () => {
    const state = createTestState()
    placeItem(state.backpack, 'coin', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 1, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 2, 0)
    for (const item of state.backpack.items) {
      state.glintingCoins.add(item.uid)
    }
    consumeGlint(state)
    expect(state.backpack.items).toHaveLength(3)
    expect(state.backpack.items.every(i => i.definitionId === 'coin')).toBe(true)
  })

  it('getGlintingBackpackCoins only counts glinting coins', () => {
    const state = createTestState()
    placeItem(state.backpack, 'coin', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 1, 0)
    placeItem(state.backpack, 'coin', Rotation.R0, 2, 0)
    // Only glint 2 of 3
    state.glintingCoins.add(state.backpack.items[0].uid)
    state.glintingCoins.add(state.backpack.items[1].uid)
    expect(getGlintingBackpackCoins(state)).toHaveLength(2)
  })

  it('coins in omnibox do not count for canCast', () => {
    const state = createTestState()
    // Place 3 coins in an omnibox container, not backpack
    const container: Container = { id: 'test-omni', name: 'test', width: 5, height: 5, items: [] }
    placeItem(container, 'coin', Rotation.R0, 0, 0)
    placeItem(container, 'coin', Rotation.R0, 1, 0)
    placeItem(container, 'coin', Rotation.R0, 2, 0)
    for (const item of container.items) {
      state.glintingCoins.add(item.uid)
    }
    expect(canCast(state)).toBe(false)
  })
})

describe('coin ground spawn', () => {
  it('createGameState spawns coin ground items', () => {
    const freshState = createGameState('Test', 20, 20)
    const coinEntities = freshState.world
      .query(ComponentType.EntityTag, ComponentType.ItemDrop)
      .filter(eid => {
        const tag = freshState.world.getComponent(eid, ComponentType.EntityTag)
        const drop = freshState.world.getComponent(eid, ComponentType.ItemDrop)
        return tag === 'groundItem' && drop?.definitionId === 'coin'
      })
    expect(coinEntities.length).toBe(3)
  })
})

describe('coin pickup glinting', () => {
  it('coins picked up from ground become glinting', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const px = state.player.x
    const py = state.player.y
    createGroundItemEntity(state, 'coin', px, py)
    const result = pickUpGroundItems(state)
    expect(result.pickedUp).toContain('coin')
    expect(state.backpack.items).toHaveLength(1)
    expect(state.glintingCoins.has(state.backpack.items[0].uid)).toBe(true)
  })

  it('non-glinting dropped coins stay non-glinting on pickup', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const px = state.player.x
    const py = state.player.y
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: px, y: py })
    state.world.addComponent(e, ComponentType.ItemDrop, { definitionId: 'coin', glinting: false })
    state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
    state.world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })
    pickUpGroundItems(state)
    expect(state.backpack.items).toHaveLength(1)
    expect(state.glintingCoins.has(state.backpack.items[0].uid)).toBe(false)
  })
})
