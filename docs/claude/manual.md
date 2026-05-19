# prairie manual

referenced from `CLAUDE.md`. read when touching manual entries, discovery tracking, or `MANUAL_LORE`.

in-game encyclopedia toggled with `[q]`. movement remains active while open.

entries are auto-derived at runtime from `ITEM_DEFINITIONS`, `RECIPES`, and `CHARACTER_DEFINITIONS`. manual-only entries for zones and events live in `MANUAL_ONLY_ENTRIES` in `manual.ts`.

discovery tracking: `manualDiscoveries: Set<string>` on GameState. structured keys: `item:<id>`, `recipe:<key>`, `character:<id>`, `zone:cave`, `event:<name>`. `recordDiscovery(state, key)` called at mutation points. undiscovered recipe results are behind spoiler blocks.

hand-authored lore goes in `MANUAL_LORE` table in `manual.ts`. run `/maintain-manual` to audit for gaps. **lore is written by humans only** — when adding new entries to `MANUAL_LORE`, use `{ lore: 'TODO' }` as a placeholder. never write lore text.

**when adding new game content**: items, recipes, and characters auto-generate manual entries — no extra work. new entity types that don't fit existing registries must be added to `MANUAL_ONLY_ENTRIES` with a corresponding `recordDiscovery` call.

## scan-to-discover flora (precis #6)

flora species discovery is *not* automatic. the player must hold-scan a flora tile with `[f]` for ~1.5s while standing on or adjacent to it. on successful release `commitScan` (in `src/engine/scan.ts`) records the species discovery and writes the scanned plant's identity into `state.scannedSpecimens` — keyed by species, written once on first scan, never overwritten.

the manual entry for a scanned species renders an 8×8 hex grid above the lore via `<HexGridView />`. the grid is derived from the cached first-specimen identity via `hashToHexGrid()` (in `src/engine/genetics/index.ts`). subsequent scans of the same species spawn a pickup bloom (player feedback) but do not change the cached identity or the rendered grid.

undiscovered flora entries are completely hidden from the manual — they're filtered by `isDiscovered()` before render.

`state.scanInProgress` tracks the active scan as `{ target, species, startTime }` or `null`. movement keys (`wasd`) clear it before processing the step — the scan aborts. early release of `[f]` aborts. key repeat on a held `[f]` is ignored. modal blocks (text input focus, dialog, menu, genesis) suppress the keydown.

**when adding new player-initiated discovery paths for other registries (fauna, biomes, etc.)**: follow this pattern — explicit player gesture, deterministic target selection, one cached specimen per category, no auto-discovery from walk-over.
