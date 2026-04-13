import { useCallback, useState } from 'react'

import { resetGameState } from '@/hooks/useGameEngine'
import { GameScreen } from '@/components/GameScreen'
import { NamePrompt } from '@/components/NamePrompt'

const generateDevName = (): string => crypto.randomUUID().slice(0, 8)

const shouldSkipGenesis = (): boolean =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('skipGenesis')

const App = () => {
  const [stewardName, setStewardName] = useState(import.meta.env.DEV ? generateDevName() : null)

  const handleRestart = useCallback(() => {
    resetGameState()
    setStewardName(null)
  }, [])

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
