# input — mouse, cursor, keybindings

referenced from `CLAUDE.md`. read when touching click-to-move, pathfinding, cursor rendering, or keybinds.

## mouse controls

click-to-move via A\* pathfinding. right-click a walkable tile → player walks there tile-by-tile (100ms per step via `tickPath()`). path stored as `state.path: Position[] | null`. keyboard input cancels the current path.

right-click is the only mouse button that moves the player. left-click never sets `state.path`. left-click on a character or interactable that is *already adjacent* fires the interaction immediately (e.g. advancing dialog) without any pathfinding; left-click on anything farther away is a no-op. to reach a far interactable, right-click to walk over and press the interact key.

shift + right-click queues a waypoint onto the active path (RTS-style). the new segment is `findPath(lastWaypoint, clickedTile)` appended to `state.path`; `state.pathWaypoints` gains the new tile. shift without an active path behaves as a plain right-click.

click feedback: every click-to-move spawns a brief hot-pink "pop and fade" diamond on the destination tile (`clickTarget` timed effect, 400ms duration, rendered by `clickTarget` pass at the `effect` slot).

ground-item pickup is handled by `pickUpGroundItems` in `engine/entities.ts`, which runs every tick and acquires any item within a 3×3 Chebyshev footprint of the player (see `pickup-hitbox` spec). neither mouse button triggers a pickup `pendingAction` — walk near the item, it picks up automatically.

coordinate transform: `screenToTile()` converts CSS pixels to world tile position. no DPR correction needed — `offsetX`/`offsetY` are already CSS-space.

## cursor

custom cursor from `public/cursor.cur` (diablo II style). set globally via CSS on root elements with `auto` fallback.

## keybindings

left-hand keyboard layout (modern roguelike standard). WASD movement + surrounding keys. `KEYBINDINGS` in `src/engine/input.ts` is the source of truth that feeds the manual and these docs.

- `wasd` / arrow keys — movement (works with backpack open; closes the system menu; blocked when a text input is focused)
- `shift` — toggle sprint (double movement speed, works with WASD and click-to-move)
- `shift + right-click` — queue waypoints onto an existing path (RTS-style)
- `f` — tap to interact: advance dialog, talk to adjacent character (coyote selects unit; first interaction with an angel stores its canto), unlock a facing locked door (or open the locked-gate dialog if no key), break a facing cave breakable wall, clear facing ruin debris. tap also doubles as the divination toss / result-close key inside `HexagramPanel`. hold to scan a flora / egregore / oak target with the permacomputer (precis #6).
- `x` — drop the currently hovered backpack item to the ground. only fires when an item is hovered in the pack. blocked during drag.
- `tab` — toggle the prairie manual (blocked during deep-time Burning / Simulating)
- `c` — toggle the divination screen. overworld only. blocked during dialog, while the system menu is open, and during deep-time Burning / Simulating.
- `esc` — close active dialog, then close active screen, then open the system menu (hierarchical cascade)
- `1` / `2` — overlay modes per precis #17 (Default / Family Tree). `3` is reserved.
- `` ` `` — toggle dev panel (dev mode only). while open, all other game keys are blocked except backtick (close) and Escape (close).

while a text input (`INPUT` / `TEXTAREA`) has focus, only `Escape` and `Tab` reach the game layer. Shift, WASD, and every other key go to the input field.

while a drag of an inventory item is active, only movement keys reach the engine — `x`, interact, and other gameplay keys are suppressed.

genesis-phase input is locked except `Escape` / `Space` / `Enter` (each skips the current epoch).

helper-text convention: bracketed UI strings use Title Case — hotkey hints (`[F]`, `[X]`, `[Tab]`, `[Enter]`) and descriptive labels (`[Toss Coins]`, `[Compendium]`).

### reserved keys (not yet implemented)

- `left click+drag` — TBD
- `right click+drag` — TBD
