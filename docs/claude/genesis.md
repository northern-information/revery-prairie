# genesis and soil health

referenced from `CLAUDE.md`. read when touching world generation, epochs, the steward-name seed, or soil health.

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

`soilHealth: Map<string, number>` keyed by posKey. default `SOIL_HEALTH_DEFAULT` (50), max `SOIL_HEALTH_MAX` (100). geologically derived when genesis runs (base 30, accumulated through epochs, clamped [10, 100]). enriched by natural flora death and by wildfire burn recovery.
