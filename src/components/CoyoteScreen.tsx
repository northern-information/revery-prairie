import { SectionHeader, TextButton } from './PanelPrimitives'

import { COYOTE_COLOR } from '@/engine/constants'
import { getCoyotePosition, summonCoyote } from '@/engine/coyote'
import { getDefinition } from '@/engine/items'
import type { GameState } from '@/engine/types'

interface CoyoteScreenProps {
  state: GameState
  refreshUI: () => void
}

export const CoyoteScreen = ({ state, refreshUI }: CoyoteScreenProps) => {
  const modeLabel = state.coyoteMode === 'follow' ? 'Following' : 'Collecting'
  const cargoLabel = state.coyoteCargo ? getDefinition(state.coyoteCargo).name : 'Empty'
  const coyotePos = getCoyotePosition(state)

  const handleSummon = () => {
    summonCoyote(state)
    refreshUI()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span style={{ color: COYOTE_COLOR }} className="text-lg">
          C
        </span>
        <span className="text-text">Coyote</span>
      </div>

      <div>
        <SectionHeader>Status</SectionHeader>
        <table className="w-full">
          <tbody>
            <tr>
              <td className="text-muted py-0.5">Mode</td>
              <td className="py-0.5 text-right">{modeLabel}</td>
            </tr>
            <tr>
              <td className="text-muted py-0.5">Carrying</td>
              <td className="py-0.5 text-right">{cargoLabel}</td>
            </tr>
            <tr>
              <td className="text-muted py-0.5">Position</td>
              <td className="py-0.5 text-right">
                {coyotePos ? `${String(coyotePos.x)}, ${String(coyotePos.y)}` : 'Unknown'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <SectionHeader>Actions</SectionHeader>
        <TextButton onClick={handleSummon}>SUMMON COYOTE</TextButton>
      </div>
    </div>
  )
}
