// RP-17 — species-agnostic spread config.
//
// Each flora species ships a SpeciesSpreadConfig declaring its spread
// behavior. The engine in src/engine/flora/spread.ts is parameterized
// by this config — no FloraSpecies values are hardcoded in the engine.
//
// Per-species implementations live under src/engine/flora/type/<species>/
// spread.ts. They export a single SpeciesSpreadConfig constant
// (CLOVER_SPREAD_CONFIG, WILDFLOWER_SPREAD_CONFIG, TALLGRASS_SPREAD_CONFIG).
// Species modules must not import from each other — the shared engine
// is the only common substrate.

import type { FloraSpecies, GameState, Position } from '@/engine/types'

// A connected patch of same-species flora tiles, detected via
// floodFillFloraPatches. tiles is a Set of posKey strings. centroid is
// the arithmetic mean of (x, y) over all tiles. beeCount is populated
// by the per-species selector when needed (only clover currently uses
// it; wildflower uses pollinator-adjacency on candidate tiles instead).
export interface FloraPatch {
  tiles: Set<string>
  centroid: Position
  beeCount: number
}

// Per-species selectGrowthTargets contract: given the detected patches
// for this species, return a Map of patch-seed → candidate Positions to
// queue as previews. The engine's commitFloraPreviews walks the
// flattened union of these positions next tick.
export type SelectGrowthTargets = (state: GameState, patches: FloraPatch[]) => Map<string, Position[]>

export interface SpeciesSpreadConfig {
  species: FloraSpecies
  // Selector chooses which Dirt neighbors of patch tiles should be
  // queued as previews this tick. Species-specific behavior lives here
  // — clover uses a rotating spiral front, wildflower a pollinator-
  // proximity filter, tall grass uniform random.
  selectGrowthTargets: SelectGrowthTargets
  // Reserved for engine introspection — the selector already handles
  // its own pollinator check. Documented on the config so the lineage
  // overlay / debug tools can describe the species without reading
  // selector internals.
  requiresPollinatorAdjacency: boolean
  // Base per-candidate growth probability. Selectors may scale this
  // further (clover spiral biases by angle, etc.); the field is on the
  // config so cross-species tooling can compare rates uniformly.
  baseGrowthChance: number
  // If true, tickSpeciesSpread bails on the winter check and clears
  // pending previews. All three species are winter-dormant in #17.
  winterDormant: boolean
  // Discovery event recorded by tickSpeciesSpread on the first commit
  // per session for this species. event:flora-spread (broader) is
  // recorded in addition; both are idempotent.
  discoveryEventOnGrowth: string
}
