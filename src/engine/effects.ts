import { ComponentType } from './ecs/types'
import { getReveryDefinition } from './reveries'

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

  return [...seen]
}
