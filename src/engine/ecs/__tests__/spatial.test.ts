import { describe, expect, it } from 'vitest'

import { createSpatialIndex } from '../spatial'

describe('SpatialIndex', () => {
  it('inserts and retrieves entities at a position', () => {
    const index = createSpatialIndex()
    index.insert(1, 5, 10)
    index.insert(2, 5, 10)
    expect(index.at(5, 10)).toEqual(expect.arrayContaining([1, 2]))
    expect(index.at(5, 10)).toHaveLength(2)
  })

  it('returns empty array for empty cell', () => {
    const index = createSpatialIndex()
    expect(index.at(0, 0)).toEqual([])
  })

  it('removes entities from a position', () => {
    const index = createSpatialIndex()
    index.insert(1, 5, 10)
    index.insert(2, 5, 10)
    index.remove(1, 5, 10)
    expect(index.at(5, 10)).toEqual([2])
  })

  it('moves an entity atomically', () => {
    const index = createSpatialIndex()
    index.insert(1, 0, 0)
    index.move(1, 0, 0, 3, 4)
    expect(index.at(0, 0)).toEqual([])
    expect(index.at(3, 4)).toEqual([1])
  })

  it('queries entities in a radius', () => {
    const index = createSpatialIndex()
    index.insert(1, 5, 5)
    index.insert(2, 6, 5)
    index.insert(3, 10, 10) // outside radius
    const result = index.inRadius(5, 5, 2)
    expect(result).toEqual(expect.arrayContaining([1, 2]))
    expect(result).not.toContain(3)
  })

  it('queries entities in a rect', () => {
    const index = createSpatialIndex()
    index.insert(1, 2, 2)
    index.insert(2, 3, 3)
    index.insert(3, 10, 10) // outside rect
    const result = index.inRect(2, 2, 3, 3)
    expect(result).toEqual(expect.arrayContaining([1, 2]))
    expect(result).not.toContain(3)
  })

  it('clears all entities', () => {
    const index = createSpatialIndex()
    index.insert(1, 0, 0)
    index.insert(2, 5, 5)
    index.clear()
    expect(index.at(0, 0)).toEqual([])
    expect(index.at(5, 5)).toEqual([])
  })
})
