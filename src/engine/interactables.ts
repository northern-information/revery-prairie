// RP-63 — Interactable speaker registry. Distinct from Character: an
// Interactable is a tile-anchored or system-synthetic speaker (gate today;
// signs, plaques, shrines anticipated). No Position component, no glyph, no
// gift, no music — just a name and a dialog line array. Never enumerated by
// the manual.
//
// Implementation is intentionally minimal at spec time. The full contract
// is owned by harness/specs/RP-63-interactable-speakers.yaml and filled in
// during the RP-63 implementation pass.

export interface Interactable {
  id: string
  name: string
  lines: readonly string[]
}

export const INTERACTABLES = {
  gate: {
    id: 'gate',
    name: 'Gate',
    lines: ['The gate is locked.'],
  },
} as const satisfies Record<string, Interactable>

export const getInteractableDefinition = (id: string): Interactable => {
  const def = (INTERACTABLES as Record<string, Interactable>)[id]
  if (!def) {
    throw new Error(`unknown interactable definition: ${id}`)
  }
  return def
}

export const getInteractableLines = (id: string): readonly string[] => getInteractableDefinition(id).lines
