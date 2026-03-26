import { generateTerrain } from '../terrain'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

describe('generateTerrain', () => {
  it('creates a grid of the specified dimensions', () => {
    const terrain = generateTerrain(50, 30)
    expect(terrain.length).toBe(30)
    expect(terrain[0].length).toBe(50)
  })

  it('fills corner tiles with space or sand (never dirt)', () => {
    const terrain = generateTerrain(100, 100)
    const corners = [terrain[0][0], terrain[0][99], terrain[99][0], terrain[99][99]]
    for (const tile of corners) {
      expect(tile.type).not.toBe(TileType.Dirt)
    }
  })

  it('fills center tiles with dirt', () => {
    const terrain = generateTerrain(100, 100)
    expect(terrain[50][50].type).toBe(TileType.Dirt)
    expect(terrain[40][40].type).toBe(TileType.Dirt)
    expect(terrain[60][60].type).toBe(TileType.Dirt)
  })

  it('creates independent rows (no shared references)', () => {
    const terrain = generateTerrain(100, 100)
    terrain[50][50] = { type: TileType.Clover }
    expect(terrain[51][50].type).toBe(TileType.Dirt)
  })
})
