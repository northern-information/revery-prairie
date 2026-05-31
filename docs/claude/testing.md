# testing

referenced from `CLAUDE.md`. read when writing tests beyond the must-know rules listed in the parent file.

every feature must have tests. engine tests in `src/engine/__tests__/`, component tests in `src/components/__tests__/`. engine code is pure TypeScript with no DOM deps. component tests use `@testing-library/react` + `jsdom`.

if a feature cannot be tested (e.g. canvas rendering), flag it for the user to review how to proceed before skipping.

## terrain preparation

tests that depend on terrain must account for the randomized coastline — use `clearAroundPlayer()` or manually set tiles to dirt before testing movement/combine mechanics. this applies to any entity, not just the player: if a test spawns an entity and then asserts on random tile selection within a radius (aura effects, spawning, etc.), clear the terrain around that entity first. without explicit terrain preparation, random tile picks may land on sand/space/water and silently fail.

## water sets are not derived from state.map

`state.ponds`, `state.rivers`, and `state.tileWater` are populated at genesis and live independently of `state.map`. overwriting tiles to dirt (or calling `clearArea` pre-fix) does not prune these collections, and `isWaterTile` will continue to report the old positions as water — silently rejecting any code path that gates on water (e.g. `isValidAngelPosition`). `clearArea` / `clearAroundPlayer` now also prune the per-position entries; if a test overwrites the entire `state.map` directly (without going through `clearArea`), call `clearAllWater(state)` to wipe all three collections in one shot. without this, tests gated on water can flake on CI in proportion to where the randomized spawn happens to land relative to the genesis water layout.

## entity seeding

`createGameState` seeds shooting stars and other entities. tests that assert exact counts on `state.shootingStars`, `state.meteorites`, etc. must reset these arrays (e.g. `state.meteorites = []`) before the test logic.

## mocking randomness

tests must never depend on `Math.random()` producing favorable outcomes over N iterations. mock it with `vi.spyOn(Math, 'random').mockReturnValue(...)` and restore with `vi.restoreAllMocks()` in a `finally` block. never use the manual `const orig = Math.random; Math.random = () => ...` pattern. when a test needs random placement to succeed (spawning an entity at a random position within a radius), don't rely on mocked random values landing on valid tiles — instead, prepare the terrain so all tiles in the radius are valid. mocking random is for controlling _which path_ code takes, not for guaranteeing tile validity.

## type assertions in tests

`no-non-null-assertion` forbids `getComponent(...)!` in tests. use a `requireComponent` helper that wraps `expect(val).toBeTruthy()` and returns the typed value. see `src/engine/__tests__/angels.test.ts` for the pattern.

## state schema allowlist

adding a new field to `GameState` requires adding it to `EXPECTED_FIELDS` in `src/harness/__tests__/serialization/schema.test.ts` or the schema allowlist test will fail.

## rain tests

rain-related tests must set `state.rainIntensity = 1` (not just `state.weather.sky = Sky.Rain`) and position the test tile in the rain front's core zone (dist between `RAIN_FRONT_FRINGE` and `RAIN_FRONT_WIDTH - RAIN_FRONT_FRINGE`) to avoid probabilistic exclusion by the blotchy fringe noise.
