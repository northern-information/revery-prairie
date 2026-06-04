# GameState field ownership

referenced from `CLAUDE.md`. read when adding fields to `GameState` or refactoring write patterns.

mutable game state has no access control. these conventions document write patterns to prepare for eventual module boundaries:

- **single-owner**: one module writes meaningful values, others only read. most fields follow this.
- **owner + clearers**: one module writes, others only null/reset (e.g. `pendingAction`, `previewFn`, `cursorTile`).
- **multi-spawner, single lifecycle**: multiple modules create entries, one owns tick/removal (e.g. `bees[]`, `groundItems`).
- **shared writers**: multiple modules write meaningful values. currently only `path`/`pathWaypoints` and `playerFacing`. _aspirational: introduce `setPath()` accessor in movement.ts._

**convention for new fields**: prefer single-owner. if multiple modules must write, use owner+clearers or multi-spawner — never ad-hoc writes from arbitrary locations.

new fields also require updating `EXPECTED_FIELDS` in `src/harness/__tests__/serialization/schema.test.ts` — the schema allowlist test fails otherwise.

## per-zone ECS worlds

`state.worlds: Map<string, World>` holds one ECS world per zone. The map is pre-populated for every non-Ruin Zone enum value in `createGameState`; ruin worlds are created on demand by `getWorldForZone(state, Zone.Ruin, ruinIndex)` (each ruin instance is its own world keyed `ruin:N`).

`state.world` is a getter on `GameState` that resolves to the active zone's world: `state.worlds.get(worldKey(state.currentZone, state.currentRuinIndex))`. Every zone transition that updates `state.currentZone` automatically repoints `state.world` — there is no explicit reassignment.

**Adding entities.** Always route via the target zone's world. Common case (entity belongs to the current zone): `state.world.createEntity()` + `state.world.addComponent(...)`. Cross-zone case (genesis seeding Moab into Cave, Emily into HouseInterior, etc.): `getWorldForZone(state, targetZone, ruinIndex?).createEntity()` and use that world reference for every `addComponent` on the same entity. Entities cannot span worlds.

**Querying entities.** `state.world.query(...)` returns ONLY entities in the active zone — cross-zone leaks are structurally impossible. Two helpers exist for the rare cross-zone consumer:
- `getWorldForZone(state, zone, ruinIndex?)` — read or write a specific zone's world by name (e.g., overworld-only celestial code that may run from a non-overworld tick).
- `queryAllZones(state, ...types)` — flatten every world; returns `{ world, eid }[]`. Used by test helpers that want a roster across worlds.

**Cross-zone entity movement.** When an entity follows the player across a zone (coyote, Moab during the burn-line walk), entity ids are per-world — so the entity must be re-homed: copy every component into the target world, destroy the source entity. The `moveEntityAcrossWorlds(sourceWorld, sourceEid, targetWorld)` helper does this and returns the new eid.

**No `EntityZone` component.** There is no component that tags an entity with its zone — the zone IS the world. Likewise `isEntityInCurrentZone`, `spatialAtInCurrentZone`, and `getCurrentEntityZone` no longer exist; the filter convention they enforced is now structural.

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
- **`placedMarkers: PlacedMarker[]`** (RP-70) — single-owner write pair. The `geodeticMarker` `PlaceableSpec.place` in `src/engine/placeable.ts` appends a `{ uid, x, y, zone, label }` entry (label = lowest free `GM-N` in 1..10 via `nextFreeMarkerLabel`); `tryPlacedMarkerInteraction` in `src/engine/interaction.ts` splices it out on pickup, freeing the label. Read-only readers: the `MapPanel` render of the map tab. The matching `placedMarker`-tagged ECS entity is the world render hook; `state.placedMarkers` is the serializable source of truth.
- **`onMapAcquired: (() => void) | null`** (RP-70) — engine→React callback field, mirrors `onPlayerMoved`. Fired once from the `pickUpGroundItems` map intercept (`src/engine/entities.ts`) when the steward picks up the cellar map key item; wired by `GameCanvas` to `setActiveScreen('map')`. Excluded from serialization (`FUNCTION_FIELDS`).

## Named regions + chronicle (RP-22)

- **`namedRegions: NamedRegion[]`** — single-owner. Written exactly once by `detectNamedRegions` in `src/engine/regions.ts`, called from `createGameState` after the state literal is constructed. Stable across the lifetime of the tenure; no tick handler may mutate it. The single-writer-on-genesis contract is asserted by a chronicle architecture guard test (snapshot identity stable after a tick).
- **`chronicle: ChronicleEvent[]`** — single-writer through `addChronicleEvent` in `src/engine/chronicle/index.ts`. Append-only within a tenure; the helper enforces dedupe-by-id so the same transition fired twice in one frame collapses to one entry. Emitters in `src/engine/chronicle/emitters.ts` are the only callers; `addChronicleEvent` is not imported by any player-action source file (movement / interaction / inventory / recipes). The no-player-trigger invariant is asserted by an architecture guard test.

Per-state scan progress for the species-extinction and egregore reach/advance scans lives in a module-local `WeakMap<GameState, EmitterScanState>` in `src/engine/chronicle/emitters.ts` — not on `GameState`, so it never bloats saves.

## In hand (RP-59)

- **`equippedItemUid: ItemUid | null`** — single owner: `src/engine/inHand.ts` (`takeInHand` / `releaseInHand` / `advanceInHand` / `clearInHandIfRemoved`). It is a uid *reference* into the backpack — the referenced `ItemInstance` stays in `state.backpack.items`, so the reference survives `autoSort`/merge/split exactly like `glintingCoins`. The 3x3 in-hand HUD cell (`InHandSlot.tsx`) and the loaded cursor (`renderer.ts`) are views of this field. `getInHandItem` self-heals a dangling reference to `null`. Player-facing copy reads "in hand," never "equipped."
- The RP-18 `stoneCirclePreview` boolean was **removed** by RP-59: the meteorite placement preview now follows the loaded cursor (cursor tile + `canPlaceMeteoriteAt`) in the `stoneCircles` pass, not a grid-hover flag.

## Item wear (RP-15)

- **`itemWear: Record<ItemUid, number>`** — single owner. Sole writer is the wear-tick site in `archivePlacedCameraFrames` (`src/engine/timeLapse.ts`), which increments by `1 / definition.maxUses` and clamps to `1.0`. Readers: the camera `PlaceableSpec` in `src/engine/placeable.ts` gates placement when wear ≥ 1.0; `ItemInfo.tsx` and `InHandSlot.tsx` render a `WearBar`. Values are in `[0, 1]`; missing keys are read as `0`. Keyed by `ItemInstance.uid`, not `definitionId` — multiple cameras wear independently. The uid is stable across the camera's destroy-on-place / recreate-on-pickup cycle (per `PlacedCamera.uid`), so wear survives the round trip without explicit copy.
- v1 scope: only the camera definition declares `maxUses` (= 12, three game years of archived seasons). Body wear is a second wear surface that coexists with film consumption (`state.cameraFilm`); film remains reloadable, body wear is permanent in v1. Repair path is deferred to a follow-up backlog item — a wear=1.0 camera stays in inventory as an inert tool.

## Revery Knot (RP-36)

Ten top-level fields land together. Each names exactly one writer; readers are append-only.

- **`knotDelivery: KnotDeliveryState | null`** — single owner: the gameLoop season-edge block. Written at the Summer → Autumn arming (set to `{ stage: 'walkingToHouse', dispatchedAt, harvestYear }`), then mutated by `tickCoyote` (stage `'walkingToHouse'` → `'enroute'`) when the coyote reaches the apron tile and accepts cargo. Cleared to `null` by `tickCoyote`'s post-tick cleanup once the scripted route completes.
- **`bedKnotPresent: boolean`** — written at the pickup contribution site (`onReveryKnotEntered`) when a Knot enters the backpack; cleared at the Winter → Spring archive in gameLoop. Mirrors the doctrinal beat "the Knot rests on the bed during the working winter" as a data flag — no render surface in this PR.
- **`archivedKnots: ArchivedKnot[]`** — append-only by the Winter → Spring archive handler in gameLoop. RP-37 reads from this array to populate the cellar's hook row. Never mutated outside the archive site.
- **`lastKnotDeliveryArmed: boolean`** — guard preventing more than one scripted-route dispatch per autumn. Written at the Summer → Autumn arming (`true`) and the Autumn → Winter reset (`false`). Both writers are in the gameLoop season-edge block.
- **`lastKnotPickupAt: number`**, **`lastKnotPickupTile: Position | null`**, **`lastKnotPickupHarvestYear: number`** — bookkeeping written by `onReveryKnotEntered` at each pickup; read by the Winter → Spring archive to populate the `ArchivedKnot`, then cleared by the archive.
- **`lastArchiveReveryCount: number`** — written by the Winter → Spring archive. Gates the archive on `state.reveryCount` having advanced past this value, so a winter that passes without a Revery does not archive a Knot prematurely.
- **`knotHarvestYearCounter: number`** — initialized to `1 - POOL_INITIAL_KNOTS` (= 0 with the default), incremented by 1 at each Summer → Autumn arming. Determines the harvestYear tag stamped on each autumn's Knot. With the default seed, the first delivery in tenure year 0 stamps `harvestYear = 0` — the pre-play year (v11 R7 doctrine: _the first knot is not yours_).
- **`knotHarvestYears: Map<ItemUid, number>`** — uid-keyed side table mirroring `seedGenomes` and `glintingCoins`. Written by `onReveryKnotEntered` at backpack handoff; entries deleted by the Winter → Spring archive when the Knot is consumed into `archivedKnots`. Survives stack/sort/merge by uid.
