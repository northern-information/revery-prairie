# GameState field ownership

referenced from `CLAUDE.md`. read when adding fields to `GameState` or refactoring write patterns.

mutable game state has no access control. these conventions document write patterns to prepare for eventual module boundaries:

- **single-owner**: one module writes meaningful values, others only read. most fields follow this.
- **owner + clearers**: one module writes, others only null/reset (e.g. `pendingAction`, `previewFn`, `cursorTile`).
- **multi-spawner, single lifecycle**: multiple modules create entries, one owns tick/removal (e.g. `bees[]`, `groundItems`).
- **shared writers**: multiple modules write meaningful values. currently only `path`/`pathWaypoints` and `playerFacing`. _aspirational: introduce `setPath()` accessor in movement.ts._

**convention for new fields**: prefer single-owner. if multiple modules must write, use owner+clearers or multi-spawner — never ad-hoc writes from arbitrary locations.

new fields also require updating `EXPECTED_FIELDS` in `src/harness/__tests__/serialization/schema.test.ts` — the schema allowlist test fails otherwise.

## example: RP-32 fields

- **`dormancyPressure: number`** — single-owner. `tickDormancyPressure` in `src/engine/omen.ts` writes; gameLoop and `tickRevery`'s Closing branch reset to 0. All other readers are read-only.
- **`collapsedStewardTile: Position | null`** — owner + clearers. `tickRevery`'s Omen → Observing branch sets it from `state.revery.summonsCollapseTile`; `tickRevery`'s Closing branch clears it. Renderers read it.
- **`state.revery.summons / summonsAudioCue / summonsCollapseTile`** — single-owner. gameLoop sets `summons` at threshold-trigger time; `tickRevery`'s Omen branch sets `summonsAudioCue` and `summonsCollapseTile`. All other readers are read-only until Closing.

## example: RP-33 fields

- **`houseMap: Tile[][]`, `houseMapWidth: number`, `houseMapHeight: number`** — single-owner. Created by `createHouseInterior()` in `src/engine/house.ts`. `enterHouse` / `exitHouse` swap `state.map` to/from `state.houseMap` (state field pointer; no copy).
- **`houseEntranceOverworld: Position`** — single-owner. Written once by `createGameState` in `src/engine/state.ts` during the west-of-Gron placement loop. `exitHouse` reads it for the safe exit position.
- **`houseEntranceInterior: Position`**, **`houseBedInterior: Position`**, **`houseChairInterior: Position`** — single-owner. Initialized once by `createGameState` from the `createHouseInterior()` return; never mutated.
- **`emilyInvitation: 'unoffered' | 'offered' | 'confirmed'`** — owner + clearers. `interaction.ts` dialog-tick writes `'offered'` when Emily's autumn last line arms `awaitingConfirmation`; the confirm path writes `'confirmed'`; dialog-close paths and Revery `Closing` reset to `'unoffered'`.
- **`emilyReveryReturn: Position | null`** — owner + clearers. `revery.ts` `Omen → Observing` captures Emily's prior idle position; `Closing` clears it after restoring her.
- **`state.activeDialog.awaitingConfirmation?: boolean`** — owner + clearers. `interaction.ts` dialog-tick sets it when on Emily's autumn last line; cleared implicitly whenever `state.activeDialog` is set to `null` (any close path).

## removed: RP-33 also drops `playerSpawn`

The `state.playerSpawn` field and the `PlayerSpawn` interface are removed entirely. The falling-star spawn ceremony is gone — the player spawns inside the house at tenure start. All `state.playerSpawn.visible` gates in `movement.ts`, `renderer.ts`, `camera.ts`, and `useGameEngine.ts` are deleted (player is always visible from frame 1). `EXPECTED_FIELDS` loses `playerSpawn` in the same PR that adds the new fields above.

## Placed meteorites (RP-18)

- **`placedMeteorites: Position[]`** — multi-spawner, single lifecycle. `PlaceableSpec.place` in `src/engine/placeable.ts` appends an entry when a meteorite is placed (RP-59 — left-click on the cursor tile while in hand). `pickUpFacingOrStandingPlacedMeteorite` in `src/engine/interaction.ts` splices an entry out when the player taps F on or while facing a placed meteorite tile. All other readers are read-only (the `stoneCircles` render pass, the egregore spread containment filter, the manual unlock check).

## In hand (RP-59)

- **`equippedItemUid: ItemUid | null`** — single owner: `src/engine/inHand.ts` (`takeInHand` / `releaseInHand` / `advanceInHand` / `clearInHandIfRemoved`). It is a uid *reference* into the backpack — the referenced `ItemInstance` stays in `state.backpack.items`, so the reference survives `autoSort`/merge/split exactly like `glintingCoins`. The 3x3 in-hand HUD cell (`InHandSlot.tsx`) and the loaded cursor (`renderer.ts`) are views of this field. `getInHandItem` self-heals a dangling reference to `null`. Player-facing copy reads "in hand," never "equipped."
- The RP-18 `stoneCirclePreview` boolean was **removed** by RP-59: the meteorite placement preview now follows the loaded cursor (cursor tile + `canPlaceMeteoriteAt`) in the `stoneCircles` pass, not a grid-hover flag.

## Item wear (RP-15)

- **`itemWear: Record<ItemUid, number>`** — single owner. Sole writer is the wear-tick site in `archivePlacedCameraFrames` (`src/engine/timeLapse.ts`), which increments by `1 / definition.maxUses` and clamps to `1.0`. Readers: the camera `PlaceableSpec` in `src/engine/placeable.ts` gates placement when wear ≥ 1.0; `ItemInfo.tsx` and `InHandSlot.tsx` render a `WearBar`. Values are in `[0, 1]`; missing keys are read as `0`. Keyed by `ItemInstance.uid`, not `definitionId` — multiple cameras wear independently. The uid is stable across the camera's destroy-on-place / recreate-on-pickup cycle (per `PlacedCamera.uid`), so wear survives the round trip without explicit copy.
- v1 scope: only the camera definition declares `maxUses` (= 12, three game years of archived seasons). Body wear is a second wear surface that coexists with film consumption (`state.cameraFilm`); film remains reloadable, body wear is permanent in v1. Repair path is deferred to a follow-up backlog item — a wear=1.0 camera stays in inventory as an inert tool.
