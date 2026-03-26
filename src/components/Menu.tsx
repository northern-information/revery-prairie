import { useState } from 'react'

interface MenuProps {
  onResume: () => void
  onNewGame: () => void
  metric: boolean
  onToggleUnits: () => void
}

export const Menu = ({ onResume, onNewGame, metric, onToggleUnits }: MenuProps) => {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="fixed inset-0 z-10" onClick={onResume}>
      <div
        className="border-border text-text fixed top-1/2 left-1/2 min-w-56 -translate-x-1/2 -translate-y-1/2 border bg-black/85 px-8 py-6 font-mono text-sm"
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        <div className="border-border-dim mb-4 flex items-start justify-between border-b pb-2">
          <div>
            <div className="text-text">revery prairie</div>
            <div className="text-dim text-xs">a tyler etters game</div>
          </div>
          <button type="button" className="text-dim hover:text-text ml-4" onClick={onResume}>
            x
          </button>
        </div>
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
        </div>
      </div>
    </div>
  )
}
