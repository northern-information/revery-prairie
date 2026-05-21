// Precis #17 — per-species growth-preview helpers.
//
// state.floraGrowthPreviews is Map<FloraSpecies, Set<string>>. Each
// species owns its own pending-preview queue so wildflower previews do
// not commit as clover and vice versa.
//
// Most call sites (renderer, zone reset paths) only need to know
// "is this tile a preview of anything?" — hasAnyGrowthPreview covers
// that without species knowledge. The clover spread tick uses
// getGrowthPreviewSet(state, FloraSpecies.Clover) for read-modify-write
// on its own queue.

import { FloraSpecies } from './types'

import type { GameState } from './types'

/**
 * Returns true if any species' growth-preview queue contains the given
 * tile key. Use this from species-naive call sites (renderer, sway
 * profile picker) that only care whether the tile is showing a preview.
 */
export const hasAnyGrowthPreview = (state: GameState, key: string): boolean => {
  for (const set of state.floraGrowthPreviews.values()) {
    if (set.has(key)) return true
  }
  return false
}

/**
 * Returns the per-species preview Set, creating it lazily if absent.
 * Mutations to the returned Set persist in state.
 */
export const getGrowthPreviewSet = (state: GameState, species: FloraSpecies): Set<string> => {
  let set = state.floraGrowthPreviews.get(species)
  if (!set) {
    set = new Set<string>()
    state.floraGrowthPreviews.set(species, set)
  }
  return set
}

/**
 * Returns true if the given species has any queued previews. Cheaper
 * than counting because it short-circuits on the first non-empty Set.
 */
export const hasGrowthPreviewsFor = (state: GameState, species: FloraSpecies): boolean => {
  const set = state.floraGrowthPreviews.get(species)
  return set !== undefined && set.size > 0
}

/**
 * Clears every species' preview queue. Used by zone-reset paths
 * (cave entry/exit, ruin entry) that need to wipe pending growth.
 */
export const clearAllGrowthPreviews = (state: GameState): void => {
  state.floraGrowthPreviews.clear()
}

/**
 * Removes the given key from every species' preview Set. Used by
 * lightning.ts when a strike erases a tile mid-preview.
 */
export const deleteGrowthPreviewKey = (state: GameState, key: string): void => {
  for (const set of state.floraGrowthPreviews.values()) {
    set.delete(key)
  }
}

/**
 * Constructs a fresh empty Map<FloraSpecies, Set<string>> with each
 * species seeded to an empty Set. Used by state.ts at game-state
 * creation so the Map shape is predictable from the start.
 */
export const createEmptyFloraGrowthPreviews = (): Map<FloraSpecies, Set<string>> => {
  const map = new Map<FloraSpecies, Set<string>>()
  map.set(FloraSpecies.Clover, new Set<string>())
  map.set(FloraSpecies.Wildflower, new Set<string>())
  map.set(FloraSpecies.TallGrass, new Set<string>())
  return map
}
