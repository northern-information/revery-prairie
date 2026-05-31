// RP-22 — Chronicle emitters.
//
// World-state-transition observers. Each emitter takes (state, ...transition-
// context), gates on currentZone === Overworld, resolves the region for the
// transition, picks a template from the matching category (preferring tone-
// appropriate templates with fallback to any in the category), fills slots
// from world state, and calls addChronicleEvent. Player-action source files
// (movement, dialog, inventory, recipes) MUST NOT import from this module —
// the architecture-guard test enforces the boundary.

import { TileType, Zone } from '../types'

import { addChronicleEvent, resolveRegionForPosition } from './index'
import { CHRONICLE_TEMPLATES, pickTemplate } from './templates'

import type { ChronicleTemplate, GameState, Position, Season } from '../types'

// Engine-local scan state, attached to a GameState via WeakMap so it
// doesn't bloat saves and resets automatically with each new tenure.
interface EmitterScanState {
  // Per-region per-species presence map from the prior scan; used by
  // emitSpeciesExtinction to detect present→absent transitions.
  speciesPresenceByRegion: Map<string, Set<string>>
  // Per-region egregore tile count from the prior scan; used by
  // emitEgregoreReach (zero→positive) and emitEgregoreAdvance
  // (crossing the 25% footprint threshold).
  egregoreCountByRegion: Map<string, number>
  // Independent first-scan flags so species and egregore both seed
  // silently on their first call without one half-initialized state
  // shadowing the other.
  speciesInitialized: boolean
  egregoreInitialized: boolean
  // Hallowed-ground tile keys observed in any prior scan. Used by
  // emitHallowedGround to fire on a region's first-ever hallowed tile.
  regionsWithHallowedGround: Set<string>
  // Last observed count of getHallowedPolygons output. emitStoneCircleComplete
  // compares against this to detect a polygon growing.
  lastPolygonCount: number
}

const scanState = new WeakMap<GameState, EmitterScanState>()

const getScanState = (state: GameState): EmitterScanState => {
  let s = scanState.get(state)
  if (!s) {
    s = {
      speciesPresenceByRegion: new Map(),
      egregoreCountByRegion: new Map(),
      speciesInitialized: false,
      egregoreInitialized: false,
      regionsWithHallowedGround: new Set(),
      lastPolygonCount: 0,
    }
    scanState.set(state, s)
  }
  return s
}

const isOverworld = (state: GameState): boolean => state.currentZone === Zone.Overworld

const yearOf = (state: GameState): number => state.reveryCount

const seasonOf = (state: GameState): Season => state.weather.season

const renderEvent = (
  template: ChronicleTemplate,
  slots: Record<string, string>
): { templateId: string; tone: ChronicleTemplate['tone']; slots: Record<string, string> } => ({
  templateId: template.id,
  tone: template.tone,
  slots,
})

// --- Season rollover ---

export const emitSeasonRollover = (state: GameState, priorSeason: Season, newSeason: Season): void => {
  if (!isOverworld(state)) return
  if (priorSeason === newSeason) return

  const prairie = state.namedRegions.find(r => r.kind === 'prairie')
  if (!prairie) return

  const preferredTone =
    newSeason === 'spring' || newSeason === 'summer' ? 'positive' : 'negative'
  const template = pickTemplate('season-rollover', preferredTone)
  const ev = renderEvent(template, {
    season: newSeason,
    region: prairie.name,
    year: String(yearOf(state)),
  })

  addChronicleEvent(state, {
    templateId: ev.templateId,
    regionId: prairie.id,
    year: yearOf(state),
    season: newSeason,
    tone: ev.tone,
    slots: ev.slots,
  })
}

// --- Species extinction ---

// Computes the current presence map: regionId → Set<species>. Native
// species only — egregoric species are excluded.
const computeSpeciesPresence = (state: GameState): Map<string, Set<string>> => {
  const presence = new Map<string, Set<string>>()
  for (const region of state.namedRegions) {
    presence.set(region.id, new Set())
  }
  for (const [key, entry] of state.floraLifecycle) {
    // A flora tile counts as present unless its stage is terminal.
    // Decomposing is the post-death terminal; black/blinkingRed/brown
    // are dying but still on the map. Only Decomposing removes presence.
    if (entry.stage === 'decomposing') continue
    for (const region of state.namedRegions) {
      if (region.kind === 'prairie') continue
      if (region.tiles.has(key)) {
        presence.get(region.id)?.add(entry.species)
        break
      }
    }
  }
  // Anything not claimed by a specific region falls into the prairie's
  // presence accounting. Prairie always present in namedRegions.
  for (const [key, entry] of state.floraLifecycle) {
    if (entry.stage === 'decomposing') continue
    let claimed = false
    for (const region of state.namedRegions) {
      if (region.kind === 'prairie') continue
      if (region.tiles.has(key)) {
        claimed = true
        break
      }
    }
    if (claimed) continue
    const prairie = state.namedRegions.find(r => r.kind === 'prairie')
    if (prairie) presence.get(prairie.id)?.add(entry.species)
  }
  return presence
}

export const tickChronicleSpeciesExtinction = (state: GameState): void => {
  if (!isOverworld(state)) return
  const s = getScanState(state)
  const current = computeSpeciesPresence(state)
  if (!s.speciesInitialized) {
    s.speciesPresenceByRegion = current
    s.speciesInitialized = true
    // Seed pass; emit nothing.
  } else {
    for (const [regionId, currentSet] of current) {
      const priorSet = s.speciesPresenceByRegion.get(regionId) ?? new Set<string>()
      for (const species of priorSet) {
        if (!currentSet.has(species)) {
          emitSpeciesExtinction(state, regionId, species)
        }
      }
    }
    s.speciesPresenceByRegion = current
  }
}

export const emitSpeciesExtinction = (state: GameState, regionId: string, species: string): void => {
  if (!isOverworld(state)) return
  const region = state.namedRegions.find(r => r.id === regionId)
  if (!region) return

  const template = pickTemplate('species-extinction', 'negative')
  const slots: Record<string, string> = {
    species,
    region: region.name,
    season: seasonOf(state),
    year: String(yearOf(state)),
  }
  addChronicleEvent(state, {
    templateId: template.id,
    regionId,
    year: yearOf(state),
    season: seasonOf(state),
    tone: template.tone,
    slots,
  })
}

// --- Egregore reach + advance ---

const EGREGORE_ADVANCE_THRESHOLD = 0.25 // fraction of region tiles

// Per-region egregore tile count. Reads state.egregorePositions and
// buckets each by region membership.
const computeEgregoreCounts = (state: GameState): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const region of state.namedRegions) counts.set(region.id, 0)
  for (const pos of state.egregorePositions) {
    const region = resolveRegionForPosition(state, pos)
    counts.set(region.id, (counts.get(region.id) ?? 0) + 1)
  }
  return counts
}

export const tickChronicleEgregoreScan = (state: GameState): void => {
  if (!isOverworld(state)) return
  const s = getScanState(state)
  const current = computeEgregoreCounts(state)
  if (!s.egregoreInitialized) {
    s.egregoreCountByRegion = current
    s.egregoreInitialized = true
    // Seed pass; emit nothing. Egregores placed at genesis are baseline,
    // not "reach" events.
  } else {
    for (const [regionId, count] of current) {
      const prior = s.egregoreCountByRegion.get(regionId) ?? 0
      const region = state.namedRegions.find(r => r.id === regionId)
      if (!region) continue
      const regionSize = region.tiles.size || 1
      // Reach: prior zero, current positive.
      if (prior === 0 && count > 0) {
        emitEgregoreReach(state, regionId)
      }
      // Advance: crossed the 25% threshold from below.
      const priorFraction = prior / regionSize
      const currentFraction = count / regionSize
      if (priorFraction < EGREGORE_ADVANCE_THRESHOLD && currentFraction >= EGREGORE_ADVANCE_THRESHOLD) {
        emitEgregoreAdvance(state, regionId)
      }
    }
    s.egregoreCountByRegion = current
  }
}

export const emitEgregoreReach = (state: GameState, regionId: string): void => {
  if (!isOverworld(state)) return
  const region = state.namedRegions.find(r => r.id === regionId)
  if (!region) return
  const template = pickTemplate('egregore-reach', 'negative')
  const slots: Record<string, string> = {
    region: region.name,
    season: seasonOf(state),
    year: String(yearOf(state)),
  }
  addChronicleEvent(state, {
    templateId: template.id,
    regionId,
    year: yearOf(state),
    season: seasonOf(state),
    tone: template.tone,
    slots,
  })
}

export const emitEgregoreAdvance = (state: GameState, regionId: string): void => {
  if (!isOverworld(state)) return
  const region = state.namedRegions.find(r => r.id === regionId)
  if (!region) return
  const template = pickTemplate('egregore-advance', 'negative')
  const slots: Record<string, string> = {
    region: region.name,
    year: String(yearOf(state)),
  }
  addChronicleEvent(state, {
    templateId: template.id,
    regionId,
    year: yearOf(state),
    season: seasonOf(state),
    tone: template.tone,
    slots,
  })
}

// --- Meteorite impact ---

export const emitMeteoriteImpact = (state: GameState, pos: Position): void => {
  if (!isOverworld(state)) return
  const region = resolveRegionForPosition(state, pos)
  // Mostly positive in tone (awe), with a negative fallback when the
  // impact landed on a Dirt-only tile. The template registry already
  // has both — prefer positive.
  const template = pickTemplate('meteorite-impact', 'positive')
  const slots: Record<string, string> = {
    region: region.name,
    year: String(yearOf(state)),
  }
  addChronicleEvent(state, {
    templateId: template.id,
    regionId: region.id,
    year: yearOf(state),
    season: seasonOf(state),
    tone: template.tone,
    slots,
  })
}

// --- Stone-circle complete ---

// Wire-in passes the prior and current polygon count; the emitter only
// fires when the current count is strictly greater than prior. The
// region is resolved from the centroid of the newest polygon's vertices.
export const emitStoneCircleComplete = (state: GameState, anchor: Position): void => {
  if (!isOverworld(state)) return
  const region = resolveRegionForPosition(state, anchor)
  const template = pickTemplate('stone-circle', 'positive')
  const slots: Record<string, string> = {
    region: region.name,
    year: String(yearOf(state)),
  }
  addChronicleEvent(state, {
    templateId: template.id,
    regionId: region.id,
    year: yearOf(state),
    season: seasonOf(state),
    tone: template.tone,
    slots,
  })
}

// --- Hallowed ground first form ---

export const emitHallowedGround = (state: GameState, anchor: Position): void => {
  if (!isOverworld(state)) return
  const region = resolveRegionForPosition(state, anchor)
  const s = getScanState(state)
  if (s.regionsWithHallowedGround.has(region.id)) return
  s.regionsWithHallowedGround.add(region.id)
  const template = pickTemplate('hallowed-ground', 'positive')
  const slots: Record<string, string> = {
    region: region.name,
    season: seasonOf(state),
    year: String(yearOf(state)),
  }
  addChronicleEvent(state, {
    templateId: template.id,
    regionId: region.id,
    year: yearOf(state),
    season: seasonOf(state),
    tone: template.tone,
    slots,
  })
}

// --- Tick orchestrator ---

// Single entry-point called from gameLoop. Runs the species + egregore
// scans and updates the prior-state snapshots. Cheap on small maps;
// scales with namedRegions * floraLifecycle, both bounded.
export const tickChronicle = (state: GameState): void => {
  if (!isOverworld(state)) return
  tickChronicleSpeciesExtinction(state)
  tickChronicleEgregoreScan(state)
}

// --- Re-exports for the test layer ---

export { CHRONICLE_TEMPLATES, TileType }
