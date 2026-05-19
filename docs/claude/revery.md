# the revery

referenced from `CLAUDE.md`. read when touching the long-form ceremonial phase, the omen detection logic, the bilingual summary, or the phenotype label resolution.

## state

- **`state.revery: ReveryState | null`** — null in normal play. Non-null while a Revery is active. Shape: `{ active, startTime, phase, elapsedYears, reveryCount (captured), snapshotBeforeRevery, scheduledChanges, summaryReady }`.
- **`state.reveryCount: number`** — lifetime count, starts 0, increments on Revery completion (during Closing → null transition).
- **`state.lastReveryEndTime: number`** — used by the cooldown gate. `REVERY_COOLDOWN_MS` default = `SEASONAL_PHASE_PERIOD_MS` (one year).
- **`state.cosmologicalDrift: number`** — 0 baseline, monotonically increasing. No incrementers in #4; future features wire passive transmission (v3 layer (a)) and meteorite-placement (v3 layer (c)).
- **`state.revealedPhenotypes: Map<FloraSpecies, RevealedPhenotype[]>`** — one entry per (species, axis) pair the player has had a Revery resolve. Re-resolving the same pair OVERWRITES; no duplicates.
- **`state.playerStationarySince: number`** — wall-clock time of the player's last successful movement. Used by the cloud-passing omen.
- **`state.lastSky: Sky`** — previous frame's `state.weather.sky`. Used by the cloud-passing omen to detect Rain/Cloudy → Sun transitions.

## phase machine

`ReveryPhase = 'omen' | 'observing' | 'summary' | 'closing'`.

- **`omen`** — one-frame staging phase. `initiateRevery` sets phase to Omen and captures the pre-Revery snapshot.
- **`observing`** — the bulk of the Revery. Input is hard-locked. `elapsedYears` accumulates at `REVERY_YEARS_PER_FRAME`. `seasonalPhase` advances at the accelerated rate. World ticks (weather, flora, bees) continue to run — the prairie genuinely passes through the winter.
- **`summary`** — phenotype label resolved, egregore advance committed (first Revery only), `summaryReady = true`. React layer renders `ReverySummary.tsx`. Input still locked.
- **`closing`** — one-frame transition triggered by any keypress on the summary. `reveryCount` increments, `lastReveryEndTime` updates, `state.revery` becomes null on the next frame, input lock releases.

`isReveryLocked(state)` returns true during `observing` and `summary`; false during `closing` and when `state.revery` is null.

## omen detection

`detectOmen(state, time)` runs each frame in `gameLoop` AFTER the standard tick block. Returns the triggering `OmenKind` or null. Gates that produce null:

- `state.revery !== null` (already running)
- `state.deepTime?.active` (deep time conflict)
- `state.currentZone !== Zone.Overworld`
- `state.weather.season !== Season.Fall` (the Revery must enter winter)
- `time - state.lastReveryEndTime < REVERY_COOLDOWN_MS`

Three omen variants. Any one triggering schedules the Revery:

- **bee on shoulder** — any bee entity's `Position` equals the player's position.
- **distant meteorite** — any shooting star's projected landing tile is within Chebyshev distance 3 of the player.
- **cloud passing the sun** — `state.lastSky` was `Rain` or `Cloudy` and `state.weather.sky` is now `Sun` AND `time - state.playerStationarySince >= REVERY_OMEN_STATIONARY_MS` (2000ms).

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

## doctrine

- The Revery is the headline ceremony. v4 frames it as the year-scale leak — heat death is the antagonist; tending is the verb.
- Player does nothing during the Revery. Camera drifts. Year counter. Summary at end.
- v3: `npm run verify` is the cross-cutting gate; new state fields require `EXPECTED_FIELDS` updates per `docs/claude/state.md`.
- Doctrine source: `docs/precis-thinktank-v3.md` section "The Revery"; supplementary v4 framing in `docs/precis-thinktank-v4.md` round 2.
