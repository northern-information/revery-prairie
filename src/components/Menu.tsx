import { useState } from 'react'
import { TextButton } from './PanelPrimitives'

const FONT_SCALES = [1, 1.25, 1.5] as const
const FONT_SCALE_LABELS: Record<number, string> = {
  1: 'small',
  1.25: 'medium',
  1.5: 'large',
}

interface MenuProps {
  onResume: () => void
  onNewGame: () => void
  metric: boolean
  onToggleUnits: () => void
  musicEnabled: boolean
  onToggleMusic: () => void
  autoHidePanels: boolean
  onToggleAutoHidePanels: () => void
  fontScale: number
  onCycleFontScale: () => void
}

export const Menu = ({
  onResume,
  onNewGame,
  metric,
  onToggleUnits,
  musicEnabled,
  onToggleMusic,
  autoHidePanels,
  onToggleAutoHidePanels,
  fontScale,
  onCycleFontScale,
}: MenuProps) => {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="text-text font-mono text-xs">
      <div className="text-dim mb-3 text-xs">a tyler etters game</div>
      <div className="flex flex-col gap-2">
        <TextButton onClick={onResume}>resume</TextButton>
        {confirming ? (
          <div className="flex gap-2">
            <TextButton onClick={onNewGame}>confirm?</TextButton>
            <TextButton
              onClick={() => {
                setConfirming(false)
              }}
            >
              cancel
            </TextButton>
          </div>
        ) : (
          <TextButton
            onClick={() => {
              setConfirming(true)
            }}
          >
            new game
          </TextButton>
        )}
        <TextButton onClick={onToggleUnits}>units: {metric ? 'metric' : 'imperial'}</TextButton>
        <TextButton onClick={onToggleMusic}>music: {musicEnabled ? 'on' : 'off'}</TextButton>
        <TextButton onClick={onToggleAutoHidePanels}>
          auto-hide panels: {autoHidePanels ? 'on' : 'off'}
        </TextButton>
        <TextButton onClick={onCycleFontScale}>font: {FONT_SCALE_LABELS[fontScale] ?? 'medium'}</TextButton>
      </div>
    </div>
  )
}

export { FONT_SCALES }
