import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { triggerPlayerSpawnShower } from '@/engine/celestial'
import { completeGenesis } from '@/engine/genesis'
import { createGameState } from '@/engine/state'

import { collapseFacingToCardinal } from '@/engine/types'

import type { NetworkClient } from '@/network/client'
import type {
  ColorId,
  PeerJoinedFrame,
  PeerLeftFrame,
  PeerPositionFrame,
  WelcomeFrame,
} from '@revery-prairie/shared'
import type { GameState } from '@/engine/types'

// Game state lives outside React's render cycle.
// It is created once and mutated by the engine.
let gameState: GameState | null = null

export const resetGameState = (): void => {
  gameState = null
}

export interface MultiplayerHookArgs {
  client: NetworkClient
  welcome: WelcomeFrame
  prairieId: string
  ownerToken: string | null
  color: ColorId
}

export const useGameEngine = (
  stewardName: string,
  viewportWidth: number,
  viewportHeight: number,
  skipGenesis?: boolean,
  multiplayer?: MultiplayerHookArgs
) => {
  const [uiVersion, setUiVersion] = useState(0)

  const initializedRef = useRef(false)
  if (!initializedRef.current) {
    if (multiplayer) {
      const seed = multiplayer.welcome.world.genesisSeed
      const initial = createGameState(seed, viewportWidth, viewportHeight)
      initial.stewardName = stewardName
      initial.multiplayerSession = {
        prairieId: multiplayer.prairieId,
        ownerToken: multiplayer.ownerToken,
        sessionId: multiplayer.welcome.sessionId,
        stewardName,
        color: multiplayer.color,
        role: multiplayer.welcome.isOwner ? 'host' : 'visitor',
        status: 'connected',
      }
      for (const peer of multiplayer.welcome.peers) {
        initial.remotePlayers.set(peer.sessionId, {
          sessionId: peer.sessionId,
          stewardName: peer.stewardName,
          color: peer.color,
          x: peer.x,
          y: peer.y,
          facing: peer.facing,
          lastUpdateMs: Date.now(),
        })
      }
      const client = multiplayer.client
      initial.onPlayerMoved = () => {
        if (!gameState) return
        // Wire protocol is 4-cardinal; collapse local 8-way facing to its
        // dominant cardinal so the protocol stays simple. Diagonals fold
        // into the closest cardinal by their world-Y axis (the "iso axis"
        // that visually dominates), with a fallback to world-X.
        const cardinalFacing = collapseFacingToCardinal(gameState.playerFacing)
        client.sendPosition(gameState.player.x, gameState.player.y, cardinalFacing)
      }
      gameState = initial
    } else {
      gameState ??= createGameState(stewardName, viewportWidth, viewportHeight)
    }
    // Hand the spawn ceremony trigger to genesis.ts via a callback so the
    // engine layer doesn't import celestial.ts (which would form a cycle
    // through manual.ts). Fires synchronously inside completeGenesis so the
    // first gameplay render already sees playerSpawn.visible === false.
    gameState.onGenesisComplete = (handoffTime: number) => {
      if (!gameState) return
      triggerPlayerSpawnShower(gameState, gameState.player, handoffTime)
    }
    initializedRef.current = true
  }
  if (!gameState) throw new Error('GameState not initialized')
  const state = gameState

  // Defer skipGenesis to a layout effect so the consumer (GameScreen) has
  // had a chance to wire state.onGenesisEpochStart during its render —
  // otherwise URL-skip would flush all 14 narration entries to a null
  // callback and lose them.
  const skipFiredRef = useRef(false)
  useLayoutEffect(() => {
    if (skipGenesis && state.genesis && !skipFiredRef.current) {
      skipFiredRef.current = true
      completeGenesis(state)
    }
  }, [skipGenesis, state])

  const refreshUI = useCallback(() => {
    setUiVersion(v => v + 1)
  }, [])

  useEffect(() => {
    if (!multiplayer) return undefined
    const client = multiplayer.client

    const onPeerJoined = (frame: PeerJoinedFrame) => {
      state.remotePlayers.set(frame.sessionId, {
        sessionId: frame.sessionId,
        stewardName: frame.stewardName,
        color: frame.color,
        x: frame.x,
        y: frame.y,
        facing: frame.facing,
        lastUpdateMs: Date.now(),
      })
      refreshUI()
    }
    const onPeerPosition = (frame: PeerPositionFrame) => {
      const remote = state.remotePlayers.get(frame.sessionId)
      if (remote) {
        remote.x = frame.x
        remote.y = frame.y
        remote.facing = frame.facing
        remote.lastUpdateMs = Date.now()
      }
      refreshUI()
    }
    const onPeerLeft = (frame: PeerLeftFrame) => {
      state.remotePlayers.delete(frame.sessionId)
      refreshUI()
    }
    const onStatusChange = (status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected') => {
      if (state.multiplayerSession) {
        state.multiplayerSession.status = status
        refreshUI()
      }
    }

    client.on('peer-joined', onPeerJoined)
    client.on('peer-position', onPeerPosition)
    client.on('peer-left', onPeerLeft)
    client.on('status-change', onStatusChange)

    return () => {
      client.off('peer-joined', onPeerJoined)
      client.off('peer-position', onPeerPosition)
      client.off('peer-left', onPeerLeft)
      client.off('status-change', onStatusChange)
    }
  }, [multiplayer, state, refreshUI])

  return {
    state,
    refreshUI,
    uiVersion,
  }
}
