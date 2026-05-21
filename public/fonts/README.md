# Voynich font (egregoric typeface)

Per precis #8a (Egregoric flora — thematic) the renderer applies `font-family: 'Voynich'` to all not-of-this-Earth content: `TileType.Egregore` tiles, egregore manual entry bodies, the Egregore manual category tab label, and (8b+) egregoric flora/entities.

`voynich.ttf` is **committed** to this directory as a required build asset. The file is the kreativekorp Voynich Unicode font (CC0, ~215 KiB).

## Refreshing the font

```sh
npm run fetch-font
```

This re-downloads `VoynichUnicode.ttf` from `https://raw.githubusercontent.com/kreativekorp/voynich-unicode/master/Voynich/` and overwrites `public/fonts/voynich.ttf`. Use this only when bumping to a newer upstream release; the file is part of the repository in normal operation.

The script:

- Aborts if the fetched payload is suspiciously small (less than 1 KiB).
- Exits non-zero on network failure.
- Accepts `--skip-if-present` (legacy; no longer used in normal workflows).

## What the font supports

`voynich.ttf` maps ~377 visible glyphs into the BMP Private Use Area, primarily `U+F121..U+F2FF`. Four PUA slots (`U+F120`, `U+F1A0`, `U+F220`, `U+F2A0`) are mapped in the cmap but render as zero-length glyphs — these live in `EMPTY_PUA_BLOCKLIST` in `src/engine/egregore.ts` and must not appear in `EGREGORE_GLYPHS` or `EVA_TOKENS`.

See `docs/voynich-specimen.html` for a visual catalog of all supported glyphs and the locked `EGREGORE_GLYPHS` 8-glyph alphabet.

## Why a load failure is a bug, not a feature

The earlier doctrine ("the medium failing is the cosmology") is retired. Egregoric content now relies on the font's PUA glyphs — without it, every egregore tile renders as an empty box. Asset-level failures are fixed at the asset/build layer, not absorbed into the renderer.
