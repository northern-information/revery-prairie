import {
  RAIN_FRONT_SPEED,
  RAIN_FRONT_WIDTH,
  WATER_DRAIN_RATE,
  WATER_MAX,
  WATER_PROXIMITY_FILL,
  WATER_PROXIMITY_RADIUS,
  WATER_RAIN_FILL,
} from './constants'
import { ComponentType } from './ecs/types'
import { Sky, WindDirection, Zone } from './types'

import type { GameState, Zone as ZoneType } from './types'

const isInRainAura = (state: GameState, zone: ZoneType, x: number, y: number): boolean => {
  for (const eid of state.world.query(ComponentType.Aura, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== zone) continue
    const aura = state.world.getComponent(eid, ComponentType.Aura)
    if (aura?.kind !== 'rain') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    const dx = x - pos.x
    const dy = y - pos.y
    if (dx * dx + dy * dy <= aura.radius * aura.radius) return true
  }
  return false
}

// Wind direction → rain front sweep axis. The front moves perpendicular-ish
// to how real weather fronts sweep across the prairie.
// Returns { axis, sign } where axis is 'x' or 'y' and sign is direction.
const windToFrontAxis = (
  dir: WindDirection
): { axis: 'x' | 'y'; sign: 1 | -1 } => {
  switch (dir) {
    case WindDirection.N:
      return { axis: 'y', sign: -1 }
    case WindDirection.S:
      return { axis: 'y', sign: 1 }
    case WindDirection.E:
      return { axis: 'x', sign: 1 }
    case WindDirection.W:
      return { axis: 'x', sign: -1 }
    case WindDirection.NE:
      return { axis: 'x', sign: 1 }
    case WindDirection.NW:
      return { axis: 'x', sign: -1 }
    case WindDirection.SE:
      return { axis: 'x', sign: 1 }
    case WindDirection.SW:
      return { axis: 'x', sign: -1 }
  }
}

const isInRainFront = (
  state: GameState,
  x: number,
  y: number
): boolean => {
  const { axis, sign } = windToFrontAxis(state.weather.windDirection)
  const mapSize = axis === 'x' ? state.overworldMapWidth : state.overworldMapHeight
  const coord = axis === 'x' ? x : y

  // Front position wraps around the map
  const frontPos = (state.rainFrontOffset * sign + mapSize) % mapSize
  const dist = ((coord - frontPos) * sign + mapSize) % mapSize

  return dist < RAIN_FRONT_WIDTH
}

export const tickTileWater = (state: GameState, zone: ZoneType): void => {
  if (zone !== Zone.Overworld) return

  const isRaining = state.weather.sky === Sky.Rain

  // Advance rain front when raining
  if (isRaining) {
    state.rainFrontOffset += RAIN_FRONT_SPEED
  }

  for (const [key, current] of state.tileWater) {
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr)
    const y = Number(yStr)

    // Water proximity to ponds/rivers — passive seepage
    const proximityBonus = state.waterProximity.get(key) ?? 0

    if ((isRaining && isInRainFront(state, x, y)) || isInRainAura(state, zone, x, y)) {
      state.tileWater.set(key, Math.min(current + WATER_RAIN_FILL, WATER_MAX))
    } else if (proximityBonus > 0) {
      // Near water body — drain slower, with passive fill
      const net = proximityBonus - WATER_DRAIN_RATE
      if (net > 0) {
        state.tileWater.set(key, Math.min(current + net, WATER_MAX))
      } else {
        state.tileWater.set(key, Math.max(current + net, 0))
      }
    } else {
      state.tileWater.set(key, Math.max(current - WATER_DRAIN_RATE, 0))
    }
  }
}

// Build proximity map — called once at state init
export const buildWaterProximity = (state: GameState): void => {
  const allWaterKeys: { x: number; y: number }[] = []
  for (const key of state.ponds) {
    const [xStr, yStr] = key.split(',')
    allWaterKeys.push({ x: Number(xStr), y: Number(yStr) })
  }
  for (const key of state.rivers) {
    const [xStr, yStr] = key.split(',')
    allWaterKeys.push({ x: Number(xStr), y: Number(yStr) })
  }

  if (allWaterKeys.length === 0) return

  for (const [key] of state.tileWater) {
    const [xStr, yStr] = key.split(',')
    const tx = Number(xStr)
    const ty = Number(yStr)

    let minDist = Infinity
    for (const w of allWaterKeys) {
      const dist = Math.abs(tx - w.x) + Math.abs(ty - w.y)
      if (dist < minDist) minDist = dist
    }

    if (minDist <= WATER_PROXIMITY_RADIUS) {
      // Linear falloff: full bonus at distance 1, zero at radius
      const bonus = WATER_PROXIMITY_FILL * (1 - minDist / (WATER_PROXIMITY_RADIUS + 1))
      if (bonus > 0) {
        state.waterProximity.set(key, bonus)
      }
    }
  }
}
