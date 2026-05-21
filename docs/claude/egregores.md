# egregores

referenced from `CLAUDE.md`. read when touching egregoric flora, Voynich rendering, EVA tokens, or the cosmology vocabulary.

precis #8a (shipped). the parallel ecology of "not-of-this-Earth" flora that share the prairie with the native species. thematic foreshadowing only in #8a; mechanical biome ships in #8b (parallel species set, invisible pollinator, winter-phased spread).

vocabulary lock-ins from `docs/precis-thinktank-v3.md`:

- working term in spec, code, and dev docs: **egregores** / **egregoric flora** / `TileType.Egregore`.
- **player-facing term: none.** the word "invasive" never appears player-facing. an automated CI guard (`src/harness/__tests__/lint/invasive-guard.test.ts`) fails on any string literal in `src/**/*.{ts,tsx}` containing the word.
- NPCs use folk register and no two NPCs agree on a folk name — Moab says "the other clover", ghost #0 says "the Far Garden".

mechanical layout in this PR:

- `src/engine/egregore.ts` — `EGREGORE_GLYPHS` allowlist (5 code points from Latin Extended-E `U+AB10..U+AB1F`, **not** the official Voynich block — there is none in Unicode). chosen because OS default UI fonts substitute visible Latin-ish glyphs (`Ħ`, `H`, etc.) when the Voynich font isn't loaded — a visible-but-foreign-looking texture is the goal, not the precise script. also includes `EVA_TOKENS` allowlist, `LATIN_PIERCE_WORDS` allowlist (16 words from the cosmology vocabulary, locked in v3). per-position-deterministic generators for glyph / manual body / pierce decision.
- `src/components/ManualPanel.tsx` + `src/components/ManualPanel.constants.ts` — the Egregore category tab label (`CATEGORY_LABELS[ManualCategory.Egregore]`) is derived from `EGREGORE_GLYPHS.slice(0, 4).join('')` rather than a hardcoded literal. drift between the two allowlists is impossible by construction.
- `src/styles/index.css` — `@font-face` declares the `'Voynich'` typeface from `/fonts/voynich.ttf`. the font file is intentionally not committed; `npm run fetch-font` downloads it from kreativekorp's GitHub. see `public/fonts/README.md` for the workflow. note: the kreativekorp font maps the Voynich PUA (`U+F120..U+F15F`), not Latin Extended-E, so installing the font does **not** change how egregore tiles render today. the script is in place if a future change ever wants real Voynich script (would require swapping `EGREGORE_GLYPHS` code points too).
- `tools/fetch-voynich-font.mjs` — Node script wired to `npm run fetch-font`. downloads `VoynichUnicode.ttf` from `raw.githubusercontent.com/kreativekorp/voynich-unicode` into `public/fonts/voynich.ttf`. supports `--skip-if-present` for setup automation.
- `state.egregorePositions: Position[]` — tile positions set during genesis post-process (`postProcessEgregoreTiles` in `genesis.ts`), biased near `sim.craters`. ~3 tiles per game. deterministic per steward name.
- Manual entries are dynamic per-tile via `getEgregoreManualEntries(state)` in `manual.ts`. `ManualPanel` merges them with the static `MANUAL_ENTRIES` at render time. Each entry's body is procedurally sampled EVA tokens; ~1 tile in 5 carries a single ASCII pierce word from `LATIN_PIERCE_WORDS`. Pierces render in the default font; surrounding EVA renders in Voynich.

what 8b adds (precis #8b — egregoric flora, mechanical biome):

- `src/engine/egregore/species.ts` — `EGREGORE_SPECIES` registry with two species (`allelopath`, `spreader`). Trait-bag asymmetry per v3 doctrine: allelopath weights `allelopathy` high, spreader weights `spreadVelocity` high. Species selection per tile is deterministic via `getEgregoreSpeciesAtPosition(x, y)` using the existing 8a `tileHash` helper.
- `src/engine/egregore/lifecycle.ts` — `tickEgregoreLifecycle` flips entries between `active` (Winter) and `dormant` (other seasons). Inverse-phased to native flora's `FloraStage.Dormant`.
- `src/engine/egregore/spread.ts` — two entry points. `tickEgregoreSpread` performs stewardship-winter drift (1–2 tiles per in-game year, throttled by `state.lastEgregoreSpreadYear`, gated on `season === Winter && currentZone === Overworld && deepTime === null && revery === null`). `advanceEgregoreInRevery` replaces precis-4's `advanceEgregoreFirstRevery` and is always called during the Revery's Observing → Summary transition (count: 3 on first Revery, 6–9 on subsequent).
- `src/engine/egregore/positions.ts` — shared `candidateDirtNeighbors(state)` helper extracted from `revery.ts`. Used by both spread paths.
- `src/engine/genetics/egregore.ts` — `EgregoreGenome` interface (`{ __kind: 'egregore'; identity; allelopathy; spreadVelocity }`) separate from `TraitBag`. `canCross(a, b)` predicate in `src/engine/genetics/index.ts` returns false for any (native, egregore) pair via the `__kind` discriminator.
- Manual footnote on every egregore entry once the player has any `flora:*` discovery — `getEgregoreIncompatibilityFootnote(x, y)` returns deterministic EVA tokens whose engineering-only translation is "no compatible regions" (never rendered as English).
- **invisible pollinator:** `tickEgregoreSpread` never spawns `PollenParticle`. The carrier "refuses to be named" is enforced by simply having no carrier — spread is a direct tile-conversion event.

still deferred:

- `cosmologicalDrift` incrementers (still 0 baseline; future features wire passive transmission and meteorite-placement layers).
- Crossbreed UX surface (#12) — 8b ships only the `canCross` predicate + manual footnote; the UI that says "no compatible regions" in the player's own language lands in #12.
- Failure-state biome conversion (#10) — ash, fungal, Far Garden conversion reads from 8b's spread substrate but is its own feature.

never write egregore lore. the EVA tokens and pierce words are procedurally sampled from curated allowlists in `egregore.ts`; the result is *Voynich script with occasional Latin*, not prose. expand the allowlists if more variety is needed; do not author sentences.

**the unreadable does not announce its source** (v5 thinktank round 2, 2026-05-21). no in-game text refers to Voynich as an external object. the script exists in the prairie because the prairie produced it; the manual does not name a source because the steward cannot name what they cannot read. this is the diegetic constraint that future authors of manual entries, NPC dialog, and predecessor records check against. checkable principle: is this reference readable from the world the steward inhabits? the construction-time referent (Voynich, MS 408, the manuscript) lives in dev surfaces and this file; it never crosses into player-facing strings. we are not running on Voynich — we are running on the gesture Voynich points at, which is *writing that does not yield*, a gesture that predates the manuscript and survives any future decipherment.

**phoneme sampling only** (v5 thinktank round 2, 2026-05-21). wire-layer invariant. the `EVA_TOKENS` generator samples procedurally constructed phonemes that look Voynich-shaped — it does not pull from transcribed folios of Beinecke MS 408. preserving this property keeps direct exposure to a hypothetical Voynich solve at zero: the substrate uses the manuscript's script (real PUA code points rendered via the kreativekorp font) but not the manuscript's text. if a future change ever sources strings from real folio transcriptions, that exposure stops being zero — treat any such change as a doctrine-breaking edit and route it through a thinktank round.
