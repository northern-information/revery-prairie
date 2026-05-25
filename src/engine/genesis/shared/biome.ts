import { SOIL_HEALTH_MAX } from '../../constants'
import { clamp } from './math'

import type { GenesisSimState } from '../../genesisTypes'

// Apply windward/leeward biome bias derived from sim.tectonicAxes.
// Prevailing wind blows from +x. For each land tile, find the nearest
// axis midpoint; project (tile - midpoint) onto the axis perpendicular.
// Positive projection = windward (wetter); negative = leeward (drier).
// Bias decays with distance from the axis (zero past 4 * axis.radius).
export const applyWindwardLeewardBias = (
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
