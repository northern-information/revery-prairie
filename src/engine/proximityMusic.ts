import { updateProximityMusic, type ProximityEmitterSample } from './audio'
import { ComponentType } from './ecs/types'
import { isEntityInCurrentZone } from './zone'

import type { GameState } from './types'

// Bridge between the ECS and the audio module's proximity API. Queries
// every MusicEmitter in the current zone, computes squared distance from
// the player, and hands the result to updateProximityMusic. Called once
// per frame from the engine RAF loop (gameLoop.ts).
//
// Emitters outside the player's current zone are skipped so a cave or
// ruin track does not bleed through when the player is in the overworld
// (and vice versa).
export const tickProximityMusic = (state: GameState): void => {
  const samples: ProximityEmitterSample[] = []
  const px = state.player.x
  const py = state.player.y

  for (const eid of state.world.query(ComponentType.MusicEmitter, ComponentType.Position)) {
    if (!isEntityInCurrentZone(state, eid)) continue
    const emitter = state.world.getComponent(eid, ComponentType.MusicEmitter)
    if (!emitter) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    const dx = px - pos.x
    const dy = py - pos.y
    samples.push({
      url: emitter.url,
      distSq: dx * dx + dy * dy,
      radiusSq: emitter.radius * emitter.radius,
    })
  }

  updateProximityMusic(samples)
}
