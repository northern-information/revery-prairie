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

what's deferred:

- the first-Revery 3→6 growth event lands in precis #4 (the Revery itself doesn't exist yet).
- `cosmologicalDrift` / passive-transmission tracking from walking over egregore tiles lands in #4.
- the parallel egregoric species set + invisible pollinator + winter-phased spread is #8b.

never write egregore lore. the EVA tokens and pierce words are procedurally sampled from curated allowlists in `egregore.ts`; the result is *Voynich script with occasional Latin*, not prose. expand the allowlists if more variety is needed; do not author sentences.
