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
}: {
  time: number
  hasLight: boolean
  species: FloraSpecies
  identity: string
  traits: TraitBag
  stage?: FloraStage
}): FloraLifecycleState => ({
  stage,
  stageStartTime: time,
  hasLight,
  species,
  identity,
  traits,
})
