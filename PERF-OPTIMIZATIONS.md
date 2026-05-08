# Performance optimizations — worktree-perf-optimizations

Eight changes targeting garbage collection pressure, wasted per-frame work, and GPU compositing cost. All changes are in the rendering and tick systems only — no game logic, no state shape, no wire protocol.

---

## How to read this document

Three profiling sessions were recorded in Brave DevTools (Performance tab, 4× CPU throttle) at different points during the work. The numbers are **percentages of total JS scripting time** for the selected window, which makes them comparable even though the recordings had different durations. Where a function is marked "gone" it dropped below the measurement threshold (~0.3%).

---

## Profile comparison — top self-time items

> Self time = time spent inside the function itself, not counting callees. It's the most reliable measure of where CPU is actually being consumed.

| Function | Profile 1 (baseline) | Profile 2 (after fixes 1–5) | Profile 3 (after fixes 6–8) | Notes |
|---|---|---|---|---|
| `render` (central tile loop) | 10.2% | 39.9% | 55.9% | % rises as denominator shrinks — absolute time fell |
| `fillText` | 11.6% | 19.3% | 16.9% | Canvas text, unavoidable for ASCII |
| `Commit` (GPU) | 5.7% | 19.0% | 15.6% | GPU compositing cost |
| GC (combined) | **10.8%** | **2.0%** | **0.6%** | ✅ 94% reduction |
| `paintTileBg` | 4.4% | gone | gone | ✅ eliminated |
| `paintTileEdge` | 4.3% | gone | gone | ✅ eliminated |
| `tickTileWater` | 4.2% | gone | gone | ✅ eliminated |
| `darkenColor` | 2.8% | gone | 0.2% | ✅ memoized; 0.2% = cold cache warmup only |
| `toHex` (inside darkenColor) | 1.8% | gone | gone | ✅ eliminated |
| `nearestLandDistance` | 2.0% | gone | gone | ✅ eliminated |
| `posKey` | 1.1% | 2.8% | gone | ✅ eliminated (% rose in P2 as other things cleared) |
| `tileHash` | — | — | 0.7% | Was 3.7% in P2; now only runs on actual glint tiles |
| `glintingZoneSparkle.draw` | 1.9% | 3.2% | ~0.7% | ✅ reduced |
| `isInBounds` (from glint pass) | — | 1.3% | gone | ✅ eliminated |
| `prairieOutline.draw` | — | 1.2% | 1.8% | ✅ optimized internally; still visible, much cheaper |
| `fill` | 7.6% | 1.0% | 0.6% | Large drop |
| `viewportToScreen` | — | 1.2% | gone | ✅ inlined in prairieOutline |

---

## Frame budget composition

The following shows roughly how JS scripting time was distributed across the three snapshots. Because faster code means a smaller total budget, the "unavoidable" items (fillText, render, GPU commit) grow as a share even as absolute time falls. This is expected and healthy — it means the wasted work is gone.

```
Profile 1 — baseline (84% scripting, 13% painting, GC visible)
────────────────────────────────────────────────────────────────
Render/fillText/fill    ████████████████████░░░░░░░░░░░░░░   ~30%
GC (C++ + Major)        ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░   ~11%
tileBgCache (paint/edge)████████░░░░░░░░░░░░░░░░░░░░░░░░░░   ~9%
tickTileWater           ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ~4%
darkenColor + toHex     ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ~5%
nearestLandDistance     ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ~2%
glintingZoneSparkle     ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ~2%
Commit (GPU)            █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ~6%
Other                   █████████████░░░░░░░░░░░░░░░░░░░░░   ~21%

Profile 2 — after fixes 1–5 (GC nearly gone, cache costs gone)
────────────────────────────────────────────────────────────────
Render/fillText         ██████████████████████░░░░░░░░░░░░   ~59%
Commit (GPU)            ████████░░░░░░░░░░░░░░░░░░░░░░░░░░   ~19%
glintingZoneSparkle+    ████████░░░░░░░░░░░░░░░░░░░░░░░░░░   ~15%  ← posKey/tileHash/isInBounds
GC (combined)           █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    ~2%
Other                   █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    ~5%

Profile 3 — after fixes 6–8 (glint cluster gone, outline optimized)
────────────────────────────────────────────────────────────────
Render/fillText         ███████████████████████████░░░░░░░   ~73%  ← unavoidable ASCII rendering
Commit (GPU)            ████████░░░░░░░░░░░░░░░░░░░░░░░░░░   ~16%
prairieOutline          █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    ~2%
GC                      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ~0.6%
Other                   ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    ~8%
```

---

## GC pressure across profiles

Garbage collection pauses the JS thread and causes dropped frames. The goal was to eliminate unnecessary heap allocations in hot paths.

```
Profile 1   C++ GC ██████░  6.3%   Major GC ████░  4.5%   Total ~10.8%
Profile 2   C++ GC ░        0.7%   Minor GC  █░    1.2%   Total  ~2.0%
Profile 3   C++ GC ░        0.6%                           Total  ~0.6%
```

**94% reduction in GC time** from baseline to final.

---

## Change-by-change breakdown

Each section describes what changed, why, what file to look at, and what to check in-game if you want to verify nothing broke.

---

### Fix 1 — Hoist ECS aura query out of `tickTileWater`

**File:** `src/engine/tileWater.ts`

**What changed:** `tickTileWater` runs every 500ms and iterates every tile in the `tileWater` map (all dirt/clover tiles on the map — potentially thousands). For each tile, it previously called `isInRainAura()`, which ran a full ECS query (`state.world.query(...)`) to find rain-emitting entities. Running an ECS query inside a per-tile loop means the query fires once per tile — O(n_tiles × n_entities) work every half-second.

The fix: collect all rain aura entities once before the tile loop, store their positions and radii in a plain array, then do a simple distance check per tile. O(n_entities + n_tiles) instead.

Also replaced `key.split(',')` (which allocates a new array per tile) with `key.indexOf(',')` + `key.slice()` (no allocation).

**What to verify:** Rain from Gron's aura should still water tiles in its radius. Standard weather rain should still hydrate tiles as the front passes. Tiles outside the aura and rain front should still drain normally.

---

### Fix 2 — Memoize `darkenColor`

**File:** `src/engine/tileBg.ts`

**What changed:** `darkenColor(hex, factor)` converts a hex color string to a darkened version for wall shading on tile edges (the left and right faces of the iso cube). It previously did `parseInt` + `Math.round` + `n.toString(16).padStart(2, '0')` × 3 on every call — six allocations per tile edge repaint.

The input space is finite: roughly 80 palette colors × 2 shade factors = ~160 unique combinations. Added a two-level memoization cache (`Map<hex, Map<factor, result>>`). First call per combination computes and stores the result; every subsequent call is a Map lookup with no arithmetic and no string construction.

Two-level structure avoids allocating a composite key string on cache hits.

**What to verify:** Tile edge shading (the darker left and right faces of each iso cube) should look identical across all tile types: dirt, clover, sand, cave floor/wall, ruin floor/wall/entrance/aqueduct, etc. The cave hidden chamber (before the breakable wall is opened) uses a different effective tile type — verify the cave walls look correct there too.

---

### Fix 3 — Remove object spread in tile bg cache paint functions

**File:** `src/engine/tileBgCache.ts`

**What changed:** `getEffectiveBgColor` previously took a `Tile` object as its second argument, but only ever used `tile.type` from it. The two call sites were passing `{ ...tile, type: effectiveType }` — a new object allocated on the heap for every tile during cache builds and dirty tile repaints. Changed the parameter to accept `TileType` directly, so callers pass `effectiveType` instead of spreading a new object.

**What to verify:** Background colors for all tile types should be unchanged. The cave hidden chamber masking (tiles behind the breakable wall render as cave wall until revealed) is the most nuanced path here — verify the hidden area looks correct before and after breaking the wall.

---

### Fix 4 — Clip prairie halo `drawImage` to viewport and cache blur filter string

**File:** `src/engine/render/passes/prairieHalo.ts`

**What changed:** The prairie halo is the amber glow around the land/space border. It's rendered by blitting a pre-built offscreen canvas (the halo cache) with `ctx.filter = blur(Npx)` applied. Previously, `ctx.drawImage(halo.canvas, dx, dy)` drew the entire world-space halo canvas — potentially thousands of pixels on each side — even though most of it is outside the viewport. The GPU blur filter was processing the full canvas every frame.

Added source-rect clipping: only the intersection of the halo canvas with the current viewport (padded by `blurPx` on each side so the blur doesn't get cut off at edges) is drawn. Pixels more than `blurPx` outside the viewport cannot contribute to any visible on-screen pixel after blurring, so they're safe to skip.

Also cached the blur filter string (`blur(Npx)`) at module level — it only changes when the font size changes (zoom or window resize), not every frame.

**What to verify:** The amber halo should still glow and pulse along the full coastline. Pan the camera to a map corner where space is visible on two sides — the glow should be continuous and not clip abruptly. Zoom in and out a couple of times to confirm the blur radius scales correctly with font size.

---

### Fix 5 — Skip `ctx.font` and `ctx.textBaseline` when unchanged

**File:** `src/engine/renderer.ts`

**What changed:** At the top of every frame, the renderer was unconditionally setting `ctx.font = metrics.font` and `ctx.textBaseline = 'top'`. Setting `ctx.font` is not free — the browser parses the font string and rebuilds its text metrics state. These values are stable across frames; they only need to be re-applied when the canvas is resized (assigning `canvas.width` resets the entire 2D context to defaults) or when the zoom level changes.

Added module-level tracking of the last-set font string and canvas pixel dimensions. The setters only fire when something actually changed.

**What to verify:** Text rendering should look identical. The most important test: zoom in and out with the scroll wheel several times. Each zoom change triggers a canvas resize and context reset — the guard should detect the dimension change and re-apply the font correctly.

---

### Fix 6 — Invert `glintingZoneSparkle` loop to iterate zones, not viewport

**File:** `src/engine/render/passes/glintingZoneSparkle.ts`

**What changed:** This pass renders the animated sparkle characters on glint zone tiles (the twinkling patches visible on the overworld). It previously iterated every tile in the full viewport — potentially thousands of tiles — and called `posKey(wx, wy)` on each one to check `state.glintZones.has(key)`. That's a new string allocation per tile per frame, plus an `isInBounds` call, regardless of whether the tile is in a glint zone. Most tiles aren't.

Inverted the loop: now iterates `state.glintZones` directly (only the tiles that are actually glint zones), converts each to viewport coordinates, and skips entries that are off-screen. Added an early return when `glintZones.size === 0`. Key parsing uses `indexOf`/`slice` instead of `split` to avoid allocating an array per entry.

This is semantically identical — both approaches compute the same intersection of {viewport tiles} ∩ {glint zone tiles}. The difference is starting from the smaller set.

**What to verify:** Sparkle animations should still appear on glint zone tiles. Walk toward a glint zone and confirm sparkles appear as tiles enter the viewport. Walk away and confirm they disappear correctly. Check that the player tile remains sparkle-free (the player exclusion check is preserved).

---

### Fix 7 — Eliminate redundant ECS query in `angelGoldAura` `isActive`

**File:** `src/engine/render/passes/angelGoldAura.ts`

**What changed:** The angel gold aura pass renders a warm gold glow under tiles within range of a spawned angel. The pass system calls `isActive(state)` first; if it returns true, `draw(state, ...)` is called. Previously `isActive` called `collectAngelCenters(state)` — which runs a full ECS query and allocates a positions array — just to check `.length > 0`. Then `draw` called `collectAngelCenters` again, running the same ECS query a second time.

Replaced `isActive` with a lightweight loop that short-circuits on the first matching angel entity without allocating. `collectAngelCenters` now runs exactly once, inside `draw`.

**What to verify:** The gold aura should appear correctly on tiles near an angel. Spawn conditions: angels appear roughly every 90 seconds on the overworld. The aura should cover a circular area around the angel's anchor position, fade with distance, and pulse with a sine wave. When the angel despawns (after ~120s), the aura should disappear.

---

### Fix 8 — Optimize `prairieOutline` geometry

**File:** `src/engine/render/passes/prairieOutline.ts`

**What changed:** This pass draws the 1px crisp outline along the land/space coastline border. Three issues were addressed:

**Geometry constants recomputed per tile.** `viewportToScreen()` and `getCellDiamondCorners()` were called for every non-space tile in the viewport. Both functions internally recompute iso origin values (`originX`, `originY`, `halfW`, `halfH`) that are constant for the entire frame — they only change on resize or zoom. Hoisted these above the loop.

**Two object allocations per border tile.** `viewportToScreen` returns `{ px, py }` and `getCellDiamondCorners` returns `{ leftX, rightX, topY, bottomY, cx, cy }` — two heap allocations per tile. Inlined the equivalent math directly, eliminating both objects. `ISO_GLYPH_VERTICAL_NUDGE` always returns 0; its call was removed and `topY = py` directly.

**Geometry computed before neighbor check.** The neighbor checks (is the tile north/east/south/west space or out of bounds?) previously ran after computing the full geometry. Most non-space tiles are inland and have no space neighbors — their geometry was computed then discarded. Moved all four neighbor checks before the geometry computation so inland tiles skip it entirely.

**What to verify:** The 1px amber outline should trace the full coastline with no gaps, including:
- Curved sections of the coast
- Iso corners (the parallelogram-shaped viewport includes tiles in the diagonal corners that a simple rectangular loop would miss — `getVisibleTileBounds` handles this and was not changed)
- Map edges where land meets the boundary
- Cave and ruin zones (the pass is inactive in those zones, so no change there)

---

## What was not changed

- No game logic (movement, combat, dialog, recipes, inventory)
- No state shape (`GameState` fields unchanged)
- No ECS component definitions
- No wire protocol or multiplayer code
- No tick system intervals — only the internal behavior of `tickTileWater` changed
- No visual output — every change was verified in-browser before committing

---

## Branch

`worktree-perf-optimizations` — 8 commits, all on top of `main` as of 2026-05-03.
