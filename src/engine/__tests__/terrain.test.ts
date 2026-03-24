import { generateTerrain } from '../terrain'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

describe('generateTerrain', () => {
  it('creates a grid of the specified dimensions', () => {
    const terrain = generateTerrain(50, 30)
    expect(terrain.length).toBe(30)
    expect(terrain[0].length).toBe(50)
  })

  it('fills corner tiles with space', () => {
    const terrain = generateTerrain(100, 100)
    expect(terrain[0][0].type).toBe(TileType.Space)
    expect(terrain[0][99].type).toBe(TileType.Space)
    expect(terrain[99][0].type).toBe(TileType.Space)
    expect(terrain[99][99].type).toBe(TileType.Space)
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
