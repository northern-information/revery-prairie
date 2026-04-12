import { updateCursorState } from '../cursor'
import { posKey } from '../position'
import { TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { CharMetrics } from '../types'

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

describe('cursor tile info', () => {
  describe('water tiles are cursorable', () => {
    it('sets cursorTile when cursor is over a pond tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const px = state.player.x + 2
      const py = state.player.y
      state.ponds.add(posKey(px, py))

      state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
      state.cursorScreenPos = {
        x: (px - state.camera.x) * metrics.charWidth,
        y: (py - state.camera.y) * metrics.charHeight,
      }

      updateCursorState(state, metrics)

      expect(state.cursorTile).toEqual({ x: px, y: py })
    })

    it('sets cursorTile when cursor is over a river tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const rx = state.player.x + 3
      const ry = state.player.y
      state.rivers.add(posKey(rx, ry))

      state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
      state.cursorScreenPos = {
        x: (rx - state.camera.x) * metrics.charWidth,
        y: (ry - state.camera.y) * metrics.charHeight,
      }

      updateCursorState(state, metrics)

      expect(state.cursorTile).toEqual({ x: rx, y: ry })
    })
  })

  describe('fresh water label', () => {
    it('pond position is detected via state.ponds', () => {
      const state = createTestState()
      const x = state.player.x + 1
      const y = state.player.y
      const key = posKey(x, y)
      state.ponds.add(key)

      expect(state.ponds.has(key)).toBe(true)
      expect(state.rivers.has(key)).toBe(false)
    })

    it('river position is detected via state.rivers', () => {
      const state = createTestState()
      const x = state.player.x + 1
      const y = state.player.y
      const key = posKey(x, y)
      state.rivers.add(key)

      expect(state.rivers.has(key)).toBe(true)
      expect(state.ponds.has(key)).toBe(false)
    })

    it('water label takes priority over underlying dirt tile type', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      const key = posKey(x, y)
      // Tile is dirt, but has a pond overlay
      expect(state.map[y][x].type).toBe(TileType.Dirt)
      state.ponds.add(key)

      // Simulate the sidebar label derivation logic
      const label = state.ponds.has(key) || state.rivers.has(key) ? 'fresh water' : state.map[y][x].type
      expect(label).toBe('fresh water')
    })
  })

  describe('stone label', () => {
    it('CaveWall tile type maps to stone label', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.CaveWall }

      const tileType = state.map[y][x].type
      const label =
        tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall ? 'stone' : (tileType ?? 'void')
      expect(label).toBe('stone')
    })

    it('CaveBreakableWall tile type maps to stone label', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.CaveBreakableWall }

      const tileType = state.map[y][x].type
      const label =
        tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall ? 'stone' : (tileType ?? 'void')
      expect(label).toBe('stone')
    })

    it('breakable wall shows same label as regular wall', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x1 = state.player.x + 1
      const x2 = state.player.x + 2
      const y = state.player.y
      state.map[y][x1] = { type: TileType.CaveWall }
      state.map[y][x2] = { type: TileType.CaveBreakableWall }

      const deriveLabel = (tileType: string | undefined) =>
        tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall ? 'stone' : (tileType ?? 'void')

      expect(deriveLabel(state.map[y][x1].type)).toBe(deriveLabel(state.map[y][x2].type))
    })

    it('other tile types are not mapped to stone', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y

      const tileType = state.map[y][x].type
      const label =
        tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall ? 'stone' : (tileType ?? 'void')
      expect(label).not.toBe('stone')
      expect(label).toBe(TileType.Dirt)
    })
  })
})
