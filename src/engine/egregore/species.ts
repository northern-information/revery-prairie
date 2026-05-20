// Precis #8b — Egregoric flora (mechanical biome).
//
// Two species share TileType.Egregore. They have no FloraSpecies enum
// entry — the cosmological boundary is rendered as a separate type
// rather than a branch in the native flora registry.
//
// Species selection per tile is deterministic via the existing 8a
// `tileHash` helper, so a given (x, y) always resolves to the same
// species across reloads. Even-bucket positions are Allelopath; odd-
// bucket are Spreader.

import { tileHash } from '@/engine/position'
import { EgregoreSpecies } from '@/engine/types'

import type { EgregoreSpeciesBias } from '@/engine/genetics/egregore'

export interface EgregoreSpeciesDef {
  id: EgregoreSpecies
  // Indices into EGREGORE_GLYPHS (5 entries in src/engine/egregore.ts).
  // Restricting each species to a glyph subset gives visual variety
  // while keeping the two species visually adjacent — no human-readable
  // distinction, just texture.
  glyphSubsetIndices: number[]
  // Trait bias used by generateEgregoreGenome to weight per-plant
  // values toward this species' role. Allelopath weights allelopathy
  // high (suppressive presence); Spreader weights spreadVelocity high
  // (slow advance).
  traitBias: EgregoreSpeciesBias
}

export const EGREGORE_SPECIES = {
  [EgregoreSpecies.Allelopath]: {
    id: EgregoreSpecies.Allelopath,
    glyphSubsetIndices: [0, 1],
    traitBias: { allelopathy: 0.8, spreadVelocity: 0.3 },
  },
  [EgregoreSpecies.Spreader]: {
    id: EgregoreSpecies.Spreader,
    glyphSubsetIndices: [2, 3, 4],
    traitBias: { allelopathy: 0.3, spreadVelocity: 0.8 },
  },
} as const satisfies Record<EgregoreSpecies, EgregoreSpeciesDef>

export const getEgregoreSpeciesDef = (species: EgregoreSpecies): EgregoreSpeciesDef => EGREGORE_SPECIES[species]

// Per-position species assignment. Deterministic from (x, y) via the
// existing 8a tileHash. The two-species split keeps the cosmological
// surface uniform — players cannot read which species sits at a given
// tile from anything but the underlying mechanical effects.
export const getEgregoreSpeciesAtPosition = (x: number, y: number): EgregoreSpecies =>
  tileHash(x, y) % 2 === 0 ? EgregoreSpecies.Allelopath : EgregoreSpecies.Spreader
