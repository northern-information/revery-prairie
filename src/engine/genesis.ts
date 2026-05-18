import { generateBoltPath } from './boltPath'
import {
  BURN_SCAR_COLORS as GAME_BURN_SCAR_COLORS,
  DIRT_COLORS as GAME_DIRT_COLORS,
  LIGHTNING_BOLT_COLOR_BRIGHT,
  LIGHTNING_BOLT_COLOR_DIM,
  LIGHTNING_BOLT_COLOR_MID,
  LIGHTNING_BOLT_MAX_LENGTH,
  LIGHTNING_BOLT_MIN_LENGTH,
  POND_COLOR,
  RIVER_COLOR,
  SAND_COLORS,
  SATELLITE_CRATER_DEPTH_CENTER,
  SATELLITE_CRATER_DEPTH_EDGE,
  SATELLITE_CRATER_DEPTH_RING,
  SATELLITE_HEAD_COLORS,
  SATELLITE_SOIL_DAMAGE,
  SATELLITE_TRAIL_COLORS,
  SOIL_HEALTH_MAX,
  SPACE_BORDER,
  TILE_CHARS,
  TILE_COLORS,
  WATER_SAND_BORDER_MAX,
  WATER_SAND_PASS_CHANCES,
} from './constants'
import { GenesisEpochId, RuinGenerationMode, RuinRole } from './genesisTypes'
import { rebuildGlintZones, seedGlintPatches } from './glintZones'
import { posKey, tileHash as rendererTileHash } from './position'
import { smoothNoiseSeeded } from './terrain'
import { TileType } from './types'

import type {
  CivilizationRuin,
  GenesisEpoch,
  GenesisMeteorStreak,
  GenesisResult,
  GenesisSatelliteCrash,
  GenesisSimState,
  GenesisTileRender,
  TectonicAxis,
} from './genesisTypes'
import type { GameState, Position, Tile } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const hashString = (s: string): number => {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h >>> 0
}

const tileHash = (x: number, y: number): number => ((x * 374761393 + y * 668265263) >>> 0) % 2147483647

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi))

const dist = (x1: number, y1: number, x2: number, y2: number): number => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

// 2D value-noise lattice. Each lattice cell stores a random value; samples
// are smoothstep-bilerped between corners. cellSize controls wavelength.
const buildValueLattice = (
  width: number,
  height: number,
  cellSize: number,
  rng: () => number
): { values: number[]; cols: number; rows: number; cellSize: number } => {
  const cols = Math.ceil(width / cellSize) + 2
  const rows = Math.ceil(height / cellSize) + 2
  const values: number[] = []
  const total = cols * rows
  for (let i = 0; i < total; i++) values.push(rng() * 2 - 1)
  return { values, cols, rows, cellSize }
}

const sampleLattice = (
  lat: { values: number[]; cols: number; rows: number; cellSize: number },
  x: number,
  y: number
): number => {
  const fx = x / lat.cellSize
  const fy = y / lat.cellSize
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = fx - ix
  const ty = fy - iy
  // Smoothstep
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const cx = clamp(ix, 0, lat.cols - 2)
  const cy = clamp(iy, 0, lat.rows - 2)
  const v00 = lat.values[cy * lat.cols + cx]
  const v10 = lat.values[cy * lat.cols + (cx + 1)]
  const v01 = lat.values[(cy + 1) * lat.cols + cx]
  const v11 = lat.values[(cy + 1) * lat.cols + (cx + 1)]
  const a = lerp(v00, v10, sx)
  const b = lerp(v01, v11, sx)
  return lerp(a, b, sy)
}

// Three-octave fBm with domain warp. Returns [-1, 1] range.
const fbmWarp2D = (width: number, height: number, rng: () => number): ((x: number, y: number) => number) => {
  const baseCell = 14
  const lat0 = buildValueLattice(width, height, baseCell, rng)
  const lat1 = buildValueLattice(width, height, baseCell / 2, rng)
  const lat2 = buildValueLattice(width, height, baseCell / 4, rng)
  // Independent warp lattices
  const wx = buildValueLattice(width, height, baseCell, rng)
  const wy = buildValueLattice(width, height, baseCell, rng)
  const warpAmp = 6
  return (x, y) => {
    const ox = sampleLattice(wx, x, y) * warpAmp
    const oy = sampleLattice(wy, x, y) * warpAmp
    const wxC = x + ox
    const wyC = y + oy
    return (
      sampleLattice(lat0, wxC, wyC) * 1.0 + sampleLattice(lat1, wxC, wyC) * 0.5 + sampleLattice(lat2, wxC, wyC) * 0.25
    )
  }
}

// Steepest-descent hydraulic erosion micropass.
// For each land tile, find the lowest of 8 neighbors. If neighbor is lower,
// transfer carve = clamp((self - neighbor) * carveMult, 0, maxCarve).
// `depositFraction` of the carved material lowers self elevation while
// raising the neighbor downstream (net incision); the remaining
// (1 - depositFraction) is removed entirely (transported off-tile).
// If `enrichSoil` is true, the downstream tile's soilHealth gains +1 per pass.
const runHydraulicErosion = (
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

// Apply windward/leeward biome bias derived from sim.tectonicAxes.
// Prevailing wind blows from +x. For each land tile, find the nearest
// axis midpoint; project (tile - midpoint) onto the axis perpendicular.
// Positive projection = windward (wetter); negative = leeward (drier).
// Bias decays with distance from the axis (zero past 4 * axis.radius).
const applyWindwardLeewardBias = (
  sim: GenesisSimState,
  soilWindward: number,
  soilLeeward: number,
  vegWindward: number,
  vegLeeward: number
) => {
  if (sim.tectonicAxes.length === 0) return
  for (const key of sim.landMask) {
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr)
    const y = Number(yStr)
    let bestProj = 0
    let bestDist = Infinity
    let bestRadius = 0
    let bestIntensity = 0
    for (const axis of sim.tectonicAxes) {
      // Midpoint of the polyline
      const mid = axis.polyline[Math.floor(axis.polyline.length / 2)]
      const d = Math.hypot(x - mid.x, y - mid.y)
      if (d >= bestDist) continue
      // Perpendicular vector to axis orientation
      const perpX = -Math.sin(axis.orientationRadians)
      const perpY = Math.cos(axis.orientationRadians)
      // Wind direction: prevailing wind from +x means windward = side where (1, 0)·perp > 0
      const proj = (x - mid.x) * perpX + (y - mid.y) * perpY
      // Sign-align so windward is positive (when wind hits the windward face first)
      const signed = perpX >= 0 ? proj : -proj
      bestProj = signed
      bestDist = d
      bestRadius = axis.radius
      bestIntensity = axis.intensity
    }
    const maxRange = bestRadius * 4
    if (bestDist > maxRange) continue
    const decay = 1 - bestDist / maxRange
    const weight = decay * (bestIntensity / 22)
    if (bestProj > 0) {
      sim.soilHealth.set(key, clamp((sim.soilHealth.get(key) ?? 30) + soilWindward * weight, 10, SOIL_HEALTH_MAX))
      sim.vegetationMap.set(key, Math.max(0, (sim.vegetationMap.get(key) ?? 0) + vegWindward * weight))
    } else if (bestProj < 0) {
      sim.soilHealth.set(key, clamp((sim.soilHealth.get(key) ?? 30) + soilLeeward * weight, 10, SOIL_HEALTH_MAX))
      sim.vegetationMap.set(key, Math.max(0, (sim.vegetationMap.get(key) ?? 0) + vegLeeward * weight))
    }
  }
}

// Generate land mask using the same algorithm as terrain.ts, but with seeded RNG.
// Sand is no longer placed at the space-to-land boundary; that role is owned by
// the water-shoreline pass that runs later in the genesis pipeline. coastlineTiles
// is populated as the outermost ring of Dirt tiles bordering Space, since several
// later epochs use it as a "tiles at the edge of the landmass" signal (ancient
// seabeds, coastal elevation lowering, ruin placement guards).
const generateLandMask = (
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

// City name fragments for ruin generation
const RUIN_NAME_PREFIXES = ['Ash', 'Old', 'Lost', 'Deep', 'High', 'Iron', 'Salt', 'Dusk', 'Dawn', 'Red']
const RUIN_NAME_SUFFIXES = ['hold', 'gate', 'well', 'ford', 'mere', 'fell', 'reach', 'vale', 'mound', 'barrow']

const generateRuinName = (rng: () => number): string =>
  RUIN_NAME_PREFIXES[Math.floor(rng() * RUIN_NAME_PREFIXES.length)] +
  RUIN_NAME_SUFFIXES[Math.floor(rng() * RUIN_NAME_SUFFIXES.length)]

// Box drawing characters for aqueducts
const BOX_HORIZONTAL = '─'
const BOX_VERTICAL = '│'
const BOX_T_DOWN = '┬'
const BOX_T_UP = '┴'
const BOX_T_RIGHT = '├'
const BOX_T_LEFT = '┤'
const BOX_CROSS = '┼'
const BOX_DOUBLE_H = '═'
const BOX_DOUBLE_V = '║'

const BUILDING_CHARS = ['▓', '▒', '░', '█', '#', '+', 'H', 'T', '=']
const CIV_COLORS = ['#666', '#777', '#888', '#999', '#AAA']

// Crater palette — must match the brown palette in renderer.ts (state.craters
// rendering branch). Kept here so the genesis presentDay epoch can paint
// craters in their post-impact resting color, letting the cross-fade from
// fallOfCivilizations smoothly blend the red SATELLITE_TRAIL_COLORS into
// the brown resting state with no pop on the genesis-to-game handoff.
const CRATER_COLORS = ['#8B4513', '#7A3B10', '#6B320D', '#5C290A', '#4D2007']

// Genesis rendering constants
const ROCK_COLORS = ['#696969', '#6B4226', '#808080', '#7B6B55']
const DIRT_COLORS = ['#8B7355', '#7B6B55', '#806B50']
const BURN_SCAR_COLORS = ['#3D2B1F', '#4A3728', '#352418']
const GREEN_COLORS = ['#2E8B57', '#3CB371', '#50C878']
const BRIGHT_GREEN_COLORS = ['#3CB371', '#50C878', '#66EE88']

// Shared rendering for space tiles (stars — no water in space, it's not ocean).
// coastlineTiles are now a subset of landMask (outermost dirt ring), so they
// fall through the landMask guard and never reach the star path.
// Stars match the gameplay renderer: char is stable per tile, only the
// color slowly cycles via time * 0.0015. Cycling the char would
// flicker faster than the rest of the scene reads as. STAR_DENSITY = 12
// also matches gameplay (was 5 here, which painted twice as many stars
// as the gameplay-renderer's space tiles — now they match).
const renderSpace = (sim: GenesisSimState, key: string, h: number, time: number): GenesisTileRender[] | null => {
  if (sim.landMask.has(key)) return null
  if (h % 12 === 0) {
    const starChars = ['.', '+', '*']
    const starColors = ['#333', '#555', '#777', '#999', '#bbb', '#999', '#777', '#555']
    const phase = (h >> 8) % starColors.length
    const colorIndex = (phase + Math.floor(time * 0.0015)) % starColors.length
    return [{ char: starChars[(h >> 4) % starChars.length], color: starColors[colorIndex], dx: 0, dy: 0 }]
  }
  return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
}

// Threshold the 2D-noise field is compared against. Cell size and amplitude
// below combine with this so a small fraction of inland land joins the mask:
// inland tiles have elevation floored at 40 (LavaEra) plus noise spanning
// roughly [-30, 30], so a threshold of 28 keeps wet area to a few large
// regions rather than washing out the map.
const LOWLAND_WATER_THRESHOLD = 28
// Lattice cell size for the value-noise field. Larger = more coherent blobs.
const LOWLAND_NOISE_CELL = 18
// Noise amplitude. Larger = more variance in where blobs sit relative to
// the LavaEra elevation floor.
const LOWLAND_NOISE_AMPLITUDE = 30

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
const buildLowlandWaterMask = (sim: GenesisSimState): void => {
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

// Shared rendering for lowland water (mask-based, land tiles only).
// The mask is built once during FirstWater.mutate from a seeded 2D
// smooth-noise field; aquatic-phase epochs all read the same coherent
// shape rather than recomputing per-tile hash scatter.
const renderLowlandWater = (sim: GenesisSimState, key: string, h: number, time: number): GenesisTileRender[] | null => {
  if (!sim.lowlandWaterMask.has(key)) return null
  const waterChars = ['~', '=', '-']
  const waterColors = ['#4466AA', '#335588', '#556699']
  const ci = (h + Math.floor(time * 0.003)) % waterChars.length
  const wi = h % waterColors.length
  return [{ char: waterChars[ci], color: waterColors[wi], dx: 0, dy: 0 }]
}

// Shared rendering for bare dirt (accounts for burn scars — darker soil)
const renderDirt = (sim: GenesisSimState, key: string, h: number): GenesisTileRender[] => {
  if (sim.burnScars.has(key)) {
    return [{ char: '.', color: BURN_SCAR_COLORS[h % BURN_SCAR_COLORS.length], dx: 0, dy: 0 }]
  }
  if (sim.glacialPaths.has(key)) {
    return [{ char: '.', color: '#696969', dx: 0, dy: 0 }]
  }
  return [{ char: '.', color: DIRT_COLORS[h % DIRT_COLORS.length], dx: 0, dy: 0 }]
}

// Shared rendering for vegetation (consistent palette across all epochs)
const renderVegetation = (sim: GenesisSimState, x: number, _y: number, h: number): GenesisTileRender[] | null => {
  const key = posKey(x, _y)
  const veg = sim.vegetationMap.get(key) ?? 0
  if (veg <= 20) return null
  const nearRiver = sim.riverPaths.has(posKey(x + 1, _y)) || sim.riverPaths.has(posKey(x - 1, _y))
  const colors = nearRiver ? BRIGHT_GREEN_COLORS : GREEN_COLORS
  return [{ char: '%', color: colors[h % colors.length], dx: 0, dy: 0 }]
}

// ---------------------------------------------------------------------------
// Epoch: Cosmic Formation
// ---------------------------------------------------------------------------

const cosmicFormation: GenesisEpoch = {
  id: GenesisEpochId.CosmicFormation,
  durationMs: 2000,
  commentary: 'Simulating birth of cosmos...',
  mutate: sim => {
    // Fill entire grid with space
    for (let y = 0; y < sim.height; y++) {
      for (let x = 0; x < sim.width; x++) {
        sim.grid[y][x] = { type: TileType.Space }
      }
    }
  },
  renderTile: () => {
    // CosmicFormation visuals are owned by the genesis renderer's
    // full-canvas starfield prepass (paintFullCanvasStarfield in
    // genesisRenderer.ts) so the big bang is centered on the canvas
    // rather than on the sim grid. The sim's per-tile path returns
    // empty so nothing paints from the sim diamond.
    return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
  },
}

// ---------------------------------------------------------------------------
// Epoch: Land Accretion
// ---------------------------------------------------------------------------

const landAccretion: GenesisEpoch = {
  id: GenesisEpochId.LandAccretion,
  durationMs: 2000,
  commentary: 'Dust coalesces...',
  mutate: () => {
    // No grid mutations — purely visual
  },
  renderTile: (sim, x, y, progress, time) => {
    const centerX = sim.width / 2
    const centerY = sim.height / 2
    const d = dist(x, y, centerX, centerY)
    const maxRadius = Math.min(sim.width, sim.height) * 0.35
    const currentRadius = progress * maxRadius
    const h = tileHash(x, y)

    // Soft rim: the outermost ~6 sim tiles of the rock mass scatter
    // into the surrounding starfield via a probabilistic alpha. Without
    // this the rock circle has a hard boundary that reads as a visible
    // cutoff against the prepass-painted stars beyond.
    const RIM_TILES = 6
    if (d <= currentRadius) {
      const distFromRim = currentRadius - d
      if (distFromRim < RIM_TILES) {
        // Inside the rim band: paint rock with probability proportional
        // to how deep into the mass we are. Tiles closer to the rim
        // drop out more often, producing a stochastic fade.
        const rimT = distFromRim / RIM_TILES
        if ((h % 100) / 100 > rimT) {
          // Tile drops out of the rock mass; fall through to the
          // drift-particle branch below so something organic can paint.
        } else {
          const rockChars = ['.', '#', '=', '*']
          const rockColors = ['#8B7355', '#696969', '#808080', '#6B4226']
          const ci = (h + Math.floor(time * 0.002)) % rockChars.length
          const ri = h % rockColors.length
          return [{ char: rockChars[ci], color: rockColors[ri], dx: 0, dy: 0 }]
        }
      } else {
        // Solid mass forming (interior)
        const rockChars = ['.', '#', '=', '*']
        const rockColors = ['#8B7355', '#696969', '#808080', '#6B4226']
        const ci = (h + Math.floor(time * 0.002)) % rockChars.length
        const ri = h % rockColors.length
        return [{ char: rockChars[ci], color: rockColors[ri], dx: 0, dy: 0 }]
      }
    }

    // Particles drifting inward
    const angle = Math.atan2(y - centerY, x - centerX)
    const drift = d - progress * 20
    const particlePhase = (drift * 0.1 + angle * 2 + time * 0.003) % 1

    if (particlePhase > 0.85 && d < maxRadius * 2) {
      return [{ char: '.', color: '#887766', dx: 0, dy: 0 }]
    }

    // Background stars are owned by the genesis renderer's full-canvas
    // starfield prepass (paintFullCanvasStarfield in genesisRenderer.ts)
    // so the sky reads as sky-wide rather than ending at the sim's
    // diamond boundary. Return empty here so the prepass shows through.
    return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
  },
}

// ---------------------------------------------------------------------------
// Epoch: Tectonic Uplift
// ---------------------------------------------------------------------------

const tectonicUplift: GenesisEpoch = {
  id: GenesisEpochId.TectonicUplift,
  durationMs: 2000,
  commentary: 'Plates collide and ranges rise...',
  mutate: sim => {
    if (sim.landMask.size === 0) {
      sim.tectonicAxes = []
      return
    }
    const numAxes = 2 + Math.floor(sim.rng() * 2) // 2-3 axes
    const axes: TectonicAxis[] = []
    const landKeys = [...sim.landMask]

    for (let a = 0; a < numAxes; a++) {
      // Pick a random land tile as start; pick a primary direction.
      const startKey = landKeys[Math.floor(sim.rng() * landKeys.length)]
      const [sxStr, syStr] = startKey.split(',')
      let cx = Number(sxStr)
      let cy = Number(syStr)
      const theta = sim.rng() * Math.PI * 2
      const polyline: Position[] = [{ x: cx, y: cy }]
      const targetLength = 24 + Math.floor(sim.rng() * 16) // 24-40
      let placed = 1
      let walks = 0
      while (placed < targetLength && walks < targetLength * 4) {
        walks++
        // Wobble the step a bit so the ridge isn't ruler-straight
        const wobble = (sim.rng() - 0.5) * 0.6
        const stepX = Math.cos(theta + wobble)
        const stepY = Math.sin(theta + wobble)
        const nx = Math.round(cx + stepX)
        const ny = Math.round(cy + stepY)
        const nk = posKey(nx, ny)
        if (sim.landMask.has(nk) && nk !== posKey(cx, cy)) {
          cx = nx
          cy = ny
          polyline.push({ x: cx, y: cy })
          placed++
        } else {
          // Try a perpendicular nudge to find a way back into landMask
          const perpX = Math.round(cx - stepY)
          const perpY = Math.round(cy + stepX)
          if (sim.landMask.has(posKey(perpX, perpY))) {
            cx = perpX
            cy = perpY
            polyline.push({ x: cx, y: cy })
            placed++
          } else {
            break
          }
        }
      }
      if (polyline.length < 5) continue
      const last = polyline[polyline.length - 1]
      const first = polyline[0]
      const orientation = Math.atan2(last.y - first.y, last.x - first.x)
      axes.push({
        polyline,
        orientationRadians: orientation,
        intensity: 18 + Math.floor(sim.rng() * 6), // peak +18..+23
        radius: 6,
      })
    }
    sim.tectonicAxes = axes

    // Apply cosine-falloff uplift along each axis.
    for (const axis of axes) {
      const r = axis.radius
      // Build a quick lookup of axis tiles for fast distance check
      const axisSet = new Set<string>()
      for (const p of axis.polyline) axisSet.add(posKey(p.x, p.y))
      // For each axis tile, dilate within radius r and apply falloff
      const visited = new Set<string>()
      for (const p of axis.polyline) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const tx = p.x + dx
            const ty = p.y + dy
            const tk = posKey(tx, ty)
            if (!sim.landMask.has(tk)) continue
            if (visited.has(tk)) continue
            // Find min distance from (tx, ty) to any polyline point
            let minD = Infinity
            for (const q of axis.polyline) {
              const d = Math.hypot(tx - q.x, ty - q.y)
              if (d < minD) minD = d
              if (minD === 0) break
            }
            if (minD > r) continue
            visited.add(tk)
            const falloff = Math.cos((minD / r) * (Math.PI / 2)) // 1 at center, 0 at edge
            const lift = axis.intensity * falloff
            const cur = sim.elevation.get(tk) ?? 50
            sim.elevation.set(tk, clamp(cur + lift, 0, 100))
          }
        }
      }
    }

    // Two passes of 3x3 mean diffusion over land tiles to smooth without flattening
    for (let pass = 0; pass < 2; pass++) {
      const next = new Map<string, number>()
      for (const key of sim.landMask) {
        const [xStr, yStr] = key.split(',')
        const x = Number(xStr)
        const y = Number(yStr)
        let sum = 0
        let count = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nk = posKey(x + dx, y + dy)
            if (!sim.landMask.has(nk)) continue
            sum += sim.elevation.get(nk) ?? 50
            count++
          }
        }
        // Blend center with smoothed mean (75% smoothed, 25% original) to keep peaks
        const smoothed = count > 0 ? sum / count : (sim.elevation.get(key) ?? 50)
        const cur = sim.elevation.get(key) ?? 50
        next.set(key, clamp(smoothed * 0.75 + cur * 0.25, 0, 100))
      }
      for (const [k, v] of next) sim.elevation.set(k, v)
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Is this tile within an axis radius? Light up uplift glyphs early in the epoch.
    let onAxis = false
    let axisDist = Infinity
    for (const axis of sim.tectonicAxes) {
      for (const p of axis.polyline) {
        const d = Math.hypot(x - p.x, y - p.y)
        if (d < axisDist) axisDist = d
        if (axisDist <= axis.radius) {
          onAxis = true
        }
      }
      if (onAxis) break
    }

    if (onAxis && progress < 0.7) {
      // Uplift pulse: caret/triangle glyphs in warm rocky tones
      const upliftChars = ['^', 'A', '/', '\\', 'M']
      const upliftColors = ['#8B7355', '#A0826D', '#6B5544', '#5C4D3D', '#9B8262']
      const ci = (h + Math.floor(time * 0.004) + Math.floor(progress * 8)) % upliftChars.length
      const cci = h % upliftColors.length
      return [{ char: upliftChars[ci], color: upliftColors[cci], dx: 0, dy: 0 }]
    }

    return renderDirt(sim, key, h)
  },
}

// ---------------------------------------------------------------------------
// Epoch: Lava Era
// ---------------------------------------------------------------------------

const lavaEra: GenesisEpoch = {
  id: GenesisEpochId.LavaEra,
  durationMs: 2000,
  commentary: 'A kingdom of lava absolute...',
  mutate: sim => {
    // Generate the land mask using the seeded RNG — this produces the final coastline
    const { landMask, coastlineTiles, grid } = generateLandMask(sim.width, sim.height, sim.rng)
    sim.landMask = landMask
    sim.coastlineTiles = coastlineTiles
    sim.grid = grid

    // Generate volcanic heat map using layered noise
    const hNoise1 = smoothNoiseSeeded(sim.width, 30, 10, sim.rng)
    const vNoise1 = smoothNoiseSeeded(sim.height, 30, 10, sim.rng)
    const hNoise2 = smoothNoiseSeeded(sim.width, 15, 20, sim.rng)
    const vNoise2 = smoothNoiseSeeded(sim.height, 15, 20, sim.rng)

    for (const key of landMask) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const heat = clamp(50 + hNoise1[x] + vNoise1[y] + hNoise2[x] + vNoise2[y], 0, 100)
      sim.volcanicHeat.set(key, heat)

      // Volcanic hotspots enrich soil
      if (heat > 70) {
        sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 20)
      }
    }

    // Generate base elevation via 2D fBm value-noise + domain warping.
    // Output range of fbmWarp2D is roughly [-1.75, 1.75]; scale to ~±28.
    const sampleElev = fbmWarp2D(sim.width, sim.height, sim.rng)
    const elevAmplitude = 28

    // Compute centroid of landMask for center bias
    let sumX = 0
    let sumY = 0
    let landCount = 0
    for (const key of landMask) {
      const [xStr, yStr] = key.split(',')
      sumX += Number(xStr)
      sumY += Number(yStr)
      landCount++
    }
    const centroidX = landCount > 0 ? sumX / landCount : sim.width / 2
    const centroidY = landCount > 0 ? sumY / landCount : sim.height / 2
    const maxLandDist = Math.sqrt((sim.width / 2) ** 2 + (sim.height / 2) ** 2)

    for (const key of landMask) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)

      const noise = sampleElev(x, y) * elevAmplitude

      // Center bias: higher near centroid, lower near edges
      const dFromCenter = dist(x, y, centroidX, centroidY)
      const centerBias = lerp(10, -10, clamp(dFromCenter / maxLandDist, 0, 1))

      // Volcanic ridge bonus
      const heat = sim.volcanicHeat.get(key) ?? 50
      const volcanicBonus = heat > 70 ? Math.floor(((heat - 70) / 30) * 15) : 0

      // Floor inland elevation at 40 so the noise itself can't create
      // cosmetic-water tiles. Real water bodies are produced later by
      // hydraulic erosion + ponds + rivers via explicit tracked sets.
      sim.elevation.set(key, clamp(Math.max(40, Math.round(50 + noise + centerBias + volcanicBonus)), 0, 100))
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Lava rendering
    const heat = sim.volcanicHeat.get(key) ?? 50
    const lavaChars = ['~', '=', '^', '*']
    const pulse = Math.sin(time * 0.004 + h * 0.1) * 0.3 + 0.7
    const ci = (h + Math.floor(time * 0.003)) % lavaChars.length

    // Color based on heat — hotter = brighter
    const heatNorm = heat / 100
    const r = Math.floor(lerp(180, 255, heatNorm * pulse))
    const g = Math.floor(lerp(30, 200, heatNorm * pulse * 0.5))
    const b = Math.floor(lerp(0, 50, (1 - heatNorm) * pulse))
    const color = `rgb(${String(r)},${String(g)},${String(b)})`

    // Fade in with progress
    if (progress < 0.15) {
      const fadeIn = progress / 0.15
      if (tileHash(x + 1, y + 1) % 100 > fadeIn * 100) {
        return [{ char: '.', color: '#696969', dx: 0, dy: 0 }]
      }
    }

    return [{ char: lavaChars[ci], color, dx: 0, dy: 0 }]
  },
}

// ---------------------------------------------------------------------------
// Epoch: Crust Cooling
// ---------------------------------------------------------------------------

const crustCooling: GenesisEpoch = {
  id: GenesisEpochId.CrustCooling,
  durationMs: 2000,
  commentary: 'The crust cools...',
  mutate: () => {
    // Visual transition only
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    const heat = sim.volcanicHeat.get(key) ?? 50

    // Cooling progresses from edges inward
    const centerX = sim.width / 2
    const centerY = sim.height / 2
    const d = dist(x, y, centerX, centerY)
    const maxDist = dist(0, 0, centerX, centerY)
    const edgeFactor = d / maxDist // 0 at center, 1 at edges

    // Higher heat and center = cools later
    const coolProgress = clamp(progress * 1.5 - (1 - edgeFactor) * 0.5 - (heat / 100) * 0.3, 0, 1)

    if (coolProgress < 0.3) {
      // Still lava
      const lavaChars = ['~', '=', '^']
      const pulse = Math.sin(time * 0.004 + h * 0.1) * 0.3 + 0.7
      const ci = (h + Math.floor(time * 0.003)) % lavaChars.length
      const heatNorm = heat / 100
      const r = Math.floor(lerp(180, 255, heatNorm * pulse))
      const g = Math.floor(lerp(30, 200, heatNorm * pulse * 0.5))
      const b = 0
      return [{ char: lavaChars[ci], color: `rgb(${String(r)},${String(g)},${String(b)})`, dx: 0, dy: 0 }]
    }

    if (coolProgress < 0.7) {
      // Transitioning — dark red/brown
      const t = (coolProgress - 0.3) / 0.4
      const r = Math.floor(lerp(200, 139, t))
      const g = Math.floor(lerp(50, 115, t))
      const b = Math.floor(lerp(0, 85, t))
      const rockChars = ['#', '=', '.']
      const ci = h % rockChars.length
      return [{ char: rockChars[ci], color: `rgb(${String(r)},${String(g)},${String(b)})`, dx: 0, dy: 0 }]
    }

    // Cooled — dark rock (no dirt yet, that comes with life)
    const rockChars = ['.', '#', '=']
    const ci = h % rockChars.length
    const ri = h % ROCK_COLORS.length

    // Occasional volcanic flare-back
    if (heat > 80 && Math.sin(time * 0.006 + h) > 0.9) {
      return [{ char: '^', color: '#FF4500', dx: 0, dy: 0 }]
    }

    return [{ char: rockChars[ci], color: ROCK_COLORS[ri], dx: 0, dy: 0 }]
  },
}

// ---------------------------------------------------------------------------
// Epoch: First Water
// ---------------------------------------------------------------------------

const firstWater: GenesisEpoch = {
  id: GenesisEpochId.FirstWater,
  durationMs: 2000,
  commentary: 'Oceans gather in the lowlands...',
  mutate: sim => {
    // Mark ancient seabeds — coastline + a band of low-lying inland tiles
    for (const key of sim.coastlineTiles) {
      sim.ancientSeabeds.add(key)
    }

    // Low-lying inland band (tiles just inside the sand boundary)
    for (const key of sim.landMask) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      let nearCoast = false
      for (let dy = -3; dy <= 3 && !nearCoast; dy++) {
        for (let dx = -3; dx <= 3 && !nearCoast; dx++) {
          if (sim.coastlineTiles.has(posKey(x + dx, y + dy))) {
            nearCoast = true
          }
        }
      }
      if (nearCoast) sim.ancientSeabeds.add(key)
    }

    // Ancient seabeds get soil enrichment
    for (const key of sim.ancientSeabeds) {
      if (sim.landMask.has(key)) {
        sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 20)
      }
    }

    // Build the cosmetic lowland-water mask used by aquatic-phase epochs.
    // Coarse seeded 2D smooth noise (separable: row noise + column noise)
    // combined with elevation produces coherent lake/sea blobs instead of
    // the salt-and-pepper blotches the old per-tile hash predicate
    // produced. The mask is computed once here and never mutated again,
    // so IceAge's elevation drop and PostGlacialDieOff's erosion can't
    // unintentionally extend the cosmetic water shape.
    buildLowlandWaterMask(sim)

    // Hydraulic erosion micropass: water finds the steepest path downhill,
    // carving valleys and depositing sediment in the lowlands. Skip ancient
    // seabeds (already at low elevation; further carving would dig holes).
    runHydraulicErosion(sim, {
      iterations: 7,
      carveMult: 0.15,
      maxCarve: 3,
      depositFraction: 0.6,
      enrichSoil: true,
      tileFilter: key => !sim.ancientSeabeds.has(key),
    })
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Water gathers in lowlands — read the mask built in mutate(). Per-tile
    // elevation still drives the progressive reveal so higher-elevation lake
    // edges fill in last, but the spatial shape comes from the coherent mask.
    if (sim.lowlandWaterMask.has(key)) {
      const elev = sim.elevation.get(key) ?? 50
      const waterThreshold = clamp(elev / 100, 0, 1)
      if (progress > waterThreshold) {
        const waterChars = ['~', '=', '-']
        const waterColors = ['#4466AA', '#335588', '#556699']
        const ci = (h + Math.floor(time * 0.003)) % waterChars.length
        const wi = h % waterColors.length
        return [{ char: waterChars[ci], color: waterColors[wi], dx: 0, dy: 0 }]
      }
    }

    // Land — dark rock (dirt only appears after life emerges)
    return [{ char: '.', color: ROCK_COLORS[h % ROCK_COLORS.length], dx: 0, dy: 0 }]
  },
}

// ---------------------------------------------------------------------------
// Epoch: Emergence of Life
// ---------------------------------------------------------------------------

const emergenceOfLife: GenesisEpoch = {
  id: GenesisEpochId.EmergenceOfLife,
  durationMs: 2000,
  commentary: 'Primordial life emerges...',
  mutate: sim => {
    // Spread vegetation across all land — denser near water, thinner inland
    for (const key of sim.landMask) {
      const elev = sim.elevation.get(key) ?? 50
      // Lower elevation = more moisture = denser vegetation
      // All land gets meaningful vegetation (no bare inland gaps)
      const baseVeg = elev < 40 ? 70 : elev < 60 ? 55 : 40
      sim.vegetationMap.set(key, baseVeg + Math.floor(sim.rng() * 30))
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 5)
    }
    applyWindwardLeewardBias(sim, 5, -3, 10, -10)
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Lowland water persists from first water epoch — life grows around it
    const water = renderLowlandWater(sim, key, h, time)
    if (water) return water

    // Green spreads from lowlands outward — life emerges near water first
    const elev = sim.elevation.get(key) ?? 50
    const scatter = (h % 25) - 12 + (((h >>> 8) % 15) - 7)
    const greenThreshold = clamp((elev + scatter - 40) / 60, 0, 0.9)
    if (progress > greenThreshold && (sim.vegetationMap.get(key) ?? 0) > 20) {
      const greenColors = ['#2E8B57', '#3CB371', '#50C878']
      const gi = h % greenColors.length
      return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
    }

    // Bare land transitions from dark rock to dirt as life spreads
    const rockToDirt = clamp(progress * 1.5, 0, 1)
    if (rockToDirt < 1) {
      return [{ char: '.', color: ROCK_COLORS[h % ROCK_COLORS.length], dx: 0, dy: 0 }]
    }
    return [{ char: '.', color: DIRT_COLORS[h % DIRT_COLORS.length], dx: 0, dy: 0 }]
  },
}

// ---------------------------------------------------------------------------
// Epoch: Fire Season
// ---------------------------------------------------------------------------

const SATELLITE_CRASH_RADIUS = 2 // 5x5 zone
const SATELLITE_CRASH_MIN = 3
const SATELLITE_CRASH_MAX = 9

/** Generate a satellite crash streak targeting a specific land position. */
const createSatelliteCrashStreak = (
  sim: GenesisSimState,
  impactX: number,
  impactY: number,
  index: number,
  total: number
): GenesisSatelliteCrash => {
  const directions = [
    { dx: 1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
  ]
  const dir = directions[Math.floor(sim.rng() * directions.length)]

  let sx = impactX
  let sy = impactY
  while (sx >= -5 && sx < sim.width + 5 && sy >= -5 && sy < sim.height + 5) {
    sx -= dir.dx
    sy -= dir.dy
  }

  // Satellites are heavier than meteorites — longer trails
  const length = 8 + Math.floor(sim.rng() * 5)
  // Each crash animates over 50% of the epoch (see renderTile). Stagger
  // starts across the first 50% so the latest crash still finishes by
  // the crossfade boundary while the per-streak fall remains slow and
  // dramatic regardless of crash count.
  const startTime = total > 1 ? (index / (total - 1)) * 0.5 : 0.1

  return { startX: sx, startY: sy, dx: dir.dx, dy: dir.dy, impactX, impactY, length, startTime }
}

/** Generate a meteorite streak targeting a specific land position. */
const createMeteorStreak = (
  sim: GenesisSimState,
  impactX: number,
  impactY: number,
  index: number
): GenesisMeteorStreak => {
  // Pick a radiant direction
  const directions = [
    { dx: 1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ]
  const dir = directions[Math.floor(sim.rng() * directions.length)]

  // Trace backward from impact to find off-map start
  let sx = impactX
  let sy = impactY
  while (sx >= -5 && sx < sim.width + 5 && sy >= -5 && sy < sim.height + 5) {
    sx -= dir.dx
    sy -= dir.dy
  }

  const length = 3 + Math.floor(sim.rng() * 4)
  // Stagger start times across the first 30% of the epoch
  const startTime = (index / 8) * 0.3

  return { startX: sx, startY: sy, dx: dir.dx, dy: dir.dy, impactX, impactY, length, startTime }
}

const fireSeason: GenesisEpoch = {
  id: GenesisEpochId.FireSeason,
  durationMs: 2000,
  commentary: 'The sky falls...',
  mutate: sim => {
    const landKeys = [...sim.landMask]

    // Generate 5-8 meteorite impact targets on land
    const numMeteors = 5 + Math.floor(sim.rng() * 4)
    const impactKeys: string[] = []

    for (let i = 0; i < numMeteors; i++) {
      // Pick a vegetated land tile for maximum drama
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = landKeys[Math.floor(sim.rng() * landKeys.length)]
        const veg = sim.vegetationMap.get(candidate) ?? 0
        if (veg > 20) {
          impactKeys.push(candidate)
          break
        }
        // Last resort: any land tile
        if (attempt === 49) {
          impactKeys.push(candidate)
        }
      }
    }

    // Fallback: ensure at least 2 ignition points
    while (impactKeys.length < 2) {
      impactKeys.push(landKeys[Math.floor(sim.rng() * landKeys.length)])
    }

    // Create meteorite streak data for rendering
    for (let i = 0; i < impactKeys.length; i++) {
      const [xStr, yStr] = impactKeys[i].split(',')
      sim.meteorites.push(createMeteorStreak(sim, Number(xStr), Number(yStr), i))
    }

    // Generate 2-4 lightning bolts alongside meteorites
    const numBolts = 2 + Math.floor(sim.rng() * 3)
    for (let i = 0; i < numBolts; i++) {
      // Pick a vegetated land tile for the strike
      let boltKey: string | null = null
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = landKeys[Math.floor(sim.rng() * landKeys.length)]
        const veg = sim.vegetationMap.get(candidate) ?? 0
        if (veg > 20 || attempt === 49) {
          boltKey = candidate
          break
        }
      }
      if (!boltKey) continue

      // Add to fire BFS ignition queue
      impactKeys.push(boltKey)

      const [bxStr, byStr] = boltKey.split(',')
      const bx = Number(bxStr)
      const by = Number(byStr)
      const length =
        LIGHTNING_BOLT_MIN_LENGTH + Math.floor(sim.rng() * (LIGHTNING_BOLT_MAX_LENGTH - LIGHTNING_BOLT_MIN_LENGTH + 1))
      const { path, branch } = generateBoltPath(bx, by, length, sim.rng)

      // Stagger start times to interleave with meteorites
      const startTime = 0.05 + (i / numBolts) * 0.25

      sim.lightningBolts.push({ impactX: bx, impactY: by, path, branch, startTime })
    }

    // BFS fire spread from each impact point
    const burned = new Set<string>()
    const queue = [...impactKeys]
    const maxBurn = Math.floor(landKeys.length * 0.6)

    while (queue.length > 0 && burned.size < maxBurn) {
      const key = queue.shift()
      if (!key) continue
      if (burned.has(key)) continue
      const veg = sim.vegetationMap.get(key) ?? 0
      if (veg < 10) continue

      burned.add(key)

      const [xStr, yStr] = key.split(',')
      const bx = Number(xStr)
      const by = Number(yStr)

      // Spread to neighbors — higher probability than before (veg/90 vs veg/120)
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      for (const [ddx, ddy] of dirs) {
        const nk = posKey(bx + ddx, by + ddy)
        if (!burned.has(nk) && sim.landMask.has(nk)) {
          const nVeg = sim.vegetationMap.get(nk) ?? 0
          if (sim.rng() < nVeg / 90) {
            queue.push(nk)
          }
        }
      }
    }

    // Apply burn effects
    for (const key of burned) {
      sim.burnScars.add(key)
      sim.vegetationMap.set(key, 0)
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 10)
    }

    // Edge effect for survivors
    for (const key of sim.landMask) {
      if (!burned.has(key)) {
        const [xStr, yStr] = key.split(',')
        const sx = Number(xStr)
        const sy = Number(yStr)
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
        for (const [ddx, ddy] of dirs) {
          if (burned.has(posKey(sx + ddx, sy + ddy))) {
            sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 3)
            break
          }
        }
      }
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    // Meteorite streaks render over everything (including space)
    for (const meteor of sim.meteorites) {
      // How far along is this meteor? Each animates over ~15% of epoch duration
      const meteorProgress = clamp((progress - meteor.startTime) / 0.15, 0, 1)
      if (meteorProgress <= 0 || meteorProgress >= 1) continue

      // Current head position interpolated from start to impact
      const totalSteps = Math.abs(meteor.impactX - meteor.startX) + Math.abs(meteor.impactY - meteor.startY)
      const currentStep = Math.floor(meteorProgress * totalSteps)
      const headX = meteor.startX + meteor.dx * currentStep
      const headY = meteor.startY + meteor.dy * currentStep

      // Check if this tile is the head or trail
      for (let t = 0; t < meteor.length; t++) {
        const tx = headX - meteor.dx * t
        const ty = headY - meteor.dy * t
        if (tx === x && ty === y) {
          if (t === 0) {
            return [{ char: '*', color: '#FFFFFF', dx: 0, dy: 0 }]
          }
          const trailChars = ['.', '·', ',']
          const trailColors = ['#FFD700', '#FF6347', '#FF4500']
          return [{ char: trailChars[t % trailChars.length], color: trailColors[t % trailColors.length], dx: 0, dy: 0 }]
        }
      }

      // Impact explosion flash
      if (meteorProgress > 0.9) {
        const impactDist = Math.abs(x - meteor.impactX) + Math.abs(y - meteor.impactY)
        if (impactDist <= 2) {
          const flashChars = ['*', '+', '·']
          const flashColors = ['#FFFFFF', '#FFD700', '#FF4500']
          return [
            {
              char: flashChars[impactDist % flashChars.length],
              color: flashColors[impactDist % flashColors.length],
              dx: 0,
              dy: 0,
            },
          ]
        }
      }
    }

    // Lightning bolt rendering (vertical bolts, faster than meteorites)
    for (const bolt of sim.lightningBolts) {
      const boltProgress = clamp((progress - bolt.startTime) / 0.1, 0, 1)
      if (boltProgress <= 0 || boltProgress >= 1) continue

      // Check if this tile is on the bolt path
      for (let i = 0; i < bolt.path.length; i++) {
        if (bolt.path[i].x === x && bolt.path[i].y === y) {
          const bdx = i > 0 ? bolt.path[i].x - bolt.path[i - 1].x : 0
          const boltChar = bdx === 0 ? '|' : bdx > 0 ? '\\' : '/'
          if (boltProgress < 0.3) {
            return [{ char: boltChar, color: LIGHTNING_BOLT_COLOR_BRIGHT, dx: 0, dy: 0 }]
          } else if (boltProgress < 0.7) {
            return [{ char: boltChar, color: LIGHTNING_BOLT_COLOR_MID, dx: 0, dy: 0 }]
          } else {
            return [{ char: boltChar, color: LIGHTNING_BOLT_COLOR_DIM, dx: 0, dy: 0 }]
          }
        }
      }

      // Check branch
      if (bolt.branch) {
        for (const bp of bolt.branch) {
          if (bp.x === x && bp.y === y) {
            const bcolor =
              boltProgress < 0.3
                ? LIGHTNING_BOLT_COLOR_BRIGHT
                : boltProgress < 0.7
                  ? LIGHTNING_BOLT_COLOR_MID
                  : LIGHTNING_BOLT_COLOR_DIM
            return [{ char: '/', color: bcolor, dx: 0, dy: 0 }]
          }
        }
      }

      // Impact flash
      if (boltProgress > 0.9) {
        const boltDist = Math.abs(x - bolt.impactX) + Math.abs(y - bolt.impactY)
        if (boltDist <= 2) {
          const bFlashChars = ['*', '+', '·']
          const bFlashColors = ['#FFFFFF', '#E0E0FF', '#8888CC']
          return [
            {
              char: bFlashChars[boltDist % bFlashChars.length],
              color: bFlashColors[boltDist % bFlashColors.length],
              dx: 0,
              dy: 0,
            },
          ]
        }
      }
    }

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Lowland water persists
    const water = renderLowlandWater(sim, key, h, time)
    if (water) return water

    // Fire visuals start after meteor shower phase (30% into epoch)
    const isBurned = sim.burnScars.has(key)
    const burnDelay = 0.3 + ((h % 100) / 100) * 0.3

    if (isBurned) {
      if (progress > burnDelay) {
        const burnProgress = clamp((progress - burnDelay) / 0.4, 0, 1)

        if (burnProgress < 0.5) {
          // Active fire
          const fireChars = ['^', '~', '*']
          const fireColors = ['#FF4500', '#FF6347', '#FFD700']
          const ci = (h + Math.floor(time * 0.005)) % fireChars.length
          const fi = h % fireColors.length
          return [{ char: fireChars[ci], color: fireColors[fi], dx: 0, dy: 0 }]
        }

        // Aftermath — charred
        return [{ char: '.', color: '#3D2B1F', dx: 0, dy: 0 }]
      }

      // Before fire reaches this tile — show as it looked before (river-aware palette)
      const nearRiver = sim.riverPaths.has(posKey(x + 1, y)) || sim.riverPaths.has(posKey(x - 1, y))
      const preFireColors = nearRiver ? BRIGHT_GREEN_COLORS : GREEN_COLORS
      return [{ char: '%', color: preFireColors[h % preFireColors.length], dx: 0, dy: 0 }]
    }

    // Unburned — show vegetation
    const vegRender = renderVegetation(sim, x, y, h)
    if (vegRender) return vegRender

    return [{ char: '.', color: DIRT_COLORS[h % DIRT_COLORS.length], dx: 0, dy: 0 }]
  },
}

// ---------------------------------------------------------------------------
// Epoch: Regrowth
// ---------------------------------------------------------------------------

const regrowth: GenesisEpoch = {
  id: GenesisEpochId.Regrowth,
  durationMs: 2000,
  commentary: 'Life grows back...',
  mutate: sim => {
    // Ash enrichment only — no vegetation regrowth. land stays barren into ice age.
    for (const key of sim.burnScars) {
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 5)
    }
    applyWindwardLeewardBias(sim, 3, -2, 0, 0)
  },
  renderTile: (sim, x, y, _progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Lowland water persists
    const water = renderLowlandWater(sim, key, h, time)
    if (water) return water

    // Surviving vegetation
    const veg = renderVegetation(sim, x, y, h)
    if (veg) return veg

    return renderDirt(sim, key, h)
  },
}

// ---------------------------------------------------------------------------
// Epoch: Ice Age
// ---------------------------------------------------------------------------

const iceAge: GenesisEpoch = {
  id: GenesisEpochId.IceAge,
  durationMs: 2000,
  commentary: 'Glaciers advance, carving the land...',
  mutate: sim => {
    // Snapshot vegetation before glaciers destroy it (for dramatic render)
    for (const [key, value] of sim.vegetationMap) {
      sim.preGlacialVegetation.set(key, value)
    }

    // Generate smooth noise for glacier edges (organic lobes, not sawtooth)
    sim.glacialEdgeNoise = {
      top: smoothNoiseSeeded(sim.width, 7, 12, sim.rng),
      bottom: smoothNoiseSeeded(sim.width, 7, 12, sim.rng),
    }

    // Glaciers advance from top and bottom
    const glacialDepth = Math.floor(sim.height * 0.2)

    for (const key of sim.landMask) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const topDist = y - SPACE_BORDER
      const bottomDist = sim.height - SPACE_BORDER - y

      // Is this tile in the glacial zone?
      const inGlacial = topDist < glacialDepth + 8 || bottomDist < glacialDepth + 8

      if (inGlacial) {
        // Smooth noise edge offsets per column
        const topNoise = sim.glacialEdgeNoise.top[x] ?? 0
        const bottomNoise = sim.glacialEdgeNoise.bottom[x] ?? 0

        const effectiveTopDepth = glacialDepth + topNoise
        const effectiveBottomDepth = glacialDepth + bottomNoise

        if (topDist < effectiveTopDepth || bottomDist < effectiveBottomDepth) {
          sim.glacialPaths.add(key)
          sim.soilHealth.set(key, Math.max(10, (sim.soilHealth.get(key) ?? 30) - 15))
          sim.vegetationMap.set(key, 0)

          // Glaciers carve valleys — lower elevation
          const currentElev = sim.elevation.get(key) ?? 50
          sim.elevation.set(key, clamp(currentElev - 15, 0, 100))

          // Random patches hit minimum
          const h = tileHash(x, y)
          if (h % 7 === 0) {
            sim.soilHealth.set(key, 10)
          }
        }
      }
    }

    // Deposit moraines at glacier terminal edges (slight elevation bump)
    for (const key of sim.glacialPaths) {
      const [xStr, yStr] = key.split(',')
      const gx = Number(xStr)
      const gy = Number(yStr)
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      for (const [ddx, ddy] of dirs) {
        const nk = posKey(gx + ddx, gy + ddy)
        if (sim.landMask.has(nk) && !sim.glacialPaths.has(nk)) {
          const nElev = sim.elevation.get(nk) ?? 50
          sim.elevation.set(nk, clamp(nElev + 5, 0, 100))
        }
      }
    }

    // Generate meltwater pools at glacier edges
    const edgeTiles: string[] = []
    for (const key of sim.glacialPaths) {
      const [xStr, yStr] = key.split(',')
      const gx = Number(xStr)
      const gy = Number(yStr)
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      for (const [ddx, ddy] of dirs) {
        const nk = posKey(gx + ddx, gy + ddy)
        if (sim.landMask.has(nk) && !sim.glacialPaths.has(nk)) {
          edgeTiles.push(nk)
          break
        }
      }
    }
    // Pick a few melt pool sites
    const numMeltPools = 3 + Math.floor(sim.rng() * 4)
    for (let i = 0; i < numMeltPools && edgeTiles.length > 0; i++) {
      const idx = Math.floor(sim.rng() * edgeTiles.length)
      const poolCenter = edgeTiles[idx]
      sim.meltPools.add(poolCenter)
      // Small cluster around center
      const [pxStr, pyStr] = poolCenter.split(',')
      const px = Number(pxStr)
      const py = Number(pyStr)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nk = posKey(px + dx, py + dy)
          if (sim.landMask.has(nk) && !sim.glacialPaths.has(nk) && sim.rng() < 0.5) {
            sim.meltPools.add(nk)
          }
        }
      }
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    const isGlacial = sim.glacialPaths.has(key)

    if (isGlacial) {
      // Glaciers only advance during ice age — no recede until warm period
      const advanceProgress = clamp(progress, 0, 1)

      const [, yStr] = key.split(',')
      const ty = Number(yStr)
      const glacialDepth = Math.floor(sim.height * 0.2)
      const topNoise = sim.glacialEdgeNoise.top[x] ?? 0
      const bottomNoise = sim.glacialEdgeNoise.bottom[x] ?? 0
      const effectiveTopDepth = glacialDepth + topNoise
      const effectiveBottomDepth = glacialDepth + bottomNoise
      const topDist = ty - SPACE_BORDER
      const bottomDist = sim.height - SPACE_BORDER - ty
      const minDist = topDist < bottomDist ? topDist : bottomDist
      const effectiveDepth = topDist < bottomDist ? effectiveTopDepth : effectiveBottomDepth
      const coverThreshold = clamp(minDist / effectiveDepth, 0, 1)

      if (advanceProgress > coverThreshold) {
        // Ice
        const iceChars = ['#', '=', '.', '*']
        const iceColors = ['#B0C4DE', '#E0E8F0', '#FFFFFF', '#ADD8E6']
        const ci = (h + Math.floor(time * 0.002)) % iceChars.length
        const ii = h % iceColors.length
        return [{ char: iceChars[ci], color: iceColors[ii], dx: 0, dy: 0 }]
      }

      // Ahead of glacier front — show pre-glacial state
      const preVeg = sim.preGlacialVegetation.get(key) ?? 0
      if (preVeg > 20) {
        const greenColors = ['#2E8B57', '#3CB371', '#50C878']
        const gi = h % greenColors.length
        return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
      }
      return renderDirt(sim, key, h)
    }

    // Lowland water freezes gradually as glaciers advance nearby
    const lowWater = renderLowlandWater(sim, key, h, time)
    if (lowWater) {
      const [, yStr] = key.split(',')
      const ty = Number(yStr)
      const glacialDepth = Math.floor(sim.height * 0.2)
      const topDist = ty - SPACE_BORDER
      const bottomDist = sim.height - SPACE_BORDER - ty
      const minDist = Math.min(topDist, bottomDist)
      // Water freezes at the same rate as glacier advance but reaches slightly further
      const freezeThreshold = clamp(minDist / (glacialDepth * 1.3), 0, 1)
      // Add per-tile scatter so freezing isn't uniform
      const scatter = ((h % 10) - 5) / 100
      if (progress > freezeThreshold + scatter) {
        const iceChars = ['#', '=', '.']
        const iceColors = ['#B0C4DE', '#E0E8F0', '#ADD8E6']
        const ci = (h + Math.floor(time * 0.002)) % iceChars.length
        const ii = h % iceColors.length
        return [{ char: iceChars[ci], color: iceColors[ii], dx: 0, dy: 0 }]
      }
      return lowWater
    }

    // Non-glacial tiles — vegetationMap is intact for these (only glacial tiles were cleared)
    const vegRender = renderVegetation(sim, x, y, h)
    if (vegRender) return vegRender

    return renderDirt(sim, key, h)
  },
}

// ---------------------------------------------------------------------------
// Epoch: Post-Glacial Die-Off
// ---------------------------------------------------------------------------

const postGlacialDieOff: GenesisEpoch = {
  id: GenesisEpochId.PostGlacialDieOff,
  durationMs: 2000,
  commentary: 'An extinction event...',
  mutate: sim => {
    // Kill 60-70% of remaining vegetation, weighted by distance from water
    for (const key of sim.landMask) {
      const veg = sim.vegetationMap.get(key) ?? 0
      if (veg <= 0) continue

      // Coastal areas survive better
      const isNearCoast = sim.ancientSeabeds.has(key)
      const surviveChance = isNearCoast ? 0.6 : 0.3

      if (sim.rng() > surviveChance) {
        sim.vegetationMap.set(key, 0)
        // Mass decomposition enriches soil
        sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 8)
      }
    }

    // Glacial recession erosion: meltwater drains from the retreating ice
    // sheet and carves U-shaped valleys. Operates on glacial tiles and their
    // immediate neighbors. No soil enrichment — meltwater is sterile.
    const recessionFilter = (key: string): boolean => {
      if (sim.glacialPaths.has(key)) return true
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          if (sim.glacialPaths.has(posKey(x + dx, y + dy))) return true
        }
      }
      return false
    }
    runHydraulicErosion(sim, {
      iterations: 5,
      carveMult: 0.2,
      maxCarve: 4,
      depositFraction: 1.0,
      enrichSoil: false,
      tileFilter: recessionFilter,
    })
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Glaciers persist through the extinction — animated to match ice age
    if (sim.glacialPaths.has(key)) {
      const iceChars = ['#', '=', '.', '*']
      const iceColors = ['#B0C4DE', '#E0E8F0', '#FFFFFF', '#ADD8E6']
      const ci = (h + Math.floor(time * 0.002)) % iceChars.length
      const ii = h % iceColors.length
      return [{ char: iceChars[ci], color: iceColors[ii], dx: 0, dy: 0 }]
    }

    // Lowland water stays frozen during extinction
    const lowWater = renderLowlandWater(sim, key, h, time)
    if (lowWater) {
      const iceChars = ['#', '=', '.']
      const iceColors = ['#B0C4DE', '#E0E8F0', '#ADD8E6']
      const ci = (h + Math.floor(time * 0.002)) % iceChars.length
      const ii = h % iceColors.length
      return [{ char: iceChars[ci], color: iceColors[ii], dx: 0, dy: 0 }]
    }

    const veg = sim.vegetationMap.get(key) ?? 0
    const dieDelay = ((h % 100) / 100) * 0.5

    if (veg <= 0 && progress > dieDelay) {
      // Dying animation: green → brown → black → fading
      const dieProgress = clamp((progress - dieDelay) / 0.5, 0, 1)

      if (dieProgress < 0.3) {
        return [{ char: '%', color: '#8B6914', dx: 0, dy: 0 }]
      }
      if (dieProgress < 0.6) {
        return [{ char: '.', color: '#2A1A0A', dx: 0, dy: 0 }]
      }
      return [{ char: '.', color: '#4A3728', dx: 0, dy: 0 }]
    }

    // Surviving vegetation
    if (veg > 20) {
      const greenColors = ['#2E8B57', '#3CB371', '#50C878']
      const gi = h % greenColors.length
      return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
    }

    return renderDirt(sim, key, h)
  },
}

// ---------------------------------------------------------------------------
// Epoch: Warm Period
// ---------------------------------------------------------------------------

const warmPeriod: GenesisEpoch = {
  id: GenesisEpochId.WarmPeriod,
  durationMs: 2000,
  commentary: 'Glaciers melt and life continues...',
  mutate: sim => {
    const landKeys = [...sim.landMask]

    // Generate rivers via steepest-descent from glacier melt sources
    const numRivers = 2 + Math.floor(sim.rng() * 3)

    // River sources: melt pool tiles and high-elevation tiles near glacier edges
    const riverSources: string[] = [...sim.meltPools]
    for (let attempt = 0; attempt < 50 && riverSources.length < numRivers * 2; attempt++) {
      const candidate = landKeys[Math.floor(sim.rng() * landKeys.length)]
      const elev = sim.elevation.get(candidate) ?? 50
      if (elev > 65 && !sim.glacialPaths.has(candidate) && !sim.riverPaths.has(candidate)) {
        riverSources.push(candidate)
      }
    }

    const cardinalDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]

    for (let r = 0; r < numRivers && riverSources.length > 0; r++) {
      const sourceIdx = Math.floor(sim.rng() * riverSources.length)
      const startKey = riverSources.splice(sourceIdx, 1)[0]
      const [sxStr, syStr] = startKey.split(',')
      let rx = Number(sxStr)
      let ry = Number(syStr)
      const riverPath: { x: number; y: number }[] = []
      const visited = new Set<string>()

      // Steepest-descent walk
      for (let step = 0; step < 300; step++) {
        const key = posKey(rx, ry)
        if (visited.has(key)) break
        visited.add(key)
        sim.riverPaths.add(key)
        riverPath.push({ x: rx, y: ry })

        // Erode: lower elevation along river path
        const currentElev = sim.elevation.get(key) ?? 50
        sim.elevation.set(key, clamp(currentElev - 2, 0, 100))

        // Find lowest and second-lowest neighbors
        let bestKey: string | null = null
        let bestElev = Infinity
        let secondBestKey: string | null = null
        let secondBestElev = Infinity

        for (const [ddx, ddy] of cardinalDirs) {
          const nx = rx + ddx
          const ny = ry + ddy
          const nk = posKey(nx, ny)
          if (!sim.landMask.has(nk) || visited.has(nk)) continue
          const nElev = sim.elevation.get(nk) ?? 50
          if (nElev < bestElev) {
            secondBestKey = bestKey
            secondBestElev = bestElev
            bestKey = nk
            bestElev = nElev
          } else if (nElev < secondBestElev) {
            secondBestKey = nk
            secondBestElev = nElev
          }
        }

        // No valid neighbor — river pools here (local minimum)
        if (!bestKey) break

        // 20% chance to pick second-best for natural meandering
        const chosenKey = secondBestKey && sim.rng() < 0.2 ? secondBestKey : bestKey
        const [nxStr, nyStr] = chosenKey.split(',')
        rx = Number(nxStr)
        ry = Number(nyStr)
      }

      sim.riverPathsOrdered.push(riverPath)

      // River adjacency enrichment
      for (const key of visited) {
        const [pxStr, pyStr] = key.split(',')
        const px = Number(pxStr)
        const py = Number(pyStr)
        const enrichDirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ]
        for (const [ddx, ddy] of enrichDirs) {
          const nk = posKey(px + ddx, py + ddy)
          if (sim.landMask.has(nk) && !sim.riverPaths.has(nk)) {
            sim.soilHealth.set(nk, (sim.soilHealth.get(nk) ?? 30) + 10)
          }
        }
      }
    }

    // Elevation-driven pond generation: find local minima, flood upward
    const waterBudget = Math.floor(sim.landMask.size * 0.05)
    const minima: { key: string; elev: number }[] = []

    for (const key of sim.landMask) {
      if (sim.riverPaths.has(key)) continue
      const elev = sim.elevation.get(key) ?? 50
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      let isMinimum = true
      for (const [ddx, ddy] of cardinalDirs) {
        const nk = posKey(x + ddx, y + ddy)
        const nElev = sim.elevation.get(nk)
        if (nElev !== undefined && nElev < elev) {
          isMinimum = false
          break
        }
      }
      if (isMinimum) minima.push({ key, elev })
    }

    // Sort by elevation (lowest first — deepest basins fill first)
    minima.sort((a, b) => a.elev - b.elev)

    let totalWaterTiles = 0
    const MAX_POND_SIZE = 200

    for (const min of minima) {
      if (totalWaterTiles >= waterBudget) break
      if (sim.ponds.has(min.key)) continue

      // Rising water BFS with visited tracking to prevent queue explosion
      const pondTiles = new Set<string>()
      const visited = new Set<string>()
      let waterLevel = min.elev
      let frontier = [min.key]
      visited.add(min.key)

      while (pondTiles.size < MAX_POND_SIZE && totalWaterTiles + pondTiles.size < waterBudget) {
        let expanded = false
        const nextFrontier: string[] = []

        while (frontier.length > 0) {
          if (pondTiles.size >= MAX_POND_SIZE || totalWaterTiles + pondTiles.size >= waterBudget) break
          const tk = frontier.pop()
          if (!tk || pondTiles.has(tk)) continue
          if (!sim.landMask.has(tk) || sim.riverPaths.has(tk)) continue
          const tElev = sim.elevation.get(tk) ?? 50
          if (tElev > waterLevel) {
            nextFrontier.push(tk)
            continue
          }

          pondTiles.add(tk)
          expanded = true

          const [xStr, yStr] = tk.split(',')
          const x = Number(xStr)
          const y = Number(yStr)
          for (const [ddx, ddy] of cardinalDirs) {
            const nk = posKey(x + ddx, y + ddy)
            if (!visited.has(nk)) {
              visited.add(nk)
              frontier.push(nk)
            }
          }
        }

        if (!expanded && nextFrontier.length === 0) break
        waterLevel++
        if (waterLevel > 100) break
        frontier = nextFrontier
      }

      // Skip tiny ponds (< 3 tiles)
      if (pondTiles.size < 3) continue

      for (const pk of pondTiles) {
        sim.ponds.add(pk)
      }
      totalWaterTiles += pondTiles.size
    }

    // Pond adjacency soil enrichment
    for (const pk of sim.ponds) {
      const [pxStr, pyStr] = pk.split(',')
      const px = Number(pxStr)
      const py = Number(pyStr)
      for (const [ddx, ddy] of cardinalDirs) {
        const nk = posKey(px + ddx, py + ddy)
        if (sim.landMask.has(nk) && !sim.ponds.has(nk) && !sim.riverPaths.has(nk)) {
          sim.soilHealth.set(nk, (sim.soilHealth.get(nk) ?? 30) + 8)
        }
      }
    }

    // Life rebounds — all dirt gets baseline enrichment
    for (const key of sim.landMask) {
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 5)

      // Re-spread vegetation from coast and rivers
      if (sim.vegetationMap.get(key) === 0 || (sim.vegetationMap.get(key) ?? 0) < 20) {
        const isNearWater = sim.riverPaths.has(key) || sim.ancientSeabeds.has(key) || sim.ponds.has(key)
        if (isNearWater) {
          sim.vegetationMap.set(key, 60 + Math.floor(sim.rng() * 30))
        } else {
          sim.vegetationMap.set(key, 30 + Math.floor(sim.rng() * 30))
        }
      }
    }

    // Optional second fire (30% chance)
    if (sim.rng() < 0.3) {
      sim.secondFireOccurred = true
      const fireStart = landKeys[Math.floor(sim.rng() * landKeys.length)]
      const [fxStr, fyStr] = fireStart.split(',')
      const fx = Number(fxStr)
      const fy = Number(fyStr)
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const nk = posKey(fx + dx, fy + dy)
          if (sim.landMask.has(nk) && dist(fx, fy, fx + dx, fy + dy) < 8) {
            if (sim.rng() < 0.5) {
              sim.soilHealth.set(nk, (sim.soilHealth.get(nk) ?? 30) + 8)
              sim.vegetationMap.set(nk, Math.max(0, (sim.vegetationMap.get(nk) ?? 0) - 30))
            }
          }
        }
      }
    }

    applyWindwardLeewardBias(sim, 5, -3, 10, -10)
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Glaciers melt from equator-facing side first — same animation as ice age advance, reversed
    if (sim.glacialPaths.has(key)) {
      const recedeProgress = clamp(progress, 0, 1)

      const [, yStr] = key.split(',')
      const ty = Number(yStr)
      const glacialDepth = Math.floor(sim.height * 0.2)
      const topNoise = sim.glacialEdgeNoise.top[x] ?? 0
      const bottomNoise = sim.glacialEdgeNoise.bottom[x] ?? 0
      const effectiveTopDepth = glacialDepth + topNoise
      const effectiveBottomDepth = glacialDepth + bottomNoise
      const topDist = ty - SPACE_BORDER
      const bottomDist = sim.height - SPACE_BORDER - ty
      const minDist = topDist < bottomDist ? topDist : bottomDist
      const effectiveDepth = topDist < bottomDist ? effectiveTopDepth : effectiveBottomDepth
      // coverThreshold: 0 at pole edge, 1 at deepest reach (equator side)
      const coverThreshold = clamp(minDist / effectiveDepth, 0, 1)

      // Melt from equator inward: deepest tiles (highest coverThreshold) melt first
      // When recedeProgress > (1 - coverThreshold), the tile has melted
      if (recedeProgress < 1 - coverThreshold * 0.8) {
        // Still frozen
        const iceChars = ['#', '=', '.', '*']
        const iceColors = ['#B0C4DE', '#E0E8F0', '#FFFFFF', '#ADD8E6']
        const ci = (h + Math.floor(time * 0.002)) % iceChars.length
        const ii = h % iceColors.length
        return [{ char: iceChars[ci], color: iceColors[ii], dx: 0, dy: 0 }]
      }

      // Melted — life regrows in exposed dirt
      const meltTime = 1 - coverThreshold * 0.8
      const regrowProgress = clamp((progress - meltTime) / 0.3, 0, 1)
      if (regrowProgress > 0.5 && h % 3 !== 0) {
        const greenColors = ['#2E8B57', '#3CB371', '#50C878']
        const gi = h % greenColors.length
        return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
      }
      return [{ char: '.', color: '#696969', dx: 0, dy: 0 }]
    }

    // Rivers reveal progressively — use Set for O(1) lookup, hash for staggered timing
    if (sim.riverPaths.has(key)) {
      // Stagger reveal: each river tile appears based on its position hash
      const revealDelay = ((h % 100) / 100) * 0.6
      if (progress > revealDelay) {
        const waterChars = ['~', '=', '-']
        const ci = (h + Math.floor(time * 0.004)) % waterChars.length
        return [{ char: waterChars[ci], color: '#6688BB', dx: 0, dy: 0 }]
      }
    }

    // Ponds appear after rivers (at 50% progress)
    if (sim.ponds.has(key) && progress > 0.5) {
      const pondDelay = 0.5 + (h % 50) / 100
      if (progress > pondDelay) {
        const waterChars = ['~', '=']
        const ci = (h + Math.floor(time * 0.003)) % waterChars.length
        return [{ char: waterChars[ci], color: '#5577AA', dx: 0, dy: 0 }]
      }
    }

    // Meltwater pools persist from ice age
    if (sim.meltPools.has(key)) {
      const waterChars = ['~', '=', '-']
      const ci = (h + Math.floor(time * 0.004)) % waterChars.length
      return [{ char: waterChars[ci], color: '#6688BB', dx: 0, dy: 0 }]
    }

    // Lowland water
    const lowWater = renderLowlandWater(sim, key, h, time)
    if (lowWater) return lowWater

    // Vegetation re-spreading
    const veg = sim.vegetationMap.get(key) ?? 0
    const greenDelay = ((h % 100) / 100) * 0.4

    if (veg > 20 && progress > greenDelay) {
      const nearRiver =
        sim.ancientSeabeds.has(key) || sim.riverPaths.has(posKey(x + 1, y)) || sim.riverPaths.has(posKey(x - 1, y))
      const greenColors = nearRiver ? ['#3CB371', '#50C878', '#66EE88'] : ['#2E8B57', '#3CB371', '#50C878']
      const gi = h % greenColors.length
      return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
    }

    return renderDirt(sim, key, h)
  },
}

// ---------------------------------------------------------------------------
// Epoch: Rise of Civilizations
// ---------------------------------------------------------------------------

const riseOfCivilizations: GenesisEpoch = {
  id: GenesisEpochId.RiseOfCivilizations,
  durationMs: 2000,
  commentary: 'Civilizations emerge...',
  mutate: sim => {
    // Starter mode (tutorial): exactly 3 ruins, role-tagged in fixed order
    // (clover, bee, coyote). Complex mode (post-deep-time, future spec)
    // currently delegates to starter; replace this branch when the complex
    // generator lands.
    const isStarter =
      sim.ruinGenerationMode === RuinGenerationMode.Starter || sim.ruinGenerationMode === RuinGenerationMode.Complex
    const numRuins = isStarter ? 3 : 8 + Math.floor(sim.rng() * 5)
    const STARTER_ROLES: RuinRole[] = [RuinRole.Clover, RuinRole.Bee, RuinRole.Coyote]
    const candidates: { key: string; score: number }[] = []

    for (const key of sim.landMask) {
      const soil = sim.soilHealth.get(key) ?? 30
      const nearRiver = sim.riverPaths.has(key) ? 20 : 0
      const nearCoast = sim.ancientSeabeds.has(key) ? 15 : 0
      candidates.push({ key, score: soil + nearRiver + nearCoast })
    }

    // Sort by score and pick from top candidates with some randomness
    candidates.sort((a, b) => b.score - a.score)
    const topCandidates = candidates.slice(0, Math.floor(candidates.length * 0.25))

    const usedKeys = new Set<string>()
    let failedAttempts = 0

    for (let i = 0; i < numRuins && topCandidates.length > 0 && failedAttempts < 50; i++) {
      const idx = Math.floor(sim.rng() * Math.min(80, topCandidates.length))
      const pick = topCandidates[idx]
      if (!pick) continue

      const [xStr, yStr] = pick.key.split(',')
      const cx = Number(xStr)
      const cy = Number(yStr)

      // Minimum distance between ruins — reduced to fit more on the map
      let tooClose = false
      for (const uKey of usedKeys) {
        const [uxStr, uyStr] = uKey.split(',')
        if (dist(cx, cy, Number(uxStr), Number(uyStr)) < 10) {
          tooClose = true
          break
        }
      }
      if (tooClose) {
        i--
        failedAttempts++
        topCandidates.splice(idx, 1)
        continue
      }

      failedAttempts = 0
      usedKeys.add(pick.key)
      const radius = 3 + Math.floor(sim.rng() * 3)
      const buildingFootprints: { x: number; y: number }[] = []

      // Generate building footprints within radius
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dist(0, 0, dx, dy) > radius) continue
          const nk = posKey(cx + dx, cy + dy)
          if (sim.landMask.has(nk)) {
            buildingFootprints.push({ x: cx + dx, y: cy + dy })
            sim.soilHealth.set(nk, (sim.soilHealth.get(nk) ?? 30) + 15)

            // Multi-layered building chars
            const bh = tileHash(cx + dx, cy + dy)
            const buildingChar = BUILDING_CHARS[bh % BUILDING_CHARS.length]
            sim.tileData.set(nk, {
              char: buildingChar,
              baseColor: CIV_COLORS[bh % CIV_COLORS.length],
              intensity: 1,
            })
          }
        }
      }

      const ruin: CivilizationRuin = {
        position: { x: cx, y: cy },
        name: generateRuinName(sim.rng),
        radius,
        age: Math.floor(sim.rng() * 5000) + 1000,
        aqueductPaths: [],
        buildingFootprints,
      }
      if (isStarter && sim.ruins.length < STARTER_ROLES.length) {
        ruin.role = STARTER_ROLES[sim.ruins.length]
      }

      sim.ruins.push(ruin)
    }

    // Generate aqueduct network connecting ruin sites (increased distance)
    for (let i = 0; i < sim.ruins.length; i++) {
      for (let j = i + 1; j < sim.ruins.length; j++) {
        const r1 = sim.ruins[i]
        const r2 = sim.ruins[j]
        const d = dist(r1.position.x, r1.position.y, r2.position.x, r2.position.y)
        if (d > 90) continue

        const path: { x: number; y: number }[] = []
        let ax = r1.position.x
        let ay = r1.position.y

        // L-shaped path with random jitter (max iterations to prevent infinite loops)
        let pathSteps = 0
        while ((ax !== r2.position.x || ay !== r2.position.y) && pathSteps < 500) {
          pathSteps++
          const key = posKey(ax, ay)
          path.push({ x: ax, y: ay })

          const existing = sim.aqueductNetwork.get(key)

          if (existing) {
            sim.aqueductNetwork.set(key, BOX_CROSS)
            if (!sim.aqueductJunctions.some(j2 => j2.x === ax && j2.y === ay)) {
              sim.aqueductJunctions.push({ x: ax, y: ay })
            }
          } else if (ax !== r2.position.x && ay !== r2.position.y) {
            if (sim.rng() < 0.5 && ax !== r2.position.x) {
              sim.aqueductNetwork.set(key, BOX_HORIZONTAL)
            } else {
              sim.aqueductNetwork.set(key, BOX_VERTICAL)
            }
          } else if (ax !== r2.position.x) {
            sim.aqueductNetwork.set(key, sim.rng() < 0.15 ? BOX_DOUBLE_H : BOX_HORIZONTAL)
          } else {
            sim.aqueductNetwork.set(key, sim.rng() < 0.15 ? BOX_DOUBLE_V : BOX_VERTICAL)
          }

          if (sim.rng() < 0.7) {
            if (Math.abs(r2.position.x - ax) > Math.abs(r2.position.y - ay)) {
              ax += r2.position.x > ax ? 1 : -1
            } else {
              ay += r2.position.y > ay ? 1 : -1
            }
          } else {
            if (ax !== r2.position.x) ax += r2.position.x > ax ? 1 : -1
            if (ay !== r2.position.y) ay += r2.position.y > ay ? 1 : -1
          }

          ax = clamp(ax, SPACE_BORDER, sim.width - SPACE_BORDER - 1)
          ay = clamp(ay, SPACE_BORDER, sim.height - SPACE_BORDER - 1)
        }

        // More dead-end branches per connection (2-5)
        const numBranches = 2 + Math.floor(sim.rng() * 4)
        for (let b = 0; b < numBranches; b++) {
          if (path.length === 0) continue
          const branchStart = path[Math.floor(sim.rng() * path.length)]
          let bx = branchStart.x
          let by = branchStart.y
          const branchLen = 3 + Math.floor(sim.rng() * 8)
          const branchDir = Math.floor(sim.rng() * 4)

          for (let s = 0; s < branchLen; s++) {
            const bk = posKey(bx, by)
            if (sim.landMask.has(bk) && !sim.aqueductNetwork.has(bk)) {
              const branchChars = [BOX_HORIZONTAL, BOX_VERTICAL, BOX_T_DOWN, BOX_T_UP, BOX_T_RIGHT, BOX_T_LEFT]
              sim.aqueductNetwork.set(bk, branchChars[Math.floor(sim.rng() * branchChars.length)])
            }
            switch (branchDir) {
              case 0:
                bx++
                break
              case 1:
                bx--
                break
              case 2:
                by++
                break
              default:
                by--
                break
            }
            bx = clamp(bx, SPACE_BORDER, sim.width - SPACE_BORDER - 1)
            by = clamp(by, SPACE_BORDER, sim.height - SPACE_BORDER - 1)
          }
        }

        r1.aqueductPaths.push(path)
        r2.aqueductPaths.push([...path].reverse())
      }
    }

    // Standalone inland aqueduct clusters — chaotic networks unconnected to ruins
    const landKeys = [...sim.landMask]
    const numClusters = 4 + Math.floor(sim.rng() * 4)
    for (let c = 0; c < numClusters; c++) {
      // Pick a random inland origin
      const originKey = landKeys[Math.floor(sim.rng() * landKeys.length)]
      if (sim.coastlineTiles.has(originKey)) continue
      const [oxStr, oyStr] = originKey.split(',')
      let cx = Number(oxStr)
      let cy = Number(oyStr)

      // Random walk to carve a chaotic pipe network
      const clusterLen = 10 + Math.floor(sim.rng() * 20)
      for (let s = 0; s < clusterLen; s++) {
        const ck = posKey(cx, cy)
        if (sim.landMask.has(ck) && !sim.aqueductNetwork.has(ck)) {
          const allChars = [
            BOX_HORIZONTAL,
            BOX_VERTICAL,
            BOX_T_DOWN,
            BOX_T_UP,
            BOX_T_RIGHT,
            BOX_T_LEFT,
            BOX_CROSS,
            BOX_DOUBLE_H,
            BOX_DOUBLE_V,
          ]
          sim.aqueductNetwork.set(ck, allChars[Math.floor(sim.rng() * allChars.length)])
        }

        // Random walk with occasional direction changes
        const dir = Math.floor(sim.rng() * 4)
        switch (dir) {
          case 0:
            cx++
            break
          case 1:
            cx--
            break
          case 2:
            cy++
            break
          default:
            cy--
            break
        }
        cx = clamp(cx, SPACE_BORDER, sim.width - SPACE_BORDER - 1)
        cy = clamp(cy, SPACE_BORDER, sim.height - SPACE_BORDER - 1)

        // Branch off occasionally
        if (sim.rng() < 0.3) {
          let bx = cx
          let by = cy
          const bLen = 2 + Math.floor(sim.rng() * 5)
          const bDir = Math.floor(sim.rng() * 4)
          for (let bs = 0; bs < bLen; bs++) {
            const bk = posKey(bx, by)
            if (sim.landMask.has(bk) && !sim.aqueductNetwork.has(bk)) {
              const branchChars = [BOX_HORIZONTAL, BOX_VERTICAL, BOX_T_DOWN, BOX_T_UP]
              sim.aqueductNetwork.set(bk, branchChars[Math.floor(sim.rng() * branchChars.length)])
            }
            switch (bDir) {
              case 0:
                bx++
                break
              case 1:
                bx--
                break
              case 2:
                by++
                break
              default:
                by--
                break
            }
            bx = clamp(bx, SPACE_BORDER, sim.width - SPACE_BORDER - 1)
            by = clamp(by, SPACE_BORDER, sim.height - SPACE_BORDER - 1)
          }
        }
      }
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Gron is intentionally absent from genesis — he arrives with the
    // player in gameplay, after the title card lifts.

    // Check if this tile is part of a civilization
    const tileInfo = sim.tileData.get(key)
    const aqueductChar = sim.aqueductNetwork.get(key)

    const growDelay = ((h % 100) / 100) * 0.5

    if (progress > growDelay) {
      const growProgress = clamp((progress - growDelay) / 0.5, 0, 1)
      const layers: GenesisTileRender[] = []

      // Building layer
      if (tileInfo && growProgress > 0.2) {
        layers.push({
          char: tileInfo.char,
          color: tileInfo.baseColor,
          dx: 0,
          dy: 0,
        })

        // Second layer — offset glyph for messy look
        if (growProgress > 0.5) {
          const secondChar = BUILDING_CHARS[(h + 3) % BUILDING_CHARS.length]
          layers.push({
            char: secondChar,
            color: CIV_COLORS[(h + 2) % CIV_COLORS.length],
            dx: 1,
            dy: 1,
          })
        }

        // Third layer at full progress
        if (growProgress > 0.8) {
          layers.push({
            char: '·',
            color: CIV_COLORS[(h + 4) % CIV_COLORS.length],
            dx: -1,
            dy: 0,
          })
        }

        return layers
      }

      // Aqueduct layer
      if (aqueductChar && growProgress > 0.3) {
        layers.push({
          char: aqueductChar,
          color: CIV_COLORS[h % CIV_COLORS.length],
          dx: 0,
          dy: 0,
        })

        if (growProgress > 0.6) {
          // Overlay with a second box char
          const overlayChars = [BOX_HORIZONTAL, BOX_VERTICAL, '·', '.']
          layers.push({
            char: overlayChars[h % overlayChars.length],
            color: CIV_COLORS[(h + 1) % CIV_COLORS.length],
            dx: h % 2 === 0 ? 1 : -1,
            dy: h % 3 === 0 ? 1 : 0,
          })
        }

        return layers
      }
    }

    // Rivers
    if (sim.riverPaths.has(key)) {
      const ci = (h + Math.floor(time * 0.004)) % 3
      return [{ char: ['~', '=', '-'][ci], color: '#6688BB', dx: 0, dy: 0 }]
    }

    // Ponds
    if (sim.ponds.has(key)) {
      const waterChars = ['~', '=']
      const ci = (h + Math.floor(time * 0.003)) % waterChars.length
      return [{ char: waterChars[ci], color: '#5577AA', dx: 0, dy: 0 }]
    }

    // Meltwater pools
    if (sim.meltPools.has(key)) {
      const waterChars = ['~', '=', '-']
      const ci = (h + Math.floor(time * 0.004)) % waterChars.length
      return [{ char: waterChars[ci], color: '#6688BB', dx: 0, dy: 0 }]
    }

    // No renderLowlandWater — by riseOfCivilizations, water is tracked in
    // ponds/riverPaths (populated by warmPeriod). Elevation-based cosmetic
    // water would show tiles not in those sets, causing a discontinuity when
    // later epochs and the game renderer only show tracked water.

    // Vegetation
    const vegRender = renderVegetation(sim, x, y, h)
    if (vegRender) return vegRender

    return renderDirt(sim, key, h)
  },
}

// ---------------------------------------------------------------------------
// Epoch: Fall of Civilizations
// ---------------------------------------------------------------------------

const fallOfCivilizations: GenesisEpoch = {
  id: GenesisEpochId.FallOfCivilizations,
  durationMs: 2000,
  commentary: 'Empires crumble and sink beneath the land...',
  mutate: sim => {
    // Final soil enrichment from decomposition
    for (const ruin of sim.ruins) {
      for (const fp of ruin.buildingFootprints) {
        const key = posKey(fp.x, fp.y)
        sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 5)
      }
    }

    // Drought: consolidate water into 2-5 contiguous bodies
    const MIN_WATER_BODY_SIZE = 10

    // 1. Unify all water tiles
    const allWater = new Set<string>()
    for (const key of sim.ponds) allWater.add(key)
    for (const key of sim.riverPaths) allWater.add(key)

    // 2. Find connected components via cardinal BFS
    const waterVisited = new Set<string>()
    const waterComponents: Set<string>[] = []
    const cDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]

    for (const startKey of allWater) {
      if (waterVisited.has(startKey)) continue
      const component = new Set<string>()
      const stack = [startKey]
      waterVisited.add(startKey)

      while (stack.length > 0) {
        const current = stack.pop()
        if (current === undefined) break
        component.add(current)
        const [xStr, yStr] = current.split(',')
        const cx = Number(xStr)
        const cy = Number(yStr)
        for (const [ddx, ddy] of cDirs) {
          const nk = posKey(cx + ddx, cy + ddy)
          if (allWater.has(nk) && !waterVisited.has(nk)) {
            waterVisited.add(nk)
            stack.push(nk)
          }
        }
      }

      waterComponents.push(component)
    }

    // 3. Sort by size (largest first), filter by minimum
    waterComponents.sort((a, b) => b.size - a.size)
    const viable = waterComponents.filter(c => c.size >= MIN_WATER_BODY_SIZE)

    // 4. Keep 1-3 of the largest viable components
    const targetCount = 1 + Math.floor(sim.rng() * 3)
    const kept = viable.length >= 1 ? viable.slice(0, targetCount) : waterComponents.slice(0, targetCount)
    const keptTiles = new Set<string>()
    for (const comp of kept) {
      for (const key of comp) keptTiles.add(key)
    }

    // 5. Remove non-kept tiles from original sets
    for (const key of [...sim.ponds]) {
      if (!keptTiles.has(key)) sim.ponds.delete(key)
    }
    for (const key of [...sim.riverPaths]) {
      if (!keptTiles.has(key)) sim.riverPaths.delete(key)
    }

    // 6. Add sand shoreline around remaining water bodies. Sand never
    // forms on a tile that touches Space — the dirt-to-Space cliff
    // stays clean (sand only ever borders water). The shoreline pass is
    // seeded only from "shoreline-eligible" water tiles: every kept pond
    // tile, every kept river mouth (last surviving tile of each polyline
    // in sim.riverPathsOrdered), and any kept river tile cardinally
    // adjacent to a pond (river-pond junction). Thin midstream river
    // tiles seed no sand.
    const shoreDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]
    const cardinals = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
    const touchesSpace = (tx: number, ty: number): boolean => {
      for (const [dx, dy] of cardinals) {
        const nx = tx + dx
        const ny = ty + dy
        if (nx < 0 || nx >= sim.width || ny < 0 || ny >= sim.height) return true
        if (sim.grid[ny][nx].type === TileType.Space) return true
      }
      return false
    }
    const shorelineSeeds = new Set<string>()
    for (const pondKey of sim.ponds) shorelineSeeds.add(pondKey)
    for (const polyline of sim.riverPathsOrdered) {
      for (let i = polyline.length - 1; i >= 0; i--) {
        const mouthKey = posKey(polyline[i].x, polyline[i].y)
        if (sim.riverPaths.has(mouthKey)) {
          shorelineSeeds.add(mouthKey)
          break
        }
      }
    }
    for (const riverKey of sim.riverPaths) {
      const [rxStr, ryStr] = riverKey.split(',')
      const rxN = Number(rxStr)
      const ryN = Number(ryStr)
      for (const [dx, dy] of cardinals) {
        if (sim.ponds.has(posKey(rxN + dx, ryN + dy))) {
          shorelineSeeds.add(riverKey)
          break
        }
      }
    }
    let frontier = new Set<string>(shorelineSeeds)
    for (let pass = 0; pass < WATER_SAND_BORDER_MAX; pass++) {
      const chance = WATER_SAND_PASS_CHANCES[pass]
      const nextFrontier = new Set<string>()
      for (const key of frontier) {
        const [xStr, yStr] = key.split(',')
        const wx = Number(xStr)
        const wy = Number(yStr)
        for (const [ddx, ddy] of shoreDirs) {
          const nx = wx + ddx
          const ny = wy + ddy
          const nk = posKey(nx, ny)
          if (
            sim.landMask.has(nk) &&
            !keptTiles.has(nk) &&
            ny >= 0 &&
            ny < sim.height &&
            nx >= 0 &&
            nx < sim.width &&
            sim.grid[ny][nx].type === TileType.Dirt &&
            !touchesSpace(nx, ny)
          ) {
            if (chance >= 100 || tileHash(nx, ny) % 100 < chance) {
              sim.grid[ny][nx].type = TileType.Sand
              nextFrontier.add(nk)
            }
          }
        }
      }
      frontier = nextFrontier
    }

    // 7. Eliminate small dirt islands inside water bodies
    // After the sand shoreline pass, tiny dirt patches can survive
    // enclosed by water and sand. Convert patches < 4 tiles to sand.
    const ISLAND_MAX_SIZE = 4
    const islandVisited = new Set<string>()
    for (let y = 0; y < sim.height; y++) {
      for (let x = 0; x < sim.width; x++) {
        if (sim.grid[y][x].type !== TileType.Dirt) continue
        const startKey = posKey(x, y)
        // Water tiles store Dirt as their underlying grid type; skip them
        // here so the BFS does not seed an island from a river/pond tile
        // and falsely grow the component past the threshold.
        if (keptTiles.has(startKey)) continue
        if (islandVisited.has(startKey)) continue

        // Cardinal BFS to find connected dirt component
        const component: string[] = [startKey]
        const stack = [startKey]
        islandVisited.add(startKey)
        let enclosed = true

        while (stack.length > 0) {
          const current = stack.pop()
          if (current === undefined) break
          const [cxStr, cyStr] = current.split(',')
          const cx = Number(cxStr)
          const cy = Number(cyStr)
          for (const [ddx, ddy] of cDirs) {
            const nx = cx + ddx
            const ny = cy + ddy
            if (nx < 0 || nx >= sim.width || ny < 0 || ny >= sim.height) {
              enclosed = false
              continue
            }
            const nk = posKey(nx, ny)
            // Water tiles have Dirt as underlying type — check water set first
            if (keptTiles.has(nk)) continue
            const neighborType = sim.grid[ny][nx].type
            if (neighborType === TileType.Dirt) {
              if (!islandVisited.has(nk)) {
                islandVisited.add(nk)
                component.push(nk)
                stack.push(nk)
              }
            } else if (neighborType !== TileType.Sand) {
              // Neighbor is not dirt, sand, or water — connected to non-water land
              enclosed = false
            }
          }
        }

        if (enclosed && component.length < ISLAND_MAX_SIZE) {
          for (const key of component) {
            const [ixStr, iyStr] = key.split(',')
            sim.grid[Number(iyStr)][Number(ixStr)] = { type: TileType.Sand }
          }
        }
      }
    }

    // Vegetation collapses with the empires — every land tile clears.
    // Gron is absent from genesis, so there is no surviving aura.
    for (const key of sim.landMask) {
      const veg = sim.vegetationMap.get(key) ?? 0
      if (veg <= 0) continue
      sim.vegetationMap.set(key, 0)
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 3)
    }

    // Satellite crashes — 3-9 satellite impacts as the empires fall.
    // Each impact creates a 5x5 crater zone tracked in sim.craters and
    // reduces soil health (matching gameplay satellite-impacts contract).
    // Protected tiles (space, sand, ponds, rivers, ruin entrances, ruin
    // building footprints, cave entrance) are excluded.
    const numCrashes = SATELLITE_CRASH_MIN + Math.floor(sim.rng() * (SATELLITE_CRASH_MAX - SATELLITE_CRASH_MIN + 1))

    // Build a fast-lookup set of ruin building footprints for protection
    const ruinProtected = new Set<string>()
    for (const ruin of sim.ruins) {
      for (const fp of ruin.buildingFootprints) {
        ruinProtected.add(posKey(fp.x, fp.y))
      }
    }

    const candidateKeys: string[] = []
    for (const key of sim.landMask) {
      if (sim.ponds.has(key)) continue
      if (sim.riverPaths.has(key)) continue
      const [xStr, yStr] = key.split(',')
      const cx = Number(xStr)
      const cy = Number(yStr)
      const tileType = sim.grid[cy][cx].type
      if (tileType !== TileType.Dirt && tileType !== TileType.Flora) continue
      candidateKeys.push(key)
    }

    const placedTargets = new Set<string>()
    for (let i = 0; i < numCrashes; i++) {
      let chosen: string | null = null
      // Try a bounded number of attempts to find a non-protected target
      // that hasn't already been used as an impact center.
      for (let attempt = 0; attempt < 50; attempt++) {
        if (candidateKeys.length === 0) break
        const candidate = candidateKeys[Math.floor(sim.rng() * candidateKeys.length)]
        if (placedTargets.has(candidate)) continue
        if (ruinProtected.has(candidate)) continue
        chosen = candidate
        break
      }
      if (!chosen) continue
      placedTargets.add(chosen)

      const [cxStr, cyStr] = chosen.split(',')
      const impactX = Number(cxStr)
      const impactY = Number(cyStr)

      sim.satelliteCrashes.push(createSatelliteCrashStreak(sim, impactX, impactY, i, numCrashes))

      // Apply 5x5 crater zone
      for (let dy = -SATELLITE_CRASH_RADIUS; dy <= SATELLITE_CRASH_RADIUS; dy++) {
        for (let dx = -SATELLITE_CRASH_RADIUS; dx <= SATELLITE_CRASH_RADIUS; dx++) {
          const tx = impactX + dx
          const ty = impactY + dy
          if (tx < 0 || tx >= sim.width || ty < 0 || ty >= sim.height) continue
          const tk = posKey(tx, ty)
          const tileType = sim.grid[ty][tx].type
          // Skip protected tiles
          if (
            tileType === TileType.Space ||
            tileType === TileType.Sand ||
            tileType === TileType.CaveEntrance ||
            tileType === TileType.CaveWall ||
            tileType === TileType.CaveBreakableWall
          ) {
            continue
          }
          if (sim.ponds.has(tk) || sim.riverPaths.has(tk)) continue
          if (ruinProtected.has(tk)) continue
          if (tileType !== TileType.Dirt && tileType !== TileType.Flora) continue

          sim.craters.add(tk)
          const current = sim.soilHealth.get(tk) ?? 30
          sim.soilHealth.set(tk, Math.max(0, current - SATELLITE_SOIL_DAMAGE))

          // Deform terrain to match gameplay satellite-impact-elevation:
          // Chebyshev distance picks center / ring / edge depth.
          const cheb = Math.max(Math.abs(dx), Math.abs(dy))
          const drop =
            cheb === 0
              ? SATELLITE_CRATER_DEPTH_CENTER
              : cheb === 1
                ? SATELLITE_CRATER_DEPTH_RING
                : SATELLITE_CRATER_DEPTH_EDGE
          const currentElev = sim.elevation.get(tk) ?? 50
          sim.elevation.set(tk, clamp(currentElev - drop, 0, 100))
        }
      }
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    // Satellite crash streaks — render over everything (including space).
    // Animates across ~50% of the epoch from each crash.startTime so each
    // streak falls slowly enough to be dramatic regardless of how many
    // crashes are happening. After the streak completes, the crater glyph
    // paints in place for the rest of the epoch via the state.craters
    // check below.
    for (const crash of sim.satelliteCrashes) {
      const crashProgress = clamp((progress - crash.startTime) / 0.5, 0, 1)
      if (crashProgress <= 0 || crashProgress >= 1) continue

      const totalSteps = Math.abs(crash.impactX - crash.startX) + Math.abs(crash.impactY - crash.startY)
      const currentStep = Math.floor(crashProgress * totalSteps)
      const headX = crash.startX + crash.dx * currentStep
      const headY = crash.startY + crash.dy * currentStep

      for (let t = 0; t < crash.length; t++) {
        const tx = headX - crash.dx * t
        const ty = headY - crash.dy * t
        if (tx === x && ty === y) {
          if (t === 0) {
            const headChar = BUILDING_CHARS[(h + Math.floor(time * 0.02)) % BUILDING_CHARS.length]
            const headColor = SATELLITE_HEAD_COLORS[Math.floor(time * 0.005) % SATELLITE_HEAD_COLORS.length]
            return [{ char: headChar, color: headColor, dx: 0, dy: 0 }]
          }
          const trailIdx = Math.min(t - 1, SATELLITE_TRAIL_COLORS.length - 1)
          const trailChar = BUILDING_CHARS[(h + t) % BUILDING_CHARS.length]
          return [{ char: trailChar, color: SATELLITE_TRAIL_COLORS[trailIdx], dx: 0, dy: 0 }]
        }
      }

      // Impact flash for 5x5 zone in the last 10% of the streak's progress
      if (crashProgress > 0.9) {
        const dx = x - crash.impactX
        const dy = y - crash.impactY
        if (Math.abs(dx) <= SATELLITE_CRASH_RADIUS && Math.abs(dy) <= SATELLITE_CRASH_RADIUS) {
          const d = Math.abs(dx) + Math.abs(dy)
          const flashChars = ['*', '+', '·']
          const flashColors = ['#FFFFFF', '#FFD700', '#FF4500']
          return [
            {
              char: flashChars[d % flashChars.length],
              color: flashColors[d % flashColors.length],
              dx: 0,
              dy: 0,
            },
          ]
        }
      }
    }

    // Persistent crater glyphs from completed crashes — paint over dirt
    // until the cross-fade hands them off to presentDay. Glyph keyed by
    // rendererTileHash so the char does NOT snap at the cross-fade
    // midpoint when presentDay (which also uses rendererTileHash) takes
    // over the same crater tile.
    if (sim.craters.has(key)) {
      const craterH = rendererTileHash(x, y)
      const buildingChar = BUILDING_CHARS[craterH % BUILDING_CHARS.length]
      const craterColor = CRATER_COLORS[craterH % CRATER_COLORS.length]
      return [{ char: buildingChar, color: craterColor, dx: 0, dy: 0 }]
    }

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Gron is intentionally absent from genesis.

    const tileInfo = sim.tileData.get(key)
    const aqueductChar = sim.aqueductNetwork.get(key)

    // Decay timing — randomized per tile
    const decayDelay = ((h % 100) / 100) * 0.3

    if (tileInfo || aqueductChar) {
      const decayProgress = clamp((progress - decayDelay) / 0.7, 0, 1)

      if (decayProgress < 1) {
        const layers: GenesisTileRender[] = []

        if (tileInfo) {
          // Buildings crumble: █ → ▓ → ▒ → ░ → . → gone
          const crumbleStages = ['█', '▓', '▒', '░', '.', '·']
          const stageIdx = Math.min(Math.floor(decayProgress * crumbleStages.length), crumbleStages.length - 1)

          // Color fades from gray to brown to dirt
          const r = Math.floor(lerp(0x88, 0x8b, decayProgress))
          const g = Math.floor(lerp(0x88, 0x73, decayProgress))
          const b2 = Math.floor(lerp(0x88, 0x55, decayProgress))
          const color = `rgb(${String(r)},${String(g)},${String(b2)})`

          // Fewer layers as decay progresses
          if (decayProgress < 0.3) {
            // Still 3 layers
            layers.push({ char: tileInfo.char, color, dx: 0, dy: 0 })
            layers.push({
              char: BUILDING_CHARS[(h + 3) % BUILDING_CHARS.length],
              color: CIV_COLORS[(h + 2) % CIV_COLORS.length],
              dx: 1,
              dy: 1,
            })
            layers.push({ char: '·', color: CIV_COLORS[(h + 4) % CIV_COLORS.length], dx: -1, dy: 0 })
          } else if (decayProgress < 0.6) {
            // 2 layers
            layers.push({ char: crumbleStages[stageIdx], color, dx: 0, dy: 0 })
            layers.push({ char: '.', color: CIV_COLORS[(h + 1) % CIV_COLORS.length], dx: 1, dy: 0 })
          } else {
            // 1 layer, fading
            layers.push({ char: crumbleStages[stageIdx], color, dx: 0, dy: 0 })
          }

          return layers
        }

        if (aqueductChar) {
          // Aqueducts are last to disappear
          const aqDecay = clamp((decayProgress - 0.2) / 0.8, 0, 1)

          if (aqDecay < 0.5) {
            layers.push({
              char: aqueductChar,
              color: CIV_COLORS[h % CIV_COLORS.length],
              dx: 0,
              dy: 0,
            })
            return layers
          }

          if (aqDecay < 0.8) {
            // Breaking apart
            const breakChars = ['+', '.', '·']
            layers.push({
              char: breakChars[Math.floor(aqDecay * 3) % breakChars.length],
              color: `rgb(${String(Math.floor(lerp(0x88, 0x8b, aqDecay)))},${String(Math.floor(lerp(0x88, 0x73, aqDecay)))},${String(Math.floor(lerp(0x88, 0x55, aqDecay)))})`,
              dx: 0,
              dy: 0,
            })
            return layers
          }

          // Almost gone
          return [{ char: '·', color: '#5A4A3A', dx: 0, dy: 0 }]
        }
      }
    }

    // Rivers — surviving fragments
    if (sim.riverPaths.has(key)) {
      const ci = (h + Math.floor(time * 0.004)) % 3
      return [{ char: ['~', '=', '-'][ci], color: '#6688BB', dx: 0, dy: 0 }]
    }

    // Ponds — surviving deep ponds
    if (sim.ponds.has(key)) {
      const waterChars = ['~', '=']
      const ci = (h + Math.floor(time * 0.003)) % waterChars.length
      return [{ char: waterChars[ci], color: '#5577AA', dx: 0, dy: 0 }]
    }

    // Meltwater pools
    if (sim.meltPools.has(key)) {
      const waterChars = ['~', '=', '-']
      const ci = (h + Math.floor(time * 0.004)) % waterChars.length
      return [{ char: waterChars[ci], color: '#6688BB', dx: 0, dy: 0 }]
    }

    // Sand placed by this epoch's water-shoreline pass — render
    // immediately with the same palette as presentDay / the gameplay
    // renderer so there is no dirt-then-snap discontinuity at the
    // crossfade.
    const tileType = sim.grid[y]?.[x]?.type
    if (tileType === TileType.Sand) {
      return [{ char: ':', color: SAND_COLORS[h % SAND_COLORS.length], dx: 0, dy: 0 }]
    }

    // No renderLowlandWater here — fallOfCivilizations.mutate consolidates
    // water into ponds/riverPaths, so only tracked water should render.
    // Elevation-based cosmetic water would create a discontinuity at the
    // genesis-to-game transition (game renderer only shows ponds/rivers).

    const veg = sim.vegetationMap.get(key) ?? 0

    // Drought wilt — without Gron's surviving rain aura, vegetation
    // wilts from the prairie edges inward as the empires fall. Wilt
    // start radiates from the map center outward via a scattered
    // distance term so the dieback looks organic rather than uniform.
    const centerX = sim.width / 2
    const centerY = sim.height / 2
    const dToCenter = dist(x, y, centerX, centerY)

    if (veg <= 0) {
      const maxDist = Math.max(sim.width, sim.height) * 0.5
      const scatter = (h % 30) - 15 + (((h >>> 8) % 20) - 10)
      const effectiveDist = dToCenter + scatter
      // Wilt starts after buildings begin decaying (0.4), radiates inward
      const wiltDelay = 0.4 + clamp(1 - effectiveDist / maxDist, 0, 0.5)

      if (progress > wiltDelay) {
        const wiltProgress = clamp((progress - wiltDelay) / 0.3, 0, 1)
        if (wiltProgress < 0.4) {
          return [{ char: '%', color: '#8B6914', dx: 0, dy: 0 }]
        }
        if (wiltProgress < 0.7) {
          return [{ char: '%', color: '#6B4914', dx: 0, dy: 0 }]
        }
        return renderDirt(sim, key, h)
      }

      // Before wilt reaches this tile — show as green (seamless from previous epoch)
      const greenColors = ['#2E8B57', '#3CB371', '#50C878']
      const gi = h % greenColors.length
      return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
    }

    // Any lingering vegetation (drought mutation runs first, so this
    // path is reached only for tiles whose veg was reset between
    // mutate() and renderTile()).
    const vegRender = renderVegetation(sim, x, y, h)
    if (vegRender) return vegRender

    return renderDirt(sim, key, h)
  },
}

// ---------------------------------------------------------------------------
// Epoch: Present Day
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Connectivity enforcement — remove unreachable walkable islands
// ---------------------------------------------------------------------------

export const enforceConnectivity = (sim: GenesisSimState): void => {
  const spawnX = Math.floor(sim.width / 2)
  const spawnY = Math.floor(sim.height / 2)

  // BFS from the exact map center (Gron's tile, adjacent to the player
  // spawn) through walkable tiles (including water overlay positions)
  const startKey = posKey(spawnX, spawnY)
  const reachable = new Set<string>()
  const queue: string[] = [startKey]
  reachable.add(startKey)

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    const [xStr, yStr] = current.split(',')
    const cx = Number(xStr)
    const cy = Number(yStr)

    for (const [ddx, ddy] of dirs) {
      const nx = cx + ddx
      const ny = cy + ddy
      if (nx < 0 || nx >= sim.width || ny < 0 || ny >= sim.height) continue
      const nk = posKey(nx, ny)
      if (reachable.has(nk)) continue

      const tile = sim.grid[ny][nx]
      // Walkable = anything that's not Space, CaveWall, or CaveBreakableWall
      if (tile.type === TileType.Space || tile.type === TileType.CaveWall || tile.type === TileType.CaveBreakableWall) {
        continue
      }

      reachable.add(nk)
      queue.push(nk)
    }
  }

  // Convert unreachable walkable tiles to Space
  for (let y = 0; y < sim.height; y++) {
    for (let x = 0; x < sim.width; x++) {
      const tile = sim.grid[y][x]
      if (tile.type === TileType.Space) continue
      if (tile.type === TileType.CaveWall || tile.type === TileType.CaveBreakableWall) continue
      if (tile.type === TileType.CaveEntrance) continue // preserve cave entrances

      const key = posKey(x, y)
      if (reachable.has(key)) continue // reachable — keep it

      // Unreachable walkable tile — convert to space and clean up
      sim.grid[y][x] = { type: TileType.Space }
      sim.landMask.delete(key)
      sim.coastlineTiles.delete(key)
      sim.soilHealth.delete(key)
      sim.elevation.delete(key)
    }
  }
}

const presentDay: GenesisEpoch = {
  id: GenesisEpochId.PresentDay,
  durationMs: 2000,
  commentary: 'A steward is called...',
  mutate: sim => {
    // Clamp all soil health to [10, 100]
    for (const [key, value] of sim.soilHealth) {
      sim.soilHealth.set(key, clamp(value, 10, SOIL_HEALTH_MAX))
    }

    // Ensure all land tiles have soil health
    for (const key of sim.landMask) {
      if (!sim.soilHealth.has(key)) {
        sim.soilHealth.set(key, 30)
      }
    }

    // Clamp all elevation to [0, 100]
    for (const [key, value] of sim.elevation) {
      sim.elevation.set(key, clamp(value, 0, 100))
    }

    // Ensure all land tiles have elevation
    for (const key of sim.landMask) {
      if (!sim.elevation.has(key)) {
        sim.elevation.set(key, 50)
      }
    }

    // Remove disconnected walkable islands unreachable from player spawn
    enforceConnectivity(sim)
  },
  renderTile: (sim, x, y, _progress, time) => {
    // Use rendererTileHash (from position.ts) — the same hash function the
    // game renderer keys terrain colors with. Local genesis tileHash and
    // rendererTileHash mix bits differently, so using local would shift
    // every sand/dirt/burn-scar/crater tile's palette index at the
    // genesis-to-game handoff. Stars and rain aura already used
    // rendererTileHash directly.
    const h = rendererTileHash(x, y)
    const tile = sim.grid[y]?.[x]

    // Stars — use rendererTileHash to match game renderer exactly
    if (!tile || tile.type === TileType.Space) {
      const STAR_CHARS = ['.', '+', '*']
      const STAR_COLORS = ['#333', '#555', '#777', '#999', '#bbb', '#999', '#777', '#555']
      const starH = rendererTileHash(x, y)
      if (starH % 12 === 0) {
        const phase = (starH >> 8) % STAR_COLORS.length
        const colorIndex = (phase + Math.floor(time * 0.0015)) % STAR_COLORS.length
        return [{ char: STAR_CHARS[(starH >> 4) % STAR_CHARS.length], color: STAR_COLORS[colorIndex], dx: 0, dy: 0 }]
      }
      return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
    }

    const key = posKey(x, y)

    // Rivers and ponds checked before Sand — matches game renderer priority
    // (game renderer checks state.rivers/ponds before tile.type). Water tiles
    // can sit on Sand grid tiles due to shoreline generation.
    if (sim.riverPaths.has(key)) {
      const waterChars = ['~', '=', '-']
      const ci = (h + Math.floor(time * 0.004)) % waterChars.length
      return [{ char: waterChars[ci], color: RIVER_COLOR, dx: 0, dy: 0 }]
    }

    if (sim.ponds.has(key)) {
      const waterChars = ['~', '=']
      const ci = (h + Math.floor(time * 0.003)) % waterChars.length
      return [{ char: waterChars[ci], color: POND_COLOR, dx: 0, dy: 0 }]
    }

    // Sand — match game renderer's multi-color palette
    if (tile.type === TileType.Sand) {
      return [{ char: ':', color: SAND_COLORS[h % SAND_COLORS.length], dx: 0, dy: 0 }]
    }

    // Ruin and cave entrances — match the game renderer so the glyph and
    // color are continuous across the genesis-to-game handoff. The 3x3
    // dark halo backdrop behind RuinEntrance is painted in a separate
    // pre-pass in genesisRenderer.ts.
    if (tile.type === TileType.RuinEntrance) {
      return [{ char: 'O', color: TILE_COLORS[TileType.RuinEntrance], dx: 0, dy: 0 }]
    }
    if (tile.type === TileType.CaveEntrance) {
      return [{ char: 'O', color: TILE_COLORS[TileType.CaveEntrance], dx: 0, dy: 0 }]
    }

    // Gron is intentionally absent from genesis presentDay — he and
    // the player both arrive after the boot title card lifts.

    // Base terrain — craters take priority over burn scars and dirt so
    // post-impact craters render in their resting brown matching
    // renderer.ts (state.craters branch). All three branches key off
    // rendererTileHash via `h`, matching the game renderer exactly. The
    // fallOfCivilizations -> presentDay crossfade smoothly blends red
    // SATELLITE_TRAIL_COLORS into this brown.
    // Use TILE_CHARS[Dirt] ('·') so burn-scar / plain-dirt glyphs match
    // gameplay byte-for-byte; previously this rendered '.' here and game
    // rendered '·', producing a per-tile char swap at the handoff.
    const dirtChar = TILE_CHARS[TileType.Dirt]
    const baseTile: GenesisTileRender = sim.craters.has(key)
      ? {
          char: BUILDING_CHARS[h % BUILDING_CHARS.length],
          color: CRATER_COLORS[h % CRATER_COLORS.length],
          dx: 0,
          dy: 0,
        }
      : sim.burnScars.has(key)
        ? { char: dirtChar, color: GAME_BURN_SCAR_COLORS[h % GAME_BURN_SCAR_COLORS.length], dx: 0, dy: 0 }
        : { char: dirtChar, color: GAME_DIRT_COLORS[h % GAME_DIRT_COLORS.length], dx: 0, dy: 0 }

    // No Gron rain aura in genesis — the aura returns in gameplay when
    // Gron and the player both arrive after the boot title card.

    return [baseTile]
  },
}

// ---------------------------------------------------------------------------
// Epoch registry
// ---------------------------------------------------------------------------

export const GENESIS_EPOCHS: GenesisEpoch[] = [
  cosmicFormation,
  landAccretion,
  lavaEra,
  crustCooling,
  tectonicUplift,
  firstWater,
  emergenceOfLife,
  fireSeason,
  regrowth,
  iceAge,
  postGlacialDieOff,
  warmPeriod,
  riseOfCivilizations,
  fallOfCivilizations,
  presentDay,
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const createGenesisState = (
  width: number,
  height: number,
  seed: number,
  ruinGenerationMode: RuinGenerationMode = RuinGenerationMode.Starter
): GenesisSimState => {
  // Import mulberry32 dynamically would break pure engine convention.
  // Inline a simple mulberry32 PRNG here.
  let a = seed | 0
  const rng = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const grid: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: TileType.Space }))
  )

  return {
    grid,
    width,
    height,
    soilHealth: new Map(),
    volcanicHeat: new Map(),
    elevation: new Map(),
    ancientSeabeds: new Set(),
    glacialPaths: new Set(),
    riverPaths: new Set(),
    vegetationMap: new Map(),
    burnScars: new Set(),
    ruins: [],
    aqueductNetwork: new Map(),
    aqueductJunctions: [],
    epochIndex: 0,
    epochStartTime: 0,
    lastTickTime: 0,
    rng,
    tileData: new Map(),
    secondFireOccurred: false,
    landMask: new Set(),
    coastlineTiles: new Set(),
    preGlacialVegetation: new Map(),
    glacialEdgeNoise: { top: [], bottom: [] },
    meteorites: [],
    lightningBolts: [],
    satelliteCrashes: [],
    craters: new Set(),
    tectonicAxes: [],
    riverPathsOrdered: [],
    meltPools: new Set(),
    ponds: new Set(),
    lowlandWaterMask: new Set(),
    epochSnapshots: [],
    mutationsPrecomputed: false,
    rainSeed: 0,
    narratedEpochCount: 0,
    ruinGenerationMode,
    tierTweens: new Map(),
    lastObservedTier: new Map(),
  }
}

export const getGenesisEpochs = (): GenesisEpoch[] => GENESIS_EPOCHS

/** Advance the simulation. Returns true when complete. */
export const tickGenesis = (
  sim: GenesisSimState,
  epochs: GenesisEpoch[],
  time: number,
  onEpochStart?: (commentary: string, epochIndex: number) => void
): boolean => {
  if (sim.epochIndex >= epochs.length) return true

  sim.lastTickTime = time
  const epoch = epochs[sim.epochIndex]

  // First tick of this epoch — run mutate (skipped if pre-computed),
  // and fire the narration callback once for this epoch index.
  if (sim.epochStartTime === 0) {
    sim.epochStartTime = time
    if (!sim.mutationsPrecomputed) {
      epoch.mutate(sim)
    }
    if (sim.narratedEpochCount === sim.epochIndex) {
      onEpochStart?.(epoch.commentary, sim.epochIndex)
      sim.narratedEpochCount++
    }
  }

  const elapsed = time - sim.epochStartTime
  if (elapsed >= epoch.durationMs) {
    // Advance to next epoch — set epochStartTime to current time so the
    // renderer sees a valid (non-zero) progress on the first frame,
    // preventing a single-frame flash at epoch transitions.
    sim.epochIndex++
    if (sim.epochIndex >= epochs.length) {
      sim.epochStartTime = 0
      return true
    }
    sim.epochStartTime = time
    const nextEpoch = epochs[sim.epochIndex]
    if (!sim.mutationsPrecomputed) {
      nextEpoch.mutate(sim)
    }
    if (sim.narratedEpochCount === sim.epochIndex) {
      onEpochStart?.(nextEpoch.commentary, sim.epochIndex)
      sim.narratedEpochCount++
    }
  }

  return false
}

export const extractGenesisResult = (sim: GenesisSimState): GenesisResult => ({
  terrain: sim.grid,
  soilHealth: sim.soilHealth,
  elevation: sim.elevation,
  ruins: sim.ruins,
  ponds: sim.ponds,
  rivers: sim.riverPaths,
  burnScars: sim.burnScars,
  craters: sim.craters,
})

export interface CompleteGenesisOptions {
  // When true (dev ?skipGenesis=true), skip scheduling the boot title
  // card so the player lands directly in gameplay with no overlay.
  skipTitleCard?: boolean
}

export const completeGenesis = (state: GameState, options: CompleteGenesisOptions = {}): void => {
  if (!state.genesis) return

  // If genesis wasn't fully played out, run remaining mutations
  const sim = state.genesis
  if (sim.epochIndex < GENESIS_EPOCHS.length) {
    if (!sim.mutationsPrecomputed) {
      runAllMutations(sim, GENESIS_EPOCHS)
    }
    sim.epochIndex = GENESIS_EPOCHS.length
  }

  // Flush narration for any unfired epochs in order so the event log
  // gets all 14 entries even when genesis is skipped.
  while (sim.narratedEpochCount < GENESIS_EPOCHS.length) {
    const epoch = GENESIS_EPOCHS[sim.narratedEpochCount]
    state.onGenesisEpochStart?.(epoch.commentary, sim.narratedEpochCount)
    sim.narratedEpochCount++
  }

  if (options.skipTitleCard) {
    // Dev fast-path: hand off immediately, no title card cover.
    finalizeGenesisHandoff(state, performance.now())
    return
  }

  // Schedule the title card. The genesis renderer keeps painting until
  // finalizeGenesisHandoff fires at the title card's hold midpoint —
  // that way the renderer swap is invisible under the full-black cover.
  state.bootTitleCard = {
    startTime: performance.now(),
    label: 'Revery Prairie',
  }
}

/**
 * Final genesis→gameplay swap. Clears state.genesis, seeds glint
 * patches with the handoff timestamp, and triggers the player spawn
 * meteor. Called either synchronously by completeGenesis (skip path)
 * or by gameLoop at the title card's hold midpoint.
 */
export const finalizeGenesisHandoff = (state: GameState, handoffTime: number): void => {
  if (!state.genesis) return

  // Seed glinting zone patches now, using the handoff time as the
  // birth-time baseline so every patch starts in fade-in (opacity 0)
  // on the first gameplay frame. Seeding earlier (in createGameState)
  // would let patches age through the ~25s of genesis and pop in at
  // full opacity once the gameplay renderer takes over.
  seedGlintPatches(state, handoffTime)
  rebuildGlintZones(state, handoffTime)

  // Hand off to the gameplay layer to trigger the player spawn ceremony
  // synchronously. Without this, the gameloop's player-spawn-trigger
  // (gameplay phase) fires one tick later than the first gameplay render —
  // that one-frame gap drew the @ glyph at the spawn tile before the
  // meteorite descent began.
  state.onGenesisComplete?.(handoffTime)

  state.genesis = null
}

export const getGenesisCommentary = (sim: GenesisSimState, epochs: GenesisEpoch[]): string => {
  if (sim.epochIndex >= epochs.length) return ''
  return epochs[sim.epochIndex].commentary
}

// Year ranges per epoch — maps geological time across the genesis sequence.
// Each entry is [startYear, endYear]. The counter lerps between them based on
// epoch progress, giving a running year from the big bang to present day.
// Must stay in lockstep with GENESIS_EPOCHS — same length, same order.
const EPOCH_YEAR_RANGES: [number, number][] = [
  [0, 500_000_000], // cosmicFormation
  [500_000_000, 1_000_000_000], // landAccretion
  [1_000_000_000, 2_000_000_000], // lavaEra
  [2_000_000_000, 2_500_000_000], // crustCooling
  [2_500_000_000, 3_000_000_000], // tectonicUplift
  [3_000_000_000, 4_000_000_000], // firstWater
  [4_000_000_000, 5_500_000_000], // emergenceOfLife
  [5_500_000_000, 7_000_000_000], // fireSeason
  [7_000_000_000, 8_500_000_000], // regrowth
  [8_500_000_000, 10_000_000_000], // iceAge
  [10_000_000_000, 11_000_000_000], // postGlacialDieOff
  [11_000_000_000, 12_000_000_000], // warmPeriod
  [12_000_000_000, 13_000_000_000], // riseOfCivilizations
  [13_000_000_000, 13_700_000_000], // fallOfCivilizations
  [13_700_000_000, 13_800_000_000], // presentDay
]

/** The year at which genesis ends and gameplay begins. */
export const GENESIS_END_YEAR = 13_800_000_000

/** Get the current geological year based on epoch index and progress.
 *  The high-order digits advance with epoch progress. The last 6 digits
 *  roll independently at a slower rate (driven by `time`) to give the
 *  impression of a fast-running clock without jumpy noise. */
export const getGenesisYear = (sim: GenesisSimState, epochs: GenesisEpoch[], time: number): number => {
  if (sim.epochIndex >= epochs.length) return GENESIS_END_YEAR
  const progress = getEpochProgress(sim, epochs)
  const [startYear, endYear] = EPOCH_YEAR_RANGES[sim.epochIndex]
  const rawYear = Math.floor(lerp(startYear, endYear, progress))

  // Truncate last 6 digits, replace with a rolling counter derived from time.
  // The counter cycles through 0–999999 over ~4 seconds, giving a steady
  // odometer feel instead of random jumps.
  const significant = rawYear - (rawYear % 1_000_000)
  const rolling = Math.floor((time * 250) % 1_000_000)
  return significant + rolling
}

/** Format a year number for display (e.g. 4500000000 → "4,500,000,000"). */
export const formatYear = (year: number): string => year.toLocaleString()

export const getEpochProgress = (sim: GenesisSimState, epochs: GenesisEpoch[]): number => {
  if (sim.epochIndex >= epochs.length) return 1
  const epoch = epochs[sim.epochIndex]
  if (sim.epochStartTime === 0) return 0
  // Use lastTickTime (set by tickGenesis from the rAF clock) instead of
  // performance.now() so the tick and render share the same time source.
  // This prevents near-zero progress on the first frame of a new epoch.
  const now = sim.lastTickTime > 0 ? sim.lastTickTime : performance.now()
  return clamp((now - sim.epochStartTime) / epoch.durationMs, 0, 1)
}

/** Run all epoch mutations synchronously (for skip / tests). */
export const runAllMutations = (sim: GenesisSimState, epochs: GenesisEpoch[]): void => {
  for (const epoch of epochs) {
    epoch.mutate(sim)
  }
  sim.epochIndex = epochs.length
}

/** Pre-compute all epoch mutations and take per-epoch snapshots for stall-free playback. */
export const precomputeGenesis = (sim: GenesisSimState, epochs: GenesisEpoch[]): void => {
  for (const epoch of epochs) {
    epoch.mutate(sim)
    sim.epochSnapshots.push({
      vegetationMap: new Map(sim.vegetationMap),
      riverPaths: new Set(sim.riverPaths),
      ponds: new Set(sim.ponds),
      elevation: new Map(sim.elevation),
      volcanicHeat: new Map(sim.volcanicHeat),
      ancientSeabeds: new Set(sim.ancientSeabeds),
      burnScars: new Set(sim.burnScars),
      meteorites: [...sim.meteorites],
      lightningBolts: [...sim.lightningBolts],
      preGlacialVegetation: new Map(sim.preGlacialVegetation),
      glacialPaths: new Set(sim.glacialPaths),
      meltPools: new Set(sim.meltPools),
      tileData: new Map(sim.tileData),
      aqueductNetwork: new Map(sim.aqueductNetwork),
      ruins: [...sim.ruins],
      satelliteCrashes: [...sim.satelliteCrashes],
      craters: new Set(sim.craters),
      tectonicAxes: sim.tectonicAxes.map(a => ({
        polyline: a.polyline.map(p => ({ x: p.x, y: p.y })),
        orientationRadians: a.orientationRadians,
        intensity: a.intensity,
        radius: a.radius,
      })),
      lowlandWaterMask: new Set(sim.lowlandWaterMask),
    })
  }
  sim.mutationsPrecomputed = true
  sim.epochIndex = 0
  sim.epochStartTime = 0
}

/** Hash a steward name to a seed number. */
export const nameToSeed = (name: string): number => hashString(name)
