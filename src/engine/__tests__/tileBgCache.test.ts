// @vitest-environment jsdom

import { setMapTile } from '../map'
import { flushDirtyTiles, getOrBuildCache, invalidateMapCache, markTileDirty } from '../tileBgCache'
import { TileType } from '../types'
import { createTestState } from './helpers'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const charWidth = 12
const charHeight = 16

let state: GameState

// jsdom returns null from getContext('2d'). Install a minimal stub so the
// cache module's path/fill/stroke calls run without throwing.
const installCanvasContextStub = (): void => {
  const stub = (): unknown => ({
    clearRect: () => undefined,
    fillRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  })
  HTMLCanvasElement.prototype.getContext = stub as HTMLCanvasElement['getContext']
}

beforeAll(() => {
  installCanvasContextStub()
})

beforeEach(() => {
  state = createTestState()
})

describe('tileBgCache', () => {
  it('lazily builds the cache on first call and reuses the entry on subsequent calls', () => {
    const first = getOrBuildCache(state, state.map, charWidth, charHeight)
    const second = getOrBuildCache(state, state.map, charWidth, charHeight)
    expect(first).toBe(second)
    expect(first.built).toBe(true)
    expect(first.canvas.width).toBeGreaterThan(0)
    expect(first.canvas.height).toBeGreaterThan(0)
  })

  it('keys cache entries by map ref so different maps get isolated entries', () => {
    const overworldEntry = getOrBuildCache(state, state.map, charWidth, charHeight)

    const otherState = createTestState()
    const otherEntry = getOrBuildCache(otherState, otherState.map, charWidth, charHeight)

    expect(overworldEntry).not.toBe(otherEntry)
    expect(overworldEntry.canvas).not.toBe(otherEntry.canvas)
  })

  it('rebuilds the canvas when char metrics change', () => {
    const first = getOrBuildCache(state, state.map, charWidth, charHeight)
    const second = getOrBuildCache(state, state.map, charWidth * 2, charHeight * 2)
    expect(first).not.toBe(second)
    expect(second.charWidth).toBe(charWidth * 2)
    expect(second.charHeight).toBe(charHeight * 2)
  })

  it('records dirty tiles via markTileDirty after the cache is built', () => {
    const entry = getOrBuildCache(state, state.map, charWidth, charHeight)
    expect(entry.dirty.size).toBe(0)
    markTileDirty(state.map, 5, 5)
    markTileDirty(state.map, 5, 6)
    expect(entry.dirty.size).toBe(2)
    expect(entry.dirty.has('5,5')).toBe(true)
    expect(entry.dirty.has('5,6')).toBe(true)
  })

  it('drops dirty tiles after flushing', () => {
    const entry = getOrBuildCache(state, state.map, charWidth, charHeight)
    markTileDirty(state.map, 10, 10)
    expect(entry.dirty.size).toBe(1)
    flushDirtyTiles(state, state.map)
    expect(entry.dirty.size).toBe(0)
  })

  it('markTileDirty is a no-op when no cache exists for the map', () => {
    const otherState = createTestState()
    expect(() => {
      markTileDirty(otherState.map, 0, 0)
    }).not.toThrow()
  })

  it('flushDirtyTiles is a no-op when no cache exists for the map', () => {
    const otherState = createTestState()
    expect(() => {
      flushDirtyTiles(otherState, otherState.map)
    }).not.toThrow()
  })

  it('invalidateMapCache drops the entry; next getOrBuildCache rebuilds', () => {
    const first = getOrBuildCache(state, state.map, charWidth, charHeight)
    invalidateMapCache(state.map)
    const second = getOrBuildCache(state, state.map, charWidth, charHeight)
    expect(first).not.toBe(second)
  })

  it('setMapTile marks the touched tile dirty so the cache repaints it on next flush', () => {
    const entry = getOrBuildCache(state, state.map, charWidth, charHeight)
    expect(entry.dirty.size).toBe(0)
    setMapTile(state, 20, 20, { type: TileType.Dirt })
    expect(entry.dirty.has('20,20')).toBe(true)
    flushDirtyTiles(state, state.map)
    expect(entry.dirty.size).toBe(0)
  })
})
