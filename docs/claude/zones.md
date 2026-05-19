# zones — cave

referenced from `CLAUDE.md`. read when touching the cave or any zone-swap mechanic.

separate 40x25 interior map accessed via `CaveEntrance` tile. uses a **map context swap** pattern: `enterCave` snapshots overworld state, swaps in cave data. `exitCave` restores. renderer/camera/pathfinding/movement require no branching — they read `state.map`/`state.mapWidth`/`state.mapHeight`.

transition fires after every `movePlayer`. on exit, player placed one tile south of entrance to avoid re-entry loop. bee/ghost/shooting star/weather ticks suppressed in cave.

breakable wall: `[e]` to break, converts to `CaveFloor`, sets `caveRevealed = true`, spawns crumble effect. hidden chamber masked until revealed. **cave entrance is indestructible** — tile-overwriting mechanics must exclude `TileType.CaveEntrance`.
