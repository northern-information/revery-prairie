// Test helper for constructing FloraLifecycleState entries with a deterministic
// identity + traits. Use this in tests instead of inline object literals — the
// production helper createFloraLifecycleEntry requires identity + traits and
// the test sites don't care about specific values.

import { createFloraLifecycleEntry } from '../../floraLifecycleEntry'
import { generateGenesisIdentity, generateTraitBag } from '../../genetics'
import { FloraSpecies, FloraStage } from '../../types'

import type { FloraLifecycleState } from '../../types'

export const createTestFloraEntry = ({
  posKey,
  species = FloraSpecies.Clover,
  stage = FloraStage.Healthy,
  hasLight = true,
  time = 0,
  binomial = 'Trifolium repens',
}: {
  posKey: string
  species?: FloraSpecies
  stage?: FloraStage
  hasLight?: boolean
  time?: number
  binomial?: string
}): FloraLifecycleState => {
  const identity = generateGenesisIdentity(binomial, 0, posKey)
  return createFloraLifecycleEntry({
    time,
    hasLight,
    species,
    identity,
    traits: generateTraitBag(identity),
    stage,
  })
}
