import { useState } from 'react'

interface MenuProps {
  onResume: () => void
  onNewGame: () => void
  metric: boolean
  onToggleUnits: () => void
  musicEnabled: boolean
  onToggleMusic: () => void
}

export const Menu = ({ onResume, onNewGame, metric, onToggleUnits, musicEnabled, onToggleMusic }: MenuProps) => {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="text-text font-mono text-sm">
      <div className="text-dim mb-3 text-xs">a tyler etters game</div>
      <div className="flex flex-col gap-2">
        <button type="button" className="text-text hover:text-pink text-left" onClick={onResume}>
          resume
        </button>
        {confirming ? (
          <div className="flex gap-2">
            <button type="button" className="text-text hover:text-pink text-left" onClick={onNewGame}>
              confirm?
            </button>
            <button
              type="button"
              className="text-text hover:text-pink text-left"
              onClick={() => {
                setConfirming(false)
              }}
            >
              cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="text-text hover:text-pink text-left"
            onClick={() => {
              setConfirming(true)
            }}
          >
            new game
          </button>
        )}
        <button type="button" className="text-text hover:text-pink text-left" onClick={onToggleUnits}>
          units: {metric ? 'metric' : 'imperial'}
        </button>
        <button type="button" className="text-text hover:text-pink text-left" onClick={onToggleMusic}>
          music: {musicEnabled ? 'on' : 'off'}
        </button>
      </div>
    </div>
  )
}
