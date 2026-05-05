import { useState } from 'react'
import { CreditsModal } from './CreditsModal'
import { TextButton } from './PanelPrimitives'
import { CREDITS } from '@/engine/credits'

const FONT_SCALES = [1, 1.25, 1.5] as const
const FONT_SCALE_LABELS: Record<number, string> = {
  1: 'Small',
  1.25: 'Medium',
  1.5: 'Large',
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
  const [showCredits, setShowCredits] = useState(false)

  return (
    <div className="text-text font-mono text-xs">
      <div className="text-dim mb-3 text-xs">A Tyler Etters game.</div>
      <div className="flex flex-col gap-2">
        <TextButton onClick={onResume}>Resume</TextButton>
        {confirming ? (
          <div className="flex gap-2">
            <TextButton onClick={onNewGame}>Confirm?</TextButton>
            <TextButton
              onClick={() => {
                setConfirming(false)
              }}
            >
              Cancel
            </TextButton>
          </div>
        ) : (
          <TextButton
            onClick={() => {
              setConfirming(true)
            }}
          >
            New Game
          </TextButton>
        )}
        <TextButton onClick={onToggleUnits}>Units: {metric ? 'Metric' : 'Imperial'}</TextButton>
        <TextButton onClick={onToggleMusic}>Music: {musicEnabled ? 'On' : 'Off'}</TextButton>
        <TextButton onClick={onToggleAutoHidePanels}>
          Auto-hide panels: {autoHidePanels ? 'On' : 'Off'}
        </TextButton>
        <TextButton onClick={onCycleFontScale}>Font: {FONT_SCALE_LABELS[fontScale] ?? 'Medium'}</TextButton>
        <TextButton
          onClick={() => {
            setShowCredits(true)
          }}
        >
          Credits
        </TextButton>
      </div>
      {showCredits && (
        <CreditsModal
          credits={CREDITS}
          onClose={() => {
            setShowCredits(false)
          }}
        />
      )}
    </div>
  )
}

export { FONT_SCALES }
