// RP-22 — Chronicle event store.
//
// addChronicleEvent is the only path that appends to state.chronicle.
// It validates the regionId against state.namedRegions, computes a
// deterministic id from the event fields (so the same transition fired
// twice in one frame produces one entry, not two), and appends the
// event if and only if its id is novel for the tenure.
//
// resolveRegionForPosition finds the NamedRegion whose tiles set
// contains a position, falling back to the prairie region. Emitters
// use it to bind transitions whose anchor doesn't fall inside any
// specific region to the prairie.

import { posKey } from '../position'

import type { ChronicleEvent, GameState, NamedRegion, Position } from '../types'

// Pure helper. Callers pass an event draft without an id; this returns
// the deterministic id derived from the event's other fields. The slot
// keys are sorted so two drafts with the same logical content hash to
// the same id regardless of key insertion order.
export const computeChronicleEventId = (
  fields: Pick<ChronicleEvent, 'templateId' | 'regionId' | 'year' | 'season' | 'slots'>
): string => {
  const slotKeys = Object.keys(fields.slots).sort((a, b) => a.localeCompare(b))
  const slotParts = slotKeys.map(k => `${k}=${fields.slots[k]}`).join('|')
  return `${fields.templateId}@${fields.regionId}@${String(fields.year)}@${fields.season}#${slotParts}`
}

// Find the NamedRegion whose tiles set contains pos. The prairie
// fallback is always the catch-all — it's the last region appended by
// detectNamedRegions and the only one guaranteed to exist on any seed.
// Callers that need the region of a meteorite impact, an extinction
// scan, etc. should route through this helper rather than touching
// state.namedRegions directly.
export const resolveRegionForPosition = (state: GameState, pos: Position): NamedRegion => {
  const key = posKey(pos.x, pos.y)
  for (const region of state.namedRegions) {
    if (region.kind === 'prairie') continue
    if (region.tiles.has(key)) return region
  }
  const prairie = state.namedRegions.find(r => r.kind === 'prairie')
  if (prairie) return prairie
  // Defensive fallback. detectNamedRegions guarantees a prairie region
  // exists; this branch keeps the type narrow and lets a downstream
  // test catch the contract violation if anyone bypasses the genesis
  // detection path.
  throw new Error('resolveRegionForPosition: no prairie fallback region present in state.namedRegions')
}

// Append a chronicle event if its id is novel for the tenure. Two
// emissions with the same (templateId, regionId, year, season, slots)
// collapse to one entry. Returns true when a new event was appended.
export const addChronicleEvent = (state: GameState, draft: Omit<ChronicleEvent, 'id'>): boolean => {
  const regionExists = state.namedRegions.some(r => r.id === draft.regionId)
  if (!regionExists) {
    throw new Error(`addChronicleEvent: regionId "${draft.regionId}" not present in state.namedRegions`)
  }
  const id = computeChronicleEventId(draft)
  if (state.chronicle.some(e => e.id === id)) return false
  state.chronicle.push({ ...draft, id })
  return true
}
