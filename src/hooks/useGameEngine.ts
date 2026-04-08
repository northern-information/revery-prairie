import { useCallback, useMemo, useState } from 'react'

import { createGameState } from '@/engine/state'
import type { GenesisResult } from '@/engine/genesisTypes'
import type { GameState } from '@/engine/types'

// Game state lives outside React's render cycle.
// It is created once and mutated by the engine.
let gameState: GameState | null = null

export const resetGameState = (): void => {
  gameState = null
}

export const useGameEngine = (
  stewardName: string,
  viewportWidth: number,
  viewportHeight: number,
  genesisResult?: GenesisResult
) => {
  const [uiVersion, setUiVersion] = useState(0)

  const state = useMemo(() => {
    gameState ??= createGameState(stewardName, viewportWidth, viewportHeight, genesisResult)
    return gameState
    // Only create once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshUI = useCallback(() => {
    setUiVersion(v => v + 1)
  }, [])

  return {
    state,
    refreshUI,
    uiVersion,
  }
}
