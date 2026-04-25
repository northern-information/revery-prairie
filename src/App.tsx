import { useCallback, useState } from 'react'

import { resetGameState } from '@/hooks/useGameEngine'
import { GameScreen } from '@/components/GameScreen'
import { NamePrompt } from '@/components/NamePrompt'
import { NetworkConnect, type NetworkConnectResult } from '@/components/NetworkConnect'

const generateDevName = (): string => crypto.randomUUID().slice(0, 8)

const shouldSkipGenesis = (): boolean =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('skipGenesis')

const PRAIRIE_PATH = /^\/p\/([^/]+)\/?$/

type Route =
  | { type: 'offline' }
  | { type: 'online-create' }
  | { type: 'online-join'; prairieId: string }

const detectRoute = (): Route => {
  const path = window.location.pathname
  const match = PRAIRIE_PATH.exec(path)
  if (!match) return { type: 'offline' }
  const id = decodeURIComponent(match[1])
  if (id === 'new') return { type: 'online-create' }
  return { type: 'online-join', prairieId: id }
}

const App = () => {
  const route = detectRoute()
  const workerUrl = import.meta.env.VITE_WORKER_URL as string | undefined

  const [stewardName, setStewardName] = useState(
    import.meta.env.DEV && route.type === 'offline' ? generateDevName() : null
  )
  const [multiplayer, setMultiplayer] = useState<NetworkConnectResult | null>(null)

  const handleRestart = useCallback(() => {
    resetGameState()
    if (multiplayer) {
      multiplayer.client.disconnect()
    }
    setMultiplayer(null)
    setStewardName(null)
    if (route.type !== 'offline') {
      window.history.replaceState(null, '', '/')
      window.location.reload()
    }
  }, [multiplayer, route.type])

  // Online flow: connect screen → game
  if (route.type === 'online-create' || route.type === 'online-join') {
    if (multiplayer) {
      return (
        <GameScreen
          key={multiplayer.welcome.sessionId}
          stewardName={multiplayer.stewardName}
          skipGenesis={shouldSkipGenesis()}
          onRestart={handleRestart}
          multiplayer={{
            client: multiplayer.client,
            welcome: multiplayer.welcome,
            prairieId: multiplayer.prairieId,
            ownerToken: multiplayer.ownerToken,
            color: multiplayer.color,
          }}
        />
      )
    }
    return (
      <NetworkConnect
        workerUrl={workerUrl}
        prairieId={route.type === 'online-join' ? route.prairieId : null}
        onConnected={setMultiplayer}
      />
    )
  }

  // Offline flow
  if (!stewardName) {
    return <NamePrompt onSubmit={setStewardName} />
  }

  return (
    <GameScreen
      key={stewardName}
      stewardName={stewardName}
      skipGenesis={shouldSkipGenesis()}
      onRestart={handleRestart}
    />
  )
}

export default App
