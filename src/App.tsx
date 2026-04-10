import { useCallback, useEffect, useRef, useState } from 'react'

import { resetGameState } from '@/hooks/useGameEngine'
import { GameScreen } from '@/components/GameScreen'
import { GenesisScreen } from '@/components/GenesisScreen'
import { NamePrompt } from '@/components/NamePrompt'
import type { GenesisResult } from '@/engine/genesisTypes'

const generateDevName = (): string => crypto.randomUUID().slice(0, 8)

const shouldSkipGenesis = (): boolean =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('skipGenesis')

const App = () => {
  const [stewardName, setStewardName] = useState(import.meta.env.DEV ? generateDevName() : null)
  const [genesisResult, setGenesisResult] = useState<GenesisResult | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRestart = useCallback(() => {
    resetGameState()
    setStewardName(null)
    setGenesisResult(null)
    setTransitioning(false)
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
  }, [])

  const handleGenesisComplete = useCallback((result: GenesisResult) => {
    setGenesisResult(result)
    setTransitioning(true)
    transitionTimerRef.current = setTimeout(() => {
      setTransitioning(false)
      transitionTimerRef.current = null
    }, 400)
  }, [])

  // Clean up transition timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        clearTimeout(transitionTimerRef.current)
      }
    }
  }, [])

  if (!stewardName) {
    return <NamePrompt onSubmit={setStewardName} />
  }

  const showGenesis = !genesisResult && !shouldSkipGenesis()

  return (
    <>
      {showGenesis ? (
        <GenesisScreen stewardName={stewardName} onComplete={handleGenesisComplete} />
      ) : (
        <GameScreen
          key={stewardName}
          stewardName={stewardName}
          genesisResult={genesisResult ?? undefined}
          onRestart={handleRestart}
        />
      )}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'black',
          pointerEvents: 'none',
          opacity: transitioning ? 1 : 0,
          transition: 'opacity 300ms',
          zIndex: 50,
        }}
      />
    </>
  )
}

export default App
