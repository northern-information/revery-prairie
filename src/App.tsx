import { useCallback, useEffect, useRef, useState } from 'react'

import { resetGameState } from '@/hooks/useGameEngine'
import { GameScreen } from '@/components/GameScreen'
import { GenesisScreen } from '@/components/GenesisScreen'
import { NamePrompt } from '@/components/NamePrompt'
import type { GenesisResult } from '@/engine/genesisTypes'

const generateDevName = (): string => crypto.randomUUID().slice(0, 8)

const shouldSkipGenesis = (): boolean =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('skipGenesis')

const DISSOLVE_MS = 200

const App = () => {
  const [stewardName, setStewardName] = useState(import.meta.env.DEV ? generateDevName() : null)
  const [genesisResult, setGenesisResult] = useState<GenesisResult | null>(null)
  const [genesisVisible, setGenesisVisible] = useState(true)
  const dissolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRestart = useCallback(() => {
    resetGameState()
    if (dissolveTimerRef.current) clearTimeout(dissolveTimerRef.current)
    dissolveTimerRef.current = null
    setStewardName(null)
    setGenesisResult(null)
    setGenesisVisible(true)
  }, [])

  const handleGenesisComplete = useCallback((result: GenesisResult) => {
    setGenesisResult(result)
    dissolveTimerRef.current = setTimeout(() => {
      setGenesisVisible(false)
    }, DISSOLVE_MS + 50)
  }, [])

  useEffect(() => {
    return () => {
      if (dissolveTimerRef.current) clearTimeout(dissolveTimerRef.current)
    }
  }, [])

  if (!stewardName) {
    return <NamePrompt onSubmit={setStewardName} />
  }

  const showGame = !!genesisResult || shouldSkipGenesis()
  const showGenesis = genesisVisible && !shouldSkipGenesis()

  return (
    <>
      {showGame && (
        <GameScreen
          key={stewardName}
          stewardName={stewardName}
          genesisResult={genesisResult ?? undefined}
          onRestart={handleRestart}
        />
      )}
      {showGenesis && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10,
            pointerEvents: genesisResult ? 'none' : 'auto',
            opacity: genesisResult ? 0 : 1,
            transition: `opacity ${String(DISSOLVE_MS)}ms ease-out`,
          }}
        >
          <GenesisScreen stewardName={stewardName} onComplete={handleGenesisComplete} />
        </div>
      )}
    </>
  )
}

export default App
