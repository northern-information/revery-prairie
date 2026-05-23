# the revery

referenced from `CLAUDE.md`. read when touching the long-form ceremonial phase, the dormancy-pressure forcing function, the summons sequence, the bilingual summary, or the phenotype label resolution.

## state

- **`state.revery: ReveryState | null`** — null in normal play. Non-null while a Revery is active. Shape: `{ active, startTime, phase, elapsedYears, reveryCount (captured), snapshotBeforeRevery, scheduledChanges, summaryReady, omenKind, summons?, summonsAudioCue?, summonsCollapseTile? }`. The `summons*` fields are precis-32 additions; they are present only when the Revery was triggered by the pressure-ceiling path.
- **`state.reveryCount: number`** — lifetime count, starts 0, increments on Revery completion (during Closing → null transition).
- **`state.lastReveryEndTime: number`** — used by the cooldown gate. `REVERY_COOLDOWN_MS` default = `SEASONAL_PHASE_PERIOD_MS` (one year).
- **`state.cosmologicalDrift: number`** — 0 baseline, monotonically increasing. No incrementers in #4; future features wire passive transmission (v3 layer (a)) and meteorite-placement (v3 layer (c)).
- **`state.revealedPhenotypes: Map<FloraSpecies, RevealedPhenotype[]>`** — one entry per (species, axis) pair the player has had a Revery resolve. Re-resolving the same pair OVERWRITES; no duplicates.
- **`state.dormancyPressure: number`** (precis-32) — domain [0, 1]. Climbs across autumn via the linear ramp in `tickDormancyPressure`; crossing 1.0 schedules the Revery. Resets to 0 at Revery Closing and on Autumn → Winter without a Revery.
- **`state.collapsedStewardTile: Position | null`** (precis-32) — set to the steward's tile at Omen → Observing when the Revery is a summons; cleared at Closing. Downstream render passes may read this to apply a dormant-flora wash to the collapsed tile.
- **`state.playerStationarySince: number`** — wall-clock time of the player's last successful movement. The cloud-passing omen no longer reads this (precis-32 retired the three omen predicates) but the field remains for other systems.
- **`state.lastSky: Sky`** — previous frame's `state.weather.sky`. The cloud-passing omen no longer reads this; field retained for any future use.

## phase machine

`ReveryPhase = 'omen' | 'observing' | 'summary' | 'closing'`.

- **`omen`** — one-frame staging phase. `initiateRevery` sets phase to Omen and captures the pre-Revery snapshot.
- **`observing`** — the bulk of the Revery. Input is hard-locked. `elapsedYears` accumulates at `REVERY_YEARS_PER_FRAME`. `seasonalPhase` advances at the accelerated rate. World ticks (weather, flora, bees) continue to run — the prairie genuinely passes through the winter.
- **`summary`** — phenotype label resolved, egregore advance committed (first Revery only), `summaryReady = true`. React layer renders `ReverySummary.tsx`. Input still locked.
- **`closing`** — one-frame transition triggered by any keypress on the summary. `reveryCount` increments, `lastReveryEndTime` updates, `state.revery` becomes null on the next frame, input lock releases.

`isReveryLocked(state)` returns true during `observing` and `summary`; false during `closing` and when `state.revery` is null.

## dormancy pressure (precis-32)

The three omen-detection predicates from precis-4 (bee on shoulder, distant meteorite, cloud passing the sun) are **retired**. They were rare, frame-stacked, and not aimed at the steward — see v6 thinktank round 6 for the doctrinal critique. `detectOmen` no longer exists.

`tickDormancyPressure(state)` runs each frame in `gameLoop`. Same gates as the old `detectOmen`: skipped when `state.revery !== null`, when `state.deepTime?.active`, when `state.currentZone !== Zone.Overworld`, when the season is not Autumn, or when the cooldown `REVERY_COOLDOWN_MS` has not elapsed since the last Revery.

Inside the gate, `state.dormancyPressure` is set to `max(prior, floor)` where the floor is a linear ramp from autumn equinox (`seasonalPhase = REVERY_PRESSURE_RAMP_START = 0.5`) to winter solstice (`seasonalPhase = REVERY_PRESSURE_RAMP_END = 0.75`). Outside the ramp window the floor is 0 (autumn not yet) or 1 (past solstice). Without any external contributions, the ramp alone reaches 1.0 exactly at the solstice frame — the Revery is guaranteed within a year.

`contributeDormancyPressure(state, amount)` adds a non-negative `amount` to `state.dormancyPressure`, clamped to [0, 1]. This is the entry point precis-36 (The Revery Knot) will call on Knot pickup; precis-32 itself never calls it.

When `state.dormancyPressure >= 1` and `state.revery === null`, `gameLoop` calls `initiateRevery` with `OmenKind.CloudPassingSun` as a placeholder for the existing `ReveryState.omenKind` shape, and immediately sets `state.revery.summons = true`. precis-36 will replace the placeholder when the Knot pickup becomes the canonical trigger.

## summons sequence (precis-32)

When `state.revery.summons === true` and the phase is `Omen`, `tickRevery` runs an additional sequence before the standard Omen → Observing flip:

1. `state.revery.summonsAudioCue = true` — a flag for future audio/render layers.
2. `state.revery.summonsCollapseTile = { x: state.player.x, y: state.player.y }` — the steward's tile at summons time.
3. `state.collapsedStewardTile` — mirrors `summonsCollapseTile` for downstream renderers.
4. Gron is teleported to an adjacent walkable tile via the existing `pickAdjacentWalkableTile` helper (the same mechanic as `triggerStewardSeal` in `interaction.ts`). If Gron's entity is missing or no adjacent walkable tile exists, the teleport is skipped silently.
5. A dialog is opened on Gron via the standard `activeDialog` shape. `getGronDialog` returns `GRON_DIALOG_SOLSTICE_SUMMONS` (lore TODO) during the summons Omen phase.

Gron remains adjacent for the rest of the Revery — his position is not reverted at Closing.

## Closing-phase egregoric commit (precis-32)

At the Closing phase, after `reveryCount` increment and `lastReveryEndTime` update, when `state.revery.summons === true` and `state.revery.summonsCollapseTile` points at a dirt-eligible tile:

- The tile is committed to `TileType.Egregore` via the now-exported `commitEgregoreTiles` helper in `egregore/spread.ts`. Species, genome, and lifecycle stage are populated identically to other egregoric commits.
- If the collapse tile is no longer eligible (mutated to water/wall during the Revery), the commit is skipped silently.
- `state.dormancyPressure` resets to 0.
- `state.collapsedStewardTile` resets to null.

Then `state.revery = null` as before. _The prairie metabolizes the spot the steward fell._

## summary

`takeReverySnapshot(state)` captures per-species flora counts, egregore tile count, season. `computeReveryDiff(state, snapshot)` runs at the Observing → Summary transition. Diff entries are stored on `state.revery.scheduledChanges` as structured `ReveryChange` records:

- `{ kind: 'flora-delta', payload: { species, before, after } }`
- `{ kind: 'egregore-grew', payload: { positions } }` (first Revery only)
- `{ kind: 'phenotype-revealed', payload: { species, axis, verdict } }`

`ReverySummary.tsx` renders ASCII for native deltas and Voynich glyphs (sampled from `EGREGORE_GLYPHS`, seeded by `reveryCount`) for the egregore-grew entry. Phenotype lines render as `Suspected: <verdict>`.

## phenotype label resolution

`resolvePhenotypeLabel(state, reveryCount)` in `src/engine/phenotype.ts`:

- Species: highest count of `flora:<species>` entries in `state.manualDiscoveries`. Ties broken by `FloraSpecies` enum order.
- Axis: `PHENOTYPE_AXES[reveryCount % PHENOTYPE_AXES.length]`. Cycles deterministically.
- Verdict: tri-bucket (low / mid / high) based on the mean trait value across all currently-living flora of that species. Hedged template, e.g. `suspected: late-blooming`, `suspected: early-blooming`, `suspected: mid-season`.
- Returns null when no flora is discovered. Defaults trait mean to 0.5 when no living tiles exist.

Manual entries render the list below the lore (and below the hex grid from #6).

## first-Revery egregoric advance

`advanceEgregoreFirstRevery(state)` runs only when `state.reveryCount === 0` (caller gate). Finds existing `TileType.Egregore` tiles, considers ordinal `TileType.Dirt` neighbors, picks `FIRST_REVERY_EGREGORE_COUNT` (default 3) positions biased toward the player trail centroid (Manhattan distance, stable sort). Returns the placed positions; the diff includes them in a `egregore-grew` change.

Subsequent Reveries (`reveryCount >= 1`) no-op. The ongoing per-Revery winter-phased spread ships in #8b.

## Revery scene — the little house (precis #33)

The Revery is rendered in the house interior, regardless of where pressure trips threshold. Two paths into the same scene:

- **Confirm-in-house**: player visits Emily during autumn, advances to her invitation line, presses `[f]` again. `contributeDormancyPressure(state, 1.0)` jumps the field to ceiling. On the next frame the threshold-trigger from precis-32 begins the Revery with the steward already in the house. precis-32's Gron-teleport and collapse-tile commit gracefully no-op (their failure cases cover the cross-zone steward). At `Omen → Observing`, `revery-house-scene` repositions the steward to `houseBedInterior` and Emily to `houseChairInterior`; her prior idle position is captured in `state.emilyReveryReturn`.

- **Field-summons**: player has not visited Emily this autumn; precis-32's pressure ramp reaches 1.0 at the winter solstice frame. The steward collapses in the field, Gron teleports adjacent, precis-32 captures the collapse tile on the overworld. At `Omen → Observing`, `revery-house-scene` performs an **immediate synchronous zone swap** to `HouseInterior` (the existing fade between Omen and Observing covers the gap), then repositions steward and Emily as above. At `Closing`, precis-32's egregore commit fires on the original overworld collapse tile — _the prairie metabolizes the spot the steward fell_, even though the Revery itself played in the house.

At `Closing` (both paths): Emily's position is restored from `state.emilyReveryReturn`; the steward stays on the bed and walks off at their pace; `state.emilyInvitation` resets to `'unoffered'` so the cycle can repeat the next autumn.

## doctrine

- The Revery is the headline ceremony. v4 frames it as the year-scale leak — heat death is the antagonist; tending is the verb.
- _The steward does not enter the Revery; the Revery enters the steward._ v6 round 1 lock.
- Player does nothing during the Revery. Camera drifts. Year counter. Summary at end.
- The retired omen predicates (bee on shoulder, distant meteorite, cloud passing the sun) and their constants (`REVERY_OMEN_STATIONARY_MS`, the helper `detectOmen`) are gone. v6 round 6: _an omen is the prairie noticing the steward back._ The omen variant itself (the Revery Knot) ships in precis-36.
- v3: `npm run verify` is the cross-cutting gate; new state fields require `EXPECTED_FIELDS` updates per `docs/claude/state.md`.
- Doctrine source: `docs/precis-thinktank-v3.md` section "The Revery"; supplementary v4 framing in `docs/precis-thinktank-v4.md` round 2; v6 thinktank rounds 1, 4, 5, 6 for the pressure model and summons sequence.
