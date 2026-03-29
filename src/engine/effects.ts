import { ComponentType } from './ecs'

import type { GameState } from './types'

export const AURA_RADIUS: Record<string, number> = {
  rain: 6,
}

export const getTileEffects = (state: GameState, x: number, y: number): string[] => {
  const seen = new Set<string>()
  for (const eid of state.world.query(ComponentType.Aura, ComponentType.Position)) {
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
  return [...seen]
}
