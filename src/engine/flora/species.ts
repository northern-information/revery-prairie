import { isInBounds, posKey } from '@/engine/position'
import { FloraSpecies, TileType } from '@/engine/types'
import type { GameState } from '@/engine/types'

export interface FloraSpeciesDef {
  id: FloraSpecies
  glyph: string
  color: string
  // Dormant color rendered when state.weather.season === Winter and the
  // tile's lifecycle entry is in FloraStage.Dormant. Each species blends
  // its base color toward a winter-drained variant — same glyph, lower
  // saturation, cooler hue. The doctrine says winter is the prairie at
  // rest; the muted color should read as "paused" not "dying."
  dormantColor: string
  displayName: string
  latinBinomial: string
  // RP-7 — species-level baseline attractiveness to bees, in [0, 1].
  // Combined with the per-plant `traits.pollinatorPreference` trait from #3
  // via getTileBeePreference. Clover stays at 1.0 to preserve historical
  // bee-prefers-clover behavior; wildflower and tall grass are nonzero so
  // they participate in routing and starvation but rank below clover.
  beePreference: number
}

// Visual + display metadata for each flora species. The renderer reads
// glyph/color from this registry (keyed by the species field on a tile's
// floraLifecycle entry) rather than the per-TileType TILE_CHARS / TILE_COLORS
// table — which only knows that the tile is "Flora" and not which species
// occupies it.
//
// Per spec RP-1-multi-species-flora:
//   - clover: existing `%` `#50C878` is preserved verbatim (the green prairie
//     bloom). The TILE_COLORS entry for TileType.Flora matches.
//   - wildflower: Purple Coneflower (Echinacea purpurea) renders as `*` in a
//     warm magenta — visually distinct from clover in scattered patches.
//   - tallGrass: Big Bluestem (Andropogon gerardii) renders as `"` in a tawny
//     buff — reads as dry prairie grass against green clover and dirt.
export const FLORA_SPECIES = {
  [FloraSpecies.Clover]: {
    id: FloraSpecies.Clover,
    glyph: '%',
    color: '#50C878',
    dormantColor: '#4A5040',
    displayName: 'Clover',
    latinBinomial: 'Trifolium repens',
    beePreference: 1.0,
  },
  [FloraSpecies.Wildflower]: {
    id: FloraSpecies.Wildflower,
    glyph: '*',
    color: '#D85FB7',
    dormantColor: '#604550',
    displayName: 'Purple Coneflower',
    latinBinomial: 'Echinacea purpurea',
    beePreference: 0.6,
  },
  [FloraSpecies.TallGrass]: {
    id: FloraSpecies.TallGrass,
    glyph: '"',
    color: '#A89968',
    dormantColor: '#5C5547',
    displayName: 'Big Bluestem',
    latinBinomial: 'Andropogon gerardii',
    beePreference: 0.3,
  },
} as const satisfies Record<FloraSpecies, FloraSpeciesDef>

export const getFloraSpeciesDef = (species: FloraSpecies): FloraSpeciesDef => FLORA_SPECIES[species]

// RP-7 — per-tile bee preference.
//
// Returns the effective bee attractiveness of one map tile in [0, 1], blending
// the species-level baseline with the per-plant `pollinatorPreference` trait
// from #3 genetics. The blend formula is
//   `species.beePreference * (0.75 + 0.5 * traits.pollinatorPreference)`
// which keeps per-plant variation inside ±25% of the species baseline (the
// trait itself is in [0, 1]). Output is clamped to [0, 1] so callers can
// treat it as a bounded weight.
//
// Returns 0 for any non-Flora tile, for out-of-bounds coords, or when the
// floraLifecycle entry for the Flora tile is missing (mid-construction state).
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

export const getTileBeePreference = (state: GameState, x: number, y: number): number => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return 0
  if (state.map[y][x].type !== TileType.Flora) return 0
  const entry = state.floraLifecycle.get(posKey(x, y))
  if (!entry) return 0
  const species = FLORA_SPECIES[entry.species]
  const trait = entry.traits.pollinatorPreference
  return clamp01(species.beePreference * (0.75 + 0.5 * trait))
}
