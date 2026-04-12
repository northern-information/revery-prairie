import { WATER_DRAIN_RATE, WATER_MAX, WATER_RAIN_FILL } from './constants'
import { ComponentType } from './ecs/types'
import { Sky, Zone } from './types'

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

export const tickTileWater = (state: GameState, zone: ZoneType): void => {
  if (zone !== Zone.Overworld) return

  const isRaining = state.weather.sky === Sky.Rain

  for (const [key, current] of state.tileWater) {
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr)
    const y = Number(yStr)

    if (isRaining || isInRainAura(state, zone, x, y)) {
      state.tileWater.set(key, Math.min(current + WATER_RAIN_FILL, WATER_MAX))
    } else {
      state.tileWater.set(key, Math.max(current - WATER_DRAIN_RATE, 0))
    }
  }
}
