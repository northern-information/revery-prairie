# sidebar and cursor info panel

referenced from `CLAUDE.md`. read when adding new entities, effects, or tile types — the sidebar must surface them.

## cursor info panel

the sidebar shows data for whatever tile the mouse hovers over. three rules apply to all current and future content:

1. **every entity that renders on the map must appear in the contents row.** if the renderer draws it at a tile position, the sidebar contents IIFE in `Sidebar.tsx` must check for it and return a human-readable label. transient timed effects (explosions, pickup blooms, wildfire, crumble) are exempt — they are visual-only.
2. **every persistent map-visible effect must appear in the effects row.** if an overlay is drawn on tiles (rain, glinting, aura), `getTileEffects()` in `effects.ts` must detect and return it. transient timed effects are exempt.
3. **tile type labels must be human-readable.** never show raw camelCase type strings (e.g. `burntFlora`). map every tile type to a plain-english label. flora and burntFlora labels read from the per-species displayName via `FLORA_SPECIES[lifecycle.species]` (e.g. "clover", "burnt purple coneflower").

when adding new entities, effects, or tile types — wire up cursor info at the same time.
