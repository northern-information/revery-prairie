import { useCallback, useState } from 'react'

import { resetGameState } from '@/hooks/useGameEngine'
import { GameScreen } from '@/components/GameScreen'
import { NamePrompt } from '@/components/NamePrompt'
import { NetworkConnect } from '@/components/NetworkConnect'
import type { NetworkConnectResult } from '@/components/NetworkConnect'
import { NorthernInformationSplash } from '@/components/NorthernInformationSplash'

const generateDevName = (): string => crypto.randomUUID().slice(0, 8)

const shouldSkipGenesis = (): boolean =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('skipGenesis')

// DEV ergonomics: ?newPlayer forces the full first-time flow (splash +
// NamePrompt) even in DEV, where the steward name would otherwise
// auto-generate. Lets us preview what a fresh visitor sees without
// rebuilding for production.
const shouldSimulateNewPlayer = (): boolean =>
  new URLSearchParams(window.location.search).has('newPlayer')

const PRAIRIE_PATH = /^\/p\/([^/]+)\/?$/

type Route = { type: 'offline' } | { type: 'online-create' } | { type: 'online-join'; prairieId: string }

const detectRoute = (): Route => {
  const path = window.location.pathname
  const match = PRAIRIE_PATH.exec(path)
  if (!match) return { type: 'offline' }
  const id = decodeURIComponent(match[1])
  if (id === 'new') return { type: 'online-create' }
  return { type: 'online-join', prairieId: id }
}

// VITE_WORKER_URL may be:
//   - explicit URL (dev pointing at deployed worker, e.g. https://...workers.dev)
//   - empty string (dev pointing at same origin)
//   - undefined (production same-origin build, no env file)
// All three cases mean multiplayer is available; the network client
// derives the websocket URL from window.location when the value is empty.
const resolveWorkerUrl = (): string => {
  const raw: unknown = import.meta.env.VITE_WORKER_URL
  return typeof raw === 'string' ? raw : ''
}

const App = () => {
  const route = detectRoute()
  const workerUrl = resolveWorkerUrl()

  const [stewardName, setStewardName] = useState(
    !shouldSimulateNewPlayer() && import.meta.env.DEV && route.type === 'offline' ? generateDevName() : null
  )
  const [multiplayer, setMultiplayer] = useState<NetworkConnectResult | null>(null)
  // The colophon plays once per page load. Sticky across handleRestart;
  // only a hard reload remounts App and replays it. DEV + ?skipGenesis
  // bypasses it for fast iteration. `screenRevealed` flips at the
  // splash's fade-out start so the underlying screen (and any genesis
  // sequence it kicks off) mounts during the splash's 800ms fade-out,
  // producing a crossfade rather than a pop.
  const skipSplash = shouldSkipGenesis()
  const [screenRevealed, setScreenRevealed] = useState(skipSplash)
  const [splashComplete, setSplashComplete] = useState(skipSplash)
  const handleSplashFadeOutStart = useCallback(() => {
    setScreenRevealed(true)
  }, [])
  const handleSplashComplete = useCallback(() => {
    setSplashComplete(true)
  }, [])

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

  let screen: React.ReactElement
  if (route.type === 'online-create' || route.type === 'online-join') {
    screen = multiplayer ? (
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
    ) : (
      <NetworkConnect
        workerUrl={workerUrl}
        prairieId={route.type === 'online-join' ? route.prairieId : null}
        onConnected={setMultiplayer}
      />
    )
  } else if (!stewardName) {
    screen = <NamePrompt onSubmit={setStewardName} />
  } else {
    screen = (
      <GameScreen
        key={stewardName}
        stewardName={stewardName}
        skipGenesis={shouldSkipGenesis()}
        onRestart={handleRestart}
      />
    )
  }

  return (
    <>
      {screenRevealed && screen}
      {!splashComplete && (
        <NorthernInformationSplash
          onFadeOutStart={handleSplashFadeOutStart}
          onComplete={handleSplashComplete}
        />
      )}
    </>
  )
}

export default App
