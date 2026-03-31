import { useEffect, useRef } from 'react'

import { setAmbient, setMusicEnabled, startDialogMusic, stopAll, stopDialogMusic, ZONE_MUSIC } from '@/engine/audio'
import { getCharacterDefinition } from '@/engine/characters'
import type { GameState, Zone } from '@/engine/types'

export const useMusic = (state: GameState): void => {
  const prevZoneRef = useRef<Zone | null>(null)
  const prevCharIdRef = useRef<string | null>(null)
  const prevEnabledRef = useRef(state.musicEnabled)

  useEffect(() => {
    const zone = state.currentZone
    const charId = state.activeDialog?.characterId ?? null
    const musicEnabled = state.musicEnabled

    // Handle enable/disable toggle
    if (musicEnabled !== prevEnabledRef.current) {
      prevEnabledRef.current = musicEnabled
      setMusicEnabled(musicEnabled)
      if (musicEnabled) {
        // Restart ambient for current zone
        setAmbient(ZONE_MUSIC[zone])
      }
    }

    if (!musicEnabled) {
      prevZoneRef.current = zone
      prevCharIdRef.current = charId
      return
    }

    // Handle zone change
    if (zone !== prevZoneRef.current) {
      prevZoneRef.current = zone
      setAmbient(ZONE_MUSIC[zone])
    }

    // Handle dialog open/close
    if (charId !== prevCharIdRef.current) {
      prevCharIdRef.current = charId

      if (charId) {
        const def = getCharacterDefinition(charId)
        if (def.music) {
          startDialogMusic(def.music)
        }
      } else {
        stopDialogMusic()
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
