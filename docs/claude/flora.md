# flora

referenced from `CLAUDE.md`. read when touching flora species, the lifecycle, pollinator behavior, or species-filtered logic.

## species

three flora species share `TileType.Flora`: clover (Trifolium repens, `%` green), wildflower / Purple Coneflower (Echinacea purpurea, `*` magenta), and tall grass / Big Bluestem (Andropogon gerardii, `"` tawny).

per-species visual identity (glyph, color, displayName, latinBinomial) lives in `FLORA_SPECIES` in `src/engine/flora/species.ts`. the renderer reads glyph + healthy color from this registry via the `species` field on the floraLifecycle entry. wind-sway and pollen registries are keyed by tile type — they're shared across species. pollen emission is biased per plant by `traits.pollinatorPreference` (precis #7): `emitProb *= 0.5 + 0.5 * trait`. high-preference plants emit visibly more pollen than their siblings; winter dormancy still suppresses emission for all species.

genesis seeds clover via the epoch chain. wildflower and tall grass are scattered in `postProcessMultiSpeciesFlora` (6-10 patches each, 2-4 tiles per patch) on walkable dirt after the epoch chain runs. determinism is preserved — same steward name produces the same patch layout via `sim.rng`. wildflower and tall grass do not self-propagate in this PR (no growth-preview system). they persist or die per the shared lifecycle.

clover-specific behaviors retained per precis #1:

- bee + clover recipe ingredient list checks for the `'clover'` item id, not any flora item
- gron quest gate checks `containerHasItem(state.backpack, 'clover')` specifically
- monarchs, angels prefer / grow on clover only (filtered via `floraLifecycle.species === 'clover'`)
- the `floraGrowthPreviews` field only ever contains positions slated to become clover

bees now route by per-tile preference (precis #7) — see `docs/claude/entities.md` for the routing rule and `getTileBeePreference` for the formula.

## flora lifecycle

all three flora species share the same six-stage lifecycle. each tile needs light and water to survive; without either, it dies through stages: healthy → brown → blinkingRed → black → decomposing → dirt. burnt tiles enter BurntRecovering and convert back to dirt after the recovery duration; species is preserved on the lifecycle entry through the burn so wildfire's recovery path knows what to regrow.

- overworld = light + rain water. cave = no light, no water.
- brown stage recovers if conditions improve. blinkingRed and beyond = terminal.
- natural death enriches soil. harvest and cut mechanics were deleted in precis #1 — clover acquisition routes through ruin recovery (precis #5).
