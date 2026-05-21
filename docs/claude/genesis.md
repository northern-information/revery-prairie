# genesis and soil health

referenced from `CLAUDE.md`. read when touching world generation, epochs, the steward-name seed, or soil health.

## genesis

reverse deep-time projection between name entry and gameplay. the permacomputer back-derives the world from the seed of the steward's name and exposes the seams of its derivation — soil composition, glacial paths, ruin layouts, river courses. the screen has no voice; it is a calm-tech readout watching its own derivation run.

app flow: `NamePrompt → GenesisScreen → GameScreen`. genesis runs its own rAF loop (no ECS/tick systems). passes `GenesisResult` to `createGameState`.

`nameToSeed(stewardName)` hashes the name to a seed for the `mulberry32` PRNG. the same name produces the same world — the derivation is fully determined by the seed and the 14 epoch mutations.

14 epochs defined in `GENESIS_EPOCHS` in `genesis.ts` — each has `id`, `durationMs`, `mutate`, `renderTile`. epoch order is fixed; the renderer reads each epoch's `renderTile` while `mutate` accumulates terrain and soil state for that epoch's duration.

the only HUD element is a bordered card centered above the bottom edge of the screen (`bottom-52 left-1/2 -translate-x-1/2`, mirroring the precis-6 `ScanProgressBar` "Sequencing..." widget). the card has two elements: a tilde-prefixed year readout (`formatYearsAgo`) on top, and a gold fill bar underneath tracking overall derivation progress (`(epochIndex + epochProgress) / 15`). the year reads `~13.8B years ago...` at cosmic origin and decays through `~M years ago...` and `~K years ago...` bands to `~now` as gameplay begins. the trailing ellipsis carries the "deriving in progress" feel of the `ScanProgressBar` sibling without turning into a percentage indicator. precision is banded — geology-citation register, never decimal-precise — and the formatter rounds the underlying lerp into honest steps. the fill bar is doctrinally diegetic — it is the sibling affordance of `ScanProgressBar`, not a consumer-electronics loading bar. consumer-electronics gestures (boot animations, splash screens, percentage-text overlays) are banned by the diegetic test locked in precis-thinktank-v4 round 9.

`civilizationRuins: CivilizationRuin[]` on GameState — data-only, set once from genesis result. aqueduct junctions inform cave entrance placement.

### skip mechanism

- press any key → fast-forward (runs remaining mutations synchronously, hands off to gameplay)
- dev auto-skip: `?skipGenesis=true` URL param
- tests: use `runAllMutations()` for a synchronous result, or omit `genesisResult` from `createGameState` to fall back to legacy terrain generation.

## soil health

`soilHealth: Map<string, number>` keyed by posKey. default `SOIL_HEALTH_DEFAULT` (50), max `SOIL_HEALTH_MAX` (100). geologically derived when genesis runs (base 30, accumulated through epochs, clamped [10, 100]). enriched by natural flora death and by wildfire burn recovery.
