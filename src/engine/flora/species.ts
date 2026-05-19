import { FloraSpecies } from '@/engine/types'

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
}

// Visual + display metadata for each flora species. The renderer reads
// glyph/color from this registry (keyed by the species field on a tile's
// floraLifecycle entry) rather than the per-TileType TILE_CHARS / TILE_COLORS
// table — which only knows that the tile is "Flora" and not which species
// occupies it.
//
// Per spec precis-1-multi-species-flora:
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
  },
  [FloraSpecies.Wildflower]: {
    id: FloraSpecies.Wildflower,
    glyph: '*',
    color: '#D85FB7',
    dormantColor: '#604550',
    displayName: 'Purple Coneflower',
    latinBinomial: 'Echinacea purpurea',
  },
  [FloraSpecies.TallGrass]: {
    id: FloraSpecies.TallGrass,
    glyph: '"',
    color: '#A89968',
    dormantColor: '#5C5547',
    displayName: 'Big Bluestem',
    latinBinomial: 'Andropogon gerardii',
  },
} as const satisfies Record<FloraSpecies, FloraSpeciesDef>

export const getFloraSpeciesDef = (species: FloraSpecies): FloraSpeciesDef => FLORA_SPECIES[species]
