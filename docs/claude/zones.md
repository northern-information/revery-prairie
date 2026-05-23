# zones — cave + little house

referenced from `CLAUDE.md`. read when touching the cave or any zone-swap mechanic.

separate 40x25 interior map accessed via `CaveEntrance` tile. uses a **map context swap** pattern: `enterCave` snapshots overworld state, swaps in cave data. `exitCave` restores. renderer/camera/pathfinding/movement require no branching — they read `state.map`/`state.mapWidth`/`state.mapHeight`.

transition fires after every `movePlayer`. on exit, player placed one tile south of entrance to avoid re-entry loop. bee/ghost/shooting star/weather ticks suppressed in cave.

breakable wall: `[e]` to break, converts to `CaveFloor`, sets `caveRevealed = true`, spawns crumble effect. hidden chamber masked until revealed. **cave entrance is indestructible** — tile-overwriting mechanics must exclude `TileType.CaveEntrance`.

## little house — `Zone.HouseInterior` (precis #33)

separate 30x18 interior map. deterministic layout (no RNG), built by `createHouseInterior()` in `src/engine/house.ts`. perimeter `HouseWall`, `HouseFloor` interior, `Fireplace` at (15, 0), `HouseBed` at (28, 8), `HouseChair` at (2, 8). south wall opens with a **3-wide pink-door** — three `HouseExit` tiles at (14, 17), (15, 17), (16, 17), rendered in `#ff69b4` per the existing cave/ruin exit idiom. `exitInterior` is the middle exit; `spawnInterior` is (15, 16) one tile north of it.

overworld entrance is a single `HouseEntrance` tile rendered with the Greek lowercase alpha `α` (U+03B1) — complements the cave's omega-shaped entrance glyph. warm-brown palette throughout the interior and entrance/apron. placed west of Gron at genesis time, using the same ring-around-Gron algorithm as the cave with an angle constraint biasing west (π/2 .. 3π/2).

enter/exit handlers (`enterHouse` / `exitHouse`) follow the cave pattern via `registerZoneSwapHandler('house', ...)`. `checkHouseTransition` in `house.ts` is called from `cave.ts:checkTransition`.

**player spawn**: tenure starts inside the house at `spawnInterior` (15, 16) facing up. the falling-star spawn ceremony is dropped — there is no longer a `state.playerSpawn` field.

**Revery scene**: at `Omen → Observing`, the engine swaps to `HouseInterior` (if not already there) and moves the steward to `houseBedInterior`, Emily to `houseChairInterior`. at `Closing`, Emily returns to her idle position; the steward stays on the bed and walks off at their pace. see `revery.md` for the full scene sequence.
