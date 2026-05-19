# Precis sequencing — v3

Distilled from v2 and the post-v2 conversation. Decisions are stated as decisions. Editorial back-and-forth is in v2 if you want to see how each one was arrived at.

## What this document is

A sequencing plan for 13 features (#0–#12, with #8 split). Not a code change. Each item, when picked up, gets its own `harness/specs/{id}.yaml` + `harness/plans/{id}.yaml` and runs through the harness pipeline.

## Prerequisites (admin work, before #0 ships)

- `backlog/precis.md` exists in-repo as the canonical precis text.
- Threshold typeface workstream kicked off in parallel (~2–3 months, see #8). Doesn't block #0. Must land before #8a's final rendering. Interim placeholder: `kreativekorp/voynich-unicode`.

## Locked design decisions

### Vocabulary

- **Revery** means *only* the long-form phase of surrender (item #4). The four player-cast "reveries" (fire, water, earth, lightning, deep-time) are deleted — not renamed.
- Player actions are **stewardship practices**, never spells. #0 deletes the action bar entirely; a future feature reintroduces a surface for tools/seeds/practices when there is actually something to hold there.
- Working term in spec, code, and dev docs for the parallel ecology: **egregores** / **egregoric flora** / `TileType.Egregore`.
- **Player-facing term for the egregores: none.** The word *invasive* does not appear anywhere a player will read it. NPCs use folk register ("the Far Garden," "the other clover," "we don't grow that"). **No two NPCs ever agree** on a folk name. Specs that introduce *invasive* in player-facing text fail review. Recommended: CI lint guard.

### Cosmology

- **The prairie is a fragment of Earth.** Native flora carry real Latin binomials (*Trifolium repens*, *Asclepias syriaca*).
- **The egregores are not-of-this-Earth.** Layered framing:
  - Deep truth (never confirmed by the game): the veil between Earths thins during the Revery.
  - In-fiction folk explanation (NPCs say it): the Far Garden.
  - Visible carrier (player observes it): meteorites fall where the veil is thin.
- Player encounters these in reverse order: meteorite → Far Garden lore → the veil framing as a late suggestion.

### Time

- **Egregores grow in winter.** Inverse-phased to natives. Peak spread in deep winter, near-zero in summer.
- Stewardship-winter produces a tile or two of slow drift — observable, not actionable.
- Revery-winters are the real push. The end-of-Revery summary reads as a sequence of seasons (*the line moved north in the third winter; held through summer; moved further in the fifth*).
- The native and egregoric are never on the field at the same time. They take turns. The prairie's grip is summer; the loosening is winter.
- Winter palette (muted browns, dark greens, snow) makes the egregoric script pop. They are most visible exactly when they are most active.

### The Revery

- Triggered by an **omen**, not a button. Threshold logic stays internal. Player sees a small visible sign — bee on shoulder, cloud passing the sun, distant meteorite. Three or four omen variants.
- The Revery can be **deferred**. The omen is necessary, not sufficient. Sometimes the prairie waits.
- **Winter omens are heavier** — meteorite on frozen ground, sound carrying. Winter omens trigger longer Reveries.
- Player does nothing during the Revery. Camera drifts. Year counter. End-of-Revery summary tells what changed and *what arrived*.

### The controlled burn

- **Torchbearer NPC** ignites burns at thaw. Their arrival *is* the seasonal signal — no clock, no banner.
- **Player walks the line with them.** Stewardship is accompaniment. The Torchbearer waits if the player isn't moving. The burn happens because you both went.
- **Calibrated Dark Souls bumper:** advise, mostly obey, refuse only at catastrophic edge (would consume the village; extreme drought + wind). Botched burns produce ash prairie — informative failure, not game-over.
- **Player may dismiss the Torchbearer at the line.** No argument. They look at the line, look at the player, turn back. Player watches them walk to the horizon. The line stays where the winter put it.
- Wildfire (drought + lightning during the Revery) is separate and *not* player-triggered.

### Genetics (decided in v3 — overrides v2)

**Option C — SHA256 for identity, trait bag for inheritance.**

- **Don't port breed-spike's Mendelian hex-grid math.** It rewards engineering. The precis wants folk ecology, not optimization.
- **SHA256 stays** as the plant's stable fingerprint — deterministic procedural identity. Same plant name always hashes the same. Free procedural variety. This is what the 8×8 grid is actually useful for.
- **Inheritance is a simple trait bag:** 4–6 fuzzy values (bloom timing, cold tolerance, fire response, drought response, pollinator preference, seed count), plus 0–2 recessive carriers, plus a small mutation table. Cross two plants → child draws from parents with weighted noise + a low-probability "new trait" roll.
- **The 8×8 hex grid surfaces in #6.** Revised from v3's original "stays buried" framing. The grid is player-facing, rendered in the naturalist's manual. Each cell is one hex nibble of the plant's SHA256 identity (cell [row][col] = nibble at position row × 8 + col). The mapping is locked in #3 so every plant's visible grid is stable for the life of the game.
- **Trait numbers are never shown.** The grid is visible; the underlying trait bag values are not. No genome viewer of the trait bag, ever.
- **Phenotype labels are split across #6 and #4** (decided 2026-05-19 during #6 requirements gathering).
  - **#6 ships only the hex grid + per-species discovery.** No phenotype labels. Walk-over reveal was considered and rejected — it rewards grinding (walk more clover → more "data") and gives away genetic information for free. The doctrine asks for friction and mystery, not optimization. Per-tile observation logs also fail this test: a running average converges to species mean with enough walk-bys, which is the same grind in disguise.
  - **#4 (The Revery) adds the slow-reveal phenotype mechanic.** Each Revery resolves one phenotype axis for one species the player has been living with — the year reveals a trait. Labels read "suspected: late blooming" and remain hedged. Because Reveries are omen-gated (not player-triggered), the player can't grind labels. The manual gains a line each year, not each tile. This is the friction that makes labels feel earned and keeps the loop from collapsing into "tile counter ↑."
- **Why the split:** shipping phenotype labels in #6 without the Revery system around them would make them the only signal in the system, and players would optimize whatever reveal mechanic carries them — walk-over, study action, observation logs, all collapse into a grind. #4 is the natural home because the Revery already encodes "the year reveals what changed." Labels arrive when the surrounding scaffolding makes them feel like observation, not interrogation.
- **Why:** the precis wants players who become naturalists, not engineers. Folk ecology is built on intuition and surprise across generations, not on legible Mendelian crosses. The hex grid is the architecture made visible — the SHA256 fingerprint that the angels also speak — but not the engineering-legible Mendelian model.

### Angels as the bridge

- Angels already speak SHA256 in this game (existing entity work).
- **Angels are the only NPC who has glimpsed the architecture.** They are the bridge between Earth and the Far Garden.
- Their dialog/cantos carry **SHA256 fragments mixed with EVA tokens** — neither Earth language nor Voynich; a third register that briefly aligns with both.
- Their gifts and encounters are the player's earliest exposure to the buried architecture. The late-game ritual / microscope is foreshadowed by what an angel said.
- Angels are also a potential discovery path for the late-game ritual described in egregoric layer (d) — a canto only legible to a player who has accumulated enough readable-word pierces from egregoric tiles.

### The egregores in detail

**Vocabulary:** see lock-in above.

**Pollinator:** invisible. Pollen drift with no carrier — *the wind that isn't wind*. Particles cross tiles, no entity behind them. The manual has no entry for the agent. Two refusals reinforcing each other: the species refuses to be named; the agent refuses to be named.

**Crossbreeding native × egregore:** impossible. Genomes share the SHA256 identity layer but the trait bags do not align (the egregores have axes natives lack, e.g. allelopathy). Manual returns "no compatible regions." The cosmological boundary rendered as data shape.

**8a — thematic allusions (ships alongside #1, before #4):**

- One inert tile type (`TileType.Egregore`), single Voynich glyph from a small consistent subset.
- ~3 tiles placed by genesis, biased near meteorite spawns.
- Manual entry in **egregore register** — a Voynich-manuscript page using real Voynich characters rendered via embedded font. Structure preserved (binomial line, description paragraph, three labeled fields); content filled with EVA tokens sampled deterministically per tile from a curated allowlist. Stable per tile (seeded by position), varies across tiles. No animation.
- **Latin pierces:** ~1 tile in 5 has one readable English word from a tight allowlist (`threshold`, `between`, `garden`, `before`, `not`, `here`, `was`, `meteor`, `Earth`, `line`, `thin`, `near`, `moved`, `past`, `us`, `them`). Vocabulary of cosmology and presence.
- NPC refusal lines (Moab, at least one ghost). They never name it. Different NPCs use different folk names.
- Meteorite (`items.ts:26`) recontextualized as visible carrier.
- During the first Revery, hardcoded growth from 3 → ~6 tiles. Summary phrases this as *the line moved*.

**8b — mechanical biome (ships after #4 + #7 + #9):**

- Parallel Flora species set under existing flora registry.
- Trait-bag asymmetry: egregoric species have axes natives lack (allelopathy, spread velocity).
- Invisible pollinator (above).
- Inverse-phased to seasons (above).
- Spread happens primarily during the Revery; stewardship-winter drift is minor.
- Coexistence is a valid long-run state. Full eradication impossible by design.

### The character set is the ontology

- ASCII = Earth's encoding. Voynich = the real human script that no Earth alphabet maps to.
- The medium *is* the cosmology, not a window onto it.
- Surface expansions beyond tiles and manual entries:
  - **End-of-Revery summary** is bilingual. ASCII for native changes; Voynich (with EVA in source) for what arrived.
  - **Player-name rendering** drifts character by character as `cosmologicalDrift` accumulates (see steward help, below). Per-character font switching in the renderer.
  - **Player's manual entry** gains a single readable English word from the egregoric allowlist once name-drift exceeds threshold. The cosmology recognizes the player back.
  - **Cross-boundary recipes** (post-#12) render with mixed-script glyphs adjacent. Typography does the labeling; no "crossbreed" tag.
  - **Font fallback is intended behavior.** When Voynich fails to load, egregoric tiles render as `□` or `?`. The medium failing on the player's machine is itself the cosmology. Do not patch; document.

### Steward help — the four layers

The player can quietly help the egregores. **The game never confirms this has happened.** Internal state (`state.player.cosmologicalDrift`) drives downstream effects but is never surfaced to the player.

- **(a) Passive transmission.** Walking through egregoric tiles attaches drift particles to the player's footstep trail. Some NPCs glance differently over many Reveries. Player's manual entry slowly drifts.
- **(b) Refusal.** Dismiss the Torchbearer at the line. Pure withholding. The line stays where the winter put it.
- **(c) Meteorite-carrying.** Pick up a meteorite and *place* it elsewhere. The next Revery seeds egregoric tiles nearby.
- **(d) Late-game ritual.** Discoverable only when accumulated Latin pierces across egregoric manual entries constitute a phrase. Performed at a specific seasonal-and-lunar window. Single act, irrevocable. (Angels may foreshadow this.)

**No UI surface for any of this.** A spec that adds a progress bar, allegiance meter, or end-screen tally fails review.

### Failure states (#10)

- **Ash prairie** — botched controlled burn (#9) or destructive Revery.
- **Fungal prairie** — emerges from particular Revery conditions; substrate-dependent.
- **The prairie became the Far Garden** — multi-Revery succession where the summer rebound fails to undo the winter advance. Player-facing narrative: *the prairie didn't survive the winter*. Carries a remembered date — *the winter the line crossed the village*. NPCs reference it for the rest of the run.
- The Far Garden conversion has three readings: passive (*the prairie didn't survive*), dated (*the winter the line crossed*), chosen (*what the steward did*). The game never surfaces which is true.

## Sequence

Ordered by player-experience priority. Build dependencies in the second column.

| #   | feature                                                                                                                    | depends on    | size |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------- | ---- |
| 0   | Reclaim *Revery* — delete the four player-cast spells *and* the action bar (state, UI, keybinds, drag targets)             | —             | M    |
| 1   | Multi-species Flora (clover → Flora; +wildflower, +tall grass)                                                             | 0             | M    |
| 8a  | Egregoric flora — thematic allusions (one tile type, Voynich manual entries, NPC refusal lines, folk-name divergence)      | 0             | XS   |
| 2   | Phenological seasons (derived from weather; plant lifecycle reads from it)                                                 | 1             | S/M  |
| 3   | Genetics v1 — SHA256 identity layer + trait-bag inheritance (option C; **not** a breed-spike port)                          | 1, 2          | M    |
| 4   | The Revery as long-form phase — omen-triggered entry, observation UX, end-of-Revery summary                                | 1, 2, 3, 8a   | L    |
| 5   | Ruin recovery delivers first non-clover species (DormantGarden payload)                                                    | 1             | S    |
| 6   | Naturalist's manual — traits as discovered phenotypes                                                                      | 3             | S    |
| 7   | Pollinator routes & species preference                                                                                     | 1, 3          | S    |
| 8b  | Egregoric flora — parallel species set, invisible pollinator, winter-phased spread, "no compatible regions" crossbreeding  | 1, 2, 3, 4, 7 | M/L  |
| 9   | Controlled burn — Torchbearer NPC, player walks the line, voice pass before behavior pass                                  | 1, 2, 3       | M    |
| 10  | Failure-state biomes — ash, fungal, Far Garden conversion as Revery outcomes                                               | 4, 8b, 9      | M    |
| 11  | Seed / genetic-fragment item taxonomy                                                                                      | 3, 5          | S    |
| 12  | Crossbreeding UX — adjacent → pollinator-mediated                                                                          | 3, 7          | M    |

### Loop-headline symmetry

Each loop has one defining ceremonial moment:

| loop                          | headline player act                                  |
| ----------------------------- | ---------------------------------------------------- |
| small — ruin expedition       | recovering a seed or genetic fragment                |
| medium — ecological stewardship | walking the burn line with the Torchbearer at thaw |
| big — the Revery              | surrender + observe                                  |

## Critical files

**Current repo (deletion + refactor surface for #0–#1):**

- `src/engine/reveries.ts:13-60` — `REVERIES` const; deleted in #0
- `src/engine/state.ts:367-374` — starting reveries pushed in `createGameState`; deleted in #0
- `src/engine/actionBar.ts` — entire file deleted in #0 (cast effects, lightning targeting, slot scaffold). A new practices surface, if needed, is introduced fresh by a later feature.
- `src/engine/characters.ts:36` — Moab's revery gift; remapped in #0, re-anchored in #9
- `src/engine/interaction.ts:242-273` — gift/postGift granting; touch where revery IDs are referenced
- `src/engine/clover.ts`, `src/engine/cloverLifecycle.ts` — generalize to Flora in #1
- `src/engine/flora/index.ts`, `flora/actions/movement.ts`, `flora/actions/pollinate.ts`, `flora/type/clover/clover.ts` — existing registry to extend in #1, #7
- `src/engine/items.ts:44-61` — `wildflowerSeeds`, `tallGrassSeeds`, `milkweedSeeds` need a home (#1, #5)
- `src/engine/types.ts:482-522` — `RuinArchetype.DormantGarden`, `DormantGardenData` (#5)
- `src/engine/ruins.ts:196-394` — `generateDormantGarden`, vault payload (#5)
- `src/engine/weather.ts` — phenological derivation source for #2
- `src/engine/deepTime.ts`, `src/engine/lightning.ts` — simulation kernels reused by #4 and #9 after the cast UX strip
- `src/engine/manual.ts`, `manualDiscoveries` — naturalist's journal substrate for #6
- `src/engine/entities.ts` — bees (#7); angels (existing — extend for the bridge role)
- `harness/__tests__/serialization/schema.test.ts:EXPECTED_FIELDS` — add new GameState fields (`season`, `cosmologicalDrift`, etc.) in #2/#3/#4

**Tests requiring updates in #0:** `state.test.ts`, `moab-colde.test.ts`, `gronDeepTime.test.ts`, `gron-gift.test.ts`, `wildfire.test.ts`; harness specs `starting-lightning-revery.yaml`, `lightning-revery.yaml`, `action-bar.yaml`.

**Genetics (#3) — new module:**

- `src/engine/genetics/` — SHA256 identity layer + trait-bag inheritance. No breed-spike vendoring.
- Trait axes (initial set): bloom timing, cold tolerance, fire response, drought response, pollinator preference, seed count.
- Mutation table: small, weighted toward minor drift; rare novelty roll.
- Hex grid: data-only, never rendered in baseline play. Surface in late-game ritual / microscope only.

**Egregore-side specifics (#8a, #8b):**

- `src/engine/types.ts` — `TileType.Egregore`
- `src/engine/genesis.ts` — ~3 egregoric tiles, biased near meteorites
- `src/engine/manual.ts` — egregore-register renderer (Voynich script, EVA tokens in source, Latin pierces)
- `src/engine/characters.ts` — Moab + ghost refusal lines; folk-name divergence rule
- `src/engine/items.ts:26` — meteorite description as visible carrier
- `src/engine/flora/type/egregore/` (8b) — species defs
- `src/engine/flora/actions/pollinate.ts` (8b) — invisible-pollinator branch
- `src/engine/deepTime.ts` — first-Revery growth event (8a); per-Revery winter-phased spread (8b)

## Verification

Planning artifact. Verification is sign-off on the sequence and the genetics decision. No code changes here. Each feature, when picked up, produces its own spec + plan and goes through `npm run spec:validate` → `npm run harness:run` → `npm run verify`.
