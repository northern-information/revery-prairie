# map and tile types

referenced from `CLAUDE.md`. read when touching map generation, tile types, walkability, or coordinate transforms.

## map

147x147 tile grid (127x127 land area, after the `SPACE_BORDER` frame on every edge). the land is a dirt island surrounded by space (twinkling stars on black) with a randomized coastline (smoothed noise). sand sits between space and dirt (2 tiles wide). viewport auto-fits to the browser window. camera centers on the player, clamped to map bounds.

odd dimensions guarantee a single exact-center tile at `(73, 73)`. Gron sits on it. the player spawns one tile west of Gron at `(72, 73)`. the cave entrance is placed in a ring just outside Gron's rain aura.

player cannot walk on space. flora cannot grow on space or sand.

displayed coordinates are offset by `SPACE_BORDER` so the land starts at (0, 0).

## tile types

defined in `src/engine/types.ts` as a const object (not an enum — `erasableSyntaxOnly` is enabled in tsconfig).

- `dirt` — empty ground (`.`, tan)
- `flora` — any flora species (`%` / `*` / `"`, per-species color). The species (clover / wildflower / tallGrass) is read from the floraLifecycle entry; see `flora.md`.
- `burntFlora` — fire-scorched flora (`%`, dark charcoal `#3D2B1F`) — walkable, flora cannot regrow on it. Species is preserved on the lifecycle entry through the BurntRecovering stage.
- `sand` — shoreline (`:`, tan-gold)
- `space` — surrounding void (twinkling stars on black)
- `caveFloor` — walkable cave ground (`.`, dark gray)
- `caveWall` — impassable cave wall (`#`, darker gray)
- `caveBreakableWall` — breakable wall (`#`, warm brown `#997755` — same char as cave wall but distinct color) — press `[e]` to break, reveals hidden chamber
- `caveEntrance` — transition tile (`O`, light gray) — triggers zone swap on walk-over
- `egregore` — egregoric flora tile (Voynich glyph from `EGREGORE_GLYPHS`, color `#7A88A0`). Walkable, inert in precis #8a (no lifecycle, no interaction). Tile glyph is per-position-deterministic; the renderer applies the `'Voynich'` font family for the draw call only. See `egregores.md`.
