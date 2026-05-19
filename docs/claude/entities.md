# entities, pickup bloom, character gifts

referenced from `CLAUDE.md`. read when touching bees, ghosts, angels, the coyote, shooting stars, ground items, item acquisition, or character dialog gifts.

## entities

- **bees** — spawn on bee+clover combine or bee item drop. wander toward neighboring tiles weighted by per-tile bee preference (species baseline × per-plant `pollinatorPreference` trait, clamped to `[0, 1]`); bare ground gets a small 0.05 baseline weight so bees still wander. species baselines live on `FloraSpeciesDef.beePreference` (clover 1.0, wildflower 0.6, tall grass 0.3). bee starvation accepts any flora with nonzero species preference. rendered as `*` in gold. walking over captures to backpack.
- **ghosts** — 3 spawn at random positions on game start. drift slowly (15% move chance per 500ms). block movement/pathfinding. freeze during dialog. each has a 3-line dialog tree.
- **angels** — biblically accurate ASCII entities. 9x9 body rendered from seeded animation. spawn periodically (~90s intervals), drift slowly, despawn after ~120s. have gold aura background, bee-spawning and clover-growing effects. dialog grants cantos (poems). tracked via `angelCantos`, `angelEncounterCount`, `angelFlashTime` on GameState.
- **coyote** — companion NPC. follows the player in `Follow` mode (stays 2-3 tiles behind). `Collect` mode: roams and picks up ground items, delivers them to the player's backpack. toggled via coyote screen. tracked via `state.coyoteMode`, `state.coyoteCargo`, `state.coyotePath`.
- **shooting stars** — ambient space entities. streak across the void with animated trails. targeted stars land on the map and become meteorites.
- **ground items** — dropped items on map. auto-pickup on walk-over if backpack has room.

## pickup bloom

every item acquisition must spawn a `pickupBloom` effect at the player position via `spawnPickupBloom(state, x, y, time)` in `effects.ts`. this includes: walking over ground items, capturing bees, collecting meteorites, coyote delivering to backpack, and crafting via recipes. one bloom per acquisition event (not per item). no bloom when `time` is omitted or when the acquisition fails.

when adding new acquisition paths — any code that adds items to the backpack or otherwise gives the player something — call `spawnPickupBloom` at the same time.

## character gifts

characters have optional `gift` and `postGift` fields on `CharacterDefinition`, plus `postGiftDialog` for dialog branching. gifts are one-time per character, tracked in `state.giftsReceived: Set<string>`. as of precis #0, both `giveCharacterGift` and `givePostGift` in `interaction.ts` return `null` for every character — no character grants anything until precis #5 (ruin recovery) wires up item gifts. the fields and flow are retained on the type for that purpose.
