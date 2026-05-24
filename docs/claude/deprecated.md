# deprecated / deleted systems

referenced from `CLAUDE.md`. read when you encounter a reference to one of these — they were removed intentionally.

## reveries

deleted in RP-0 (Reclaim Revery). the four player-cast spells (fire, water, earth, lightning, deep-time) are gone, the action bar is gone, and the `r` / `1-4` keybinds are gone. the `lightning.ts` and `deepTime.ts` simulation kernels remain — they are reused by RP-4 (the long-form Revery phase) and #9 (Controlled Burn). the word *Revery* is reserved for the long-form phase only — see `docs/backlog-thinktank-v3.md`.

## falling-star player spawn ceremony

deleted in RP-33 (the little house and Emily). the spring-equinox steward-star descent, the `state.playerSpawn` field, the `PlayerSpawn` interface, the `STEWARD_STAR_*` color constants, the `stewardImpact` impact kind, and the per-frame `playerSpawn.visible` gates in `movement.ts` / `renderer.ts` / `camera.ts` / `useGameEngine.ts` are gone. tenure now starts with the player inside the little house at the south-door spawn anchor; the React hook calls `enterHouseAtTenureStart` after `createGameState`. obsolete specs `player-spawn.yaml` and `player-glyph-flash-before-spawn.yaml` were removed in the same change.
