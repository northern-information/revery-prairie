# input — mouse, cursor, keybindings

referenced from `CLAUDE.md`. read when touching click-to-move, pathfinding, cursor rendering, or keybinds.

## mouse controls

click-to-move via A\* pathfinding. click a walkable tile → player walks there tile-by-tile (100ms per step via `tickPath()`). path stored as `state.path: Position[] | null`. keyboard input cancels the current path.

shift+click chains waypoints onto an existing path (RTS-style). pathfinds from end of current chain to clicked tile and appends. `state.pathWaypoints` stores click targets.

click-to-interact: clicking any interactable pathfinds to closest adjacent walkable tile, then executes interaction on arrival via `state.pendingAction`. `state.pendingInteractionTarget` highlights the target during the walk.

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
- `shift+click` — queue waypoints onto existing path (RTS-style)
- `space` — toggle camera mode (follow lock ↔ RTS pan)
- during drag: `esc` cancels (captured by drag hook)
- `` ` `` — toggle dev panel (dev mode only)
- `isDraggingRef` blocks `x` in keyboard hook while drag is active, but allows movement through

### reserved keys (not yet implemented)

- `left click+drag` — TBD (future RTS-style multi-select)
- `right click` — TBD
