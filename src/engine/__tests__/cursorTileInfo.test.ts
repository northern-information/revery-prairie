import { updateCursorState } from '../cursor'
import { ComponentType } from '../ecs/types'
import { getTileEffects } from '../effects'
import { posKey } from '../position'
import { worldToScreen } from '../projection'
import { Sky, TileType, WindDirection, Zone } from '../types'
import { clearAroundPlayer, createBeeEntity, createBeehiveEntity, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { CharMetrics, GameState, Position } from '../types'

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

const cursorPosForTile = (state: GameState, target: Position) => {
  const { px, py } = worldToScreen(
    target.x,
    target.y,
    state.camera,
    metrics.charWidth,
    metrics.charHeight,
    state.viewportWidth,
    state.viewportHeight
  )
  return { x: px + 0.01, y: py + metrics.charHeight / 2 + 0.01 }
}

/**
 * Replicates the sidebar contents label derivation logic from Sidebar.tsx.
 * Must be kept in sync with the IIFE in the sidebar component.
 */
const deriveContentsLabel = (state: ReturnType<typeof createTestState>, x: number, y: number): string => {
  const { world } = state
  if (x === state.player.x && y === state.player.y) return state.stewardName.toLowerCase()
  const hasBee = world.spatial.at(x, y).some(eid => world.getComponent(eid, ComponentType.EntityTag) === 'bee')
  if (hasBee) return 'bee'
  const hasMeteorite = world.spatial
    .at(x, y)
    .some(eid => world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')
  if (hasMeteorite) return 'meteorite'
  const hasBeehive = world.spatial.at(x, y).some(eid => world.getComponent(eid, ComponentType.EntityTag) === 'beehive')
  if (hasBeehive) return 'beehive'
  const key = posKey(x, y)
  if (state.ponds.has(key) || state.rivers.has(key)) return 'fresh water'
  const tileType = state.map[y]?.[x]?.type
  if (tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall) return 'stone'
  if (tileType === TileType.CaveFloor) return 'dirt'
  if (tileType === TileType.CaveEntrance) return 'cave entrance'
  if (tileType === TileType.BurntFlora) return 'burnt clover'
  return tileType ?? 'void'
}

describe('cursor tile info', () => {
  describe('water tiles are cursorable', () => {
    it('sets cursorTile when cursor is over a pond tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const px = state.player.x + 2
      const py = state.player.y
      state.ponds.add(posKey(px, py))

      state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
      state.cursorScreenPos = cursorPosForTile(state, { x: px, y: py })

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
      state.cursorScreenPos = cursorPosForTile(state, { x: rx, y: ry })

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
      expect(state.map[y][x].type).toBe(TileType.Dirt)
      state.ponds.add(key)

      expect(deriveContentsLabel(state, x, y)).toBe('fresh water')
    })
  })

  describe('stone label', () => {
    it('CaveWall tile type maps to stone label', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.CaveWall }

      expect(deriveContentsLabel(state, x, y)).toBe('stone')
    })

    it('CaveBreakableWall tile type maps to stone label', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.CaveBreakableWall }

      expect(deriveContentsLabel(state, x, y)).toBe('stone')
    })

    it('breakable wall shows same label as regular wall', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x1 = state.player.x + 1
      const x2 = state.player.x + 2
      const y = state.player.y
      state.map[y][x1] = { type: TileType.CaveWall }
      state.map[y][x2] = { type: TileType.CaveBreakableWall }

      expect(deriveContentsLabel(state, x1, y)).toBe(deriveContentsLabel(state, x2, y))
    })

    it('other tile types are not mapped to stone', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y

      expect(deriveContentsLabel(state, x, y)).not.toBe('stone')
      expect(deriveContentsLabel(state, x, y)).toBe(TileType.Dirt)
    })
  })

  describe('cave floor dirt label', () => {
    it('CaveFloor tile type maps to dirt label', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.CaveFloor }

      expect(deriveContentsLabel(state, x, y)).toBe('dirt')
    })

    it('CaveEntrance tile type maps to cave entrance label', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.CaveEntrance }

      expect(deriveContentsLabel(state, x, y)).toBe('cave entrance')
    })

    it('water overlay on cave floor shows fresh water not dirt', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.CaveFloor }
      state.ponds.add(posKey(x, y))

      expect(deriveContentsLabel(state, x, y)).toBe('fresh water')
    })

    it('broken breakable wall becomes CaveFloor and shows dirt', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.CaveBreakableWall }
      expect(deriveContentsLabel(state, x, y)).toBe('stone')
      state.map[y][x] = { type: TileType.CaveFloor }
      expect(deriveContentsLabel(state, x, y)).toBe('dirt')
    })
  })

  describe('beehive contents', () => {
    it('beehive entity shows "beehive" in contents', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      createBeehiveEntity(state, x, y)

      expect(deriveContentsLabel(state, x, y)).toBe('beehive')
    })

    it('beehive takes priority over underlying clover tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.Flora }
      createBeehiveEntity(state, x, y)

      expect(deriveContentsLabel(state, x, y)).toBe('beehive')
    })

    it('bee takes priority over beehive on same tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      createBeehiveEntity(state, x, y)
      createBeeEntity(state, x, y)

      expect(deriveContentsLabel(state, x, y)).toBe('bee')
    })
  })

  describe('burnt clover label', () => {
    it('BurntClover tile type maps to "burnt clover" label', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.BurntFlora }

      expect(deriveContentsLabel(state, x, y)).toBe('burnt clover')
    })

    it('does not show raw camelCase type string', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.map[y][x] = { type: TileType.BurntFlora }

      expect(deriveContentsLabel(state, x, y)).not.toBe('burntClover')
    })
  })

  describe('effects: glinting zones', () => {
    it('returns "glinting" when tile is in a glint zone (overworld)', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.currentZone = Zone.Overworld
      state.glintZones.add(posKey(x, y))

      const effects = getTileEffects(state, x, y)
      expect(effects).toContain('glinting')
    })

    it('does not return "glinting" when tile is not in a glint zone', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.currentZone = Zone.Overworld

      const effects = getTileEffects(state, x, y)
      expect(effects).not.toContain('glinting')
    })

    it('does not return "glinting" in cave zone', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const x = state.player.x + 1
      const y = state.player.y
      state.currentZone = Zone.Cave
      state.glintZones.add(posKey(x, y))

      const effects = getTileEffects(state, x, y)
      expect(effects).not.toContain('glinting')
    })
  })

  describe('effects: weather rain front', () => {
    it('returns "rain" when tile is within rain front band', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      state.currentZone = Zone.Overworld
      state.weather.sky = Sky.Rain
      // SW maps to { axis: 'x', sign: 1 } in the rotated cardinal frame
      // (precis-thinktank-v5 round 1). Swapped from the old WindDirection.E
      // to preserve the test's "front aligned with player.x + 1" intent.
      state.weather.windDirection = WindDirection.SW
      state.rainFrontOffset = state.player.x + 1

      const effects = getTileEffects(state, state.player.x + 1, state.player.y)
      expect(effects).toContain('rain')
    })

    it('does not return "rain" when weather is not rainy', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      state.currentZone = Zone.Overworld
      state.weather.sky = Sky.Sun
      state.rainFrontOffset = state.player.x + 1

      const effects = getTileEffects(state, state.player.x + 1, state.player.y)
      expect(effects).not.toContain('rain')
    })

    it('does not return "rain" in cave zone', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      state.currentZone = Zone.Cave
      state.weather.sky = Sky.Rain
      state.rainFrontOffset = state.player.x + 1

      const effects = getTileEffects(state, state.player.x + 1, state.player.y)
      expect(effects).not.toContain('rain')
    })
  })
})
