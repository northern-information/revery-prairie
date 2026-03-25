# revery prairie

browser-based prairie game. ASCII rendered on HTML canvas via React + TypeScript + Vite + Tailwind.

## architecture

two distinct layers — keep them separate:

- **`src/engine/`** — pure TypeScript. no React imports. mutable game state, canvas rendering, input mapping, camera logic. this is the swap point for the eventual isometric sprite upgrade.
- **`src/components/` + `src/hooks/`** — React UI. overlays (inventory, sidebar) and the canvas bridge.

the canvas runs a `requestAnimationFrame` loop that reads game state by reference. React re-renders on movement and UI interactions via `refreshUI()`.

game state is a mutable singleton (`src/hooks/useGameEngine.ts`) held outside React's render cycle. engine functions mutate it directly. this is intentional — standard for game dev, avoids allocation overhead.

## map

100x25 tile grid. the land is a dirt island surrounded by water with a randomized coastline (smoothed noise, ±3 tiles variation). sand sits between water and dirt (2 tiles wide). viewport auto-fits to the browser window. camera centers on the player, clamped to map bounds.

player cannot walk on water. clover cannot grow on water or sand.

displayed coordinates are offset by `SPACE_BORDER` so the land starts at (0, 0).

## tile types

defined in `src/engine/types.ts` as a const object (not an enum — `erasableSyntaxOnly` is enabled in tsconfig).

- `dirt` — empty ground (`.`, tan)
- `clover` — planted clover field (`%`, green)
- `sand` — shoreline (`:`, tan-gold)
- `space` — surrounding void (twinkling stars on black)

## color conventions

hot pink (`#ff69b4`) is reserved for user actions: cursor highlight, path dots, combine/drop previews (`#`), combine toast UI, inventory drop targets. do not use this color for world entities, terrain, or NPC behavior.

cursor highlight uses inverted rendering: pink `fillRect` background + dark `BG_COLOR` text. the renderer uses a two-phase resolve-then-draw pattern — first determine `char`/`color`/`cursorable`, then apply cursor inversion at the end if applicable.

## key files

- `src/engine/types.ts` — all game types. everything depends on this.
- `src/engine/renderer.ts` — canvas ASCII drawing. the file to replace for sprites.
- `src/engine/actions.ts` — game mechanics (movement, combine, bee ticking, path-following).
- `src/engine/pathfinding.ts` — A\* pathfinding (4-directional, manhattan heuristic, binary min-heap).
- `src/engine/coordinates.ts` — screen pixel to world tile coordinate transform.
- `src/engine/weather.ts` — weather generation, tick drift, unit conversion.
- `src/engine/terrain.ts` — map generation with randomized coastline.
- `src/engine/constants.ts` — map size, tile chars/colors, font, border widths.
- `src/components/GameCanvas.tsx` — canvas element, rAF loop, resize handling, HiDPI.
- `src/engine/inventory.ts` — spatial grid operations (place, remove, move, rotate, transfer, auto-sort).
- `src/engine/items.ts` — item definition registry, backpack/container factories.
- `src/engine/recipes.ts` — recipe definitions, combine detection, preview functions.
- `src/components/InventoryPanel.tsx` — inventory UI panel with grid, combine toast, drag-to-map.
- `src/components/InventoryGrid.tsx` — single container grid renderer with drag-and-drop.
- `src/components/ItemInfo.tsx` — imperative item info display (forwardRef).
- `src/components/Sidebar.tsx` — always-visible right sidebar: item info, log, stats, tile, cursor, weather, units, controls.
- `src/hooks/useKeyboard.ts` — all keybindings and panel toggling.
- `src/hooks/useInventoryDrag.ts` — drag state, ghost, rotation, combine detection.
- `src/hooks/useEventLog.ts` — event log + toast system (pickups, drops, combines).
- `src/hooks/useMouse.ts` — click-to-move handler, called inside GameCanvas.

## mouse controls

click-to-move via A\* pathfinding. click a walkable tile and the player walks there tile-by-tile (100ms per step via `tickPath()` in the rAF loop). path is stored as `state.path: Position[] | null`. keyboard input cancels the current path. path tiles render as `·` in `#666` for visual feedback.

coordinate transform: `screenToTile()` converts `e.offsetX`/`e.offsetY` (CSS pixels) to world tile position using camera offset and char metrics. no DPR correction needed — `offsetX`/`offsetY` are already CSS-space.

future: entity click interaction (hit-test, walk-then-interact), drag-select for multi-tile operations.

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
- `i` — toggle inventory
- `x` — drop hovered item (changed from `d` to avoid WASD conflict)
- `r` — rotate hovered item in place, or rotate during drag
- `g` — grab adjacent ground omnibox into backpack
- `esc` — close panel / open menu
- during drag: `r` rotates ghost, `esc` cancels (captured by drag hook)
- `isDraggingRef` blocks `x`/`r` in keyboard hook while drag is active, but allows movement through

## entities

- **bees** — spawn when bee+clover are combined, or when a bee item is dropped. wander randomly — prefer adjacent clover tiles, otherwise walk any non-Space tile. rendered as `*` in gold. tracked in `state.bees[]`. walking over a bee captures it into backpack.
- **ground items** — items dropped on the map. rendered with their glyph/color. walking over them auto-picks up if backpack has room.
- **ground omniboxes** — omniboxes dropped on the map. tracked in `state.groundOmniboxes[]` (separate from groundItems). walking over one auto-OPENS it (does not auto-pickup). the player must explicitly drag it to their backpack from the inventory UI.

## omniboxes

portable 5x5 containers (2x2 inventory footprint). created by combining meteorite + permacomputer (craft recipe). inspired by diablo's horadric cube.

- **container registry**: `state.omniboxContainers: Map<string, Container>` keyed by `ItemInstance.uid`. each omnibox item links to its container data through this map.
- **numbering**: `state.nextOmniboxNumber` increments on creation. container names are `omnibox #1`, `omnibox #2`, etc.
- **multiple open**: `state.openContainers: Container[]` replaces the old `openContainer: Container | null`. multiple omniboxes can be open simultaneously. rendered below backpack in inventory panel.
- **ground behavior**: dropped omniboxes go to `state.groundOmniboxes[]` (not `groundItems`). ground omniboxes are solid — they block `movePlayer()` and `findPath()`. adjacent omniboxes auto-open; walking away auto-closes. press `g` to grab an adjacent ground omnibox into backpack.
- **nesting**: omniboxes can be placed inside other omniboxes.
- **renaming**: deferred — not yet implemented.

## pending actions

`state.pendingAction` is a nullable callback fired when `tickPath` completes a path. used for walk-then-drop. cleared on path failure, WASD interruption, or click-to-move override. `state.previewFn` provides visual indicators (blinking `#`) during transit.

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
