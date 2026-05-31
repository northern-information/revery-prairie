import { updateProximityMusic } from './audio'
import { ComponentType } from './ecs/types'
import { WATERFALL_AUDIO_RADIUS, WATERFALL_AUDIO_URL } from './tileBg'
import { Zone } from './types'
import { isEntityInCurrentZone } from './zone'

import type { ProximityEmitterSample } from './audio'
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
  // During genesis the player is sitting at the overworld map center
  // next to Gron — close enough that his proximity track would play
  // over the genesis ambient. The cinematic shouldn't have NPC music.
  // Skip proximity while genesis is mid-playback; the regular ambient
  // (overworld.mp3) plays unobstructed.
  if (state.genesis) {
    updateProximityMusic([])
    return
  }
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

  // RP-64 — Waterfall positional emitters. Overworld only (no
  // waterfalls in caves/ruins/house). Frozen waterfalls are
  // silent (silence reads as ice). All waterfalls share one URL
  // so updateProximityMusic's max-across-same-url logic caps the
  // audible volume at 1 — the closest waterfall wins.
  if (state.currentZone === Zone.Overworld) {
    const radiusSq = WATERFALL_AUDIO_RADIUS * WATERFALL_AUDIO_RADIUS
    for (const waterfall of state.waterfalls.values()) {
      if (waterfall.frozen) continue
      const dx = px - waterfall.topX
      const dy = py - waterfall.topY
      samples.push({
        url: WATERFALL_AUDIO_URL,
        distSq: dx * dx + dy * dy,
        radiusSq,
      })
    }
  }

  updateProximityMusic(samples)
}
