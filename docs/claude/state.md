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

## example: precis-33 fields

- **`houseMap: Tile[][]`, `houseMapWidth: number`, `houseMapHeight: number`** — single-owner. Created by `createHouseInterior()` in `src/engine/house.ts`. `enterHouse` / `exitHouse` swap `state.map` to/from `state.houseMap` (state field pointer; no copy).
- **`houseEntranceOverworld: Position`** — single-owner. Written once by `createGameState` in `src/engine/state.ts` during the west-of-Gron placement loop. `exitHouse` reads it for the safe exit position.
- **`houseEntranceInterior: Position`**, **`houseBedInterior: Position`**, **`houseChairInterior: Position`** — single-owner. Initialized once by `createGameState` from the `createHouseInterior()` return; never mutated.
- **`emilyInvitation: 'unoffered' | 'offered' | 'confirmed'`** — owner + clearers. `interaction.ts` dialog-tick writes `'offered'` when Emily's autumn last line arms `awaitingConfirmation`; the confirm path writes `'confirmed'`; dialog-close paths and Revery `Closing` reset to `'unoffered'`.
- **`emilyReveryReturn: Position | null`** — owner + clearers. `revery.ts` `Omen → Observing` captures Emily's prior idle position; `Closing` clears it after restoring her.
- **`state.activeDialog.awaitingConfirmation?: boolean`** — owner + clearers. `interaction.ts` dialog-tick sets it when on Emily's autumn last line; cleared implicitly whenever `state.activeDialog` is set to `null` (any close path).

## removed: precis-33 also drops `playerSpawn`

The `state.playerSpawn` field and the `PlayerSpawn` interface are removed entirely. The falling-star spawn ceremony is gone — the player spawns inside the house at tenure start. All `state.playerSpawn.visible` gates in `movement.ts`, `renderer.ts`, `camera.ts`, and `useGameEngine.ts` are deleted (player is always visible from frame 1). `EXPECTED_FIELDS` loses `playerSpawn` in the same PR that adds the new fields above.
