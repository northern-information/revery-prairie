import { RAIN_FRONT_WIDTH } from './constants'
import { ComponentType } from './ecs/types'
import { posKey } from './position'
import { getReveryDefinition } from './reveries'
import { Sky, WindDirection, Zone } from './types'

import type { GameState } from './types'

export const AURA_RADIUS: Record<string, number> = {
  rain: 6,
}

export const getTileEffects = (state: GameState, x: number, y: number): string[] => {
  const seen = new Set<string>()
  const zone = state.currentZone

  // Aura effects (e.g. Gron's rain)
  for (const eid of state.world.query(ComponentType.Aura, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== zone) continue
    const aura = state.world.getComponent(eid, ComponentType.Aura)
    if (!aura) continue
    const r = aura.radius
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    const dx = x - pos.x
    const dy = y - pos.y
    if (dx * dx + dy * dy <= r * r) {
      seen.add(aura.kind)
    }
  }

  // Revery cast effects
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== zone) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'reveryCast') continue
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!effect?.reveryId) continue
    const multiPos = state.world.getComponent(eid, ComponentType.MultiPosition)
    if (!multiPos) continue
    for (const pos of multiPos.positions) {
      if (pos.x === x && pos.y === y) {
        const def = getReveryDefinition(effect.reveryId)
        seen.add(def.name.toLowerCase())
        break
      }
    }
  }

  // Weather rain front (overworld only)
  if (state.weather.sky === Sky.Rain && zone === Zone.Overworld) {
    const windDir = state.weather.windDirection
    const frontAxis =
      windDir === WindDirection.N || windDir === WindDirection.S ? 'y' : 'x'
    const frontSign =
      windDir === WindDirection.N || windDir === WindDirection.W || windDir === WindDirection.NW || windDir === WindDirection.SW
        ? -1
        : 1
    const frontMapSize = frontAxis === 'x' ? state.overworldMapWidth : state.overworldMapHeight
    const frontPos = ((state.rainFrontOffset * frontSign) % frontMapSize + frontMapSize) % frontMapSize
    const coord = frontAxis === 'x' ? x : y
    const dist = ((coord - frontPos) * frontSign + frontMapSize) % frontMapSize
    if (dist < RAIN_FRONT_WIDTH) {
      seen.add('rain')
    }
  }

  // Glinting zones (overworld only)
  if (zone === Zone.Overworld && state.glintZones.has(posKey(x, y))) {
    seen.add('glinting')
  }

  return [...seen]
}
