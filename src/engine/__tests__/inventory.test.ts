import {
  autoSort,
  buildOccupancyGrid,
  canPlace,
  containerHasItem,
  findFitPosition,
  findItemByDefinition,
  moveItem,
  placeItem,
  removeItem,
  transferItem,
} from '../inventory'
import { BACKPACK_HEIGHT, BACKPACK_WIDTH, createBackpack, createContainer } from '../items'
import { describe, expect, it } from 'vitest'

describe('buildOccupancyGrid', () => {
  it('returns empty grid for empty container', () => {
    const container = createContainer('test', 'Test', 3, 2)
    const grid = buildOccupancyGrid(container)
    expect(grid).toEqual([
      [null, null, null],
      [null, null, null],
    ])
  })

  it('marks cells occupied by placed items', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', 1, 2)

    const grid = buildOccupancyGrid(container)
    const occupiedCells = grid.flat().filter(c => c !== null)
    expect(occupiedCells).toHaveLength(1)
    expect(grid[2]?.[1]).not.toBeNull()
  })

  it('excludes item by uid', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const item = placeItem(container, 'bee', 0, 0)
    expect(item).not.toBeNull()

    const gridWith = buildOccupancyGrid(container)
    const gridWithout = buildOccupancyGrid(container, item?.uid)

    expect(gridWith[0]?.[0]).not.toBeNull()
    expect(gridWithout[0]?.[0]).toBeNull()
  })
})

describe('canPlace', () => {
  it('allows placing in empty container', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(canPlace(container, 'bee', 0, 0)).toBe(true)
  })

  it('rejects placement out of bounds (x)', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(canPlace(container, 'bee', 4, 0)).toBe(false)
  })

  it('rejects placement out of bounds (y)', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(canPlace(container, 'bee', 0, 4)).toBe(false)
  })

  it('rejects negative coordinates', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(canPlace(container, 'bee', -1, 0)).toBe(false)
    expect(canPlace(container, 'bee', 0, -1)).toBe(false)
  })

  it('rejects overlapping placement', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', 0, 0)
    expect(canPlace(container, 'clover', 0, 0)).toBe(false)
  })

  it('allows placement adjacent to existing item', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', 0, 0)
    expect(canPlace(container, 'clover', 1, 0)).toBe(true)
  })

  it('allows placement when excludeUid ignores the occupying item', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const item = placeItem(container, 'bee', 0, 0)
    expect(item).not.toBeNull()
    expect(canPlace(container, 'bee', 0, 0, item?.uid)).toBe(true)
  })
})

describe('placeItem', () => {
  it('places item and returns instance', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const instance = placeItem(container, 'bee', 0, 0)
    expect(instance).not.toBeNull()
    expect(instance?.definitionId).toBe('bee')
    expect(instance?.gridX).toBe(0)
    expect(instance?.gridY).toBe(0)
    expect(instance?.uid).toBeTruthy()
    expect(container.items).toHaveLength(1)
  })

  it('returns null when placement is invalid', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', 0, 0)
    const result = placeItem(container, 'clover', 0, 0)
    expect(result).toBeNull()
    expect(container.items).toHaveLength(1)
  })
})

describe('removeItem', () => {
  it('removes and returns the item', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const item = placeItem(container, 'bee', 0, 0)
    expect(item).not.toBeNull()
    const removed = removeItem(container, item?.uid ?? '')
    expect(removed).not.toBeNull()
    expect(removed?.uid).toBe(item?.uid)
    expect(container.items).toHaveLength(0)
  })

  it('returns null for unknown uid', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(removeItem(container, 'nonexistent')).toBeNull()
  })
})

describe('moveItem', () => {
  it('moves item to new position', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const item = placeItem(container, 'bee', 0, 0)
    expect(item).not.toBeNull()
    const result = moveItem(container, item?.uid ?? '', 2, 3)
    expect(result).toBe(true)
    expect(container.items[0]?.gridX).toBe(2)
    expect(container.items[0]?.gridY).toBe(3)
  })

  it('rejects move to occupied position', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', 0, 0)
    const item2 = placeItem(container, 'clover', 1, 0)
    expect(item2).not.toBeNull()
    const result = moveItem(container, item2?.uid ?? '', 0, 0)
    expect(result).toBe(false)
    expect(container.items[1]?.gridX).toBe(1)
    expect(container.items[1]?.gridY).toBe(0)
  })

  it('allows moving item to its own position', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const item = placeItem(container, 'bee', 0, 0)
    expect(item).not.toBeNull()
    const result = moveItem(container, item?.uid ?? '', 0, 0)
    expect(result).toBe(true)
  })

  it('returns false for unknown uid', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(moveItem(container, 'nonexistent', 0, 0)).toBe(false)
  })
})

describe('findFitPosition', () => {
  it('finds position in empty container', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const pos = findFitPosition(container, 'bee')
    expect(pos).not.toBeNull()
    expect(pos?.gridX).toBe(0)
    expect(pos?.gridY).toBe(0)
  })

  it('finds position around existing items', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', 0, 0)
    const pos = findFitPosition(container, 'clover')
    expect(pos).not.toBeNull()
    expect(pos?.gridX).toBe(1)
    expect(pos?.gridY).toBe(0)
  })

  it('returns null when container is full', () => {
    const container = createContainer('test', 'Test', 1, 1)
    placeItem(container, 'bee', 0, 0)
    const pos = findFitPosition(container, 'clover')
    expect(pos).toBeNull()
  })
})

describe('autoSort', () => {
  it('compacts items into top-left positions', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', 3, 3)
    placeItem(container, 'clover', 2, 2)

    const result = autoSort(container)
    expect(result).toBe(true)
    expect(container.items).toHaveLength(2)

    const positions = container.items.map(i => ({ x: i.gridX, y: i.gridY }))
    expect(positions).toContainEqual({ x: 0, y: 0 })
    expect(positions).toContainEqual({ x: 1, y: 0 })
  })

  it('preserves all items', () => {
    const container = createContainer('test', 'Test', 6, 4)
    placeItem(container, 'bee', 5, 3)
    placeItem(container, 'clover', 0, 3)

    autoSort(container)

    const defs = container.items.map(i => i.definitionId)
    expect(defs).toContain('bee')
    expect(defs).toContain('clover')
  })

  it('groups same-type items adjacent to each other', () => {
    const container = createContainer('test', 'Test', 4, 4)
    // Place items scattered
    placeItem(container, 'bee', 0, 0)
    placeItem(container, 'clover', 1, 0)
    placeItem(container, 'bee', 2, 0)
    placeItem(container, 'clover', 3, 0)

    autoSort(container)

    // Same-type items should be consecutive in placement order
    const defs = container.items.map(i => i.definitionId)
    const firstBee = defs.indexOf('bee')
    const lastBee = defs.lastIndexOf('bee')
    const firstClover = defs.indexOf('clover')
    const lastClover = defs.lastIndexOf('clover')

    // All bees should be in a contiguous block, same for clovers
    expect(lastBee - firstBee).toBe(1)
    expect(lastClover - firstClover).toBe(1)
  })

  it('sorts items by definitionId', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'clover', 0, 0)
    placeItem(container, 'bee', 1, 0)

    autoSort(container)

    // Sorted alphabetically: bee before clover
    expect(container.items[0]?.definitionId).toBe('bee')
    expect(container.items[1]?.definitionId).toBe('clover')
  })

  it('preserves item uids across sort', () => {
    const container = createContainer('test', 'Test', 6, 4)
    const a = placeItem(container, 'bee', 5, 3)
    const b = placeItem(container, 'clover', 0, 3)

    const uidA = a?.uid
    const uidB = b?.uid

    autoSort(container)

    const uids = container.items.map(i => i.uid)
    expect(uids).toContain(uidA)
    expect(uids).toContain(uidB)
  })
})

describe('transferItem', () => {
  it('moves item between containers', () => {
    const source = createContainer('a', 'A', 4, 4)
    const target = createContainer('b', 'B', 4, 4)
    const item = placeItem(source, 'bee', 0, 0)
    expect(item).not.toBeNull()

    const result = transferItem(source, target, item?.uid ?? '', 2, 2)
    expect(result).toBe(true)
    expect(source.items).toHaveLength(0)
    expect(target.items).toHaveLength(1)
    expect(target.items[0]?.definitionId).toBe('bee')
  })

  it('rolls back on failed placement', () => {
    const source = createContainer('a', 'A', 4, 4)
    const target = createContainer('b', 'B', 1, 1)
    const item = placeItem(source, 'bee', 0, 0)
    expect(item).not.toBeNull()
    placeItem(target, 'clover', 0, 0)

    const result = transferItem(source, target, item?.uid ?? '', 0, 0)
    expect(result).toBe(false)
    expect(source.items).toHaveLength(1)
    expect(target.items).toHaveLength(1)
  })

  it('returns false for unknown uid', () => {
    const source = createContainer('a', 'A', 4, 4)
    const target = createContainer('b', 'B', 4, 4)
    expect(transferItem(source, target, 'nope', 0, 0)).toBe(false)
  })

  it('preserves uid on successful transfer', () => {
    const source = createContainer('a', 'A', 4, 4)
    const target = createContainer('b', 'B', 4, 4)
    const item = placeItem(source, 'bee', 0, 0)
    expect(item).not.toBeNull()
    const originalUid = item?.uid ?? ''

    transferItem(source, target, originalUid, 2, 2)
    expect(target.items[0]?.uid).toBe(originalUid)
  })

  it('preserves uid on failed transfer (rollback)', () => {
    const source = createContainer('a', 'A', 4, 4)
    const target = createContainer('b', 'B', 1, 1)
    const item = placeItem(source, 'bee', 0, 0)
    expect(item).not.toBeNull()
    const originalUid = item?.uid ?? ''
    placeItem(target, 'clover', 0, 0)

    transferItem(source, target, originalUid, 0, 0)
    expect(source.items[0]?.uid).toBe(originalUid)
  })
})

describe('containerHasItem', () => {
  it('returns true when item is present', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', 0, 0)
    expect(containerHasItem(container, 'bee')).toBe(true)
  })

  it('returns false when item is not present', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(containerHasItem(container, 'bee')).toBe(false)
  })
})

describe('findItemByDefinition', () => {
  it('returns the item instance', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const placed = placeItem(container, 'bee', 0, 0)
    expect(placed).not.toBeNull()
    const found = findItemByDefinition(container, 'bee')
    expect(found).not.toBeUndefined()
    expect(found?.uid).toBe(placed?.uid)
  })

  it('returns undefined when not found', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(findItemByDefinition(container, 'bee')).toBeUndefined()
  })
})

describe('backpack dimensions', () => {
  it('is 10 columns wide and 5 rows tall', () => {
    expect(BACKPACK_WIDTH).toBe(10)
    expect(BACKPACK_HEIGHT).toBe(5)
  })

  it('creates a backpack with 50 total cells', () => {
    const backpack = createBackpack()
    expect(backpack.width).toBe(10)
    expect(backpack.height).toBe(5)
  })

  it('rejects placement when all 50 cells are full', () => {
    const backpack = createBackpack()
    for (let y = 0; y < BACKPACK_HEIGHT; y++) {
      for (let x = 0; x < BACKPACK_WIDTH; x++) {
        const placed = placeItem(backpack, 'bee', x, y)
        expect(placed).not.toBeNull()
      }
    }
    expect(backpack.items).toHaveLength(50)
    expect(findFitPosition(backpack, 'bee')).toBeNull()
    expect(placeItem(backpack, 'bee', 0, 0)).toBeNull()
  })
})
