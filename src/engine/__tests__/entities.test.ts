import { combineFromBackpack } from '../combine'
import { ComponentType } from '../ecs/types'
import { dropItem, pickUpGroundItems, tickBees } from '../entities'
import { containerHasItem, placeItem } from '../inventory'
import { movePlayer } from '../movement'
import { TileType } from '../types'
import {
  clearArea,
  clearAroundPlayer,
  createBeeEntity,
  createGroundItemEntity,
  createMeteoriteEntity,
  createTestState,
  getBeeEntities,
  getGroundItemEntities,
} from './helpers'
import { describe, expect, it, vi } from 'vitest'

describe('tickBees', () => {
  it('does nothing when there are no bees', () => {
    const state = createTestState()
    tickBees(state)
    expect(getBeeEntities(state)).toHaveLength(0)
  })

  it('keeps bees on clover tiles', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)
    combineFromBackpack(state, 'bee', 'clover')

    // Force movement to always trigger so we actually test clover preference
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    try {
      for (let i = 0; i < 100; i++) {
        tickBees(state)
      }
    } finally {
      vi.restoreAllMocks()
    }

    for (const eid of getBeeEntities(state)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const pos = state.world.getComponent(eid, ComponentType.Position)!
      const tile = state.map[pos.y][pos.x]
      expect(tile.type).toBe(TileType.Flora)
    }
  })

  it('bee stays in place when surrounded by space tiles', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    const bx = 50
    const by = 12
    state.map[by][bx] = { type: TileType.Flora }
    // Surround with space so bee has nowhere to go
    for (const d of [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ]) {
      state.map[by + d[1]][bx + d[0]] = { type: TileType.Space }
    }
    const beeEid = createBeeEntity(state, bx, by)

    for (let i = 0; i < 50; i++) {
      tickBees(state)
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const pos = state.world.getComponent(beeEid, ComponentType.Position)!
    expect(pos.x).toBe(bx)
    expect(pos.y).toBe(by)
  })

  it('bee wanders on walkable tiles when no clover nearby', () => {
    const state = createTestState()
    const bx = state.player.x + 5
    const by = state.player.y
    clearArea(state, bx, by, 2)
    const beeEid = createBeeEntity(state, bx, by)

    // Force movement to always trigger — deterministic instead of hoping 100 ticks is enough
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    try {
      tickBees(state)
    } finally {
      vi.restoreAllMocks()
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const pos = state.world.getComponent(beeEid, ComponentType.Position)!
    const moved = pos.x !== bx || pos.y !== by
    expect(moved).toBe(true)
  })
})

describe('dropItem', () => {
  it('drops item to the north first', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', 0, 0)
    const result = dropItem(state, 'clover')
    expect(result).toBe(true)
    const items = getGroundItemEntities(state)
    expect(items).toHaveLength(1)
    const pos = state.world.getComponent(items[0], ComponentType.Position)
    expect(pos?.x).toBe(state.player.x)
    expect(pos?.y).toBe(state.player.y - 1)
    expect(containerHasItem(state.backpack, 'clover')).toBe(false)
  })

  it('skips occupied ground tiles', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', 0, 0)
    // Place a ground item to the north
    createGroundItemEntity(state, 'clover', state.player.x, state.player.y - 1)
    const result = dropItem(state, 'clover')
    expect(result).toBe(true)
    // Should drop NE since N is taken
    const items = getGroundItemEntities(state)
    expect(items).toHaveLength(2)
    // Find the newly dropped item (not the one at N)
    const newItem = items.find(eid => {
      const pos = state.world.getComponent(eid, ComponentType.Position)
      return pos?.x === state.player.x + 1 && pos?.y === state.player.y - 1
    })
    expect(newItem).toBeDefined()
  })

  it('drops under the player as last resort', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', 0, 0)
    // Fill all 8 surrounding tiles with ground items
    const deltas = [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
    ]
    for (const d of deltas) {
      createGroundItemEntity(state, 'clover', state.player.x + d.x, state.player.y + d.y)
    }
    const result = dropItem(state, 'clover')
    expect(result).toBe(true)
    const items = getGroundItemEntities(state)
    expect(items).toHaveLength(9)
    // The last dropped item should be under the player
    const underPlayer = items.find(eid => {
      const pos = state.world.getComponent(eid, ComponentType.Position)
      return pos?.x === state.player.x && pos?.y === state.player.y
    })
    expect(underPlayer).toBeDefined()
  })

  it('returns false when all positions are occupied', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', 0, 0)
    const deltas = [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
      { x: 0, y: 0 },
    ]
    for (const d of deltas) {
      createGroundItemEntity(state, 'clover', state.player.x + d.x, state.player.y + d.y)
    }
    const result = dropItem(state, 'clover')
    expect(result).toBe(false)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('returns false when item is not in inventory', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const result = dropItem(state, 'nonexistent')
    expect(result).toBe(false)
  })

  it('skips Space tiles', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', 0, 0)
    state.map[state.player.y - 1][state.player.x] = { type: TileType.Space }
    const result = dropItem(state, 'clover')
    expect(result).toBe(true)
    const items = getGroundItemEntities(state)
    expect(items).toHaveLength(1)
    const pos = state.world.getComponent(items[0], ComponentType.Position)
    expect(pos?.x).toBe(state.player.x + 1)
    expect(pos?.y).toBe(state.player.y - 1)
  })

  it('releases bee as world entity instead of ground item', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'bee', 0, 0)
    const result = dropItem(state, 'bee')
    expect(result).toBe(true)
    expect(getGroundItemEntities(state)).toHaveLength(0)
    expect(getBeeEntities(state)).toHaveLength(1)
  })
})

describe('pickUpGroundItems', () => {
  it('picks up a ground item at the player position', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createGroundItemEntity(state, 'clover', state.player.x, state.player.y)
    pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(0)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('auto-picks up when walking over a ground item', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createGroundItemEntity(state, 'bee', state.player.x + 1, state.player.y)

    movePlayer(state, 'right')
    pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(0)
    expect(containerHasItem(state.backpack, 'bee')).toBe(true)
  })

  it('does not pick up if backpack is full', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    // Fill the entire backpack
    state.backpack.items = []
    for (let y = 0; y < state.backpack.height; y++) {
      for (let x = 0; x < state.backpack.width; x++) {
        state.backpack.items.push({
          uid: crypto.randomUUID(),
          definitionId: 'bee',

          gridX: x,
          gridY: y,
        })
      }
    }
    createGroundItemEntity(state, 'bee', state.player.x, state.player.y)
    pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(1)
  })

  it('does not capture a live bee at the player position', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createBeeEntity(state, state.player.x, state.player.y)
    const beeItemsBefore = state.backpack.items.filter(i => i.definitionId === 'bee').length
    const result = pickUpGroundItems(state)
    expect(getBeeEntities(state)).toHaveLength(1)
    expect(state.backpack.items.filter(i => i.definitionId === 'bee')).toHaveLength(beeItemsBefore)
    expect(result.pickedUp).not.toContain('bee')
  })

  // Ruin-bee regression guard: a groundItem-tagged entity whose payload is
  // 'bee' (the bee-role ruin vault drop) is still picked up via the
  // groundItem branch — only live bee entities are immune to walk-over
  // capture.
  it('picks up a ground-item bee at the player position (ruin-bee path)', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createGroundItemEntity(state, 'bee', state.player.x, state.player.y)
    const result = pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(0)
    expect(containerHasItem(state.backpack, 'bee')).toBe(true)
    expect(result.pickedUp).toContain('bee')
  })

  it('picks up ground item adjacent to player (Chebyshev distance 1)', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    // Place ground item 1 tile to the north-east — adjacent but not at player position
    createGroundItemEntity(state, 'clover', state.player.x + 1, state.player.y - 1)
    pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(0)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('picks up all ground items within 3x3 footprint in one pass', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    // Place items at several different adjacent positions
    createGroundItemEntity(state, 'clover', state.player.x, state.player.y - 1) // north
    createGroundItemEntity(state, 'clover', state.player.x + 1, state.player.y) // east
    createGroundItemEntity(state, 'clover', state.player.x, state.player.y + 1) // south
    pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(0)
  })

  it('does not capture a live bee adjacent to player (Chebyshev distance 1)', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createBeeEntity(state, state.player.x + 1, state.player.y)
    pickUpGroundItems(state)
    expect(getBeeEntities(state)).toHaveLength(1)
  })

  it.each([
    ['NW', -1, -1],
    ['N', 0, -1],
    ['NE', 1, -1],
    ['W', -1, 0],
    ['E', 1, 0],
    ['SW', -1, 1],
    ['S', 0, 1],
    ['SE', 1, 1],
  ])('does not capture a live bee from each neighbor tile (%s)', (_label, dx, dy) => {
    const state = createTestState()
    clearAroundPlayer(state)
    createBeeEntity(state, state.player.x + dx, state.player.y + dy)
    pickUpGroundItems(state)
    expect(getBeeEntities(state)).toHaveLength(1)
  })

  it.each([
    ['NW', -1, -1],
    ['N', 0, -1],
    ['NE', 1, -1],
    ['W', -1, 0],
    ['E', 1, 0],
    ['SW', -1, 1],
    ['S', 0, 1],
    ['SE', 1, 1],
  ])('picks up meteorite from each neighbor tile (%s)', (_label, dx, dy) => {
    const state = createTestState()
    clearAroundPlayer(state, 3)
    createMeteoriteEntity(state, state.player.x + dx, state.player.y + dy)
    // Force chain roll to fail so the meteorite survives to pickup
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const result = pickUpGroundItems(state, 1000)
      expect(result.pickedUp).toContain('meteorite')
      expect(containerHasItem(state.backpack, 'meteorite')).toBe(true)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('pickup exemption (just-dropped items)', () => {
  it('does not re-pick up an item dropped via dropItem while the player is still in 3x3', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', 0, 0)
    const dropped = dropItem(state, 'clover')
    expect(dropped).toBe(true)
    expect(getGroundItemEntities(state)).toHaveLength(1)

    pickUpGroundItems(state)

    expect(getGroundItemEntities(state)).toHaveLength(1)
    expect(containerHasItem(state.backpack, 'clover')).toBe(false)
  })

  it('does not pick up across a full perimeter walk while the item stays inside 3x3', () => {
    const state = createTestState()
    clearAroundPlayer(state, 3)
    placeItem(state.backpack, 'clover', 0, 0)
    const dropped = dropItem(state, 'clover')
    expect(dropped).toBe(true)

    const groundItems = getGroundItemEntities(state)
    expect(groundItems).toHaveLength(1)
    const itemEid = groundItems[0]
    const itemPos = state.world.getComponent(itemEid, ComponentType.Position)
    expect(itemPos).toBeDefined()
    if (!itemPos) return

    const perimeter = [
      { x: itemPos.x - 1, y: itemPos.y - 1 },
      { x: itemPos.x, y: itemPos.y - 1 },
      { x: itemPos.x + 1, y: itemPos.y - 1 },
      { x: itemPos.x + 1, y: itemPos.y },
      { x: itemPos.x + 1, y: itemPos.y + 1 },
      { x: itemPos.x, y: itemPos.y + 1 },
      { x: itemPos.x - 1, y: itemPos.y + 1 },
      { x: itemPos.x - 1, y: itemPos.y },
    ]

    for (const p of perimeter) {
      state.player.x = p.x
      state.player.y = p.y
      pickUpGroundItems(state)
      expect(getGroundItemEntities(state)).toHaveLength(1)
      expect(containerHasItem(state.backpack, 'clover')).toBe(false)
    }
  })

  it('clears the exemption once the item is outside 3x3, then picks up on return', () => {
    const state = createTestState()
    clearAroundPlayer(state, 4)
    placeItem(state.backpack, 'clover', 0, 0)

    const startX = state.player.x
    const startY = state.player.y

    const dropped = dropItem(state, 'clover')
    expect(dropped).toBe(true)
    const groundItems = getGroundItemEntities(state)
    expect(groundItems).toHaveLength(1)
    const itemEid = groundItems[0]
    const itemPos = state.world.getComponent(itemEid, ComponentType.Position)
    expect(itemPos).toBeDefined()
    if (!itemPos) return

    state.player.x = startX + 3
    state.player.y = startY
    pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(1)
    expect(containerHasItem(state.backpack, 'clover')).toBe(false)

    state.player.x = itemPos.x
    state.player.y = itemPos.y
    pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(0)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('multiple dropped items each track their own exemption', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    placeItem(state.backpack, 'clover', 0, 0)
    placeItem(state.backpack, 'coin', 1, 0)

    const startX = state.player.x
    const startY = state.player.y

    expect(dropItem(state, 'clover')).toBe(true)
    expect(dropItem(state, 'coin')).toBe(true)
    expect(getGroundItemEntities(state)).toHaveLength(2)

    pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(2)

    state.player.x = startX + 3
    state.player.y = startY
    pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(2)

    state.player.x = startX
    state.player.y = startY
    pickUpGroundItems(state)
    expect(getGroundItemEntities(state)).toHaveLength(0)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
    expect(containerHasItem(state.backpack, 'coin')).toBe(true)
  })
})
