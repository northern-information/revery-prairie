// RP-4 — phenotype label resolver.
//
// Once per Revery, the player has been living with a prairie long enough that
// one species' trait becomes legible. resolvePhenotypeLabel picks the species
// the player has interacted with most (highest flora:<species> count in
// manualDiscoveries), the axis cycles deterministically by reveryCount, and
// the verdict is a hedged tri-bucket string keyed off the mean trait across
// all currently-living flora of that species.
//
// See harness/specs/RP-4-the-revery.yaml revery-resolves-phenotype-label
// for the contract.

import { PHENOTYPE_AXES } from './constants'
import { FloraSpecies } from './types'

import type { GameState, PhenotypeAxis } from './types'

// Manual discovery key per species. Mirrors the keys in manual.ts.
const SPECIES_DISCOVERY_KEY: Record<FloraSpecies, string> = {
  [FloraSpecies.Clover]: 'flora:clover',
  [FloraSpecies.Wildflower]: 'flora:wildflower',
  [FloraSpecies.TallGrass]: 'flora:tallGrass',
}

// Stable enum ordering for tie-breaking.
const SPECIES_ORDER: FloraSpecies[] = [FloraSpecies.Clover, FloraSpecies.TallGrass, FloraSpecies.Wildflower]

// Tri-bucket verdict templates per axis. Low / mid / high.
const VERDICT_BANK: Record<PhenotypeAxis, [string, string, string]> = {
  bloomTiming: ['early-blooming', 'mid-season', 'late-blooming'],
  coldTolerance: ['cold-sensitive', 'temperate', 'cold-tolerant'],
  droughtResponse: ['drought-prone', 'temperate', 'drought-resistant'],
  pollinatorPreference: ['rarely visited', 'commonly visited', 'bee-favored'],
}

// In tests there are no living tiles, in which case we default to the mid
// bucket. The species discovery key check above (flora:<species> presence)
// gates whether we resolve at all.
const TRAIT_LOW_THRESHOLD = 0.33
const TRAIT_HIGH_THRESHOLD = 0.67

const bucketIndex = (mean: number): 0 | 1 | 2 => {
  if (mean < TRAIT_LOW_THRESHOLD) return 0
  if (mean >= TRAIT_HIGH_THRESHOLD) return 2
  return 1
}

const meanTraitForSpecies = (state: GameState, species: FloraSpecies, axis: PhenotypeAxis): number => {
  let sum = 0
  let count = 0
  for (const entry of state.floraLifecycle.values()) {
    if (entry.species !== species) continue
    sum += entry.traits[axis]
    count += 1
  }
  if (count === 0) return 0.5
  return sum / count
}

const selectSpecies = (state: GameState): FloraSpecies | null => {
  let best: FloraSpecies | null = null
  let bestCount = 0
  for (const species of SPECIES_ORDER) {
    const key = SPECIES_DISCOVERY_KEY[species]
    const count = state.manualDiscoveries.has(key) ? 1 : 0
    if (count > bestCount) {
      best = species
      bestCount = count
    }
  }
  // The discovery set is binary per key (each species gets one discovery
  // entry from #6's hold-to-scan). With multiple species discovered, ties
  // fall through to SPECIES_ORDER's first match.
  return best
}

export interface PhenotypeResolution {
  species: FloraSpecies
  axis: PhenotypeAxis
  verdict: string
}

export const resolvePhenotypeLabel = (state: GameState, reveryCount: number): PhenotypeResolution | null => {
  const species = selectSpecies(state)
  if (!species) return null
  const axisName = PHENOTYPE_AXES[reveryCount % PHENOTYPE_AXES.length]
  const axis = axisName as PhenotypeAxis
  const mean = meanTraitForSpecies(state, species, axis)
  const verdict = VERDICT_BANK[axis][bucketIndex(mean)]
  return { species, axis, verdict }
}
