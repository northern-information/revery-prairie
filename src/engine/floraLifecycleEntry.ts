// Construction helper for FloraLifecycleState. Kept in its own module —
// separate from floraLifecycle.ts which imports from manual.ts — so the
// genesis flora-seeding sites can import this without pulling manual.ts
// into the genesis → manual → genesis init-order cycle.
//
// All FloraLifecycleState construction must route through this helper.
// `identity` and `traits` are required by the FloraLifecycleState shape;
// the helper enforces that at compile time.

import { FloraStage } from './types'

import type { TraitBag } from './genetics'
import type { FloraLifecycleState, FloraSpecies } from './types'

export const createFloraLifecycleEntry = ({
  time,
  hasLight,
  species,
  identity,
  traits,
  stage = FloraStage.Healthy,
  soilEffectApplied = false,
}: {
  time: number
  hasLight: boolean
  species: FloraSpecies
  identity: string
  traits: TraitBag
  stage?: FloraStage
  // RP-19 — set to true at the genesis flora-seeding sites
  // (postProcessMultiSpeciesFlora) so the standing flora at game start
  // doesn't re-tax the genesis-derived soilHealth baseline. Every other
  // construction site (seed-planting, spread, ceremony wave, ruin
  // recovery, etc.) leaves this false, so the spawn-effect hook in
  // tickFloraLifecycle applies the per-species debit/credit once.
  soilEffectApplied?: boolean
}): FloraLifecycleState => ({
  stage,
  stageStartTime: time,
  hasLight,
  species,
  identity,
  traits,
  soilEffectApplied,
})
