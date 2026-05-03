import {
  RAIN_FRONT_FRINGE,
  RAIN_FRONT_SPEED,
  RAIN_FRONT_WIDTH,
  WATER_DRAIN_RATE,
  WATER_MAX,
  WATER_PROXIMITY_FILL,
  WATER_PROXIMITY_RADIUS,
  WATER_RAIN_FILL,
} from './constants'
import { ComponentType } from './ecs/types'
import { tileHash } from './position'
import { WindDirection, Zone } from './types'
import { isEntityInCurrentZone } from './zone'

import type { GameState, Zone as ZoneType } from './types'

interface RainAura { x: number; y: number; radiusSq: number }

// Collect all active rain auras in the given zone into a plain array.
// Called once per tickTileWater so the ECS query runs once instead of
// once per tile (previously O(n_tiles × n_query) → now O(n_aura + n_tiles)).
const collectRainAuras = (state: GameState, zone: ZoneType): RainAura[] => {
  const auras: RainAura[] = []
  for (const eid of state.world.query(ComponentType.Aura, ComponentType.Position)) {
    const inZone =
      zone === state.currentZone
        ? isEntityInCurrentZone(state, eid)
        : state.world.getComponent(eid, ComponentType.EntityZone)?.zone === zone
    if (!inZone) continue
    const aura = state.world.getComponent(eid, ComponentType.Aura)
    if (aura?.kind !== 'rain') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    auras.push({ x: pos.x, y: pos.y, radiusSq: aura.radius * aura.radius })
  }
  return auras
}

// Wind direction → rain front sweep axis. The front moves perpendicular-ish
// to how real weather fronts sweep across the prairie.
// Returns { axis, sign } where axis is 'x' or 'y' and sign is direction.
export const windToFrontAxis = (
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

// Returns whether a tile is in the rain front (including blotchy fringe),
// and its edge alpha (1.0 in core, 0.0-1.0 in fringe, 0.0 outside).
// Fringe uses tileHash noise so the boundary is organic, not a straight line.
export const isInRainFront = (
  state: GameState,
  x: number,
  y: number
): { hit: boolean; edgeAlpha: number } => {
  const { axis, sign } = windToFrontAxis(state.weather.windDirection)
  const mapSize = axis === 'x' ? state.overworldMapWidth : state.overworldMapHeight
  const coord = axis === 'x' ? x : y

  // Front position wraps around the map
  const frontPos = (state.rainFrontOffset * sign + mapSize) % mapSize
  const dist = ((coord - frontPos) * sign + mapSize) % mapSize

  // Core zone — fully inside
  if (dist >= RAIN_FRONT_FRINGE && dist < RAIN_FRONT_WIDTH - RAIN_FRONT_FRINGE) {
    return { hit: true, edgeAlpha: 1 }
  }

  // Leading fringe (entering edge)
  if (dist < RAIN_FRONT_FRINGE) {
    const t = dist / RAIN_FRONT_FRINGE // 0 at outer edge, 1 at core boundary
    const threshold = t * t // quadratic — sparse at edge, dense near core
    const noise = (tileHash(x * 7, y * 13) % 1000) / 1000
    if (noise < threshold) return { hit: true, edgeAlpha: t }
    return { hit: false, edgeAlpha: 0 }
  }

  // Trailing fringe (exiting edge)
  if (dist < RAIN_FRONT_WIDTH) {
    const overshoot = dist - (RAIN_FRONT_WIDTH - RAIN_FRONT_FRINGE)
    const t = 1 - overshoot / RAIN_FRONT_FRINGE // 1 at core boundary, 0 at outer edge
    const threshold = t * t
    const noise = (tileHash(x * 7, y * 13) % 1000) / 1000
    if (noise < threshold) return { hit: true, edgeAlpha: t }
    return { hit: false, edgeAlpha: 0 }
  }

  // Outside the front entirely
  return { hit: false, edgeAlpha: 0 }
}

export const tickTileWater = (state: GameState, zone: ZoneType): void => {
  if (zone !== Zone.Overworld) return

  const hasRainIntensity = state.rainIntensity > 0

  // Advance rain front when raining (even during fade-out so the front
  // doesn't freeze mid-map while intensity drains)
  if (hasRainIntensity) {
    state.rainFrontOffset += RAIN_FRONT_SPEED
  }

  // Collect rain auras once before the tile loop. Previously isInRainAura
  // ran state.world.query() per tile — O(n_tiles × n_query). Now O(n_aura + n_tiles).
  const rainAuras = collectRainAuras(state, zone)

  for (const [key, current] of state.tileWater) {
    // Avoid key.split(',') which allocates a new array per tile.
    const sep = key.indexOf(',')
    const x = Number(key.slice(0, sep))
    const y = Number(key.slice(sep + 1))

    // Water proximity to ponds/rivers — passive seepage
    const proximityBonus = state.waterProximity.get(key) ?? 0

    const inFront = hasRainIntensity && isInRainFront(state, x, y).hit
    let inAura = false
    for (const aura of rainAuras) {
      const dx = x - aura.x
      const dy = y - aura.y
      if (dx * dx + dy * dy <= aura.radiusSq) {
        inAura = true
        break
      }
    }

    if (inFront || inAura) {
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
