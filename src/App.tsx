import { useCallback, useState } from 'react'

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

  const handleRestart = useCallback(() => {
    resetGameState()
    setStewardName(null)
    setGenesisResult(null)
  }, [])

  if (!stewardName) {
    return <NamePrompt onSubmit={setStewardName} />
  }

  if (!genesisResult && !shouldSkipGenesis()) {
    return <GenesisScreen stewardName={stewardName} onComplete={setGenesisResult} />
  }

  return (
    <GameScreen
      key={stewardName}
      stewardName={stewardName}
      genesisResult={genesisResult ?? undefined}
      onRestart={handleRestart}
    />
  )
}

export default App
