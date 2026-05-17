---
type: change-request
author: claude
date: 2026-04-14
---

# split renderer.ts render() into phases

`render()` in `renderer.ts` is 1,089 lines — the single largest function in the codebase. it handles terrain, entities, effects, overlays, cursor, path preview, and transition fades in one monolithic function.

split into ~4 phase functions:

- `renderTerrain` — tile/clover/soil/water/stars
- `renderEntities` — bees/ghosts/characters/items/meteorites/angels
- `renderEffects` — explosions/weather/lightning/glint/blooms/wildfire
- `renderOverlays` — path preview/cursor/transition fades

keep `render()` as a thin orchestrator calling the four phases. each phase would be under 300 lines.
