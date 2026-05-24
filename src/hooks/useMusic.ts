import { useEffect, useRef } from 'react'

import { setAmbient, setAudioEnabled, startDialogMusic, stopAll, stopDialogMusic, ZONE_MUSIC } from '@/engine/audio'
import { getCharacterDefinition } from '@/engine/characters'
import { ComponentType } from '@/engine/ecs/types'
import { Zone } from '@/engine/types'
import type { GameState } from '@/engine/types'

// Returns true if the named character's entity carries a MusicEmitter.
// Dialog music is suppressed for such characters — the proximity track
// is already playing at the right gain and a second dialog track would
// double the audio.
const characterHasMusicEmitter = (state: GameState, characterId: string): boolean => {
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.MusicEmitter)) {
    const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (ident?.definitionId === characterId) return true
  }
  return false
}

export const useMusic = (state: GameState): void => {
  const prevZoneRef = useRef<Zone | null>(null)
  const prevCharIdRef = useRef<string | null>(null)
  const dialogStartedRef = useRef(false)
  const prevEnabledRef = useRef(state.audioEnabled)
  // Tracks whether genesis was active on the previous render so we can
  // crossfade the ambient track at the genesis-to-gameplay handoff
  // (precis #33).
  const prevGenesisRef = useRef(state.genesis !== null)

  useEffect(() => {
    const zone = state.currentZone
    const charId = state.activeDialog?.characterId ?? null
    const audioEnabled = state.audioEnabled

    // Handle enable/disable toggle
    if (audioEnabled !== prevEnabledRef.current) {
      prevEnabledRef.current = audioEnabled
      setAudioEnabled(audioEnabled)
      if (audioEnabled) {
        // Restart ambient for current zone (or overworld during genesis).
        setAmbient(state.genesis ? ZONE_MUSIC[Zone.Overworld] : ZONE_MUSIC[zone])
      }
    }

    if (!audioEnabled) {
      prevZoneRef.current = zone
      prevCharIdRef.current = charId
      return
    }

    // Precis #33 — during genesis playback the player is conceptually in
    // the house but the cinematic plays the overworld ambient. Pick
    // overworld music whenever state.genesis is non-null, regardless of
    // currentZone. The zone-change effect below still fires at handoff
    // (state.genesis flips to null), crossfading to the zone track.
    const wantedAmbient = state.genesis ? ZONE_MUSIC[Zone.Overworld] : ZONE_MUSIC[zone]

    // Handle zone (or genesis-state) change
    if (zone !== prevZoneRef.current || (state.genesis !== null) !== prevGenesisRef.current) {
      prevZoneRef.current = zone
      prevGenesisRef.current = state.genesis !== null
      setAmbient(wantedAmbient)
    }

    // Handle dialog open/close
    if (charId !== prevCharIdRef.current) {
      prevCharIdRef.current = charId

      if (charId) {
        const def = getCharacterDefinition(charId)
        if (def.music && !characterHasMusicEmitter(state, charId)) {
          startDialogMusic(def.music)
          dialogStartedRef.current = true
        }
      } else if (dialogStartedRef.current) {
        stopDialogMusic()
        dialogStartedRef.current = false
      }
    }

    // First render: start ambient if nothing is playing yet
    prevZoneRef.current ??= zone
  })

  // Cleanup on unmount (and StrictMode simulated unmount).
  // Reset refs so the remount treats the zone as fresh and re-calls setAmbient.
  useEffect(
    () => () => {
      stopAll()
      prevZoneRef.current = null
      prevCharIdRef.current = null
    },
    []
  )
}
