# revery prairie

browser-based prairie game. ASCII rendered on HTML canvas via React + TypeScript + Vite + Tailwind.

## architecture

two distinct layers — keep them separate:

- **`src/engine/`** — pure TypeScript. no React imports. mutable game state, canvas rendering, input mapping, camera logic. this is the swap point for the eventual isometric sprite upgrade.
- **`src/components/` + `src/hooks/`** — React UI. overlays (inventory, sidebar) and the canvas bridge.

the canvas runs a `requestAnimationFrame` loop that reads game state by reference. React re-renders on movement and UI interactions via `refreshUI()`.

game state is a mutable singleton (`src/hooks/useGameEngine.ts`) held outside React's render cycle. engine functions mutate it directly. this is intentional — standard for game dev, avoids allocation overhead.

## map

170x95 tile grid. the land is a dirt island surrounded by space (twinkling stars on black) with a randomized coastline (smoothed noise). sand sits between space and dirt (2 tiles wide). viewport auto-fits to the browser window. camera centers on the player, clamped to map bounds.

player cannot walk on space. clover cannot grow on space or sand.

displayed coordinates are offset by `SPACE_BORDER` so the land starts at (0, 0).

## tile types

defined in `src/engine/types.ts` as a const object (not an enum — `erasableSyntaxOnly` is enabled in tsconfig).

- `dirt` — empty ground (`.`, tan)
- `clover` — planted clover field (`%`, green)
- `sand` — shoreline (`:`, tan-gold)
- `space` — surrounding void (twinkling stars on black)
- `caveFloor` — walkable cave ground (`.`, dark gray)
- `caveWall` — impassable cave wall (`#`, darker gray)
- `caveBreakableWall` — breakable wall (`#`, warm brown `#997755` — same char as cave wall but distinct color) — press `[e]` to break, reveals hidden chamber
- `caveEntrance` — transition tile (`O`, light gray) — triggers zone swap on walk-over

## color conventions

hot pink (`#ff69b4`) is reserved for user actions: cursor highlight, path dots, combine/drop previews (`#`), combine toast UI, inventory drop targets. do not use this color for world entities, terrain, or NPC behavior.

cursor highlight uses inverted rendering: pink `fillRect` background + dark `BG_COLOR` text. the renderer uses a two-phase resolve-then-draw pattern — first determine `char`/`color`/`cursorable`, then apply cursor inversion at the end if applicable.

## key files

- `src/engine/types.ts` — all game types. everything depends on this.
- `src/engine/state.ts` — game state factory (`createGameState`), initializes all mutable state, terrain, backpack, weather.
- `src/engine/renderer.ts` — canvas ASCII drawing. the file to replace for sprites.
- `src/engine/gameLoop.ts` — tick system registry and game loop. `TickSystem` interface for entity tick definitions. `createGameLoop` returns start/stop/pause/resume + register/unregister. `tick(time)` is the testable simulation step.
- `src/engine/movement.ts` — `movePlayer`, `tickPath`, `getBlockedPositions`, `getPathfindingBlockers`.
- `src/engine/entities.ts` — `tickBees`, `tickCharacterBehaviors`, `pickUpGroundItems`, `dropItem`.
- `src/engine/celestial.ts` — `spawnShootingStar`, `spawnShootingStarAtTarget`, `tickShootingStars`, `spawnChainMeteorites`.
- `src/engine/interaction.ts` — `interactWithCharacter`, `advanceDialog`, `updateFacingEntity`, `isInteractableAt`, dialog tick, `giveMoabGift`, `breakWall`.
- `src/engine/omnibox.ts` — `openOmnibox`, `closeOmnibox`, `toggleOmnibox`, `grabOmnibox`, `toggleFacingOmnibox`.
- `src/engine/combine.ts` — drag-drop combine detection (`checkCombine`) and `combineBeeAndClover`.
- `src/engine/pathfinding.ts` — A\* pathfinding (4-directional, manhattan heuristic, binary min-heap).
- `src/engine/coordinates.ts` — screen pixel to world tile coordinate transform.
- `src/engine/camera.ts` — camera positioning and viewport clamping.
- `src/engine/weather.ts` — weather generation, tick drift, unit conversion.
- `src/engine/terrain.ts` — map generation with randomized coastline.
- `src/engine/cave.ts` — cave generation (semi-random layout with breakable wall and hidden chamber), zone transition functions (`enterCave`, `exitCave`, `checkTransition`).
- `src/engine/characters.ts` — character definitions (including ghost factory), dialog trees, interaction logic.
- `src/engine/input.ts` — key-to-direction mapping for WASD and arrow keys.
- `src/engine/position.ts` — shared position utilities: `posKey`, `isInBounds`, `removeByIndices`, direction deltas (`DIRECTIONS`, `CARDINAL`, `ORDINAL`).
- `src/engine/constants.ts` — map size, tile chars/colors, font, border widths.
- `src/engine/inventory.ts` — spatial grid operations (place, remove, move, rotate, transfer, auto-sort).
- `src/engine/items.ts` — item definition registry, backpack/container factories.
- `src/engine/recipes.ts` — recipe definitions, combine detection, preview functions.
- `src/components/GameScreen.tsx` — main game container orchestrating canvas, sidebar, inventory, menu, dialogs, toasts.
- `src/components/GameCanvas.tsx` — canvas element, rAF render via game loop, resize handling, HiDPI.
- `src/components/InventoryPanel.tsx` — inventory UI panel with grid, combine toast, drag-to-map.
- `src/components/InventoryGrid.tsx` — single container grid renderer with drag-and-drop.
- `src/components/ItemInfo.tsx` — imperative item info display (forwardRef).
- `src/components/Sidebar.tsx` — always-visible right sidebar: item info, log, stats, tile, cursor, weather, units, controls.
- `src/components/Menu.tsx` — in-game menu (resume, new game).
- `src/components/DialogBox.tsx` — NPC dialog rendering.
- `src/components/NamePrompt.tsx` — steward name entry screen.
- `src/components/DragCursor.tsx` — visual cursor during inventory drag-and-drop.
- `src/components/CombineToast.tsx` — combine result notification with live preview.
- `src/components/PickupToasts.tsx` — item pickup notifications.
- `src/hooks/useGameEngine.ts` — game state singleton, held outside React's render cycle.
- `src/hooks/useKeyboard.ts` — all keybindings and panel toggling.
- `src/hooks/useInventoryDrag.ts` — drag state, ghost, rotation, combine detection.
- `src/hooks/useCanvasDrop.ts` — handles dropping dragged items from inventory onto the canvas map.
- `src/hooks/useEventLog.ts` — event log + toast system (pickups, drops, combines).
- `src/hooks/useMouse.ts` — click-to-move handler, called inside GameCanvas.

## mouse controls

click-to-move via A\* pathfinding. click a walkable tile and the player walks there tile-by-tile (100ms per step via `tickPath()` in the rAF loop). path is stored as `state.path: Position[] | null`. keyboard input cancels the current path. path tiles render as `·` in `#ff69b4` (hot pink) for visual feedback.

shift+click chains waypoints onto an existing path (RTS-style movement queuing). pathfinds from the end of the current chain to the clicked tile and appends. `state.pathWaypoints: Position[]` stores click targets — rendered as `+` in hot pink instead of `·`. every click marks its destination: normal click sets `pathWaypoints` to `[tile]`, shift+click appends. cleared whenever `state.path` is set to `null`. shift+click with no existing path falls through to normal click. shift+click on the same tile as the last waypoint is ignored. failed extension pathfinding leaves the existing path unmodified.

coordinate transform: `screenToTile()` converts `e.offsetX`/`e.offsetY` (CSS pixels) to world tile position using camera offset and char metrics. no DPR correction needed — `offsetX`/`offsetY` are already CSS-space.

click-to-interact: clicking any interactable (character, ground omnibox, breakable wall, or any tile where `isInteractableAt` returns true) pathfinds to the closest adjacent walkable tile, then executes the interaction on arrival via `state.pendingAction`. `state.pendingInteractionTarget: Position | null` tracks the clicked interactable's position — the renderer highlights it with pink inversion during the walk. cleared on action completion, path cancellation, WASD interrupt, zone transition, or new non-interactable click.

pathfinding blockers: click-to-move and hover preview use `getPathfindingBlockers(state, target?)` instead of `getBlockedPositions`. this extends the blocked set with cave entrance tiles so paths don't accidentally route through zone transitions. the `target` parameter excludes the destination from blocking so you can still pathfind TO an entrance or interactable.

hover path preview: `state.hoverPath` / `state.hoverPathTarget` cache a preview path from the player to the cursor tile. computed in the renderer when `cursorTile` changes (not every frame). cleared when an active path exists or cursor leaves the canvas. rendered as the tile's own glyph in dark gray (`#555555`) — preserves tile identity (e.g. `O` for cave entrance) rather than replacing with dots.

tile glyph preservation on paths: special tiles (cave entrance, interactables) render their own glyph on active path and hover overlays, never replaced by path dots (`·`) or waypoint markers (`+`). this is a general rendering convention — tile identity is always visible.

future: drag-select for multi-tile operations.

## cursor

custom cursor from `public/cursor.cur` (diablo II style). set globally via CSS on root elements with `auto` fallback.

## inventory

tetris-style spatial inventory. items have shapes (`boolean[][]`) that must physically fit in a container grid.

- **`src/engine/items.ts`** — item registry. items defined without `id` field in a `const ITEMS = { ... } as const satisfies Record<string, ItemEntry>` map; `ITEM_DEFINITIONS` built via `Object.fromEntries` injecting the key as `id`.
- **`src/engine/inventory.ts`** — pure grid operations: placement, rotation, occupancy, transfer, auto-sort.
- **`src/engine/recipes.ts`** — recipe system for combining items via drag-and-drop.
- **`src/components/InventoryPanel.tsx`** — docked left of sidebar. backpack grid, controls, combine toast.
- **`src/components/InventoryGrid.tsx`** — CSS grid with 28px cells, drag-and-drop, combine detection.
- **`src/components/ItemInfo.tsx`** — imperative (`forwardRef`/`useImperativeHandle`) item info display in sidebar. uses refs to avoid re-render cascades from hover.
- **`src/hooks/useInventoryDrag.ts`** — drag state, ghost rendering, rotation, combine detection.

key types: `ItemDefinition` (template), `ItemInstance` (placed in container), `Container` (grid), `Rotation` (0/1/2/3).

categories: `Fauna`, `Flora`, `Tool`, `CelestialDebris`, `Gizmo` — expand as needed, don't add speculatively.

## recipes

recipes combine two items via drag-and-drop. defined in `src/engine/recipes.ts`.

- `kind`: `macro` (map effects, shows `!` on grid) or `craft` (creates items, shows result icon)
- `resultName`: displayed in toast header (`bee + clover = prairie`)
- `preserveIngredient`: optional definitionId of an ingredient that should NOT be consumed. the combine handler checks both dragged and target items against this field.
- `preview`: optional function returning `{ pos, char, color }[]` for map visualization. called every frame via `state.previewFn` so it follows the player.
- `discoveredRecipes: Set<string>` on GameState tracks which recipes the player has used. undiscovered recipes show `?` on grid cells and `???` in toast.

the permacomputer is never consumed by recipes. it is a tool that persists. the omnibox recipe uses `preserveIngredient: 'permacomputer'` to enforce this.

## keybindings

- `wasd` — movement (works with inventory open, blocked in menu and during drag)
- `r` — toggle inventory (when not hovering item), rotate hovered item in place (when hovering)
- `i` — toggle inventory (legacy, still works)
- `x` — drop hovered item
- `e` — context-dependent: pick up open ground omnibox / close open backpack omnibox / open hovered omnibox / open facing ground omnibox / talk to character / advance dialog
- `esc` — close panel / open menu
- during drag: `r` rotates ghost, `esc` cancels (captured by drag hook)
- `isDraggingRef` blocks `x`/`r` in keyboard hook while drag is active, but allows movement through

## entities

- **bees** — spawn when bee+clover are combined, or when a bee item is dropped. wander randomly — prefer adjacent clover tiles, otherwise walk any non-Space tile. rendered as `*` in gold. tracked in `state.bees[]`. walking over a bee captures it into backpack.
- **ghosts** — 3 spawn at random walkable positions on game start. drift slowly (15% move chance per 500ms tick) using the shared `getBlockedPositions` set. rendered as `ö` in white. tracked in `state.characters[]` with `behavior: { type: 'drift', speed: 0.15, freezeOnDialog: true }`. block player movement and pathfinding. cannot be captured. freeze in place during dialog. each has a 3-line dialog tree.
- **ground items** — items dropped on the map. rendered with their glyph/color. walking over them auto-picks up if backpack has room.
- **ground omniboxes** — omniboxes dropped on the map. tracked in `state.groundOmniboxes[]` (separate from groundItems). player must press `[e]` facing one to open it. walking away (>1 tile) auto-closes it. the player must explicitly drag it to their backpack from the inventory UI.

## omniboxes

portable 5x5 containers (2x2 inventory footprint). created by combining meteorite + permacomputer (craft recipe). inspired by diablo's horadric cube.

- **container registry**: `state.omniboxContainers: Map<string, Container>` keyed by `ItemInstance.uid`. each omnibox item links to its container data through this map.
- **numbering**: `state.nextOmniboxNumber` increments on creation. container names are `omnibox #1`, `omnibox #2`, etc.
- **single open**: `state.openContainer: Container | null`. only one omnibox can be open at a time. opening a new one closes the previous.
- **explicit open/close only**: no auto-open on adjacency or drop. player must press `[e]` to toggle. ground omniboxes auto-close when player walks >1 tile away.
- **facing highlight**: `state.playerFacing: Direction` tracks last move direction. `state.facingEntityPos: Position | null` is the nearest interactable tile the player faces (ground omnibox, character, or any future interactable). rendered with pink cursor inversion. `updateFacingEntity()` recalculates after every move. to add new interactable types, add a check to `isInteractableAt()` in `actions.ts`.
- **ground behavior**: dropped omniboxes go to `state.groundOmniboxes[]` (not `groundItems`). ground omniboxes are solid — they block `movePlayer()` and `findPath()`. press `[e]` facing a ground omnibox to toggle it open/closed.
- **drag-to-store**: dragging an item onto an omnibox item in any container stores the item inside and opens the omnibox. shows the dragged item's glyph as pink preview. shows "not enough capacity" toast if it doesn't fit.
- **panel layout**: backpack panel renders above-right of the player. omnibox panel renders above-left of the player. positioned relative to player screen coordinates.
- **nesting**: omniboxes can be placed inside other omniboxes.
- **renaming**: deferred — not yet implemented.

## movement blocking

`getBlockedPositions(state)` in `movement.ts` returns a `Set<string>` of all tiles blocked by ground omniboxes and characters. used by `movePlayer`, `tickCharacterBehaviors`, pathfinding, and click-to-move. to add new blocking entity types, add them to `getBlockedPositions`. this keeps all movement systems consistent automatically.

tile walkability is centralized in `isWalkableTile(tileType)` in `position.ts`. non-walkable: `Space`, `CaveWall`, `CaveBreakableWall`. used by `movePlayer`, `findPath`, `tickBees`, `tickCharacterBehaviors`, `canDropAt`.

`getPathfindingBlockers(state, target?)` in `movement.ts` extends `getBlockedPositions` with soft blockers (cave entrances) that should be avoided as intermediate waypoints but allowed as destinations. used by click-to-move (`useMouse`) and hover path preview (`renderer`). `movePlayer` and `tickPath` still use `getBlockedPositions` directly — they handle frame-by-frame movement, not route planning.

## cave

separate 40x25 interior map accessed via a `CaveEntrance` tile on the overworld. uses a **map context swap** pattern: `enterCave(state)` snapshots all overworld-specific fields (map, entities, path, etc.), swaps in cave data, and clears entities. `exitCave(state)` restores the snapshot. the renderer, camera, pathfinding, and movement code require no branching — they read `state.map`/`state.mapWidth`/`state.mapHeight` which point to whichever zone is active.

- **generation**: `generateCave()` in `cave.ts`. semi-random layout: CaveWall fill, CaveEntrance at bottom center, random-walk corridors upward, small chamber at the end, breakable wall row, hidden chamber behind it.
- **transition**: `checkTransition(state)` fires after every successful `movePlayer`. if the player is on a `CaveEntrance` tile, it calls `enterCave` or `exitCave` based on `state.currentZone`. on exit, the player is placed one tile south of the overworld entrance to avoid re-entry loop.
- **zone**: `state.currentZone` is `'overworld'` or `'cave'`. `state.overworldSnapshot` holds saved state while in cave.
- **rendering**: out-of-bounds tiles render as dark void (no stars) in cave zone. cave tile chars/colors are in `TILE_CHARS`/`TILE_COLORS`.
- **ticks**: bee, ghost, shooting star, and weather ticks are suppressed in cave (`GameCanvas.tsx` guards on `currentZone`).
- **breakable wall**: player presses `[e]` facing a `CaveBreakableWall` tile to break it. highlights pink via the interactable system (`isInteractableAt` / `facingEntityPos`). `breakWall()` in `actions.ts` converts all wall tiles to `CaveFloor`, sets `caveRevealed = true`, and spawns a `CrumbleEffect` (600ms animation: `#` → `+` → `.` → `·` with fading brown tones). one-time permanent event.
- **hidden chamber masking**: when `!state.caveRevealed`, tiles in `state.caveHiddenPositions` render as `CaveWall` in the renderer — the player cannot see behind the breakable wall until it is broken. `caveHiddenPositions` is a `Set<string>` of posKeys built from `generateCave`'s `hiddenChamberPositions`.
- **cave entrance protection**: the `CaveEntrance` tile is indestructible — the prairie recipe (and any future tile-overwriting mechanics) must exclude `TileType.CaveEntrance`.

## pending actions

`state.pendingAction` is a nullable callback fired when `tickPath` completes a path. used for walk-then-drop and click-to-interact. cleared on path failure, WASD interruption, or click-to-move override. `state.previewFn` provides visual indicators (blinking `#`) during transit. `state.pendingInteractionTarget` tracks the clicked interactable's position for pink highlight during the walk — cleared alongside `pendingAction`.

**caveat**: `movePlayer` inside `tickPath` can trigger a zone transition (`checkTransition`) which sets `state.path = null`. `tickPath` must null-check `state.path` after `movePlayer` returns before calling `shift()`.

## weather

midwest illinois spring conditions. temperature 35-72°F, wind 3-25 mph, humidity 45-85%. sky condition (sunny/cloudy/rain) is weighted by humidity. weather drifts every 5 seconds. season is hardcoded to "spring" for now.

imperial/metric toggle in the sidebar controls section. `fToC()` and `mphToKph()` are in `src/engine/weather.ts`.

## commands

```
npm run dev          # start dev server
npm run build        # type-check + production build
npm run lint         # eslint (strict type-checked)
npm run format       # prettier
npm run format:check # prettier check
npm run test         # run tests once
npm run test:watch   # run tests in watch mode
```

## testing

every feature must have tests. engine tests live in `src/engine/__tests__/`, component tests in `src/components/__tests__/`. engine code is pure TypeScript with no DOM deps. component tests use `@testing-library/react` + `jsdom`.

if a feature cannot be tested (e.g. canvas rendering), flag it for the user to review how to proceed before skipping.

tests that depend on terrain must account for the randomized coastline — use `clearAroundPlayer()` or manually set tiles to dirt before testing movement/combine mechanics.

`createGameState` seeds shooting stars and other entities. tests that assert exact counts on `state.shootingStars`, `state.meteorites`, etc. must reset these arrays (e.g. `state.meteorites = []`) before the test logic.

## harness

spec-driven development pipeline for building and maintaining game features through structured specs, plans, and automated verification.

### workflow

1. **spec** — write a YAML spec in `harness/specs/` describing behaviors, edge cases, failure conditions, and verification commands.
2. **validate** — `npm run spec:validate` checks the spec against `harness/specs/spec-schema.json` (schema compliance, dependency existence, file references).
3. **plan** — write a YAML plan in `harness/plans/` with ordered tasks. each task has narrow `context_files`, `output_files`, `depends_on`, `verification` commands, and a `repair` policy.
4. **execute** — run the plan. each task gets only the spec sections and context files it needs. verification runs after each task; failures trigger repair attempts.
5. **maintain** — run `/maintain-harness` periodically to check for spec-code drift.

### spec format

each spec requires: `id` (kebab-case), `name`, `status` (planned/partial/implemented), `priority`, `layer` (engine/component/integration), `source_files`, `behaviors` (with inputs/outputs/state_changes/determinism), `edge_cases`, `failure_conditions`, `verification` (test_file, test_pattern, command).

### key directories

- `harness/specs/` — feature specs (YAML).
- `harness/plans/` — execution plans (YAML).
- `harness/src/` — harness tooling: validator, plan parser, topo sort, checksum, prompt assembler, executor, logger.
- `harness/__tests__/` — harness module tests.
- `.claude/skills/` — local skill definitions as `{skill-name}/SKILL.md` (`new-feature`, `change-request`, `bug-report`, `maintain-harness`).

### harness commands

```
npm run spec:validate    # validate all specs against schema
npm run harness:run      # execute a plan (--plan harness/plans/{id}.yaml)
```

## conventions

- no enums. use `as const` objects + type aliases.
- ES6 arrow syntax for all functions (`const foo = () => {}`).
- engine code must not import from React or `src/components/`.
- Tailwind for styling. custom theme tokens defined in `src/styles/index.css`.
- `@/` path alias maps to `src/`.
- prettier config matches shop-item-detail-frontend (single quotes, no semis, trailing commas, import sorting, tailwind class sorting).
- eslint uses `strictTypeChecked` + `stylisticTypeChecked` from typescript-eslint.
- for event handlers that read mutable game state, use refs (`containerRef.current`, `dragStateRef.current`) instead of closure-captured values. this avoids stale closures and prevents `useEffect` re-registration on every state change.
- when a `useEffect` only needs to know if something is truthy (not its full value), extract a boolean (`const isDragging = dragState !== null`) and use that in the dependency array to reduce churn.
- `as const satisfies Record<string, T>` pattern for typed registries that derive IDs from keys.
- any code that re-creates `ItemInstance` objects (autoSort, merge, stack, split) must preserve the original `uid`. omnibox containers are keyed by item uid in `state.omniboxContainers` — generating a new uid breaks the link.
- when mutating state before delegating to another function, check that the delegate can fail. if it can, validate before mutating (e.g. check standing tile before removing recipe ingredients).
