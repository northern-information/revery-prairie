# prairie manual

referenced from `CLAUDE.md`. read when touching manual entries, discovery tracking, or `MANUAL_LORE`.

in-game encyclopedia toggled with `[q]`. movement remains active while open.

entries are auto-derived at runtime from `ITEM_DEFINITIONS`, `RECIPES`, and `CHARACTER_DEFINITIONS`. manual-only entries for zones and events live in `MANUAL_ONLY_ENTRIES` in `manual.ts`.

discovery tracking: `manualDiscoveries: Set<string>` on GameState. structured keys: `item:<id>`, `recipe:<key>`, `character:<id>`, `zone:cave`, `event:<name>`. `recordDiscovery(state, key)` called at mutation points. undiscovered recipe results are behind spoiler blocks.

hand-authored lore goes in `MANUAL_LORE` table in `manual.ts`. run `/maintain-manual` to audit for gaps. **lore is written by humans only** — when adding new entries to `MANUAL_LORE`, use `{ lore: 'TODO' }` as a placeholder. never write lore text.

**when adding new game content**: items, recipes, and characters auto-generate manual entries — no extra work. new entity types that don't fit existing registries must be added to `MANUAL_ONLY_ENTRIES` with a corresponding `recordDiscovery` call.

## scan-to-discover flora (precis #6)

flora species discovery is *not* automatic. the player must hold-scan a flora tile with `[f]` for ~1.5s while standing on or adjacent to it. on successful release `commitScan` (in `src/engine/scan.ts`) records the species discovery and appends a `ScannedSpecimen` ({ identity, scannedAt, position }) to `state.scannedSpecimens[species]`. scanning the same plant twice (same identity) is deduped — only distinct specimens become cards. scanning a different specimen of the same species appends a new card to the stack.

the manual entry for a scanned species renders a `<SpecimenStack />` above the lore — one card per unique specimen, with prev/next paging, a counter ("Specimen N of M"), and a relative-time label ("just now" / "N seconds ago" / etc). each card's 8×8 hex grid is derived from that specimen's identity via `hashToHexGrid()` (in `src/engine/genetics/index.ts`). on auto-open after a scan the stack defaults to the latest card (the just-scanned one) via `initialIndex={specimens.length - 1}`.

undiscovered flora entries are completely hidden from the manual — they're filtered in `EntryCard` by checking `entry.id.startsWith('flora:') && !discovered`.

`state.scanInProgress` tracks the active scan as `{ target, species, startTime }` or `null`. movement keys (`wasd`) clear it before processing the step — the scan aborts. early release of `[f]` aborts. key repeat on a held `[f]` is ignored. modal blocks (text input focus, dialog, menu, genesis) suppress the keydown. while a scan is in progress the `<ScanProgressBar />` renders centered above the bottom bar with the "Sequencing..." label and a pink fill that scales 0–100% over `SCAN_DURATION_MS`.

on a successful commit the keyup handler sets `state.manualHighlightEntryId` to `flora:${species}` and opens the MANUAL screen. `<ManualPanel />` reads the field, resets to the ALL category, scrolls the entry into view, applies the `animate-event-log-flash` class to the entry container for ~700ms, then clears the field.

**when adding new player-initiated discovery paths for other registries (fauna, biomes, etc.)**: follow this pattern — explicit player gesture, deterministic target selection, one cached specimen per category, no auto-discovery from walk-over.
