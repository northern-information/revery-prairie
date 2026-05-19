# movement, blocking, pending actions

referenced from `CLAUDE.md`. read when touching `movePlayer`, pathfinding, blocking tiles, or walk-then-act flows.

## movement blocking

`getBlockedPositions(state, zone?, opts?)` returns all tiles blocked by entities with the `Blocking` component (characters, etc.) plus overworld water tiles (ponds, rivers). pass `{ ignoreCoyote: true }` in opts to exclude the coyote — used by player movement and pathfinding so the player can walk through the coyote. other entities still see the coyote as blocking via the default call. to add new blocking types, add them here — all movement systems use it automatically.

`isWalkableTile(tileType)` in `position.ts` centralizes tile walkability. non-walkable: `Space`, `CaveWall`, `CaveBreakableWall`.

`getPathfindingBlockers(state, target?)` extends blocked set with soft blockers (cave entrances) that should be avoided as waypoints but allowed as destinations. used by click-to-move and hover preview.

## pending actions

`state.pendingAction` is a nullable callback fired when `tickPath` completes a path. used for walk-then-drop and click-to-interact. cleared on path failure, WASD interruption, or click-to-move override.

**caveat**: `movePlayer` inside `tickPath` can trigger a zone transition which sets `state.path = null`. `tickPath` must null-check `state.path` after `movePlayer` returns before calling `shift()`.
