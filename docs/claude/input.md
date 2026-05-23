# input — mouse, cursor, keybindings

referenced from `CLAUDE.md`. read when touching click-to-move, pathfinding, cursor rendering, or keybinds.

## mouse controls

click-to-move via A\* pathfinding. right-click a walkable tile → player walks there tile-by-tile (100ms per step via `tickPath()`). path stored as `state.path: Position[] | null`. keyboard input cancels the current path.

right-click is the only mouse button that moves the player. left-click never sets `state.path`. left-click on a character or interactable that is *already adjacent* fires the interaction immediately (e.g. advancing dialog) without any pathfinding; left-click on anything farther away is a no-op. to reach a far interactable, right-click to walk over and press the interact key.

shift + right-click queues a waypoint onto the active path (RTS-style). the new segment is `findPath(lastWaypoint, clickedTile)` appended to `state.path`; `state.pathWaypoints` gains the new tile. shift without an active path behaves as a plain right-click.

click feedback: every click-to-move spawns a brief hot-pink "pop and fade" diamond on the destination tile (`clickTarget` timed effect, 400ms duration, rendered by `clickTarget` pass at the `effect` slot).

coordinate transform: `screenToTile()` converts CSS pixels to world tile position. no DPR correction needed — `offsetX`/`offsetY` are already CSS-space.

## cursor

custom cursor from `public/cursor.cur` (diablo II style). set globally via CSS on root elements with `auto` fallback.

## keybindings

left-hand keyboard layout (modern roguelike standard). WASD movement + surrounding keys.

- `wasd` — movement (works with inventory open, blocked in menu, during drag, and when a text input is focused)
- `e` — context-dependent: talk to character / advance dialog / toss coins in divination / close divination result / break facing cave breakable wall
- `x` — drop hovered inventory item to the ground (only when an item is hovered in the pack)
- `c` — toggle divination screen (overworld only, blocked during dialog and menu)
- `tab` — toggle inventory
- `q` — toggle prairie manual
- `esc` — close panel / open menu
- `shift` — toggle sprint (double movement speed, works with WASD and click-to-move)
- `space` — toggle camera mode (follow lock ↔ RTS pan)
- during drag: `esc` cancels (captured by drag hook)
- `` ` `` — toggle dev panel (dev mode only)
- `isDraggingRef` blocks `x` in keyboard hook while drag is active, but allows movement through
