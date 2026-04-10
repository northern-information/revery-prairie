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
  SAND_BORDER,
  SAND_COLORS,
  SOIL_HEALTH_MAX,
  SPACE_BORDER,
  WATER_SAND_BORDER_MAX,
  WATER_SAND_PASS_CHANCES,
} from './constants'
import { generateBoltPath } from './boltPath'
import { GenesisEpochId } from './genesisTypes'
import { posKey } from './position'
import { smoothNoiseSeeded } from './terrain'
import { TileType } from './types'

import type {
  CivilizationRuin,
  GenesisEpoch,
  GenesisMeteorStreak,
  GenesisResult,
  GenesisSimState,
  GenesisTileRender,
} from './genesisTypes'
import type { Tile } from './types'

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

// Generate land mask using the same algorithm as terrain.ts, but with seeded RNG
const generateLandMask = (
  width: number,
  height: number,
  rng: () => number
): { landMask: Set<string>; coastlineTiles: Set<string>; grid: Tile[][] } => {
  const topOuterVariation = smoothNoiseSeeded(width, 3, 6, rng)
  const bottomOuterVariation = smoothNoiseSeeded(width, 3, 6, rng)
  const leftOuterVariation = smoothNoiseSeeded(height, 3, 6, rng)
  const rightOuterVariation = smoothNoiseSeeded(height, 3, 6, rng)

  const topInnerVariation = smoothNoiseSeeded(width, 3, 8, rng)
  const bottomInnerVariation = smoothNoiseSeeded(width, 3, 8, rng)
  const leftInnerVariation = smoothNoiseSeeded(height, 3, 8, rng)
  const rightInnerVariation = smoothNoiseSeeded(height, 3, 8, rng)

  const outerBorder = SPACE_BORDER
  const innerBorder = SPACE_BORDER + SAND_BORDER

  const landMask = new Set<string>()
  const coastlineTiles = new Set<string>()

  const grid: Tile[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const topOuter = outerBorder + topOuterVariation[x]
      const bottomOuter = outerBorder + bottomOuterVariation[x]
      const leftOuter = outerBorder + leftOuterVariation[y]
      const rightOuter = outerBorder + rightOuterVariation[y]

      const isSpace = x < leftOuter || x >= width - rightOuter || y < topOuter || y >= height - bottomOuter
      if (isSpace) return { type: TileType.Space }

      const topInner = innerBorder + topInnerVariation[x]
      const bottomInner = innerBorder + bottomInnerVariation[x]
      const leftInner = innerBorder + leftInnerVariation[y]
      const rightInner = innerBorder + rightInnerVariation[y]

      const isSand = x < leftInner || x >= width - rightInner || y < topInner || y >= height - bottomInner
      const key = posKey(x, y)
      if (isSand) {
        coastlineTiles.add(key)
        return { type: TileType.Sand }
      }

      landMask.add(key)
      return { type: TileType.Dirt }
    })
  )

  return { landMask, coastlineTiles, grid }
}

// Scatter sandbars in space tiles near edges (matches terrain.ts logic)
const scatterSandbars = (map: Tile[][], width: number, height: number, rng: () => number) => {
  const count = Math.floor((width + height) / 4)
  for (let i = 0; i < count; i++) {
    const edge = Math.floor(rng() * 4)
    let cx: number
    let cy: number
    const margin = SPACE_BORDER - 2
    if (margin < 2) continue
    switch (edge) {
      case 0:
        cx = Math.floor(rng() * width)
        cy = Math.floor(rng() * (margin - 1)) + 1
        break
      case 1:
        cx = Math.floor(rng() * width)
        cy = height - 1 - Math.floor(rng() * (margin - 1)) - 1
        break
      case 2:
        cx = Math.floor(rng() * (margin - 1)) + 1
        cy = Math.floor(rng() * height)
        break
      default:
        cx = width - 1 - Math.floor(rng() * (margin - 1)) - 1
        cy = Math.floor(rng() * height)
        break
    }
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue
    if (map[cy][cx].type !== TileType.Space) continue
    map[cy][cx] = { type: TileType.Sand }
    const size = Math.floor(rng() * 3) + 1
    const deltas = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, -1],
    ]
    for (let j = 0; j < size; j++) {
      const [ddx, ddy] = deltas[Math.floor(rng() * deltas.length)]
      const nx = cx + ddx
      const ny = cy + ddy
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && map[ny][nx].type === TileType.Space) {
        map[ny][nx] = { type: TileType.Sand }
      }
    }
  }
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

// Genesis rendering constants
const ROCK_COLORS = ['#696969', '#6B4226', '#808080', '#7B6B55']
const DIRT_COLORS = ['#8B7355', '#7B6B55', '#806B50']
const BURN_SCAR_COLORS = ['#3D2B1F', '#4A3728', '#352418']
const GREEN_COLORS = ['#2E8B57', '#3CB371', '#50C878']
const BRIGHT_GREEN_COLORS = ['#3CB371', '#50C878', '#66EE88']
const GRON_RAIN_RADIUS = 6

// Shared rendering for space tiles (stars — no water in space, it's not ocean)
const renderSpace = (sim: GenesisSimState, key: string, h: number, time: number): GenesisTileRender[] | null => {
  if (sim.landMask.has(key)) return null
  if (sim.coastlineTiles.has(key)) return [{ char: ':', color: '#C2B280', dx: 0, dy: 0 }]
  if (h % 5 === 0) {
    const starChars = ['.', '*', '+', '·']
    const starColors = ['#FFFFFF', '#DDDDFF', '#FFDDDD', '#FFFFDD', '#AAAACC']
    const phase = (time * 0.0015 + h * 0.001) % 1
    const ci = Math.floor((h + Math.floor(phase * 4)) % starChars.length)
    const si = h % starColors.length
    return [{ char: starChars[ci], color: starColors[si], dx: 0, dy: 0 }]
  }
  return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
}

// Shared rendering for lowland water (elevation-based, land tiles only)
const renderLowlandWater = (sim: GenesisSimState, key: string, h: number, time: number): GenesisTileRender[] | null => {
  if (!sim.landMask.has(key)) return null
  const elev = sim.elevation.get(key) ?? 50
  const scatter = (h % 25) - 12 + (((h >>> 8) % 15) - 7)
  if (elev + scatter < 40) {
    const waterChars = ['~', '=', '-']
    const waterColors = ['#4466AA', '#335588', '#556699']
    const ci = (h + Math.floor(time * 0.003)) % waterChars.length
    const wi = h % waterColors.length
    return [{ char: waterChars[ci], color: waterColors[wi], dx: 0, dy: 0 }]
  }
  return null
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
  commentary: 'simulating birth of cosmos...',
  mutate: sim => {
    // Fill entire grid with space
    for (let y = 0; y < sim.height; y++) {
      for (let x = 0; x < sim.width; x++) {
        sim.grid[y][x] = { type: TileType.Space }
      }
    }
  },
  renderTile: (_sim, x, y, progress, time) => {
    const h = tileHash(x, y)
    const centerX = _sim.width / 2
    const centerY = _sim.height / 2
    const d = dist(x, y, centerX, centerY)
    const maxDist = dist(0, 0, centerX, centerY)
    const threshold = progress * maxDist * 1.2

    if (d > threshold) return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]

    // Star twinkling
    const starChars = ['.', '*', '+', '·']
    const starColors = ['#FFFFFF', '#DDDDFF', '#FFDDDD', '#FFFFDD', '#AAAACC']
    const phase = (time * 0.0015 + h * 0.001) % 1
    const charIdx = Math.floor((h + Math.floor(phase * 4)) % starChars.length)
    const colorIdx = Math.floor((h + Math.floor(phase * 5)) % starColors.length)
    const brightness = h % 7 === 0 ? 1 : h % 3 === 0 ? 0.6 : 0.3

    if (brightness < 0.5 && h % 5 !== 0) return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]

    return [{ char: starChars[charIdx], color: starColors[colorIdx], dx: 0, dy: 0 }]
  },
}

// ---------------------------------------------------------------------------
// Epoch: Land Accretion
// ---------------------------------------------------------------------------

const landAccretion: GenesisEpoch = {
  id: GenesisEpochId.LandAccretion,
  durationMs: 2000,
  commentary: 'dust coalesces...',
  mutate: () => {
    // No grid mutations — purely visual
  },
  renderTile: (sim, x, y, progress, time) => {
    const centerX = sim.width / 2
    const centerY = sim.height / 2
    const d = dist(x, y, centerX, centerY)
    const maxRadius = Math.min(sim.width, sim.height) * 0.35
    const currentRadius = progress * maxRadius

    // Stars in background
    const h = tileHash(x, y)
    const starChars = ['.', '*', '+', '·']
    const starColors = ['#FFFFFF', '#DDDDFF', '#FFDDDD', '#FFFFDD']

    if (d <= currentRadius) {
      // Solid mass forming
      const rockChars = ['.', '#', '=', '*']
      const rockColors = ['#8B7355', '#696969', '#808080', '#6B4226']
      const ci = (h + Math.floor(time * 0.002)) % rockChars.length
      const ri = h % rockColors.length
      return [{ char: rockChars[ci], color: rockColors[ri], dx: 0, dy: 0 }]
    }

    // Particles drifting inward
    const angle = Math.atan2(y - centerY, x - centerX)
    const drift = d - progress * 20
    const particlePhase = (drift * 0.1 + angle * 2 + time * 0.003) % 1

    if (particlePhase > 0.85 && d < maxRadius * 2) {
      return [{ char: '.', color: '#887766', dx: 0, dy: 0 }]
    }

    // Background stars (fading as mass grows)
    if (h % 5 === 0) {
      const phase = (time * 0.0015 + h * 0.001) % 1
      const ci = Math.floor((h + Math.floor(phase * 4)) % starChars.length)
      const si = h % starColors.length
      return [{ char: starChars[ci], color: starColors[si], dx: 0, dy: 0 }]
    }

    return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
  },
}

// ---------------------------------------------------------------------------
// Epoch: Lava Era
// ---------------------------------------------------------------------------

const lavaEra: GenesisEpoch = {
  id: GenesisEpochId.LavaEra,
  durationMs: 2000,
  commentary: 'a kingdom of lava absolute...',
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

    // Generate base elevation from three octave pairs of 1D noise
    const eH1 = smoothNoiseSeeded(sim.width, 25, 30, sim.rng)
    const eV1 = smoothNoiseSeeded(sim.height, 25, 30, sim.rng)
    const eH2 = smoothNoiseSeeded(sim.width, 12, 14, sim.rng)
    const eV2 = smoothNoiseSeeded(sim.height, 12, 14, sim.rng)
    const eH3 = smoothNoiseSeeded(sim.width, 6, 7, sim.rng)
    const eV3 = smoothNoiseSeeded(sim.height, 6, 7, sim.rng)

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
    const centroidX = sumX / landCount
    const centroidY = sumY / landCount
    const maxLandDist = Math.sqrt((sim.width / 2) ** 2 + (sim.height / 2) ** 2)

    for (const key of landMask) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)

      // Sum three octave pairs
      const noise = eH1[x] + eV1[y] + eH2[x] + eV2[y] + eH3[x] + eV3[y]

      // Center bias: higher near centroid, lower near edges
      const dFromCenter = dist(x, y, centroidX, centroidY)
      const centerBias = lerp(10, -10, clamp(dFromCenter / maxLandDist, 0, 1))

      // Volcanic ridge bonus
      const heat = sim.volcanicHeat.get(key) ?? 50
      const volcanicBonus = heat > 70 ? Math.floor(((heat - 70) / 30) * 15) : 0

      sim.elevation.set(key, clamp(Math.round(50 + noise + centerBias + volcanicBonus), 0, 100))
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)

    if (!sim.landMask.has(key) && !sim.coastlineTiles.has(key)) {
      // Space — stars
      const h = tileHash(x, y)
      if (h % 5 === 0) {
        const starChars = ['.', '*', '+', '·']
        const phase = (time * 0.0015 + h * 0.001) % 1
        const ci = Math.floor((h + Math.floor(phase * 4)) % starChars.length)
        return [{ char: starChars[ci], color: '#AAAACC', dx: 0, dy: 0 }]
      }
      return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
    }

    // Lava rendering
    const heat = sim.volcanicHeat.get(key) ?? 50
    const h = tileHash(x, y)
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
  commentary: '',
  mutate: () => {
    // Visual transition only
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)

    if (!sim.landMask.has(key) && !sim.coastlineTiles.has(key)) {
      const h = tileHash(x, y)
      if (h % 5 === 0) {
        const starChars = ['.', '*', '+', '·']
        const phase = (time * 0.0015 + h * 0.001) % 1
        const ci = Math.floor((h + Math.floor(phase * 4)) % starChars.length)
        return [{ char: starChars[ci], color: '#AAAACC', dx: 0, dy: 0 }]
      }
      return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
    }

    const heat = sim.volcanicHeat.get(key) ?? 50
    const h = tileHash(x, y)

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
  commentary: 'oceans gather in the lowlands...',
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
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    if (!sim.landMask.has(key)) {
      if (sim.coastlineTiles.has(key)) {
        // Sand appearing
        const sandProgress = clamp(progress * 2 - 0.3, 0, 1)
        if (sandProgress > 0.5) {
          return [{ char: ':', color: '#C2B280', dx: 0, dy: 0 }]
        }
        return [{ char: '.', color: DIRT_COLORS[h % DIRT_COLORS.length], dx: 0, dy: 0 }]
      }
      // Space — stars
      if (h % 5 === 0) {
        const starChars = ['.', '*', '+', '·']
        const phase = (time * 0.0015 + h * 0.001) % 1
        const ci = Math.floor((h + Math.floor(phase * 4)) % starChars.length)
        return [{ char: starChars[ci], color: '#AAAACC', dx: 0, dy: 0 }]
      }
      return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
    }

    // Water gathers in lowlands — per-tile hash noise breaks grid-aligned contours
    const elev = sim.elevation.get(key) ?? 50
    const scatter = (h % 25) - 12 + (((h >>> 8) % 15) - 7)
    const effectiveElev = elev + scatter
    const waterThreshold = clamp(effectiveElev / 100, 0, 1)
    if (progress > waterThreshold && effectiveElev < 40) {
      const waterChars = ['~', '=', '-']
      const waterColors = ['#4466AA', '#335588', '#556699']
      const ci = (h + Math.floor(time * 0.003)) % waterChars.length
      const wi = h % waterColors.length
      return [{ char: waterChars[ci], color: waterColors[wi], dx: 0, dy: 0 }]
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
  commentary: 'primordial life emerges...',
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
  commentary: 'the sky falls...',
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
      const length = LIGHTNING_BOLT_MIN_LENGTH + Math.floor(sim.rng() * (LIGHTNING_BOLT_MAX_LENGTH - LIGHTNING_BOLT_MIN_LENGTH + 1))
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
            const bcolor = boltProgress < 0.3 ? LIGHTNING_BOLT_COLOR_BRIGHT : boltProgress < 0.7 ? LIGHTNING_BOLT_COLOR_MID : LIGHTNING_BOLT_COLOR_DIM
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
  commentary: '',
  mutate: sim => {
    // Ash enrichment only — no vegetation regrowth. land stays barren into ice age.
    for (const key of sim.burnScars) {
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 5)
    }
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
  commentary: 'glaciers advance, carving the land...',
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
  commentary: 'an extinction event...',
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
  commentary: 'glaciers melt and life continues...',
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
  commentary: 'civilizations emerge...',
  mutate: sim => {
    // Pick 8-12 ruin sites at strategic locations (high soil, near rivers/coast)
    const numRuins = 8 + Math.floor(sim.rng() * 5)
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

    // Gron appears at the dawn of civilization
    const gronX = Math.floor(sim.width / 2) + 5
    const gronY = Math.floor(sim.height / 2)
    if (x === gronX && y === gronY && progress > 0.3) {
      return [{ char: 'G', color: '#FFFFFF', dx: 0, dy: 0 }]
    }

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

    // Lowland water
    const lowWater = renderLowlandWater(sim, key, h, time)
    if (lowWater) return lowWater

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
  commentary: 'empires crumble and sink beneath the land...',
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

    // 4. Keep 2-5 of the largest viable components
    const targetCount = 2 + Math.floor(sim.rng() * 4)
    const kept =
      viable.length >= 2 ? viable.slice(0, targetCount) : waterComponents.slice(0, targetCount)
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

    // 6. Add sand shoreline around remaining water bodies
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
    let frontier = new Set<string>(keptTiles)
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
            sim.grid[ny][nx].type === TileType.Dirt
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

    const gronX = Math.floor(sim.width / 2) + 5
    const gronY = Math.floor(sim.height / 2)

    // Kill vegetation everywhere except within Gron's rain aura
    for (const key of sim.landMask) {
      const veg = sim.vegetationMap.get(key) ?? 0
      if (veg <= 0) continue
      const [xStr, yStr] = key.split(',')
      const d = dist(Number(xStr), Number(yStr), gronX, gronY)
      if (d <= GRON_RAIN_RADIUS) continue
      sim.vegetationMap.set(key, 0)
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 3)
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Gron persists
    const gronX = Math.floor(sim.width / 2) + 5
    const gronY = Math.floor(sim.height / 2)
    if (x === gronX && y === gronY) {
      return [{ char: 'G', color: '#FFFFFF', dx: 0, dy: 0 }]
    }

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

    // Lowland water
    const lowWater = renderLowlandWater(sim, key, h, time)
    if (lowWater) return lowWater

    const veg = sim.vegetationMap.get(key) ?? 0

    // Gron's rain aura — vegetation survives here
    const dToGron = dist(x, y, gronX, gronY)

    if (veg > 20 && dToGron <= GRON_RAIN_RADIUS) {
      const greenColors = ['#2E8B57', '#3CB371', '#50C878']
      const gi = h % greenColors.length
      return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
    }

    // Drought wilt — dead vegetation shows green then wilts toward Gron
    if (veg <= 0) {
      const maxDist = Math.max(sim.width, sim.height) * 0.5
      const scatter = (h % 30) - 15 + (((h >>> 8) % 20) - 10)
      const effectiveDist = dToGron + scatter
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

    // Vegetation still alive (within Gron's aura, rendered above)
    const vegRender = renderVegetation(sim, x, y, h)
    if (vegRender) return vegRender

    return renderDirt(sim, key, h)
  },
}

// ---------------------------------------------------------------------------
// Epoch: Present Day
// ---------------------------------------------------------------------------

const presentDay: GenesisEpoch = {
  id: GenesisEpochId.PresentDay,
  durationMs: 2000,
  commentary: 'a steward is called...',
  mutate: sim => {
    // Finalize terrain and scatter sandbars
    scatterSandbars(sim.grid, sim.width, sim.height, sim.rng)

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
  },
  renderTile: (sim, x, y, progress, time) => {
    const h = tileHash(x, y)
    const tile = sim.grid[y]?.[x]

    // Stars — match game renderer exactly (STAR_CHARS, STAR_COLORS, density 12)
    if (!tile || tile.type === TileType.Space) {
      const STAR_CHARS = ['.', '+', '*']
      const STAR_COLORS = ['#333', '#555', '#777', '#999', '#bbb', '#999', '#777', '#555']
      if (h % 12 === 0) {
        const phase = (h >> 8) % STAR_COLORS.length
        const colorIndex = (phase + Math.floor(time * 0.0015)) % STAR_COLORS.length
        return [{ char: STAR_CHARS[(h >> 4) % STAR_CHARS.length], color: STAR_COLORS[colorIndex], dx: 0, dy: 0 }]
      }
      return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
    }

    // Sand — match game renderer's multi-color palette
    if (tile.type === TileType.Sand) {
      return [{ char: ':', color: SAND_COLORS[h % SAND_COLORS.length], dx: 0, dy: 0 }]
    }

    const key = posKey(x, y)

    // Gron
    const gronX = Math.floor(sim.width / 2) + 5
    const gronY = Math.floor(sim.height / 2)
    if (x === gronX && y === gronY) {
      return [{ char: 'G', color: '#FFFFFF', dx: 0, dy: 0 }]
    }

    // Player fades in
    const playerX = Math.floor(sim.width / 2)
    const playerY = Math.floor(sim.height / 2)
    if (x === playerX && y === playerY && progress > 0.5) {
      return [{ char: '@', color: '#FFFFFF', dx: 0, dy: 0 }]
    }

    // Rivers — match game renderer color
    if (sim.riverPaths.has(key)) {
      const waterChars = ['~', '=', '-']
      const ci = (h + Math.floor(time * 0.004)) % waterChars.length
      return [{ char: waterChars[ci], color: RIVER_COLOR, dx: 0, dy: 0 }]
    }

    // Ponds — match game renderer color
    if (sim.ponds.has(key)) {
      const waterChars = ['~', '=']
      const ci = (h + Math.floor(time * 0.003)) % waterChars.length
      return [{ char: waterChars[ci], color: POND_COLOR, dx: 0, dy: 0 }]
    }

    // Dirt/burn scars — match game renderer's 5-color palette
    if (sim.burnScars.has(key)) {
      return [{ char: '.', color: GAME_BURN_SCAR_COLORS[h % GAME_BURN_SCAR_COLORS.length], dx: 0, dy: 0 }]
    }
    return [{ char: '.', color: GAME_DIRT_COLORS[h % GAME_DIRT_COLORS.length], dx: 0, dy: 0 }]
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

export const createGenesisState = (width: number, height: number, seed: number): GenesisSimState => {
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
    rng,
    tileData: new Map(),
    secondFireOccurred: false,
    landMask: new Set(),
    coastlineTiles: new Set(),
    preGlacialVegetation: new Map(),
    glacialEdgeNoise: { top: [], bottom: [] },
    meteorites: [],
    lightningBolts: [],
    riverPathsOrdered: [],
    meltPools: new Set(),
    ponds: new Set(),
    epochSnapshots: [],
    mutationsPrecomputed: false,
  }
}

export const getGenesisEpochs = (): GenesisEpoch[] => GENESIS_EPOCHS

/** Advance the simulation. Returns true when complete. */
export const tickGenesis = (sim: GenesisSimState, epochs: GenesisEpoch[], time: number): boolean => {
  if (sim.epochIndex >= epochs.length) return true

  const epoch = epochs[sim.epochIndex]

  // First tick of this epoch — run mutate (skipped if pre-computed)
  if (sim.epochStartTime === 0) {
    sim.epochStartTime = time
    if (!sim.mutationsPrecomputed) {
      epoch.mutate(sim)
    }
  }

  const elapsed = time - sim.epochStartTime
  if (elapsed >= epoch.durationMs) {
    // Advance to next epoch — mutate runs on the next frame's first tick
    sim.epochIndex++
    sim.epochStartTime = 0
    if (sim.epochIndex >= epochs.length) return true
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
})

export const getGenesisCommentary = (sim: GenesisSimState, epochs: GenesisEpoch[]): string => {
  if (sim.epochIndex >= epochs.length) return ''
  return epochs[sim.epochIndex].commentary
}

export const getEpochProgress = (sim: GenesisSimState, epochs: GenesisEpoch[]): number => {
  if (sim.epochIndex >= epochs.length) return 1
  const epoch = epochs[sim.epochIndex]
  if (sim.epochStartTime === 0) return 0
  return clamp((performance.now() - sim.epochStartTime) / epoch.durationMs, 0, 1)
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
    })
  }
  sim.mutationsPrecomputed = true
  sim.epochIndex = 0
  sim.epochStartTime = 0
}

/** Hash a steward name to a seed number. */
export const nameToSeed = (name: string): number => hashString(name)
