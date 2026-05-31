import { frozenStairwayKey } from './position'
import { Season } from './types'

import type { GameState } from './types'

// RP-64 — Season freeze/thaw. Idempotent per-frame: every
// waterfall's `frozen` flag is brought into agreement with the
// current season (true in Winter, false otherwise). Per-frame
// cost is bounded by the number of waterfalls (genesis budget —
// typically tens, not thousands), and the comparison short-
// circuits on equality. Avoids the season-transition-tracking
// dance because there's no need to detect the boundary itself
// — only to mirror the current state.
//
// Does NOT clear or rebuild `state.waterfalls`. Waterfall
// identity (top/bottom coords) is determined at genesis and only
// changes when RP-44 winter geology lands.
export const tickWaterfalls = (state: GameState): void => {
  const shouldBeFrozen = state.weather.season === Season.Winter
  for (const w of state.waterfalls.values()) {
    if (w.frozen !== shouldBeFrozen) w.frozen = shouldBeFrozen
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
