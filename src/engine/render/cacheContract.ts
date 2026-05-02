import { invalidateMapCache } from '../tileBgCache'
import type { Tile } from '../types'
import { invalidateHaloCache } from './haloCache'

// Single source of truth for cached-layer invalidation. See
// harness/specs/renderer.yaml `cache-contract` behavior.
//
// Each cached render layer (tileBgCache, haloCache, tier grid, future
// caches) declares its invalidation triggers here. Mutation sites in the
// engine call into this module rather than poking individual caches —
// that way a new mutation only has to learn one API, and a new cache only
// has to register its triggers in one place.
//
// Trigger documentation
// ---------------------
//
// tileBgCache (per-map, world-space):
//   - setMapTile(state, x, y, tile)  → markTileDirty(map, x, y)
//   - whole-map invalidation events  → invalidateMapCache(map)
//   - charWidth/charHeight change    → auto-detected inside getOrBuildCache
//
// haloCache (per-map, world-space; overworld only):
//   - setMapTile that flips a tile to/from TileType.Space → invalidateHaloCache(map)
//     (rare in practice — the coastline is sealed at genesis. Other
//     setMapTile calls do not need to invalidate the halo.)
//   - whole-map invalidation events  → invalidateHaloCache(map)
//   - charWidth/charHeight change    → auto-detected inside getOrBuildHaloCache
//
// tier grid (per-state, flat Int8Array):
//   - state.elevation reference change → auto-detected via WeakMap on the
//     elevation Map. Only triggered at genesis / state init.
//
// Helpers below paper over the per-cache details so callers do not have
// to remember which caches are sensitive to a given mutation.

// Called whenever a whole-map invalidation event fires (e.g. caveRevealed
// flipping). Drops every cached layer derived from the given map ref so
// the next frame rebuilds from scratch.
export const onMapInvalidate = (map: Tile[][]): void => {
  invalidateMapCache(map)
  invalidateHaloCache(map)
}
