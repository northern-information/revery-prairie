import { findPath } from '../pathfinding'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

import type { Tile } from '../types'

const dirt = (): Tile => ({ type: TileType.Dirt })
const water = (): Tile => ({ type: TileType.Space })

const makeGrid = (width: number, height: number): Tile[][] =>
  Array.from({ length: height }, () => Array.from({ length: width }, () => dirt()))

describe('findPath', () => {
  it('finds a straight horizontal path', () => {
    const map = makeGrid(5, 1)
    const path = findPath(map, 5, 1, { x: 0, y: 0 }, { x: 4, y: 0 })
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ])
  })

  it('finds a straight vertical path', () => {
    const map = makeGrid(1, 5)
    const path = findPath(map, 1, 5, { x: 0, y: 0 }, { x: 0, y: 4 })
    expect(path).toEqual([
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
      { x: 0, y: 4 },
    ])
  })

  it('routes around a wall of water tiles', () => {
    // 5x5 grid with a vertical wall at x=2, gap at y=4
    // S . # . E
    // . . # . .
    // . . # . .
    // . . # . .
    // . . . . .
    const map = makeGrid(5, 5)
    for (let y = 0; y < 4; y++) {
      map[y][2] = water()
    }
    const path = findPath(map, 5, 5, { x: 0, y: 0 }, { x: 4, y: 0 })
    expect(path).not.toBeNull()
    if (!path) return
    // Path must not cross any water tile
    for (const p of path) {
      expect(map[p.y][p.x].type).not.toBe(TileType.Space)
    }
    // Path must end at destination
    expect(path[path.length - 1]).toEqual({ x: 4, y: 0 })
  })

  it('returns null when destination is enclosed by water', () => {
    // 5x5 grid, destination at (2,2) surrounded by water
    const map = makeGrid(5, 5)
    map[1][1] = water()
    map[1][2] = water()
    map[1][3] = water()
    map[2][1] = water()
    map[2][3] = water()
    map[3][1] = water()
    map[3][2] = water()
    map[3][3] = water()
    const path = findPath(map, 5, 5, { x: 0, y: 0 }, { x: 2, y: 2 })
    expect(path).toBeNull()
  })

  it('returns null when destination is water', () => {
    const map = makeGrid(5, 5)
    map[2][2] = water()
    const path = findPath(map, 5, 5, { x: 0, y: 0 }, { x: 2, y: 2 })
    expect(path).toBeNull()
  })

  it('returns null when destination is out of bounds', () => {
    const map = makeGrid(5, 5)
    expect(findPath(map, 5, 5, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeNull()
    expect(findPath(map, 5, 5, { x: 0, y: 0 }, { x: -1, y: 0 })).toBeNull()
    expect(findPath(map, 5, 5, { x: 0, y: 0 }, { x: 0, y: 5 })).toBeNull()
  })

  it('returns null when from equals to', () => {
    const map = makeGrid(5, 5)
    const path = findPath(map, 5, 5, { x: 2, y: 2 }, { x: 2, y: 2 })
    expect(path).toBeNull()
  })

  it('finds path along map edge', () => {
    const map = makeGrid(5, 5)
    // Block the interior
    for (let y = 1; y < 4; y++) {
      for (let x = 1; x < 4; x++) {
        map[y][x] = water()
      }
    }
    const path = findPath(map, 5, 5, { x: 0, y: 0 }, { x: 4, y: 0 })
    expect(path).not.toBeNull()
    if (!path) return
    for (const p of path) {
      expect(map[p.y][p.x].type).not.toBe(TileType.Space)
    }
    expect(path[path.length - 1]).toEqual({ x: 4, y: 0 })
  })

  it('produces an optimal-length path on open grid', () => {
    const map = makeGrid(10, 10)
    const path = findPath(map, 10, 10, { x: 0, y: 0 }, { x: 5, y: 3 })
    // Manhattan distance = 5 + 3 = 8 steps
    expect(path).not.toBeNull()
    if (!path) return
    expect(path.length).toBe(8)
  })

  it('walks through sand tiles', () => {
    const map = makeGrid(3, 1)
    map[0][1] = { type: TileType.Sand }
    const path = findPath(map, 3, 1, { x: 0, y: 0 }, { x: 2, y: 0 })
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ])
  })
})
