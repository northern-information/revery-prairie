// Purple Coneflower (Echinacea purpurea) — wildflower flora species.
//
// All three flora species share TileType.Flora, so the wind-sway and pollen
// registries (keyed by tile type) live with clover. The per-species visual
// identity (glyph, color, display name, Latin binomial) lives in
// `src/engine/flora/species.ts` under FLORA_SPECIES.
//
// Pollinator mechanics (bee preference, capture-on-step) stay clover-specific
// per RP-1 — the broader pollinator routes are deferred to RP-7.
// Wildflower tiles persist or die per the shared six-stage lifecycle but do
// not spread via the growth-preview system (only clover does).
//
// This file exists so future per-species hooks (custom particle emitters,
// species-specific tick behavior, dialog references) have a stable home.

export {}
