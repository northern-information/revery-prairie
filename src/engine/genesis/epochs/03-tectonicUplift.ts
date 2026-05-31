import { GenesisEpochId } from '../../genesisTypes'
import { posKey } from '../../position'
import { clamp, renderDirt, renderSpace, tileHash } from '../shared'

import type { GenesisEpoch, TectonicAxis } from '../../genesisTypes'
import type { Position } from '../../types'

export const tectonicUplift: GenesisEpoch = {
  id: GenesisEpochId.TectonicUplift,
  durationMs: 2000,
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
