# Precis thinktank — v5

A continuation of v4. v4 ran rounds 0–9, locked the cosmology's five lines, named the diegetic test, named the bottom bar as the permacomputer, and named permacomputing.net as source doctrine. v5 picks up after v4 with a new arc, sparked by a question Tyler brought to the room on 2026-05-21 while specifying `#28`: _which way does the weathervane point?_ The room found that the question was the wrong size. The real question underneath was: _what is north?_

What follows is the rounds. Decisions are stated as decisions. Open questions are flagged. v5 is _additive_ to v4 — it does not invalidate v4 unless a round here explicitly amends it. Items that should propagate back to `docs/precis-thinktank-v4.md` are tagged `**Amendment to v4:**`.

## The cast

Carried forward from v2/v3/v4 with no changes:

- **Astrid** — vision purist.
- **Boon** — systems-first.
- **Calla** — player-experience pragmatist.
- **Delta** — late-arriving frame-breaker.

## Open and locked

**Locked in v5:**

- **The diamond is the world.** The iso projection is not a viewing layer applied to a flat grid; it is the shape of the world the steward inhabits. World `(x, y)` storage indices are internal storage, not a coordinate frame the game exposes.
- **The cardinal frame rotates 45° to align with the diamond.** N is the top point of the diamond. E is the right. S is the bottom. W is the left. The ordinals (NE / SE / SW / NW) align with the storage axes themselves.
- **No coordinate translation lives anywhere in the game.** The display layer does not translate between two frames because there is only one frame.
- **The compass points at the world the steward inhabits, not at the grid the storage uses.** Portable principle for any future surface that reports a direction or a position.
- **Amendment to v4 round 9 diegetic test:** the test extends to coordinate frames. _Is this coordinate frame readable from the world the steward inhabits?_ A coordinate frame that does not match the world is a voice in geometry's clothing.

**Open in v5:**

- _(none yet)_

---

## Round 1: the diamond is the world

_Tyler: "we're committed to iso projection. what does that mean for cardinal directions? the genesis system used ortho projection for NESW. i have a gut feeling we actually want the tip of the diamond at the very north of the map to become north — and the very southern tip to become the south pole — instead of the northwest and southeast corners."_

> **Boon:** Before anyone reacts, the code already half-said yes to this. `worldDeltaToIsoPx` in `src/engine/projection.ts:74` projects world `(x, y)` onto screen as `((x − y) * w, (x + y) * h/2)`. The world's `(0, 0)` corner lands at the **top tip** of the diamond on screen. The `(max, max)` corner lands at the **bottom tip**. World-`(+x, 0)` runs down the **right edge**; world-`(0, +y)` runs down the **left edge**. The current `WindDirection` enum calls the direction toward `(0, −y)` "north" — but on screen, that is the **upper-right edge** of the diamond, not the top point. The compass and the projection have been silently 45° out of phase for the entire history of the codebase. `tileWater.ts:47` has a function called `windToFrontAxis` that sweeps rain "from the north" along world-`y`, which crosses the screen as a diagonal — not top-to-bottom. The substrate has been lying about cardinals. Tyler's gut is the cleanup.

> **Astrid:** And once the cleanup is named, it is enormous. The diegetic test from round 9 was about _instruments not lying about what is observable._ This is the same rule applied one layer deeper: _the coordinate frame itself does not lie about what is observable._ The world the steward inhabits is the diamond. The diamond has a top point and a bottom point. To call the top _northwest corner_ is to import a viewing frame the steward does not have. **North is the top of the diamond.** South is the bottom. East is the right. West is the left. The labels finally match the world. _It is not a rotation; it is a confession._

> **Astrid:** And genesis is not hypothetical — it is already broken in exactly this way. `src/engine/genesis.ts:1444` says _"Glaciers advance from top and bottom"_ in a comment, and the code under it measures `topDist = y − SPACE_BORDER` and `bottomDist = sim.height − SPACE_BORDER − y`. Under the current substrate, that iteration advances along storage-`y`, which on screen is _the upper-right edge to the lower-left edge_ of the diamond — a diagonal sweep. The design intent was always _from the north pole and the south pole_, which under the rotated frame is _from the top tip and the bottom tip of the diamond_. The code wrote the intent in English and then walked a different geometry. The doctrine names what the code already wanted to say: **icecaps advance from the poles, the poles are the diamond's tips, and the iteration measures distance from those tips.**

> **Calla:** And the player payoff lands at the level of geological feeling, not just the vane. _Ice caps emerge from the top and bottom points of the diamond._ That sentence is what the design has always wanted to be true; the code wrote it in a comment and then did something else. After `#30`, the icecaps actually arrive from where the steward would point at them. Rain fronts sweep across the diamond in the direction the cardinal names. Future latitude-banded features — equatorial blooms, polar fauna, anything keyed to north-south — place themselves where their names say they go. The doctrine and the picture become one picture. _The compass and the world finally rhyme._

> **Delta:** The line worth naming: _the diamond is the world._ Not _the diamond is the projection of the world._ Not _the world is a square the camera tilts._ **The diamond is the world.** Iso is not a viewing choice we apply to a flat grid; iso is the world's shape. The `(x, y)` storage indices are exactly that — storage indices, the way bytes on disk are storage indices for a string. The grid is internal. The diamond is the world. _The compass points at the world, not at the storage._

> **Boon:** Concretely, the change is two layers. **Layer one — the labels rotate.** `WindDirection`'s enum keeps its eight keys (`N`, `NE`, `S`, …), but each key's semantic meaning rotates 45°: `WindDirection.N` denotes the diamond's top tip, which in storage is the `(−x, −y)` direction. The `WIND_SCREEN_VECTORS` table in `src/engine/weather/wind.ts:32` is rewritten so each cardinal's `(sx, sy)` matches the new mapping. `windToFrontAxis` in `src/engine/tileWater.ts:47` and the pollen-bias logic in `src/engine/effects.ts:47-53` follow. **Layer two — the iterations rotate.** Four sites in `src/engine/genesis.ts` (lines 1451, 1563, 1594, 1983) measure `topDist`/`bottomDist` along storage-`y`. Under the rotated frame, polar distance is `u = x + y` from the top pole and `2·(height − 2·SPACE_BORDER) − u` from the bottom pole. The glacial edge noise at line 1438, currently indexed by `x` (one per column), reindexes by the perpendicular coordinate `v = x − y`. Same shape of math, rotated 45° at the source. Roughly five engine files plus tests; the migration is one PR.

> **Calla:** The 19th-century farmer reading from round 9 holds, too — actually it sharpens. The vane on a real barn reports the direction of the wind in the world the farmer stands in. The farmer's world has a north pole. _So does the steward's._ The prairie has a top tip and a bottom tip; those tips are the poles. The vane on the permacomputer reports the wind in the world the steward is in. Compass-truth and screen-truth become _the same truth_ — that was the deeper version of Tyler's iso request from earlier. **The two frames collapse to one.** The vane points where it points. The letter beside it agrees. The pollen blows the way the arrow says.

> **Delta:** Which dissolves the question `#28` started with. There was never an iso-vs-world choice to make; the world _is_ iso. The question only seemed real because the labels had drifted out of phase with the geometry. The fix is not to translate at the display layer. The fix is to retire the translation by making the labels honest. **No coordinate translation lives anywhere in the game after this round.** That is the doctrine.

> **Astrid:** And the cosmology gets a sixth line, or near it. The five lines from round 7 — heat death, tending, tenure, lineage, inventory — are about the game's stakes and verbs. _The diamond is the world_ is about the game's space. It sits next to them as a structural statement, not above them. **The compass points at the world the steward inhabits, not at the grid the storage uses.** That is the principle. It is portable to anything that reports a position or a direction — the minimap, the sidebar cursor, a future predecessor record that says _your mother's grave is in the north of the prairie._

### Consensus

- **The diamond is the world.** The iso projection is not a viewing layer applied to a flat grid; it is the shape of the world the steward inhabits. The world's `(x, y)` storage indices are internal storage, not a coordinate frame the game exposes.
- **The cardinal frame rotates 45° to align with the diamond.** N is the top point of the diamond. E is the right. S is the bottom. W is the left. The ordinals (NE / SE / SW / NW) align with the storage axes themselves (NE = down the right edge of the diamond / storage-`+x`; SE = down the lower edge / storage-`+y`; etc.).
- **No coordinate translation lives anywhere in the game.** The display layer does not translate between two frames because there is only one frame.
- **Both the labels and the iterations rotate.** `WindDirection`'s `(sx, sy)` table and downstream mappings rotate. The four `topDist`/`bottomDist` sites in `src/engine/genesis.ts` (1451, 1563, 1594, 1983) rewrite to measure polar distance along the rotated frame — `u = x + y` from the top pole, `2·(height − 2·SPACE_BORDER) − u` from the bottom pole. Glacial edge noise reindexes from `x` to the perpendicular coordinate `v = x − y`.
- **Icecaps now advance from the diamond's top and bottom points.** The comment at `genesis.ts:1444` finally describes what the code does. Future latitude-banded features land where their names say they go.
- **`#28` ships under the new frame.** The vane arrow and letter are derived from the rotated cardinals directly; both agree by construction. Wind-speed labels lock as `still / breeze / brisk / gusty / gale`. Threshold values defer to spec. `#28` depends on `#30`.
- **Doctrinal addition:** _the compass points at the world the steward inhabits, not at the grid the storage uses._ Goes under **Locked in v5**. Portable to all future surfaces that report a direction or a position.
- **Amendment to v4 round 9:** the diegetic test now extends to coordinate frames — _is this coordinate frame readable from the world the steward inhabits?_ A coordinate frame that does not match the world is a voice in geometry's clothing.

### Tracked as

- **`#30 The diamond is the world`** — No deps. Rotates the cardinal frame 45° to align with the iso diamond, at both the label level and the iteration level. **Label layer:** rewrites the `(sx, sy)` table in `WIND_SCREEN_VECTORS` (`src/engine/weather/wind.ts`), `windToFrontAxis` (`src/engine/tileWater.ts`), and pollen-bias (`src/engine/effects.ts`). **Iteration layer:** rewrites the four `topDist`/`bottomDist` sites in `src/engine/genesis.ts` (1451, 1563, 1594, 1983) to measure polar distance along the rotated frame (`u = x + y` from the top pole; `2·(height − 2·SPACE_BORDER) − u` from the bottom pole), and reindexes the glacial edge noise (`genesis.ts:1438`) from `x` to the perpendicular coordinate `v = x − y`. Includes tests (`wind.test.ts`, `tileWater.test.ts`, `cursorTileInfo.test.ts`) and a visual check that icecaps emerge from the diamond's top and bottom points. Audit pass: any in-game text or label that references a cardinal reads naturally under the new semantics.
- **Amendment to `#28`:** ships under the rotated cardinal frame established by `#30`. Wind-speed labels lock as `still / breeze / brisk / gusty / gale`. Arrow glyph and letter are derived from the rotated cardinals directly. `#28` now depends on `#30`.
- **Amendment to v4 top-matter:** rotated-cardinal doctrine added under v5 locks; diegetic test extended to cover coordinate frames.

### Open questions deferred to specs

- For `#30`: a single golden test fixturing each cardinal's `(sx, sy)` and each pole's iteration metric, so future code cannot author the old frame by accident. (Boon: cheap to add, high return.)
- For `#30`: whether the glacial edge noise needs more cells under the rotated index (the perpendicular coordinate `v = x − y` spans roughly `2·width` instead of `width`). (Boon: probably double the lattice array length, otherwise the lobes get coarser.)
- For `#30`: any user-facing text (manual, sidebar, future predecessor records) that names a cardinal under the old semantics. The audit pass identifies these. (Calla: probably zero today; the value is the constraint going forward.)
- For `#28`: threshold values for the five wind-speed labels over `[0, MAX_WIND_SPEED]`. (Boon: even fifths are the default; spec author may bias toward narrower _still_ and _gale_ bands.)
- For `#28`: uppercase (`SE`) or lowercase (`se`) for the cardinal letter. (Astrid: defer.)
