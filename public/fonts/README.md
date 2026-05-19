# Voynich font (egregoric typeface)

Per precis #8a (Egregoric flora — thematic) the renderer draws `TileType.Egregore` tiles using a Voynich-script typeface. The font file is intentionally **not committed** to the repository — it is a manual install step.

## Why not committed

Most Voynich Unicode fonts are CC-licensed or unclear-licensed. The repo policy is to avoid committing fonts with ambiguous redistribution rights. The runtime falls back gracefully — see below.

## Installing the font

Drop a Voynich Unicode `.ttf` (or `.woff2`) into this directory and name it `voynich.ttf`. Suggested source:

- [kreativekorp.com/software/fonts/voynichinit/](https://www.kreativekorp.com/software/fonts/voynichinit/) — Voynich Init (CC0)
- [www.voynich.nu/extra/fonts.html](http://www.voynich.nu/extra/fonts.html) — research fonts

The `@font-face` declaration in `src/styles/index.css` references `/fonts/voynich.ttf`. If the file is present the egregore tiles render in Voynich script; if absent the browser substitutes its default missing-glyph fallback (`□` or `?`).

## Why the fallback is correct

Per v3 doctrine:

> The medium failing on the player's machine is itself the cosmology. Do not patch; document.

`□` / `?` is a perfectly valid render path. The Voynich font is an enrichment, not a requirement.
