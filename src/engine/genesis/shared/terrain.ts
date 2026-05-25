import { SOIL_HEALTH_MAX, SPACE_BORDER } from '../../constants'
import { posKey } from '../../position'
import { smoothNoiseSeeded } from '../../terrain'
import { TileType } from '../../types'
import { clamp } from './math'

import type { GenesisSimState } from '../../genesisTypes'
import type { Tile } from '../../types'

// Steepest-descent hydraulic erosion micropass.
// For each land tile, find the lowest of 8 neighbors. If neighbor is lower,
// transfer carve = clamp((self - neighbor) * carveMult, 0, maxCarve).
// `depositFraction` of the carved material lowers self elevation while
// raising the neighbor downstream (net incision); the remaining
// (1 - depositFraction) is removed entirely (transported off-tile).
// If `enrichSoil` is true, the downstream tile's soilHealth gains +1 per pass.
export const runHydraulicErosion = (
  sim: GenesisSimState,
  options: {
    iterations: number
    carveMult: number
    maxCarve: number
    depositFraction: number
    enrichSoil: boolean
    tileFilter?: (key: string) => boolean
  }
) => {
  const { iterations, carveMult, maxCarve, depositFraction, enrichSoil, tileFilter } = options
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]
  for (let iter = 0; iter < iterations; iter++) {
    const updates: [string, number][] = []
    const enrichments: string[] = []
    for (const key of sim.landMask) {
      if (tileFilter && !tileFilter(key)) continue
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const selfElev = sim.elevation.get(key) ?? 50
      let bestKey: string | null = null
      let bestElev = selfElev
      for (const [dx, dy] of dirs) {
        const nk = posKey(x + dx, y + dy)
        if (!sim.landMask.has(nk)) continue
        const nElev = sim.elevation.get(nk) ?? 50
        if (nElev < bestElev) {
          bestElev = nElev
          bestKey = nk
        }
      }
      if (bestKey === null) continue
      const carve = clamp((selfElev - bestElev) * carveMult, 0, maxCarve)
      if (carve <= 0) continue
      updates.push([key, selfElev - carve])
      updates.push([bestKey, bestElev + carve * depositFraction])
      if (enrichSoil) enrichments.push(bestKey)
    }
    for (const [k, v] of updates) {
      sim.elevation.set(k, clamp(v, 0, 100))
    }
    if (enrichSoil) {
      for (const k of enrichments) {
        sim.soilHealth.set(k, clamp((sim.soilHealth.get(k) ?? 30) + 1, 10, SOIL_HEALTH_MAX))
      }
    }
  }
}

// Generate land mask using the same algorithm as terrain.ts, but with seeded RNG.
// Sand is no longer placed at the space-to-land boundary; that role is owned by
// the water-shoreline pass that runs later in the genesis pipeline. coastlineTiles
// is populated as the outermost ring of Dirt tiles bordering Space, since several
// later epochs use it as a "tiles at the edge of the landmass" signal (ancient
// seabeds, coastal elevation lowering, ruin placement guards).
export const generateLandMask = (
  width: number,
  height: number,
  rng: () => number
): { landMask: Set<string>; coastlineTiles: Set<string>; grid: Tile[][] } => {
  const topVariation = smoothNoiseSeeded(width, 6, 12, rng)
  const bottomVariation = smoothNoiseSeeded(width, 6, 12, rng)
  const leftVariation = smoothNoiseSeeded(height, 6, 12, rng)
  const rightVariation = smoothNoiseSeeded(height, 6, 12, rng)

  const border = SPACE_BORDER

  const landMask = new Set<string>()

  const grid: Tile[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const top = border + topVariation[x]
      const bottom = border + bottomVariation[x]
      const left = border + leftVariation[y]
      const right = border + rightVariation[y]

      const isSpace = x < left || x >= width - right || y < top || y >= height - bottom
      if (isSpace) return { type: TileType.Space }

      landMask.add(posKey(x, y))
      return { type: TileType.Dirt }
    })
  )

  // coastlineTiles = land tiles with at least one cardinal Space neighbor.
  // Captures the outermost ring of the landmass, replacing the SAND_BORDER
  // ring concept without changing what downstream consumers iterate.
  const coastlineTiles = new Set<string>()
  const cardinals = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  for (const key of landMask) {
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr)
    const y = Number(yStr)
    for (const [dx, dy] of cardinals) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        coastlineTiles.add(key)
        break
      }
      if (grid[ny][nx].type === TileType.Space) {
        coastlineTiles.add(key)
        break
      }
    }
  }

  return { landMask, coastlineTiles, grid }
}

// Threshold the 2D-noise field is compared against. Cell size and amplitude
// below combine with this so a small fraction of inland land joins the mask:
// inland tiles have elevation floored at 40 (LavaEra) plus noise spanning
// roughly [-30, 30], so a threshold of 28 keeps wet area to a few large
// regions rather than washing out the map.
export const LOWLAND_WATER_THRESHOLD = 28
// Lattice cell size for the value-noise field. Larger = more coherent blobs.
export const LOWLAND_NOISE_CELL = 18
// Noise amplitude. Larger = more variance in where blobs sit relative to
// the LavaEra elevation floor.
export const LOWLAND_NOISE_AMPLITUDE = 30

// Final-water inland bias — minima within COAST_INLAND_BIAS_RADIUS tiles
// (Chebyshev) of any coastlineTiles tile receive COAST_INLAND_BIAS_PENALTY
// added to their sort key. Deeper basins still win the budget allocation,
// but among similar-depth candidates the interior basins fill first, so the
// final water bodies cluster toward the diamond's center rather than its
// edges.
export const COAST_INLAND_BIAS_RADIUS = 8
export const COAST_INLAND_BIAS_PENALTY = 30

const smoothstep = (t: number): number => t * t * (3 - 2 * t)

/**
 * Build sim.lowlandWaterMask: coherent cosmetic-water tile set used by
 * aquatic-phase epochs. Generates a true 2D value-noise field at the
 * resolution given by LOWLAND_NOISE_CELL and bilinearly interpolates with
 * smoothstep easing — this produces isotropic blobs without the diagonal
 * banding that summed 1D noise fields exhibit. Tiles where
 * (elevation + noise) drops below the threshold join the mask. Ancient
 * seabeds are already painted as water by their own predicate path, so
 * they are excluded from the mask. Idempotent — overwrites whatever was
 * previously in the set.
 */
export const buildLowlandWaterMask = (sim: GenesisSimState): void => {
  const lattW = Math.ceil(sim.width / LOWLAND_NOISE_CELL) + 2
  const lattH = Math.ceil(sim.height / LOWLAND_NOISE_CELL) + 2
  const lattice: number[][] = []
  for (let j = 0; j < lattH; j++) {
    const row: number[] = []
    for (let i = 0; i < lattW; i++) {
      row.push((sim.rng() * 2 - 1) * LOWLAND_NOISE_AMPLITUDE)
    }
    lattice.push(row)
  }
  const sampleNoise = (x: number, y: number): number => {
    const fx = x / LOWLAND_NOISE_CELL
    const fy = y / LOWLAND_NOISE_CELL
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = smoothstep(fx - ix)
    const ty = smoothstep(fy - iy)
    const v00 = lattice[iy]?.[ix] ?? 0
    const v10 = lattice[iy]?.[ix + 1] ?? 0
    const v01 = lattice[iy + 1]?.[ix] ?? 0
    const v11 = lattice[iy + 1]?.[ix + 1] ?? 0
    const a = v00 + (v10 - v00) * tx
    const b = v01 + (v11 - v01) * tx
    return a + (b - a) * ty
  }
  sim.lowlandWaterMask = new Set()
  for (const key of sim.landMask) {
    if (sim.ancientSeabeds.has(key)) continue
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr)
    const y = Number(yStr)
    const elev = sim.elevation.get(key) ?? 50
    const noise = sampleNoise(x, y)
    if (elev + noise < LOWLAND_WATER_THRESHOLD) {
      sim.lowlandWaterMask.add(key)
    }
  }
}
