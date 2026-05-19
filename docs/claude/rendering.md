# rendering

referenced from `CLAUDE.md`. read when touching the renderer, render passes, or cached layers.

## rendering pipeline

the renderer is organized around two ideas — see `harness/specs/renderer.yaml`:

- **pass registry** (`src/engine/render/passes.ts`) — the render frame is built from named passes registered into ordered slots: `bg-cache` → `world-overlay` → `tile-glyph` → `entity` → `effect` → `screen-overlay`. each pass declares an `isActive(state)` predicate and a `draw` function. `renderer.ts` calls `runPassesInSlot(slot, ...)` at each slot's documented position; passes are added by creating a module under `src/engine/render/passes/` and re-exporting it from `passes/index.ts` (the side-effect import in `renderer.ts` triggers registration). currently populated slots: `bg-cache`, `world-overlay`, `effect` (post-tile overlays only), `screen-overlay`. the `tile-glyph` and `entity` slots are intentionally empty — the central tile loop in `renderer.ts` (terrain, clover lifecycle, fog of war, glints, cursor inversion, ponds/rivers, plus the populate-then-consume pattern that feeds it from ECS) is the tile-glyph slot. splitting the precedence chain across pass files would duplicate logic or force a frameState abstraction; the inline central loop is the documented end state.
- **cache contract** (`src/engine/render/cacheContract.ts`) — single source of truth for cached-layer invalidation triggers. mutation sites call into this module rather than poking individual caches. current cached layers: `tileBgCache` (per-map static tile bg + cube edges), `haloCache` (per-map prairie halo at peak intensity, pulse applied at composite via `globalAlpha`). the contract module documents which mutations invalidate which caches.

when adding a new bg-cache, world-overlay, effect, or screen-overlay concern, write a pass — don't edit `renderer.ts`. when adding a new map mutation site, route it through the cache contract. when adding a new cached layer, declare its triggers in `cacheContract.ts` so the next mutation author can find them.
