# Voynich font (egregoric typeface)

Per precis #8a (Egregoric flora — thematic) the renderer applies a `font-family: 'Voynich'` to `TileType.Egregore` tiles. The font file is intentionally **not committed** to the repository — `npm run fetch-font` downloads it on demand.

## Why not committed

The kreativekorp Voynich Unicode font is CC0, but the repo policy is to avoid committing binary font assets. `public/fonts/voynich.ttf` is gitignored.

## Installing the font

```sh
npm run fetch-font
```

This downloads `VoynichUnicode.ttf` from `https://raw.githubusercontent.com/kreativekorp/voynich-unicode/master/Voynich/` into `public/fonts/voynich.ttf`. The script:

- Aborts if the fetched payload is suspiciously small (less than 1 KiB).
- Exits non-zero on network failure.
- Accepts `--skip-if-present` for use in setup automations.

## Important: installing the font does not change current rendering

`EGREGORE_GLYPHS` in `src/engine/egregore.ts` uses code points from Latin Extended-E (`U+AB10..U+AB1F`). The kreativekorp font maps Voynich glyphs at `U+F120..U+F15F` (BMP Private Use Area) — a completely different range. So even with the font installed, the OS fallback renders the egregore tiles as Latin-ish characters (`Ħ`, `H`, etc.).

This is intentional: visible foreign-looking glyphs are preferable to a row of missing-glyph boxes when the cosmology font isn't installed. The fetch script is in place if a future doctrine change wants real Voynich script — that would require swapping `EGREGORE_GLYPHS` to PUA code points at the same time.

## Why the fallback is acceptable

Per v3 doctrine:

> The medium failing on the player's machine is itself the cosmology. Do not patch; document.

The Voynich font is an enrichment, not a requirement.
