// RP-22 — Chronicle read helpers.
//
// Pure read-only access to state.chronicle. Consumed by the Revery
// summary, the manual region/species threads, and (when RP-16 lands)
// the lineage predecessor surface. UI surfaces that subscribe to
// chronicle MUST import only from this module — addChronicleEvent
// stays inside the engine.

import type { ChronicleEvent, GameState } from '../types'

export const readChronicle = (
  state: GameState,
  predicate?: (event: ChronicleEvent) => boolean
): ChronicleEvent[] => {
  if (!predicate) return state.chronicle.slice()
  return state.chronicle.filter(predicate)
}

export const readChronicleForRegion = (state: GameState, regionId: string): ChronicleEvent[] =>
  state.chronicle.filter(e => e.regionId === regionId)

// Species is carried inside the event's slots map (template-bound, no
// dedicated field on ChronicleEvent). Extinction templates put the
// species name under slots.species; other categories may not.
export const readChronicleForSpecies = (state: GameState, species: string): ChronicleEvent[] =>
  state.chronicle.filter(e => e.slots.species === species)

export const readChronicleForYear = (state: GameState, year: number): ChronicleEvent[] =>
  state.chronicle.filter(e => e.year === year)
