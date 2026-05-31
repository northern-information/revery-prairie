# flora

referenced from `CLAUDE.md`. read when touching flora species, the lifecycle, pollinator behavior, or species-filtered logic.

## species

three flora species share `TileType.Flora`: clover (Trifolium repens, `%` green), wildflower / Purple Coneflower (Echinacea purpurea, `*` magenta), and tall grass / Big Bluestem (Andropogon gerardii, `"` tawny).

per-species visual identity (glyph, color, displayName, latinBinomial) lives in `FLORA_SPECIES` in `src/engine/flora/species.ts`. the renderer reads glyph + healthy color from this registry via the `species` field on the floraLifecycle entry. wind-sway and pollen registries are keyed by tile type — they're shared across species. pollen emission is biased per plant by `traits.pollinatorPreference` (RP-7): `emitProb *= 0.5 + 0.5 * trait`. high-preference plants emit visibly more pollen than their siblings; winter dormancy still suppresses emission for all species.

genesis seeds clover via the epoch chain. wildflower and tall grass are scattered in `postProcessMultiSpeciesFlora` (6-10 patches each, 2-4 tiles per patch) on walkable dirt after the epoch chain runs. determinism is preserved — same steward name produces the same patch layout via `sim.rng`. all three species self-propagate at runtime via the backlog item #17 spread engine.

## autonomous spread (RP-17)

all three species spread on their own via a single species-agnostic engine in `src/engine/flora/spread.ts`. each species ships a `SpeciesSpreadConfig` (`flora/type/<species>/spread.ts`) declaring growth chance, max-per-tick cap, winter dormancy, pollinator-adjacency requirement, and a `selectGrowthTargets(state, patches)` selector. the game loop calls `tickSpeciesSpread(state, time, config)` per species per scheduled interval. species-specific behavior lives only in the configs and selectors; the engine has no species-aware branches.

- **clover** — spiral-front growth (extracted from `clover.ts`). requires a bee within range. winter-dormant. preserves existing rates.
- **wildflower** — pollinator-biased radial. `Chebyshev ≤ 3` from any bee or monarch filters candidate Dirt neighbors. winter-dormant. ~0.6x clover rate.
- **tall grass** — uniform rhizome. no pollinator filter. winter-dormant. slowest of the three (~0.3x clover) so it doesn't dominate.

per-species preview queues live in `state.floraGrowthPreviews: Map<FloraSpecies, Set<string>>` — wildflower previews never commit as clover and vice versa. `src/engine/floraGrowthPreviews.ts` owns the helpers; never read or write the map directly.

## lineage propagation

`applyParentLineage(parentIdentity, binomial, childKey, time)` produces the child's identity via `generateRuntimeIdentity(`${binomial}:spread:${parentIdentity?.slice(0, 8) ?? 'genesis'}`, childKey, time)`. the shared 8-hex prefix in the SHA input means descendants share family-resemblance regions in the identity-derived hex grid (per `docs/claude/genetics.md`). traits are generated fresh from the child identity unless the parent had `primedPollen` set, in which case `crossTraitBags(parent, primedPollen, rng)` runs and `crossDonorPrefix` is recorded. drift is implicit in the hash — there's no separate mutation function. orphaned previews (parent died same tick) fall back to a `'genesis'` literal seed.

## ceremony wave (bee+clover combine)

the bee+clover recipe no longer stamps a 3x3 patch. it generates a `seedIdentity`, places one clover tile at the player position carrying that identity, enqueues a `WaveEmission` into `state.activeWaves`, and spawns an unbound bee. `src/engine/floraWaves.ts` advances the wave radius every `CEREMONY_WAVE_TICK_MS`, painting clover tiles along a `cellNoise`-jittered annulus (organic boundary, ~150 tiles by `CEREMONY_WAVE_RADIUS = 8`). children inherit lineage from `seedIdentity`. pollen-burst `TimedEffect`s spawn 2-4 per tick on the leading edge. waves remove themselves from `state.activeWaves` when they paint no new tiles past `maxRadius`.

## bee-mediated pollination

bees and monarchs carry a `PollenBag` ECS component (`POLLEN_BAG_CAPACITY = 4`, LIFO eviction, cross-species mixing allowed). `src/engine/beePollination.ts` runs after movement: visiting a flora tile pushes a `PollenLoad` `{ identity, traits, species }` if it's not already at the top of the bag. if the bag already holds a matching-species load of a different identity, the visited tile's `primedPollen` is set to the most-recent matching load (father = pollen, mother = visited tile). primed tiles cross with their pollen donor on their next spread. bees within `Chebyshev-1` of a beehive deposit their bag (cleared to `[]`).

note: `src/engine/flora/actions/pollinate.ts` (existing) governs visual pollen-particle drift driven by wind — unrelated to bee-mediated genetic crossing. don't conflate the two.

clover-specific behaviors retained per RP-1:

- bee + clover recipe ingredient list checks for the `'clover'` item id, not any flora item
- gron quest gate checks `containerHasItem(state.backpack, 'clover')` specifically
- monarchs, angels prefer / grow on clover only (filtered via `floraLifecycle.species === 'clover'`)
- the `floraGrowthPreviews` field only ever contains positions slated to become clover

bees now route by per-tile preference (RP-7) — see `docs/claude/entities.md` for the routing rule and `getTileBeePreference` for the formula.

## flora lifecycle

all three flora species share the same six-stage lifecycle. each tile needs light and water to survive; without either, it dies through stages: healthy → brown → blinkingRed → black → decomposing → dirt. burnt tiles enter BurntRecovering and convert back to dirt after the recovery duration; species is preserved on the lifecycle entry through the burn so wildfire's recovery path knows what to regrow.

- overworld = light + rain water. cave = no light, no water.
- brown stage recovers if conditions improve. blinkingRed and beyond = terminal.
- natural death enriches soil (`+SOIL_HEALTH_FLORA_DEATH_BONUS`, 15 at `Decomposing → Dirt`). harvest and cut mechanics were deleted in RP-1 — clover acquisition routes through ruin recovery (RP-5).
- spawn taxes soil (RP-19). every flora applies a one-time per-species soil effect on its first `Healthy` tick: clover credits `+SOIL_HEALTH_NITROGEN_FIXER_BONUS` (5, nitrogen fixer); wildflower and tall grass each debit `−SOIL_HEALTH_FLORA_SPAWN_DEBIT` (20). genesis-seeded flora skips the spawn effect (the genesis-derived soil already reflects standing flora) — see `docs/claude/genesis.md` soil-health section for the full mechanic.
