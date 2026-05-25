import { posKey } from '../../position'

import type { GenesisSimState, GenesisTileRender } from '../../genesisTypes'

// Genesis rendering palettes — shared across epochs.
export const ROCK_COLORS = ['#696969', '#6B4226', '#808080', '#7B6B55']
export const DIRT_COLORS = ['#8B7355', '#7B6B55', '#806B50']
export const BURN_SCAR_COLORS = ['#3D2B1F', '#4A3728', '#352418']
export const GREEN_COLORS = ['#2E8B57', '#3CB371', '#50C878']
export const BRIGHT_GREEN_COLORS = ['#3CB371', '#50C878', '#66EE88']

// Crater palette — must match the brown palette in renderer.ts (state.craters
// rendering branch). Kept here so the genesis presentDay epoch can paint
// craters in their post-impact resting color, letting the cross-fade from
// fallOfCivilizations smoothly blend the red SATELLITE_TRAIL_COLORS into
// the brown resting state with no pop on the genesis-to-game handoff.
export const CRATER_COLORS = ['#8B4513', '#7A3B10', '#6B320D', '#5C290A', '#4D2007']

// Shared rendering for space tiles (stars — no water in space, it's not ocean).
// coastlineTiles are now a subset of landMask (outermost dirt ring), so they
// fall through the landMask guard and never reach the star path.
// Stars match the gameplay renderer: char is stable per tile, only the
// color slowly cycles via time * 0.0015. Cycling the char would
// flicker faster than the rest of the scene reads as. STAR_DENSITY = 12
// also matches gameplay (was 5 here, which painted twice as many stars
// as the gameplay-renderer's space tiles — now they match).
export const renderSpace = (sim: GenesisSimState, key: string, h: number, time: number): GenesisTileRender[] | null => {
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

// Shared rendering for lowland water (mask-based, land tiles only).
// The mask is built once during FirstWater.mutate from a seeded 2D
// smooth-noise field; aquatic-phase epochs all read the same coherent
// shape rather than recomputing per-tile hash scatter.
export const renderLowlandWater = (
  sim: GenesisSimState,
  key: string,
  h: number,
  time: number
): GenesisTileRender[] | null => {
  if (!sim.lowlandWaterMask.has(key)) return null
  const waterChars = ['~', '=', '-']
  const waterColors = ['#4466AA', '#335588', '#556699']
  const ci = (h + Math.floor(time * 0.003)) % waterChars.length
  const wi = h % waterColors.length
  return [{ char: waterChars[ci], color: waterColors[wi], dx: 0, dy: 0 }]
}

// Shared rendering for bare dirt (accounts for burn scars — darker soil)
export const renderDirt = (sim: GenesisSimState, key: string, h: number): GenesisTileRender[] => {
  if (sim.burnScars.has(key)) {
    return [{ char: '.', color: BURN_SCAR_COLORS[h % BURN_SCAR_COLORS.length], dx: 0, dy: 0 }]
  }
  if (sim.glacialPaths.has(key)) {
    return [{ char: '.', color: '#696969', dx: 0, dy: 0 }]
  }
  return [{ char: '.', color: DIRT_COLORS[h % DIRT_COLORS.length], dx: 0, dy: 0 }]
}

// Shared rendering for vegetation (consistent palette across all epochs)
export const renderVegetation = (
  sim: GenesisSimState,
  x: number,
  _y: number,
  h: number
): GenesisTileRender[] | null => {
  const key = posKey(x, _y)
  const veg = sim.vegetationMap.get(key) ?? 0
  if (veg <= 20) return null
  const nearRiver = sim.riverPaths.has(posKey(x + 1, _y)) || sim.riverPaths.has(posKey(x - 1, _y))
  const colors = nearRiver ? BRIGHT_GREEN_COLORS : GREEN_COLORS
  return [{ char: '%', color: colors[h % colors.length], dx: 0, dy: 0 }]
}
