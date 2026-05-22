import { describe, expect, it } from 'vitest'

import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { posKey } from '../position'
import { createGameState } from '../state'
import { TileType } from '../types'

// Regression: a ruin or cave whose 3x3 footprint (entrance + 8 neighbors)
// intersects a pond, river, or Space tile rendered as a "truncated" structure
// because renderer.ts draws water before the tile glyph. The fix validates
// each structure's full 3x3 footprint against the finalized water/space sets
// and relocates (or skips, as a last resort) when the footprint is blocked.

const FOOTPRINT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]

const tileTypeAt = (
  map: GameMap,
  x: number,
  y: number,
): TileType | undefined => map[y]?.[x]?.type

// Probe several deterministic seeds — the bug is seed-dependent because
// candidate scoring biases ruins toward water, so the truncation only
// surfaces on certain steward names.
const STEWARD_NAMES = ['alice', 'bob', 'cleo', 'dora', 'evan', 'fern', 'gus', 'hana']

interface GameMap extends Array<Array<{ type: TileType }>> {}

describe('structure water truncation', () => {
  it.each(STEWARD_NAMES)(
    'every ruin entrance footprint is clear of ponds, rivers, and Space (steward: %s)',
    stewardName => {
      const state = createGameState(stewardName, 40, 30)
      for (const interior of state.ruinInteriors) {
        const { x, y } = interior.entranceOverworld
        for (const [dx, dy] of FOOTPRINT_OFFSETS) {
          const fx = x + dx
          const fy = y + dy
          if (fx < 0 || fx >= MAP_WIDTH || fy < 0 || fy >= MAP_HEIGHT) continue
          const key = posKey(fx, fy)
          expect(
            state.ponds.has(key),
            `ruin ${interior.name} at (${String(x)},${String(y)}) — footprint (${String(fx)},${String(fy)}) is in a pond`,
          ).toBe(false)
          expect(
            state.rivers.has(key),
            `ruin ${interior.name} at (${String(x)},${String(y)}) — footprint (${String(fx)},${String(fy)}) is in a river`,
          ).toBe(false)
          expect(
            tileTypeAt(state.overworldMap, fx, fy),
            `ruin ${interior.name} at (${String(x)},${String(y)}) — footprint (${String(fx)},${String(fy)}) is Space`,
          ).not.toBe(TileType.Space)
        }
      }
    },
  )

  it.each(STEWARD_NAMES)(
    'cave entrance footprint is clear of ponds, rivers, and Space (steward: %s)',
    stewardName => {
      const state = createGameState(stewardName, 40, 30)
      const { x, y } = state.caveEntranceOverworld
      for (const [dx, dy] of FOOTPRINT_OFFSETS) {
        const fx = x + dx
        const fy = y + dy
        if (fx < 0 || fx >= MAP_WIDTH || fy < 0 || fy >= MAP_HEIGHT) continue
        const key = posKey(fx, fy)
        expect(state.ponds.has(key), `cave footprint (${String(fx)},${String(fy)}) is in a pond`).toBe(false)
        expect(state.rivers.has(key), `cave footprint (${String(fx)},${String(fy)}) is in a river`).toBe(false)
        expect(
          tileTypeAt(state.overworldMap, fx, fy),
          `cave footprint (${String(fx)},${String(fy)}) is Space`,
        ).not.toBe(TileType.Space)
      }
    },
  )
})
