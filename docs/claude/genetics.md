# genetics

referenced from `CLAUDE.md`. read when touching flora identity, trait bag inheritance, the hex grid derivation, or anything that constructs a `FloraLifecycleState`.

## identity + trait bag (RP-3)

every flora tile carries a stable SHA256 identity and a TraitBag on its `FloraLifecycleState` entry. genesis-placed flora use `sha256(`${binomial}:${genesisSeed}:${posKey}`)` for the identity; runtime-spawned flora (clover-by-bee, monarch wildflower, recipe flora, lightning-strike survivor flora, angel halo clover) use `sha256(`runtime:${binomial}:${posKey}:${time}`)` so re-growths on a recycled tile receive a fresh identity. burnt flora retains its identity through `BurntRecovering`. crossed offspring (#12, future) will chain to parent hashes.

the TraitBag has four phenotype axes — `bloomTiming`, `coldTolerance`, `droughtResponse`, `pollinatorPreference` — each a number in `[0, 1]` — plus 0-2 recessives in a `number[]` slot. trait values are deterministic per identity (mulberry32 seeded from the first 8 hex chars). recessive count rolls 70/25/5 for 0/1/2.

`crossTraitBags(parentA, parentB, rng)` averages each phenotype axis + Gaussian noise (σ=0.05), clamped to `[0, 1]`. a single 2% novelty roll re-rolls one axis uniformly. recessives inherit per-slot via 50/50 coin flip, capped at 2. wired in RP-17 — when a flora tile sprouts a child via the spread engine and its `primedPollen` is set (a bee carrying matching-species pollen of a different identity visited the parent), `commitFloraPreviews` calls `crossTraitBags(parent.traits, primedPollen.traits, rng)` for the child instead of `generateTraitBag(childIdentity)`. the `rng` is a mulberry32 seeded from the first 8 hex chars of the child identity. parent's `primedPollen` is cleared after the cross fires — one cross per priming. children also record `crossDonorPrefix` (the donor's 8-hex prefix) so the backlog item-#17 lineage overlay can draw a second dashed edge to the donor.

`hashToHexGrid(identity)` derives an 8×8 grid of nibble values: `grid[row][col] = parseInt(identity[row * 8 + col], 16)`. **the mapping is locked forever** — every plant's grid in #6's manual derives from this rule and must stay stable across game versions.

`sha256Sync` + `sha256Async` live in `src/engine/crypto.ts`. they're byte-identical to the original angels.ts impl; do not modify the hash mixing routine or saved flora identities will drift.

## construction discipline

all `FloraLifecycleState` construction must route through `createFloraLifecycleEntry()` in `src/engine/floraLifecycle.ts`. direct object literals are caught at compile time because `identity` and `traits` are required fields. test sites use `createTestFloraEntry()` from `src/engine/__tests__/helpers/createTestFloraEntry.ts` for a deterministic identity + trait bag in tests.

## doctrine override

v3 doctrine (`docs/backlog-thinktank-v3.md` lines 62-63) was overridden during #3 planning. the original "hex grid stays buried, only visible in late-game ritual" framing has been replaced. the 8×8 grid surfaces in #6 (naturalist's manual), player-facing. trait _numbers_ are still never shown.

**#6 has shipped this surface, now in the gel-band idiom.** flora species discovered via hold-to-scan first render the sequence in a center-screen `<ScanResultModal />` (latin binomial + ceremonial row-by-row reveal), and the manual archive renders the same sequence as a `<GelBandView />` per-specimen. the underlying `hashToHexGrid()` mapping is **unchanged and still locked** — only the visual presentation has changed: each nibble draws as a horizontal band whose opacity is `nibble / 15`, with vertical CSS blur so the rows read as a gel-electrophoresis printout. specimens are keyed off `state.scannedSpecimens.get(species)`. see `docs/claude/manual.md` for the scan flow.

## phenotype label split — #6 vs #4 (decided 2026-05-19)

phenotype labels ("suspected: late blooming", "cold hardy", etc.) are _not_ in #6. they ship in #4 (The Revery).

#6 ships the gel-band sequence + per-species manual discovery only. it does not surface any phenotype labels derived from the trait bag.

reasoning: every walk-over-based reveal mechanism collapses into a grind. walking past a clover to "observe" it incentivizes the player to optimize tile coverage. a running-average observation log has the same problem in slow motion. doctrine asks for friction and mystery; cheap reveal mechanisms produce neither.

#4 is the right home because the Revery already encodes "the year reveals what changed." each Revery resolves one phenotype axis for one species the player has been living with. labels remain hedged ("suspected: …"). reveries are omen-gated, not player-triggered, so the label loop can't be ground.

when implementing #6: do not add `getPhenotypeLabel()` or any equivalent. do not add per-species observation logs. do not add a "study" key. the trait bag is invisible to the player until #4 introduces the slow-reveal mechanic.
