# rendering

referenced from `CLAUDE.md`. read when touching the renderer, render passes, or cached layers.

## rendering pipeline

the renderer is organized around two ideas — see `harness/specs/renderer.yaml`:

- **pass registry** (`src/engine/render/passes.ts`) — the render frame is built from named passes registered into ordered slots: `bg-cache` → `world-overlay` → `tile-glyph` → `entity` → `effect` → `screen-overlay`. each pass declares an `isActive(state)` predicate and a `draw` function. `renderer.ts` calls `runPassesInSlot(slot, ...)` at each slot's documented position; passes are added by creating a module under `src/engine/render/passes/` and re-exporting it from `passes/index.ts` (the side-effect import in `renderer.ts` triggers registration). currently populated slots: `bg-cache`, `world-overlay`, `effect` (post-tile overlays only), `screen-overlay`. the `tile-glyph` and `entity` slots are intentionally empty — the central tile loop in `renderer.ts` (terrain, clover lifecycle, fog of war, glints, cursor inversion, ponds/rivers, plus the populate-then-consume pattern that feeds it from ECS) is the tile-glyph slot. splitting the precedence chain across pass files would duplicate logic or force a frameState abstraction; the inline central loop is the documented end state.
- **cache contract** (`src/engine/render/cacheContract.ts`) — single source of truth for cached-layer invalidation triggers. mutation sites call into this module rather than poking individual caches. current cached layers: `tileBgCache` (per-map static tile bg + cube edges), `haloCache` (per-map prairie halo at peak intensity, pulse applied at composite via `globalAlpha`). the contract module documents which mutations invalidate which caches.

when adding a new bg-cache, world-overlay, effect, or screen-overlay concern, write a pass — don't edit `renderer.ts`. when adding a new map mutation site, route it through the cache contract. when adding a new cached layer, declare its triggers in `cacheContract.ts` so the next mutation author can find them.

## iso projection is the canonical exposed frame (RP-30)

the diamond is the world (backlog-thinktank-v5 round 1). `worldToScreen` in `src/engine/projection.ts` applies the canonical iso projection `(sx, sy) = ((x − y) · charWidth, (x + y) · charHeight / 2)`. world `(x, y)` is internal storage, not a coordinate frame the game exposes. any code that reports a position or a direction to the steward (the minimap, the sidebar cursor, future instruments) reports in the iso frame the steward inhabits, not in storage coords.

cardinals point at the diamond's tips on screen — N is the top tip (storage `(0, 0)` direction), E the right tip, S the bottom tip, W the left tip. ordinals align with the storage axes themselves. see `docs/claude/weather.md` for the doctrinal summary and the `WindDirection` enum doctrine block in `src/engine/types.ts` for the canonical reference. no coordinate translation lives anywhere in the game — the display layer does not translate between two frames because there is only one frame.
