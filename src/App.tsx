import { useCallback, useEffect, useRef, useState } from 'react'

import { resetGameState } from '@/hooks/useGameEngine'
import { GameScreen } from '@/components/GameScreen'
import { GenesisScreen } from '@/components/GenesisScreen'
import { NamePrompt } from '@/components/NamePrompt'
import type { GenesisResult } from '@/engine/genesisTypes'

const generateDevName = (): string => crypto.randomUUID().slice(0, 8)

const shouldSkipGenesis = (): boolean =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('skipGenesis')

type FadePhase = 'none' | 'toBlack' | 'hold' | 'fromBlack'

const FADE_DURATION_MS = 300
const HOLD_MS = 100

const App = () => {
  const [stewardName, setStewardName] = useState(import.meta.env.DEV ? generateDevName() : null)
  const [genesisResult, setGenesisResult] = useState<GenesisResult | null>(null)
  const [fadePhase, setFadePhase] = useState<FadePhase>('none')
  const pendingResultRef = useRef<GenesisResult | null>(null)
  const transitionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    for (const t of transitionTimersRef.current) clearTimeout(t)
    transitionTimersRef.current = []
  }, [])

  const handleRestart = useCallback(() => {
    resetGameState()
    clearTimers()
    pendingResultRef.current = null
    setStewardName(null)
    setGenesisResult(null)
    setFadePhase('none')
  }, [clearTimers])

  const handleGenesisComplete = useCallback(
    (result: GenesisResult) => {
      pendingResultRef.current = result
      setFadePhase('toBlack')

      transitionTimersRef.current.push(
        setTimeout(() => {
          // Overlay is now fully opaque — swap screens
          setGenesisResult(pendingResultRef.current)
          setFadePhase('hold')

          transitionTimersRef.current.push(
            setTimeout(() => {
              // GameScreen has mounted — fade from black
              setFadePhase('fromBlack')

              transitionTimersRef.current.push(
                setTimeout(() => {
                  setFadePhase('none')
                }, FADE_DURATION_MS + 50)
              )
            }, HOLD_MS)
          )
        }, FADE_DURATION_MS + 50)
      )
    },
    []
  )

  // Clean up transition timers on unmount
  useEffect(() => {
    return clearTimers
  }, [clearTimers])

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
          opacity: fadePhase === 'toBlack' || fadePhase === 'hold' ? 1 : 0,
          transition: `opacity ${String(FADE_DURATION_MS)}ms`,
          zIndex: 50,
        }}
      />
    </>
  )
}

export default App
