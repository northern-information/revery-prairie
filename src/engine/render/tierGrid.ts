import { getElevationTier, getTierLift } from '../tileBg'

// Flat per-map tier cache. state.elevation is a Map<posKey, number>
// populated at genesis. It is mostly stable but a small set of mutations
// (currently: satellite impacts) modify it in place. Mutators must call
// invalidateTierGrid (typically via cacheContract.onElevationMutated) so
// the next getTierGrid call rebuilds from the new values. The cache is
// otherwise reused across frames as long as the elevation reference is
// stable.
//
// Lives in render/ because it is purely a render-side concern: the
// game logic does not need a flat grid, but every tile-anchored draw
// call reads the tier on a hot path.

let _cache: Int8Array | null = null
let _for: Map<string, number> | null = null
let _width = 0

export const getTierGrid = (
  elevation: Map<string, number>,
  mapWidth: number,
  mapHeight: number,
): Int8Array => {
  if (_cache !== null && _for === elevation && _width === mapWidth) {
    return _cache
  }
  const grid = new Int8Array(mapWidth * mapHeight)
  for (const [key, value] of elevation) {
    const sep = key.indexOf(',')
    if (sep < 0) continue
    const x = Number(key.slice(0, sep))
    const y = Number(key.slice(sep + 1))
    if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) continue
    grid[x + y * mapWidth] = getElevationTier(value)
  }
  _cache = grid
  _for = elevation
  _width = mapWidth
  return grid
}

export const invalidateTierGrid = (): void => {
  _cache = null
  _for = null
  _width = 0
}

export const liftAt = (
  grid: Int8Array,
  mx: number,
  my: number,
  mapWidth: number,
  mapHeight: number,
): number => {
  if (mx < 0 || mx >= mapWidth || my < 0 || my >= mapHeight) return 0
  return getTierLift(grid[mx + my * mapWidth])
}
