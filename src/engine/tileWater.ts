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

interface RainAura {
  x: number
  y: number
  radiusSq: number
}

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

// Wind direction → rain front sweep axis in the rotated cardinal frame
// (backlog-thinktank-v5 round 1). Under the rotated frame, cardinals (N/E/S/W)
// point at the diamond's tips on screen, so their fronts sweep along the
// iso-diagonal coordinates u = x + y (the diamond's vertical screen axis) and
// v = x - y (the diamond's horizontal screen axis). Ordinals (NE/SE/SW/NW)
// align with the storage axes, so their fronts sweep along x or y.
//
// sign indicates the direction the leading edge advances over time —
// positive means coord increases as rainFrontOffset grows.
export type RainFrontAxis = 'x' | 'y' | 'u' | 'v'

export const windToFrontAxis = (dir: WindDirection): { axis: RainFrontAxis; sign: 1 | -1 } => {
  switch (dir) {
    case WindDirection.N:
      // Wind from top tip; rain enters at u=max and advances toward u=0
      return { axis: 'u', sign: -1 }
    case WindDirection.S:
      return { axis: 'u', sign: 1 }
    case WindDirection.E:
      // Wind from right tip; rain enters at v=max and advances toward v=min
      return { axis: 'v', sign: -1 }
    case WindDirection.W:
      return { axis: 'v', sign: 1 }
    case WindDirection.NE:
      // Wind from upper-right edge (storage -x); rain advances along -x
      return { axis: 'x', sign: -1 }
    case WindDirection.SW:
      return { axis: 'x', sign: 1 }
    case WindDirection.SE:
      // Wind from lower-right edge (storage -y); rain advances along -y
      return { axis: 'y', sign: -1 }
    case WindDirection.NW:
      return { axis: 'y', sign: 1 }
  }
}

// Pure helper. Resolves a tile (x, y) into the front coordinate and the
// map extent along the given axis. The v axis is biased by mapHeight so
// coord is non-negative across the playable region, letting the modulo
// wrap math operate on positive values.
export const rainFrontCoord = (
  axis: RainFrontAxis,
  x: number,
  y: number,
  mapWidth: number,
  mapHeight: number
): { coord: number; mapSize: number } => {
  switch (axis) {
    case 'x':
      return { coord: x, mapSize: mapWidth }
    case 'y':
      return { coord: y, mapSize: mapHeight }
    case 'u':
      // Diamond's vertical screen axis: u spans [0, mapWidth + mapHeight - 2]
      return { coord: x + y, mapSize: mapWidth + mapHeight }
    case 'v':
      // Diamond's horizontal screen axis: v = x - y is signed; bias by
      // mapHeight so coord lands in [1, mapWidth + mapHeight - 1] across the
      // playable region.
      return { coord: x - y + mapHeight, mapSize: mapWidth + mapHeight }
  }
}

// Returns whether a tile is in the rain front (including blotchy fringe),
// and its edge alpha (1.0 in core, 0.0-1.0 in fringe, 0.0 outside).
// Fringe uses tileHash noise so the boundary is organic, not a straight line.
export const isInRainFront = (state: GameState, x: number, y: number): { hit: boolean; edgeAlpha: number } => {
  const { axis, sign } = windToFrontAxis(state.weather.windDirection)
  const { coord, mapSize } = rainFrontCoord(axis, x, y, state.overworldMapWidth, state.overworldMapHeight)

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

  const hasPrecipitation = state.precipitationIntensity > 0

  // Advance rain front when raining (even during fade-out so the front
  // doesn't freeze mid-map while intensity drains)
  if (hasPrecipitation) {
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

    const inFront = hasPrecipitation && isInRainFront(state, x, y).hit
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
