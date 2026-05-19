# prairie manual

referenced from `CLAUDE.md`. read when touching manual entries, discovery tracking, or `MANUAL_LORE`.

in-game encyclopedia toggled with `[q]`. movement remains active while open.

entries are auto-derived at runtime from `ITEM_DEFINITIONS`, `RECIPES`, and `CHARACTER_DEFINITIONS`. manual-only entries for zones and events live in `MANUAL_ONLY_ENTRIES` in `manual.ts`.

discovery tracking: `manualDiscoveries: Set<string>` on GameState. structured keys: `item:<id>`, `recipe:<key>`, `character:<id>`, `zone:cave`, `event:<name>`. `recordDiscovery(state, key)` called at mutation points. undiscovered recipe results are behind spoiler blocks.

hand-authored lore goes in `MANUAL_LORE` table in `manual.ts`. run `/maintain-manual` to audit for gaps. **lore is written by humans only** — when adding new entries to `MANUAL_LORE`, use `{ lore: 'TODO' }` as a placeholder. never write lore text.

**when adding new game content**: items, recipes, and characters auto-generate manual entries — no extra work. new entity types that don't fit existing registries must be added to `MANUAL_ONLY_ENTRIES` with a corresponding `recordDiscovery` call.
