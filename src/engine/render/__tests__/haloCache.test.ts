// @vitest-environment jsdom
import { TileType } from '../../types'
import { getOrBuildHaloCache, invalidateHaloCache } from '../haloCache'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Tile } from '../../types'

// jsdom returns null from getContext('2d'). Install a minimal stub so the
// cache module's path/fill calls run without throwing.
const installCanvasContextStub = (): void => {
  const stub = (): unknown => ({
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    fill: () => undefined,
    fillStyle: '',
    globalAlpha: 1,
  })
  HTMLCanvasElement.prototype.getContext = stub as HTMLCanvasElement['getContext']
}

beforeAll(() => {
  installCanvasContextStub()
})

const makeMap = (cells: TileType[][]): Tile[][] => cells.map(row => row.map(type => ({ type })))

const tinyMap = (): Tile[][] =>
  makeMap([
    [TileType.Space, TileType.Space, TileType.Space],
    [TileType.Space, TileType.Dirt, TileType.Space],
    [TileType.Space, TileType.Space, TileType.Space],
  ])

describe('haloCache', () => {
  it('builds a cache entry on first call for a map ref', () => {
    const map = tinyMap()
    const entry = getOrBuildHaloCache(map, 10, 14)
    expect(entry.canvas).toBeDefined()
    expect(entry.charWidth).toBe(10)
    expect(entry.charHeight).toBe(14)
    expect(entry.mapWidth).toBe(3)
    expect(entry.mapHeight).toBe(3)
  })

  it('returns the same cache entry on repeated calls with the same map ref + metrics', () => {
    const map = tinyMap()
    const a = getOrBuildHaloCache(map, 10, 14)
    const b = getOrBuildHaloCache(map, 10, 14)
    expect(b).toBe(a)
    expect(b.canvas).toBe(a.canvas)
  })

  it('rebuilds when charWidth changes', () => {
    const map = tinyMap()
    const a = getOrBuildHaloCache(map, 10, 14)
    const b = getOrBuildHaloCache(map, 12, 14)
    expect(b).not.toBe(a)
    expect(b.charWidth).toBe(12)
  })

  it('rebuilds when charHeight changes', () => {
    const map = tinyMap()
    const a = getOrBuildHaloCache(map, 10, 14)
    const b = getOrBuildHaloCache(map, 10, 16)
    expect(b).not.toBe(a)
    expect(b.charHeight).toBe(16)
  })

  it('invalidateHaloCache forces a rebuild on the next call', () => {
    const map = tinyMap()
    const a = getOrBuildHaloCache(map, 10, 14)
    invalidateHaloCache(map)
    const b = getOrBuildHaloCache(map, 10, 14)
    expect(b).not.toBe(a)
  })

  it('keeps separate entries per map ref (zone swap)', () => {
    const overworld = tinyMap()
    const cave = tinyMap()
    const a = getOrBuildHaloCache(overworld, 10, 14)
    const b = getOrBuildHaloCache(cave, 10, 14)
    expect(b).not.toBe(a)
    // and the original cave/overworld entries don't collide on subsequent reads
    expect(getOrBuildHaloCache(overworld, 10, 14)).toBe(a)
    expect(getOrBuildHaloCache(cave, 10, 14)).toBe(b)
  })

  it('invalidating one map ref does not affect another', () => {
    const overworld = tinyMap()
    const cave = tinyMap()
    const o1 = getOrBuildHaloCache(overworld, 10, 14)
    const c1 = getOrBuildHaloCache(cave, 10, 14)
    invalidateHaloCache(overworld)
    expect(getOrBuildHaloCache(cave, 10, 14)).toBe(c1)
    expect(getOrBuildHaloCache(overworld, 10, 14)).not.toBe(o1)
  })

  it('sizes the canvas to the world iso bounding box, not the viewport', () => {
    const map = tinyMap()
    const entry = getOrBuildHaloCache(map, 10, 14)
    // Iso bounding box for a 3x3 map at (charWidth=10, charHeight=14):
    // width  ~ (mw-1)*cw + (mh-1)*cw + cw + cw/2 + ... = comfortably > viewport size
    // height ~ (mw+mh-2) * (ch/2) + ch + headroom
    // We don't assert exact pixels (the math has overlap padding), just the
    // contract that the canvas covers a multi-tile diagonal extent.
    const minExpectedWidth = 3 * 10
    const minExpectedHeight = 3 * 14
    expect(entry.canvas.width).toBeGreaterThan(minExpectedWidth)
    expect(entry.canvas.height).toBeGreaterThan(minExpectedHeight)
  })

  it('worldOrigin offsets place tile (0, 0) at a positive canvas position', () => {
    const map = tinyMap()
    const entry = getOrBuildHaloCache(map, 10, 14)
    expect(entry.worldOriginX).toBeGreaterThan(0)
    expect(entry.worldOriginY).toBeGreaterThanOrEqual(0)
  })
})
