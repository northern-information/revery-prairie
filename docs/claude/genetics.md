# genetics

referenced from `CLAUDE.md`. read when touching flora identity, trait bag inheritance, the hex grid derivation, or anything that constructs a `FloraLifecycleState`.

## identity + trait bag (precis #3)

every flora tile carries a stable SHA256 identity and a TraitBag on its `FloraLifecycleState` entry. genesis-placed flora use `sha256(`${binomial}:${genesisSeed}:${posKey}`)` for the identity; runtime-spawned flora (clover-by-bee, monarch wildflower, recipe flora, lightning-strike survivor flora, angel halo clover) use `sha256(`runtime:${binomial}:${posKey}:${time}`)` so re-growths on a recycled tile receive a fresh identity. burnt flora retains its identity through `BurntRecovering`. crossed offspring (#12, future) will chain to parent hashes.

the TraitBag has four phenotype axes — `bloomTiming`, `coldTolerance`, `droughtResponse`, `pollinatorPreference` — each a number in `[0, 1]` — plus 0-2 recessives in a `number[]` slot. trait values are deterministic per identity (mulberry32 seeded from the first 8 hex chars). recessive count rolls 70/25/5 for 0/1/2.

`crossTraitBags(parentA, parentB, rng)` is pure and tested but unwired in #3. each phenotype axis is averaged + Gaussian noise (σ=0.05), clamped to `[0, 1]`. a single 2% novelty roll re-rolls one axis uniformly. recessives inherit per-slot via 50/50 coin flip, capped at 2.

`hashToHexGrid(identity)` derives an 8×8 grid of nibble values: `grid[row][col] = parseInt(identity[row * 8 + col], 16)`. **the mapping is locked forever** — every plant's grid in #6's manual derives from this rule and must stay stable across game versions.

`sha256Sync` + `sha256Async` live in `src/engine/crypto.ts` (shared with `angels.ts`). they're byte-identical to the original angels.ts impl; do not modify the hash mixing routine or angel cantos in saved games will drift.

## construction discipline

all `FloraLifecycleState` construction must route through `createFloraLifecycleEntry()` in `src/engine/floraLifecycle.ts`. direct object literals are caught at compile time because `identity` and `traits` are required fields. test sites use `createTestFloraEntry()` from `src/engine/__tests__/helpers/createTestFloraEntry.ts` for a deterministic identity + trait bag in tests.

## doctrine override

v3 doctrine (`docs/precis-thinktank-v3.md` lines 62-63) was overridden during #3 planning. the original "hex grid stays buried, only visible in late-game ritual" framing has been replaced. the 8×8 grid surfaces in #6 (naturalist's manual), player-facing. trait *numbers* are still never shown.
