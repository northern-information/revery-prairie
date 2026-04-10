import {
  autoSort,
  buildOccupancyGrid,
  canPlace,
  containerHasItem,
  findFitPosition,
  findItemByDefinition,
  getRotatedShape,
  moveItem,
  placeItem,
  removeItem,
  rotateShapeCW,
  shapeHeight,
  shapeWidth,
  transferItem,
} from '../inventory'
import { createContainer } from '../items'
import { Rotation } from '../types'
import { describe, expect, it } from 'vitest'

describe('rotateShapeCW', () => {
  it('rotates a 1x1 shape', () => {
    expect(rotateShapeCW([[true]])).toEqual([[true]])
  })

  it('rotates a 1x2 vertical shape to 2x1 horizontal', () => {
    const shape = [[true], [true]]
    const rotated = rotateShapeCW(shape)
    expect(rotated).toEqual([[true, true]])
  })

  it('rotates a 2x1 horizontal shape to 1x2 vertical', () => {
    const shape = [[true, true]]
    const rotated = rotateShapeCW(shape)
    expect(rotated).toEqual([[true], [true]])
  })

  it('rotates an L-shape correctly', () => {
    const lShape = [
      [true, false],
      [true, false],
      [true, true],
    ]
    const rotated = rotateShapeCW(lShape)
    expect(rotated).toEqual([
      [true, true, true],
      [true, false, false],
    ])
  })

  it('four rotations return to original', () => {
    const shape = [
      [true, false],
      [true, true],
    ]
    let result = shape
    for (let i = 0; i < 4; i++) {
      result = rotateShapeCW(result)
    }
    expect(result).toEqual(shape)
  })
})

describe('getRotatedShape', () => {
  it('R0 returns original shape', () => {
    const shape = [
      [true, false],
      [true, true],
    ]
    expect(getRotatedShape(shape, Rotation.R0)).toEqual(shape)
  })

  it('R90 rotates once', () => {
    const shape = [[true], [true]]
    expect(getRotatedShape(shape, Rotation.R90)).toEqual([[true, true]])
  })

  it('R180 rotates twice', () => {
    const shape = [
      [true, false],
      [true, true],
    ]
    const r180 = getRotatedShape(shape, Rotation.R180)
    expect(r180).toEqual([
      [true, true],
      [false, true],
    ])
  })

  it('R270 rotates three times', () => {
    const shape = [[true], [true]]
    expect(getRotatedShape(shape, Rotation.R270)).toEqual([[true, true]])
  })
})

describe('shapeWidth and shapeHeight', () => {
  it('returns correct dimensions for 1x1', () => {
    expect(shapeWidth([[true]])).toBe(1)
    expect(shapeHeight([[true]])).toBe(1)
  })

  it('returns correct dimensions for 2x3', () => {
    const shape = [
      [true, true],
      [true, false],
      [true, true],
    ]
    expect(shapeWidth(shape)).toBe(2)
    expect(shapeHeight(shape)).toBe(3)
  })
})

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
    placeItem(container, 'bee', Rotation.R0, 1, 2)

    const grid = buildOccupancyGrid(container)
    const occupiedCells = grid.flat().filter(c => c !== null)
    expect(occupiedCells).toHaveLength(1)
    expect(grid[2]?.[1]).not.toBeNull()
  })

  it('excludes item by uid', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const item = placeItem(container, 'bee', Rotation.R0, 0, 0)
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
    expect(canPlace(container, 'bee', Rotation.R0, 0, 0)).toBe(true)
  })

  it('rejects placement out of bounds (x)', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(canPlace(container, 'bee', Rotation.R0, 4, 0)).toBe(false)
  })

  it('rejects placement out of bounds (y)', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(canPlace(container, 'bee', Rotation.R0, 0, 4)).toBe(false)
  })

  it('rejects negative coordinates', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(canPlace(container, 'bee', Rotation.R0, -1, 0)).toBe(false)
    expect(canPlace(container, 'bee', Rotation.R0, 0, -1)).toBe(false)
  })

  it('rejects overlapping placement', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', Rotation.R0, 0, 0)
    expect(canPlace(container, 'clover', Rotation.R0, 0, 0)).toBe(false)
  })

  it('allows placement adjacent to existing item', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', Rotation.R0, 0, 0)
    expect(canPlace(container, 'clover', Rotation.R0, 1, 0)).toBe(true)
  })

  it('allows placement when excludeUid ignores the occupying item', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const item = placeItem(container, 'bee', Rotation.R0, 0, 0)
    expect(item).not.toBeNull()
    expect(canPlace(container, 'bee', Rotation.R0, 0, 0, item?.uid)).toBe(true)
  })
})

describe('placeItem', () => {
  it('places item and returns instance', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const instance = placeItem(container, 'bee', Rotation.R0, 0, 0)
    expect(instance).not.toBeNull()
    expect(instance?.definitionId).toBe('bee')
    expect(instance?.gridX).toBe(0)
    expect(instance?.gridY).toBe(0)
    expect(instance?.uid).toBeTruthy()
    expect(container.items).toHaveLength(1)
  })

  it('returns null when placement is invalid', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', Rotation.R0, 0, 0)
    const result = placeItem(container, 'clover', Rotation.R0, 0, 0)
    expect(result).toBeNull()
    expect(container.items).toHaveLength(1)
  })
})

describe('removeItem', () => {
  it('removes and returns the item', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const item = placeItem(container, 'bee', Rotation.R0, 0, 0)
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
    const item = placeItem(container, 'bee', Rotation.R0, 0, 0)
    expect(item).not.toBeNull()
    const result = moveItem(container, item?.uid ?? '', 2, 3, Rotation.R0)
    expect(result).toBe(true)
    expect(container.items[0]?.gridX).toBe(2)
    expect(container.items[0]?.gridY).toBe(3)
  })

  it('moves item with rotation change', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const item = placeItem(container, 'bee', Rotation.R0, 0, 0)
    expect(item).not.toBeNull()
    const result = moveItem(container, item?.uid ?? '', 1, 1, Rotation.R90)
    expect(result).toBe(true)
    expect(container.items[0]?.rotation).toBe(Rotation.R90)
  })

  it('rejects move to occupied position', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', Rotation.R0, 0, 0)
    const item2 = placeItem(container, 'clover', Rotation.R0, 1, 0)
    expect(item2).not.toBeNull()
    const result = moveItem(container, item2?.uid ?? '', 0, 0, Rotation.R0)
    expect(result).toBe(false)
    expect(container.items[1]?.gridX).toBe(1)
    expect(container.items[1]?.gridY).toBe(0)
  })

  it('allows moving item to its own position', () => {
    const container = createContainer('test', 'Test', 4, 4)
    const item = placeItem(container, 'bee', Rotation.R0, 0, 0)
    expect(item).not.toBeNull()
    const result = moveItem(container, item?.uid ?? '', 0, 0, Rotation.R0)
    expect(result).toBe(true)
  })

  it('returns false for unknown uid', () => {
    const container = createContainer('test', 'Test', 4, 4)
    expect(moveItem(container, 'nonexistent', 0, 0, Rotation.R0)).toBe(false)
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
    placeItem(container, 'bee', Rotation.R0, 0, 0)
    const pos = findFitPosition(container, 'clover')
    expect(pos).not.toBeNull()
    expect(pos?.gridX).toBe(1)
    expect(pos?.gridY).toBe(0)
  })

  it('returns null when container is full', () => {
    const container = createContainer('test', 'Test', 1, 1)
    placeItem(container, 'bee', Rotation.R0, 0, 0)
    const pos = findFitPosition(container, 'clover')
    expect(pos).toBeNull()
  })
})

describe('autoSort', () => {
  it('compacts items into top-left positions', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', Rotation.R0, 3, 3)
    placeItem(container, 'clover', Rotation.R0, 2, 2)

    const result = autoSort(container)
    expect(result).toBe(true)
    expect(container.items).toHaveLength(2)

    const positions = container.items.map(i => ({ x: i.gridX, y: i.gridY }))
    expect(positions).toContainEqual({ x: 0, y: 0 })
    expect(positions).toContainEqual({ x: 1, y: 0 })
  })

  it('preserves all items', () => {
    const container = createContainer('test', 'Test', 6, 4)
    placeItem(container, 'bee', Rotation.R0, 5, 3)
    placeItem(container, 'clover', Rotation.R0, 0, 3)

    autoSort(container)

    const defs = container.items.map(i => i.definitionId)
    expect(defs).toContain('bee')
    expect(defs).toContain('clover')
  })

  it('groups same-type items adjacent to each other', () => {
    const container = createContainer('test', 'Test', 4, 4)
    // Place items scattered
    placeItem(container, 'bee', Rotation.R0, 0, 0)
    placeItem(container, 'clover', Rotation.R0, 1, 0)
    placeItem(container, 'bee', Rotation.R0, 2, 0)
    placeItem(container, 'clover', Rotation.R0, 3, 0)

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

  it('places larger items first', () => {
    const container = createContainer('test', 'Test', 4, 6)
    placeItem(container, 'bee', Rotation.R0, 0, 0)
    placeItem(container, 'permacomputer', Rotation.R0, 1, 0)

    autoSort(container)

    // Permacomputer (2x1) should be placed before bee (1x1)
    const sampler = container.items.find(i => i.definitionId === 'permacomputer')
    expect(sampler?.gridX).toBe(0)
    expect(sampler?.gridY).toBe(0)
  })

  it('preserves item uids across sort', () => {
    const container = createContainer('test', 'Test', 6, 4)
    const a = placeItem(container, 'bee', Rotation.R0, 5, 3)
    const b = placeItem(container, 'clover', Rotation.R0, 0, 3)

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
    const item = placeItem(source, 'bee', Rotation.R0, 0, 0)
    expect(item).not.toBeNull()

    const result = transferItem(source, target, item?.uid ?? '', 2, 2, Rotation.R0)
    expect(result).toBe(true)
    expect(source.items).toHaveLength(0)
    expect(target.items).toHaveLength(1)
    expect(target.items[0]?.definitionId).toBe('bee')
  })

  it('rolls back on failed placement', () => {
    const source = createContainer('a', 'A', 4, 4)
    const target = createContainer('b', 'B', 1, 1)
    const item = placeItem(source, 'bee', Rotation.R0, 0, 0)
    expect(item).not.toBeNull()
    placeItem(target, 'clover', Rotation.R0, 0, 0)

    const result = transferItem(source, target, item?.uid ?? '', 0, 0, Rotation.R0)
    expect(result).toBe(false)
    expect(source.items).toHaveLength(1)
    expect(target.items).toHaveLength(1)
  })

  it('returns false for unknown uid', () => {
    const source = createContainer('a', 'A', 4, 4)
    const target = createContainer('b', 'B', 4, 4)
    expect(transferItem(source, target, 'nope', 0, 0, Rotation.R0)).toBe(false)
  })

  it('preserves uid on successful transfer', () => {
    const source = createContainer('a', 'A', 4, 4)
    const target = createContainer('b', 'B', 4, 4)
    const item = placeItem(source, 'bee', Rotation.R0, 0, 0)
    expect(item).not.toBeNull()
    const originalUid = item?.uid ?? ''

    transferItem(source, target, originalUid, 2, 2, Rotation.R0)
    expect(target.items[0]?.uid).toBe(originalUid)
  })

  it('preserves uid on failed transfer (rollback)', () => {
    const source = createContainer('a', 'A', 4, 4)
    const target = createContainer('b', 'B', 1, 1)
    const item = placeItem(source, 'bee', Rotation.R0, 0, 0)
    expect(item).not.toBeNull()
    const originalUid = item?.uid ?? ''
    placeItem(target, 'clover', Rotation.R0, 0, 0)

    transferItem(source, target, originalUid, 0, 0, Rotation.R0)
    expect(source.items[0]?.uid).toBe(originalUid)
  })
})

describe('containerHasItem', () => {
  it('returns true when item is present', () => {
    const container = createContainer('test', 'Test', 4, 4)
    placeItem(container, 'bee', Rotation.R0, 0, 0)
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
    const placed = placeItem(container, 'bee', Rotation.R0, 0, 0)
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
