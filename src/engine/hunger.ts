import { ComponentType } from './ecs/types'

import type { GameState, Position } from './types'

/**
 * Generic creature hunger tick. For each entity matching `entityTag`:
 * - If `isNearFood(state, pos)` returns true, reset hungerMs to 0
 * - Otherwise, increment hungerMs by `tickMs`
 * - If hungerMs >= starvationMs, destroy the entity and add its position to the returned deaths array
 *
 * Entities missing the HungerTimer component are skipped.
 */
export const tickCreatureHunger = (
  state: GameState,
  entityTag: string,
  starvationMs: number,
  tickMs: number,
  isNearFood: (state: GameState, pos: Position) => boolean,
): Position[] => {
  const deaths: Position[] = []

  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== entityTag) continue

    const hunger = state.world.getComponent(eid, ComponentType.HungerTimer)
    if (!hunger) continue

    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue

    if (isNearFood(state, pos)) {
      hunger.hungerMs = 0
    } else {
      hunger.hungerMs += tickMs
    }

    if (hunger.hungerMs >= starvationMs) {
      deaths.push({ x: pos.x, y: pos.y })
      state.world.destroyEntity(eid)
    }
  }

  return deaths
}
