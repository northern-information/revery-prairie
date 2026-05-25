# revery prairie

browser-based prairie game. ASCII rendered on HTML canvas via React + TypeScript + Vite + Tailwind.

deeper system docs live in `docs/claude/` — see the pointer table at the bottom of this file. read them on demand for the system you're touching.

## writing style

- Sentence case for prose — PR titles and bodies, commit messages, comments, chat replies, in-game body text, descriptions, error messages. Capitalize the first word and proper nouns only.
- Title Case for labels — button text, form labels, headings, link text, menu items, in-game entry names (manual entries, item names, character names, recipe names, keybinding action labels). Capitalize all major words; lowercase short articles, conjunctions, and prepositions ≤3 letters except as the first word.
- Never all-lowercase for user-facing text. Sentence case or Title Case as appropriate, never `enter your name` or `connecting…`.
- Wrap code, identifiers, file paths, and commands in backticks. Use triple-backtick code fences for multi-line snippets with a language tag.
- Preserve original casing for identifiers (PascalCase, camelCase, SCREAMING_SNAKE_CASE) and product names (GitHub, React, Vite, Tailwind).
- Exception: the existing body of this CLAUDE.md uses lowercase headings and prose. That's intentional for this repo — match it when editing this file.

## node version

the node version is pinned in three places that must stay in sync:

- `.node-version` — read by nodenv
- `.nvmrc` — read by nvm
- `package.json` `engines.node` (when present)

use the exact patch version (e.g. `24.13.0`), never a range or major-only (`^24`, `24`). when bumping node, update all three files in the same commit and regenerate `package-lock.json`.

## architecture

two distinct layers — keep them separate:

- **`src/engine/`** — pure TypeScript. no React imports. mutable game state, canvas rendering, input mapping, camera logic. the rendering target is ASCII-on-iso permanently — no sprite swap planned.
- **`src/components/` + `src/hooks/`** — React UI. overlays (inventory, dialog, bottom bar) and the canvas bridge.

the canvas runs a `requestAnimationFrame` loop that reads game state by reference. React re-renders on movement and UI interactions via `refreshUI()`.

game state is a mutable singleton (`src/hooks/useGameEngine.ts`) held outside React's render cycle. engine functions mutate it directly. this is intentional — standard for game dev, avoids allocation overhead.

renderer details (pass registry, cache contract, slot ordering) → `docs/claude/rendering.md`.

## color conventions

hot pink (`#ff69b4`) is reserved for user actions: cursor highlight, path dots, combine/drop previews (`#`), inventory drop targets. do not use this color for world entities, terrain, or NPC behavior.

cursor highlight uses inverted rendering: pink `fillRect` background + dark `BG_COLOR` text. the renderer uses a two-phase resolve-then-draw pattern — first determine `char`/`color`/`cursorable`, then apply cursor inversion at the end if applicable.

## rules that fire when adding content

these are the always-on rules. fuller discussion lives in the doc cited at the end of each line.

- **new item acquisition path** — call `spawnPickupBloom(state, x, y, time)` from `effects.ts` at the same site. one bloom per acquisition event. → `docs/claude/entities.md`
- **new flora-creation path** — route through `createFloraLifecycleEntry` and supply `identity` + `traits` (either freshly generated via `generateRuntimeIdentity` + `generateTraitBag`, or pulled from `state.seedGenomes` for seed-planted flora). → `docs/claude/inventory.md`
- **new `GameState` field** — add it to `EXPECTED_FIELDS` in `src/harness/__tests__/serialization/schema.test.ts`. prefer single-owner write patterns. → `docs/claude/state.md`
- **new manual entry needing lore** — use `{ lore: 'TODO' }` placeholder in `MANUAL_LORE`. lore is written by humans only — never author lore text. → `docs/claude/manual.md`
- **egregore content** — never author EVA tokens or pierce words as prose. expand the allowlists in `egregore.ts` instead (PUA range `U+F121..U+F2FF`, excluding `EMPTY_PUA_BLOCKLIST`). pick new glyphs visually via `docs/voynich-specimen.html`. egregore tiles are F-hold scan targets; new code that scans egregoric content must maintain `state.egregoreSpecimens` and call `recordDiscovery(state, 'egregore:x,y')`. the word "invasive" is banned player-facing (CI guard). → `docs/claude/egregores.md`
- **new test** — mock `Math.random` with `vi.spyOn(Math, 'random')` + `vi.restoreAllMocks()` in a `finally` block, never the manual save/restore pattern. prepare terrain with `clearAroundPlayer()` rather than relying on random tile picks landing on valid tiles. reset entity arrays (e.g. `state.meteorites = []`) before asserting counts. → `docs/claude/testing.md`
- **rain-related test** — set `state.rainIntensity = 1` (not just `weather.sky = Sky.Rain`) and place the test tile in the rain front's core zone. → `docs/claude/testing.md`
- **new render concern** — write a pass under `src/engine/render/passes/`; don't edit `renderer.ts`. route map mutations through `cacheContract.ts`. → `docs/claude/rendering.md`
- **new multiplayer wire change** — update `shared/src/protocol.ts`. neither client nor worker may duplicate types. → `docs/claude/multiplayer.md`

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
npm run backlog         # terminal kanban for the backlog
```

## worktrees

after `EnterWorktree`, the Bash tool's working directory does **not** automatically change to the worktree. always prefix git commands with `cd <worktree-path> &&` or they will silently operate on the main checkout.

Read/Edit/Write tools resolve **relative** paths against the worktree. **Absolute** paths go wherever they point — passing `/Users/.../revery-prairie/src/foo.ts` (the main checkout) instead of `/Users/.../revery-prairie/.claude/worktrees/<branch>/src/foo.ts` will silently edit the main checkout. Prefer relative paths after `EnterWorktree`. If you must use absolute paths, include `.claude/worktrees/<branch>/` in them.

sanity check: after the first Read/Edit/Write, run `git status` in Bash. if it shows the file changed in the worktree branch, you're in the right place. if `git status` is clean inside the worktree but the main checkout shows the change, you've edited the wrong tree — revert and redo.

after `/new-feature`, `/bug-report`, or `/change-request` completes, prompt the user if they want to run the dev server in the worktree: `cd <worktree-path> && npm run dev`.

## conventions

- no enums. use `as const` objects + type aliases.
- ES6 arrow syntax for all functions (`const foo = () => {}`).
- engine code must not import from React or `src/components/`.
- engine code must not import from `src/network/`. movement.ts emits `state.onPlayerMoved?.()` after a successful step; `useGameEngine` is the layer that wires that callback to `NetworkClient.sendPosition`. keeps the engine portable across alternate transports.
- multiplayer code: `shared/` is the single source of truth for the wire protocol. neither client nor worker may duplicate types — both import from `@revery-prairie/shared`. `shared/` itself imports nothing from the rest of the repo.
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

## reference docs

deeper docs live in `docs/claude/`. read on demand for the system you're touching:

| file | covers |
|---|---|
| `rendering.md` | pass registry, cache contract, render slot order |
| `multiplayer.md` | Cloudflare Worker + Durable Objects, wire protocol, deploy, local dev |
| `map.md` | 147x147 grid layout, tile types, walkability |
| `egregores.md` | RP-8a — Voynich-rendered "not-of-this-Earth" flora, EVA tokens, pierce words |
| `input.md` | mouse, click-to-move, cursor, keybindings |
| `inventory.md` | spatial inventory, item types, recipes |
| `manual.md` | in-game encyclopedia, discovery tracking, `MANUAL_LORE` |
| `entities.md` | bees, ghosts, angels, coyote, shooting stars, ground items, pickup bloom, character gifts |
| `movement.md` | `getBlockedPositions`, walkability, `pendingAction` |
| `zones.md` | cave map context swap, breakable walls |
| `state.md` | GameState field ownership conventions, EXPECTED_FIELDS |
| `weather.md` | seasons, snow, dormancy, winter palette wash |
| `flora.md` | clover / wildflower / tall grass species, six-stage lifecycle |
| `genetics.md` | RP-3 — SHA256 identity, trait bag, crossing math, hex grid derivation |
| `revery.md` | RP-4 — phase machine, omen detection, summary, phenotype labels, first-Revery egregoric advance |
| `genesis.md` | 15 epochs, steward-name seeding, soil health |
| `audio.md` | ambient + dialog music layers |
| `testing.md` | terrain prep, random mocking, schema allowlist, rain test setup |
| `harness.md` | spec/plan format, harness commands, CI gate, Skip-Harness override |
| `backlog.md` | backlog kanban TUI, status YAML, v3 doctrine |
| `deprecated.md` | systems intentionally removed (reveries) |
