# revery prairie

browser-based prairie game. ASCII rendered on HTML canvas via React + TypeScript + Vite + Tailwind.

## writing style

- Sentence case for prose — PR titles and bodies, commit messages, comments, chat replies, in-game body text, descriptions, error messages. Capitalize the first word and proper nouns only.
- Title Case for labels — button text, form labels, headings, link text, menu items, in-game entry names (manual entries, item names, character names, recipe names, keybinding action labels). Capitalize all major words; lowercase short articles, conjunctions, and prepositions ≤3 letters except as the first word.
- Never all-lowercase for user-facing text. Sentence case or Title Case as appropriate, never `enter your name` or `connecting…`.
- Wrap code, identifiers, file paths, and commands in backticks. Use triple-backtick code fences for multi-line snippets with a language tag.
- Preserve original casing for identifiers (PascalCase, camelCase, SCREAMING_SNAKE_CASE) and product names (GitHub, React, Vite, Tailwind).
- Exception: the existing body of this CLAUDE.md uses lowercase headings and prose. That's intentional for this repo — match it when editing this file.

## architecture

two distinct layers — keep them separate:

- **`src/engine/`** — pure TypeScript. no React imports. mutable game state, canvas rendering, input mapping, camera logic. the rendering target is ASCII-on-iso permanently — no sprite swap planned.
- **`src/components/` + `src/hooks/`** — React UI. overlays (inventory, sidebar) and the canvas bridge.

the canvas runs a `requestAnimationFrame` loop that reads game state by reference. React re-renders on movement and UI interactions via `refreshUI()`.

game state is a mutable singleton (`src/hooks/useGameEngine.ts`) held outside React's render cycle. engine functions mutate it directly. this is intentional — standard for game dev, avoids allocation overhead.

### rendering pipeline

the renderer is organized around two ideas — see `harness/specs/renderer.yaml`:

- **pass registry** (`src/engine/render/passes.ts`) — the render frame is built from named passes registered into ordered slots: `bg-cache` → `world-overlay` → `tile-glyph` → `entity` → `effect` → `screen-overlay`. each pass declares an `isActive(state)` predicate and a `draw` function. `renderer.ts` calls `runPassesInSlot(slot, ...)` at each slot's documented position; passes are added by creating a module under `src/engine/render/passes/` and re-exporting it from `passes/index.ts` (the side-effect import in `renderer.ts` triggers registration). currently populated slots: `bg-cache`, `world-overlay`, `effect` (post-tile overlays only), `screen-overlay`. the `tile-glyph` and `entity` slots are intentionally empty — the central tile loop in `renderer.ts` (terrain, clover lifecycle, fog of war, glints, cursor inversion, ponds/rivers, plus the populate-then-consume pattern that feeds it from ECS) is the tile-glyph slot. splitting the precedence chain across pass files would duplicate logic or force a frameState abstraction; the inline central loop is the documented end state.
- **cache contract** (`src/engine/render/cacheContract.ts`) — single source of truth for cached-layer invalidation triggers. mutation sites call into this module rather than poking individual caches. current cached layers: `tileBgCache` (per-map static tile bg + cube edges), `haloCache` (per-map prairie halo at peak intensity, pulse applied at composite via `globalAlpha`). the contract module documents which mutations invalidate which caches.

when adding a new bg-cache, world-overlay, effect, or screen-overlay concern, write a pass — don't edit `renderer.ts`. when adding a new map mutation site, route it through the cache contract. when adding a new cached layer, declare its triggers in `cacheContract.ts` so the next mutation author can find them.

## multiplayer

three-tier deploy bundled as a single Cloudflare Worker: React SPA + worker fetch handler + one Durable Object per prairie. the SPA is served via the worker's `[assets]` binding, the fetch handler routes `/api/*` to the DO, and everything else falls through to static assets with SPA-style `not_found_handling`. same origin in production — no CORS.

### workspace layout

- `shared/` — wire protocol, `ColorId`, `PLAYER_COLORS`. consumed by both client and worker via `@revery-prairie/shared` (npm workspaces). never imports from `src/`, `worker/`, or React.
- `worker/` — Cloudflare Worker code. `worker/src/PrairieDO.ts` is the Durable Object (one instance per prairie, websocket hibernation API); `worker/src/index.ts` is the HTTP/WS router; `worker/wrangler.toml` configures the deploy.
- `src/network/` — React-side network layer. `client.ts` is the websocket client; `types.ts` holds client-only types like `NetworkClientStatus`.

### url routing

- `/` — offline mode. `NamePrompt` → `GameScreen`. localStorage save/load active.
- `/p/new` — create a prairie. `NetworkConnect` POSTs `/api/prairies`, server returns `{ prairieId, ownerToken }`, client stores `ownerToken` under `prairie:{prairieId}:ownerToken` in localStorage, browser navigates to `/p/{prairieId}`.
- `/p/{prairieId}` — visit a prairie. opens a websocket to `/api/prairies/{prairieId}/connect`, sends `hello`, receives `welcome` (with sessionId, isOwner, world.genesisSeed, peers).

### wire protocol

defined in `shared/src/protocol.ts`. summary:

- HTTP `POST /api/prairies` with `{ stewardName, color }` → `{ prairieId, ownerToken }`
- WS `/api/prairies/{id}/connect`
  - client → server: `hello` (once), `position` (per movement)
  - server → client: `welcome` (once), `peer-joined` / `peer-position` / `peer-left`, `error`
- close codes (4xxx range): 4001 malformed hello, 4002 invalid color, 4003 prairie not found, 4500 server error

### sync scope

position-only in the foundation spec (`multiplayer-foundation`). mutations (harvest, drop, combine), entity ticks (bees, ghosts, weather), and reveries are deferred to follow-up specs (`multiplayer-mutations`, `multiplayer-entity-tick`, `multiplayer-reveries`, etc.).

server-side game ticks only run while at least one websocket is open. there is no Cron Trigger or `alarm()` keeping the world ticking 24/7 — true 24/7 persistence is a follow-up spec.

### state shape

new fields on `GameState`:

- `multiplayerSession: MultiplayerSession | null` — `prairieId`, `ownerToken`, `sessionId`, `color`, `role` (`'host' | 'visitor'`), `status`. null in offline mode.
- `remotePlayers: Map<string, RemotePlayer>` — keyed by sessionId. populated from `welcome.peers`, mutated on `peer-joined` / `peer-position` / `peer-left`.
- `onPlayerMoved: (() => void) | null` — engine callback fired after every successful `movePlayer`. wired to `NetworkClient.sendPosition` in online mode by `useGameEngine`.

### colors

avatars are rendered as `@` glyphs colored from `PLAYER_COLORS` (8 entries, hot pink excluded). the local player picks a color in `NetworkConnect`; remote players' colors come from their `peer-joined` / `welcome.peers` entries. last-used color autofills the next session via `prairie:lastColor` in localStorage.

### deploy

`npm run deploy` builds the SPA into `dist/` then runs `wrangler deploy` from `worker/`. the worker's `[assets]` block points at `../dist`. `wrangler login` is required once interactively before the first deploy.

`VITE_WORKER_URL` env var:

- unset (default in production builds) — same origin
- empty string — same origin (explicit)
- non-empty url — point at a remote worker (used in `npm run dev` to talk to the deployed worker from `localhost:5173`)

### local dev

two paths:

- `npm run dev` against a deployed worker — set `VITE_WORKER_URL=https://...workers.dev` in `.env.local`
- `npm run dev` against a local worker — `cd worker && npx wrangler dev` separately (wrangler v4 detects the workspace root and refuses to run there), then set `VITE_WORKER_URL=http://localhost:8787` in `.env.local`

## map

147x147 tile grid (127x127 land area, after the `SPACE_BORDER` frame on every edge). the land is a dirt island surrounded by space (twinkling stars on black) with a randomized coastline (smoothed noise). sand sits between space and dirt (2 tiles wide). viewport auto-fits to the browser window. camera centers on the player, clamped to map bounds.

odd dimensions guarantee a single exact-center tile at `(73, 73)`. Gron sits on it. the player spawns one tile west of Gron at `(72, 73)`. the cave entrance is placed in a ring just outside Gron's rain aura.

player cannot walk on space. clover cannot grow on space or sand.

displayed coordinates are offset by `SPACE_BORDER` so the land starts at (0, 0).

## tile types

defined in `src/engine/types.ts` as a const object (not an enum — `erasableSyntaxOnly` is enabled in tsconfig).

- `dirt` — empty ground (`.`, tan)
- `clover` — planted clover field (`%`, green)
- `burntClover` — fire-scorched clover (`%`, dark charcoal `#3D2B1F`) — walkable, clover cannot regrow on it. created by fire revery.
- `sand` — shoreline (`:`, tan-gold)
- `space` — surrounding void (twinkling stars on black)
- `caveFloor` — walkable cave ground (`.`, dark gray)
- `caveWall` — impassable cave wall (`#`, darker gray)
- `caveBreakableWall` — breakable wall (`#`, warm brown `#997755` — same char as cave wall but distinct color) — press `[e]` to break, reveals hidden chamber
- `caveEntrance` — transition tile (`O`, light gray) — triggers zone swap on walk-over

## color conventions

hot pink (`#ff69b4`) is reserved for user actions: cursor highlight, path dots, combine/drop previews (`#`), inventory drop targets. do not use this color for world entities, terrain, or NPC behavior.

cursor highlight uses inverted rendering: pink `fillRect` background + dark `BG_COLOR` text. the renderer uses a two-phase resolve-then-draw pattern — first determine `char`/`color`/`cursorable`, then apply cursor inversion at the end if applicable.

## mouse controls

click-to-move via A\* pathfinding. click a walkable tile → player walks there tile-by-tile (100ms per step via `tickPath()`). path stored as `state.path: Position[] | null`. keyboard input cancels the current path.

shift+click chains waypoints onto an existing path (RTS-style). pathfinds from end of current chain to clicked tile and appends. `state.pathWaypoints` stores click targets.

click-to-interact: clicking any interactable pathfinds to closest adjacent walkable tile, then executes interaction on arrival via `state.pendingAction`. `state.pendingInteractionTarget` highlights the target during the walk.

coordinate transform: `screenToTile()` converts CSS pixels to world tile position. no DPR correction needed — `offsetX`/`offsetY` are already CSS-space.

## cursor

custom cursor from `public/cursor.cur` (diablo II style). set globally via CSS on root elements with `auto` fallback.

## cursor info panel

the sidebar shows data for whatever tile the mouse hovers over. three rules apply to all current and future content:

1. **every entity that renders on the map must appear in the contents row.** if the renderer draws it at a tile position, the sidebar contents IIFE in `Sidebar.tsx` must check for it and return a human-readable label. transient timed effects (explosions, pickup blooms, wildfire, crumble) are exempt — they are visual-only.
2. **every persistent map-visible effect must appear in the effects row.** if an overlay is drawn on tiles (rain, glinting, aura, revery cast), `getTileEffects()` in `effects.ts` must detect and return it. transient timed effects are exempt.
3. **tile type labels must be human-readable.** never show raw camelCase type strings (e.g. `burntClover`). map every tile type to a plain-english label (e.g. "burnt clover").

when adding new entities, effects, or tile types — wire up cursor info at the same time.

## inventory

tetris-style spatial inventory. items have shapes (`boolean[][]`) that must physically fit in a container grid.

key types: `ItemDefinition` (template), `ItemInstance` (placed in container), `Container` (grid), `Rotation` (0/1/2/3).

categories: `Fauna`, `Flora`, `Tool`, `CelestialDebris`, `Gizmo`, `Seed`, `Artifact`, `Zoogenic` — expand as needed, don't add speculatively.

## recipes

recipes combine two items via drag-and-drop. defined in `src/engine/recipes.ts`.

- `kind`: `macro` (map effects, shows `!` on grid) or `craft` (creates items, shows result icon)
- `preserveIngredient`: optional definitionId of an ingredient that should NOT be consumed.
- `discoveredRecipes: Set<string>` on GameState tracks which recipes the player has used. undiscovered recipes show `?` on grid cells.

## keybindings

left-hand keyboard layout (modern roguelike standard). WASD movement + surrounding keys.

- `wasd` — movement (works with inventory open, blocked in menu, during drag, and when a text input is focused)
- `e` — context-dependent: talk to character / advance dialog / toss coins in divination / close divination result / break facing cave breakable wall
- `r` — toggle reveries screen (blocked when modifier held to avoid overriding Cmd+R / Ctrl+R browser refresh)
- `f` — harvest facing clover tile (tile → dirt, clover item to backpack, no soil enrichment)
- `x` — drop hovered item; also cuts facing clover when no item is hovered (tile → dirt, soil enrichment, no item)
- `c` — toggle divination screen (overworld only, blocked during dialog and menu)
- `tab` — toggle inventory
- `q` — toggle prairie manual
- `esc` — close panel / open menu
- `shift` — toggle sprint (double movement speed, works with WASD and click-to-move)
- `shift+click` — queue waypoints onto existing path (RTS-style)
- `space` — toggle camera mode (follow lock ↔ RTS pan)
- during drag: `esc` cancels (captured by drag hook)
- `1-4` — activate action bar slot (blocked during dialog and menu)
- `` ` `` — toggle dev panel (dev mode only)
- `isDraggingRef` blocks `x` in keyboard hook while drag is active, but allows movement through

### reserved keys (not yet implemented)

- `left click+drag` — TBD (future RTS-style multi-select)
- `right click` — TBD

## prairie manual

in-game encyclopedia toggled with `[q]`. movement remains active while open.

entries are auto-derived at runtime from `ITEM_DEFINITIONS`, `RECIPES`, and `CHARACTER_DEFINITIONS`. manual-only entries for zones and events live in `MANUAL_ONLY_ENTRIES` in `manual.ts`.

discovery tracking: `manualDiscoveries: Set<string>` on GameState. structured keys: `item:<id>`, `recipe:<key>`, `character:<id>`, `zone:cave`, `event:<name>`. `recordDiscovery(state, key)` called at mutation points. undiscovered recipe results are behind spoiler blocks.

hand-authored lore goes in `MANUAL_LORE` table in `manual.ts`. run `/maintain-manual` to audit for gaps. **lore is written by humans only** — when adding new entries to `MANUAL_LORE`, use `{ lore: 'TODO' }` as a placeholder. never write lore text.

**when adding new game content**: items, recipes, and characters auto-generate manual entries — no extra work. new entity types that don't fit existing registries must be added to `MANUAL_ONLY_ENTRIES` with a corresponding `recordDiscovery` call.

## entities

- **bees** — spawn on bee+clover combine or bee item drop. wander randomly preferring clover. rendered as `*` in gold. walking over captures to backpack.
- **ghosts** — 3 spawn at random positions on game start. drift slowly (15% move chance per 500ms). block movement/pathfinding. freeze during dialog. each has a 3-line dialog tree.
- **angels** — biblically accurate ASCII entities. 9x9 body rendered from seeded animation. spawn periodically (~90s intervals), drift slowly, despawn after ~120s. have gold aura background, bee-spawning and clover-growing effects. dialog grants cantos (poems). tracked via `angelCantos`, `angelEncounterCount`, `angelFlashTime` on GameState.
- **coyote** — companion NPC. follows the player in `Follow` mode (stays 2-3 tiles behind). `Collect` mode: roams and picks up ground items, delivers them to the player's backpack. toggled via coyote screen. tracked via `state.coyoteMode`, `state.coyoteCargo`, `state.coyotePath`.
- **shooting stars** — ambient space entities. streak across the void with animated trails. targeted stars land on the map and become meteorites.
- **ground items** — dropped items on map. auto-pickup on walk-over if backpack has room.

## pickup bloom

every item acquisition must spawn a `pickupBloom` effect at the player position via `spawnPickupBloom(state, x, y, time)` in `effects.ts`. this includes: walking over ground items, capturing bees, collecting meteorites, harvesting clover, coyote delivering to backpack, crafting via recipes, and receiving revery gifts. one bloom per acquisition event (not per item). no bloom when `time` is omitted or when the acquisition fails.

when adding new acquisition paths — any code that adds items to the backpack, grants reveries, or otherwise gives the player something — call `spawnPickupBloom` at the same time.

## reveries

key items that don't occupy inventory grid space. stored as `state.reveries: string[]`. given as gifts by characters on dialog completion.

registry in `src/engine/reveries.ts`. current reveries:

- `earth` (starting revery) — `castStyle: 'scan'`. radiates a 20-tile radius soil health visualization from the player position. black → green gradient (black = depleted, green = thriving). works in both overworld and cave. three phases: radial expansion (1.5s), hold (2.5s), radial wave fade-out (1.5s). purely diagnostic — no gameplay effects. skips space and impassable cave walls.
- `lightning` (starting revery) — `castStyle: 'targeted'`. player selects a tile within range, lightning strikes it. 15s cooldown.
- `fire` (from Moab) — `castStyle: 'tile'`. burns the facing tile. 12s cooldown.
- `water` (from Gron) — `castStyle: 'rain'`. rain pattern on cross shape. 12s cooldown.
- `deep-time` (from Gron post-deep-time) — `castStyle: 'deepTime'`. initiates the deep time endgame sequence. single use (infinite cooldown).

## character gifts

characters have optional `gift` and `postGiftDialog` fields. gifts are one-time per character, tracked in `state.giftsReceived: Set<string>`. `getCharacterDialog` returns `postGiftDialog` if gift has been given.

## action bar

bottom-center UI with 4 slots for reveries or items. `1-4` keybinds. new reveries auto-fill first empty slot. items can be dragged from inventory onto slots.

## movement blocking

`getBlockedPositions(state, zone?, opts?)` returns all tiles blocked by entities with the `Blocking` component (characters, etc.) plus overworld water tiles (ponds, rivers). pass `{ ignoreCoyote: true }` in opts to exclude the coyote — used by player movement and pathfinding so the player can walk through the coyote. other entities still see the coyote as blocking via the default call. to add new blocking types, add them here — all movement systems use it automatically.

`isWalkableTile(tileType)` in `position.ts` centralizes tile walkability. non-walkable: `Space`, `CaveWall`, `CaveBreakableWall`.

`getPathfindingBlockers(state, target?)` extends blocked set with soft blockers (cave entrances) that should be avoided as waypoints but allowed as destinations. used by click-to-move and hover preview.

## cave

separate 40x25 interior map accessed via `CaveEntrance` tile. uses a **map context swap** pattern: `enterCave` snapshots overworld state, swaps in cave data. `exitCave` restores. renderer/camera/pathfinding/movement require no branching — they read `state.map`/`state.mapWidth`/`state.mapHeight`.

transition fires after every `movePlayer`. on exit, player placed one tile south of entrance to avoid re-entry loop. bee/ghost/shooting star/weather ticks suppressed in cave.

breakable wall: `[e]` to break, converts to `CaveFloor`, sets `caveRevealed = true`, spawns crumble effect. hidden chamber masked until revealed. **cave entrance is indestructible** — tile-overwriting mechanics must exclude `TileType.CaveEntrance`.

## pending actions

`state.pendingAction` is a nullable callback fired when `tickPath` completes a path. used for walk-then-drop and click-to-interact. cleared on path failure, WASD interruption, or click-to-move override.

**caveat**: `movePlayer` inside `tickPath` can trigger a zone transition which sets `state.path = null`. `tickPath` must null-check `state.path` after `movePlayer` returns before calling `shift()`.

## field ownership

mutable game state has no access control. these conventions document write patterns to prepare for eventual module boundaries:

- **single-owner**: one module writes meaningful values, others only read. most fields follow this.
- **owner + clearers**: one module writes, others only null/reset (e.g. `pendingAction`, `previewFn`, `cursorTile`).
- **multi-spawner, single lifecycle**: multiple modules create entries, one owns tick/removal (e.g. `bees[]`, `groundItems`).
- **shared writers**: multiple modules write meaningful values. currently only `path`/`pathWaypoints` and `playerFacing`. _aspirational: introduce `setPath()` accessor in movement.ts._

**convention for new fields**: prefer single-owner. if multiple modules must write, use owner+clearers or multi-spawner — never ad-hoc writes from arbitrary locations.

## weather

midwest illinois spring conditions. temperature 35-72°F, wind 3-25 mph, humidity 45-85%. weather drifts every 5 seconds. season hardcoded to "spring". imperial/metric toggle in sidebar.

## clover lifecycle

clover needs light and water to survive. without either, it dies through stages: healthy → brown → blinkingRed → black → decomposing → dirt.

- overworld = light + rain water. cave = no light, no water.
- brown stage recovers if conditions improve. blinkingRed and beyond = terminal.
- death enriches soil. harvest (`[f]`) does not enrich. cut (`[x]`) enriches but gives no item.

## genesis

geological simulation between name entry and gameplay. compresses a billion years into ~25 seconds. generates terrain, soil health, and civilization ruin data.

app flow: `NamePrompt → GenesisScreen → GameScreen`. genesis runs its own rAF loop (no ECS/tick systems). passes `GenesisResult` to `createGameState`.

`nameToSeed(stewardName)` hashes name to a seed for `mulberry32` PRNG. same name = same world.

14 epochs defined in `GENESIS_EPOCHS` in `genesis.ts` — each has `id`, `durationMs`, `commentary`, `mutate`, `renderTile`. adding/removing/reordering epochs auto-updates the manual entry.

`civilizationRuins: CivilizationRuin[]` on GameState — data-only, set once from genesis result. aqueduct junctions inform cave entrance placement.

### skip mechanism

- press any key → fast-forward (run remaining mutations synchronously)
- dev auto-skip: `?skipGenesis=true` URL param
- tests: use `runAllMutations()` for synchronous result, or omit `genesisResult` from `createGameState` to fall back to old terrain generation.

## soil health

`soilHealth: Map<string, number>` keyed by posKey. default `SOIL_HEALTH_DEFAULT` (50), max `SOIL_HEALTH_MAX` (100). geologically derived when genesis runs (base 30, accumulated through epochs, clamped [10, 100]). enriched by natural clover death and cutting. not enriched by harvesting.

## music

two-layer audio system: ambient (zone) and dialog (character). crossfade on zone/dialog transitions (~300ms). `musicEnabled` toggle in ESC menu preserves playback position.

MP3s in `public/music/`, gitignored. `public/music/MANIFEST.md` lists expected files. must be placed manually after cloning.

## commands

```
npm run dev             # start dev server
npm run build           # type-check + production build (tsc -b && vite build)
npm run lint            # eslint (strict type-checked)
npm run format          # prettier
npm run format:check    # prettier check
npm run typecheck       # tsc -b --noEmit (type-check only, no build)
npm run test            # run tests once
npm run test:watch      # run tests in watch mode
npm run test:engine     # engine tests only
npm run test:components # component tests only
npm run test:harness    # harness tests only
npm run verify          # typecheck + lint + test (all three)
npm run preview         # vite preview
npm run deploy          # vite build + wrangler deploy from worker/ (needs wrangler login once)
```

## testing

every feature must have tests. engine tests in `src/engine/__tests__/`, component tests in `src/components/__tests__/`. engine code is pure TypeScript with no DOM deps. component tests use `@testing-library/react` + `jsdom`.

if a feature cannot be tested (e.g. canvas rendering), flag it for the user to review how to proceed before skipping.

tests that depend on terrain must account for the randomized coastline — use `clearAroundPlayer()` or manually set tiles to dirt before testing movement/combine mechanics. this applies to any entity, not just the player: if a test spawns an entity and then asserts on random tile selection within a radius (aura effects, spawning, etc.), clear the terrain around that entity first. without explicit terrain preparation, random tile picks may land on sand/space/water and silently fail.

`createGameState` seeds shooting stars and other entities. tests that assert exact counts on `state.shootingStars`, `state.meteorites`, etc. must reset these arrays (e.g. `state.meteorites = []`) before the test logic.

tests must never depend on `Math.random()` producing favorable outcomes over N iterations. mock it with `vi.spyOn(Math, 'random').mockReturnValue(...)` and restore with `vi.restoreAllMocks()` in a `finally` block. never use the manual `const orig = Math.random; Math.random = () => ...` pattern. when a test needs random placement to succeed (spawning an entity at a random position within a radius), don't rely on mocked random values landing on valid tiles — instead, prepare the terrain so all tiles in the radius are valid. mocking random is for controlling *which path* code takes, not for guaranteeing tile validity.

`no-non-null-assertion` forbids `getComponent(...)!` in tests. use a `requireComponent` helper that wraps `expect(val).toBeTruthy()` and returns the typed value. see `src/engine/__tests__/angels.test.ts` for the pattern.

adding a new field to `GameState` requires adding it to `EXPECTED_FIELDS` in `src/harness/__tests__/serialization/schema.test.ts` or the schema allowlist test will fail.

rain-related tests must set `state.rainIntensity = 1` (not just `state.weather.sky = Sky.Rain`) and position the test tile in the rain front's core zone (dist between `RAIN_FRONT_FRINGE` and `RAIN_FRONT_WIDTH - RAIN_FRONT_FRINGE`) to avoid probabilistic exclusion by the blotchy fringe noise.

## harness

spec-driven development pipeline. see README.md for the workflow, roles, and entry points.

### writing a spec

file: `harness/specs/{id}.yaml`. schema: `harness/specs/spec-schema.json`.

required top-level fields:

- `id` — kebab-case, unique
- `name` — human-readable title
- `priority` — `critical`, `high`, `medium`, `low`
- `layer` — `engine`, `component`, or `integration`
- `source_files` — array of file paths this feature touches
- `dependencies` — (optional) array of other spec ids
- `behaviors` — array, at least one. each behavior has:
  - `id` — kebab-case
  - `description` — what happens (min 10 chars)
  - `inputs` — array of triggering conditions
  - `outputs` — array of observable results
  - `state_changes` — array of `{ field, effect }` pairs
  - `determinism` — `deterministic`, `probabilistic`, or `time-based`
- `edge_cases` — array of `{ id, description, expected }`
- `failure_conditions` — array of `{ trigger, expected }`
- `verification` — `{ test_file, test_pattern, command }`

### writing a plan

file: `harness/plans/{id}.yaml`.

top-level:

- `plan.id` — matches the spec id
- `plan.title` — what the plan accomplishes
- `plan.created` — date (YYYY-MM-DD)
- `plan.global_verification` — array of commands run after all tasks. scope to the touched layer:
  - **default** (single-component or narrow change): `npm run typecheck`, `npm run lint`, plus the spec's `verification.command` (the targeted vitest run)
  - **cross-cutting** (engine layer, integration layer, multiple layers, `shared/` wire protocol changes, or anything that mutates `GameState` shape): `npm run typecheck`, `npm run test`, `npm run lint`
  - the full suite (`npm run test`) takes ~60s and runs in CI on PR open. local iteration stays fast when scoped.

each task in `tasks[]`:

- `id` — kebab-case
- `title` — what the task does
- `spec_id` — which spec this implements
- `spec_sections` — array of behavior ids from the spec (scopes context)
- `context_files` — files the task needs to read
- `output_files` — files the task will modify
- `depends_on` — array of task ids that must complete first
- `verification` — array of commands to confirm the task worked
- `repair` — `retry` or `skip`
- `tags` — optional array (e.g. `[engine]`, `[test]`, `[hook]`)

### harness execution

`npm run harness:run` delegates tasks to an LLM agent that may produce zero edits, causing tasks to fail with 0 attempts. when executing a plan, implement the tasks manually following the plan's task order and dependency graph. the harness is useful for validation and structure, not autonomous execution.

### harness commands

```
npm run spec:validate    # validate all specs against schema
npm run harness:run      # execute a plan (--plan harness/plans/{id}.yaml)
npm run harness:check    # gate the current branch against origin/main
```

### harness gate (CI)

`npm run harness:check` enforces that significant product changes go through `/new-feature`, `/bug-report`, or `/change-request`. it runs in CI on every PR and can be run locally.

**gate triggers** (PR fails unless it includes both a `harness/specs/*.yaml` and a `harness/plans/*.yaml` change):

- any new file added under `src/`, `worker/src/`, or `shared/src/` (excluding tests)
- more than 150 LOC changed (added + removed) across product paths in the same trees

**always skipped** (no spec required):

- test files (`**/__tests__/**`, `*.test.ts(x)`)
- `harness/`, `.github/workflows/`, `.claude/`
- root config and docs (`package.json`, `tsconfig*`, `vite*`, `eslint*`, `prettier*`, `*.md`, `.gitignore`, `.editorconfig`)
- assets and anything else outside the product trees

**override**: add a `Skip-Harness: <reason>` trailer to the most recent commit on the branch (or set `SKIP_HARNESS=<reason>` in CI). the reason is logged in CI output so reviewers see it. use sparingly — for emergency patches or genuinely-uncategorizable changes that the gate misclassifies.

**how to satisfy the gate**: run `/new-feature`, `/bug-report`, or `/change-request` before starting work. these skills produce both a spec and a plan, which the gate looks for in the diff against `origin/main`.

## worktrees

after `EnterWorktree`, the Bash tool's working directory does **not** automatically change to the worktree. always prefix git commands with `cd <worktree-path> &&` or they will silently operate on the main checkout.

Read/Edit/Write tools resolve **relative** paths against the worktree. **Absolute** paths go wherever they point — passing `/Users/.../revery-prairie/src/foo.ts` (the main checkout) instead of `/Users/.../revery-prairie/.claude/worktrees/<branch>/src/foo.ts` will silently edit the main checkout. Prefer relative paths after `EnterWorktree`. If you must use absolute paths, include `.claude/worktrees/<branch>/` in them.

sanity check: after the first Read/Edit/Write, run `git status` in Bash. if it shows the file changed in the worktree branch, you're in the right place. if `git status` is clean inside the worktree but the main checkout shows the change, you've edited the wrong tree — revert and redo.

after `/new-feature`, `/bug-report`, or `/change-request` completes, prompt the user if they want to run the dev server in the worktree: `cd <worktree-path> && npm run dev`.

## conventions

- no enums. use `as const` objects + type aliases.
- ES6 arrow syntax for all functions (`const foo = () => {}`).
- engine code must not import from React or `src/components/`.
- Tailwind for styling. custom theme tokens defined in `src/styles/index.css`.
- `@/` path alias maps to `src/`.
- prettier config matches shop-item-detail-frontend (single quotes, no semis, trailing commas, import sorting, tailwind class sorting).
- eslint uses `strictTypeChecked` + `stylisticTypeChecked` from typescript-eslint. never add `eslint-disable` comments — fix the underlying code instead. `no-dynamic-delete` forbids `delete obj[key]` — use `Reflect.deleteProperty(obj, key)` instead.
- for event handlers that read mutable game state, use refs (`containerRef.current`, `dragStateRef.current`) instead of closure-captured values. this avoids stale closures and prevents `useEffect` re-registration on every state change.
- when a `useEffect` only needs to know if something is truthy (not its full value), extract a boolean (`const isDragging = dragState !== null`) and use that in the dependency array to reduce churn.
- `as const satisfies Record<string, T>` pattern for typed registries that derive IDs from keys.
- any code that re-creates `ItemInstance` objects (autoSort, merge, stack, split) must preserve the original `uid`. `state.glintingCoins` is keyed by item uid — generating a new uid orphans the glint state.
- when mutating state before delegating to another function, check that the delegate can fail. if it can, validate before mutating (e.g. check standing tile before removing recipe ingredients).
- avoid naming collisions between game concepts and source concepts. if a game entity and a code mechanism share a name (e.g. "ghost" for both NPC spirits and drag-preview phantoms), rename the code mechanism. overlapping terminology makes human understanding difficult.
- multiplayer code: `shared/` is the single source of truth for the wire protocol. neither client nor worker may duplicate types — both import from `@revery-prairie/shared`. `shared/` itself imports nothing from the rest of the repo.
- engine code must not import from `src/network/`. movement.ts emits `state.onPlayerMoved?.()` after a successful step; `useGameEngine` is the layer that wires that callback to `NetworkClient.sendPosition`. keeps the engine portable across alternate transports.
