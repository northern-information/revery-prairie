# GameState field ownership

referenced from `CLAUDE.md`. read when adding fields to `GameState` or refactoring write patterns.

mutable game state has no access control. these conventions document write patterns to prepare for eventual module boundaries:

- **single-owner**: one module writes meaningful values, others only read. most fields follow this.
- **owner + clearers**: one module writes, others only null/reset (e.g. `pendingAction`, `previewFn`, `cursorTile`).
- **multi-spawner, single lifecycle**: multiple modules create entries, one owns tick/removal (e.g. `bees[]`, `groundItems`).
- **shared writers**: multiple modules write meaningful values. currently only `path`/`pathWaypoints` and `playerFacing`. _aspirational: introduce `setPath()` accessor in movement.ts._

**convention for new fields**: prefer single-owner. if multiple modules must write, use owner+clearers or multi-spawner — never ad-hoc writes from arbitrary locations.

new fields also require updating `EXPECTED_FIELDS` in `src/harness/__tests__/serialization/schema.test.ts` — the schema allowlist test fails otherwise.

## example: precis-32 fields

- **`dormancyPressure: number`** — single-owner. `tickDormancyPressure` in `src/engine/omen.ts` writes; gameLoop and `tickRevery`'s Closing branch reset to 0. All other readers are read-only.
- **`collapsedStewardTile: Position | null`** — owner + clearers. `tickRevery`'s Omen → Observing branch sets it from `state.revery.summonsCollapseTile`; `tickRevery`'s Closing branch clears it. Renderers read it.
- **`state.revery.summons / summonsAudioCue / summonsCollapseTile`** — single-owner. gameLoop sets `summons` at threshold-trigger time; `tickRevery`'s Omen branch sets `summonsAudioCue` and `summonsCollapseTile`. All other readers are read-only until Closing.
