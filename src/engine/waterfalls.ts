import { frozenStairwayKey } from './position'
import { Season } from './types'

import type { GameState } from './types'

// RP-64 — Season-boundary freeze/thaw. Compares the cached
// `state.lastSeenSeason` to the current `state.weather.season`
// (the established pattern from `tickTorchbearer`). On Autumn→
// Winter, flips every waterfall's `frozen` flag to true; on
// Winter→Spring, flips it back to false. Idempotent within a
// season: a tick mid-Winter is a no-op because the season hasn't
// changed since the last call. The caller (the engine RAF loop)
// is responsible for updating `state.lastSeenSeason` AFTER this
// tick runs so it sees one transition per boundary; this function
// reads the diff but does NOT update the cached field — wiring
// happens in gameLoop next to tickTorchbearer which already owns
// the cache.
//
// Does NOT clear or rebuild `state.waterfalls` — the freeze/thaw
// only flips the boolean. Waterfall identity (top/bottom coords)
// is determined at genesis and only changes when RP-44 winter
// geology lands.
export const tickWaterfalls = (state: GameState): void => {
  const current = state.weather.season
  const previous = state.lastSeenSeason
  if (previous === current) return
  if (previous === Season.Autumn && current === Season.Winter) {
    for (const w of state.waterfalls.values()) w.frozen = true
    return
  }
  if (previous === Season.Winter && current === Season.Spring) {
    for (const w of state.waterfalls.values()) w.frozen = false
    return
  }
}

// RP-64 — Derived set of frozen-stairway transitions used by
// movement and pathfinding callers of `isClimbableStep`. Walks
// `state.waterfalls` and emits the bottom→top key for each frozen
// entry. Returns an empty Set when no waterfalls are frozen
// (caller short-circuit). Computed per-call; cheap because the
// waterfall count is bounded by the number of overflow tiles on
// the map (genesis budget — typically tens, not thousands).
export const getFrozenStairwaySet = (state: GameState): Set<string> => {
  const set = new Set<string>()
  for (const w of state.waterfalls.values()) {
    if (!w.frozen) continue
    set.add(frozenStairwayKey(w.bottomX, w.bottomY, w.topX, w.topY))
  }
  return set
}
