import { SectionHeader } from './PanelPrimitives'

import { COYOTE_COLOR } from '@/engine/constants'
import { getCoyotePosition, summonCoyote } from '@/engine/coyote'
import { getDefinition } from '@/engine/items'

import type { GameState } from '@/engine/types'

interface CoyoteScreenProps {
  state: GameState
  refreshUI: () => void
}

export const CoyoteScreen = ({ state, refreshUI }: CoyoteScreenProps) => {
  const modeLabel = state.coyoteMode === 'follow' ? 'following' : 'collecting'
  const cargoLabel = state.coyoteCargo ? getDefinition(state.coyoteCargo).name.toLowerCase() : 'empty'
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
        <span className="text-text">coyote</span>
      </div>

      <div>
        <SectionHeader>status</SectionHeader>
        <table className="w-full">
          <tbody>
            <tr>
              <td className="text-muted py-0.5">mode</td>
              <td className="py-0.5 text-right">{modeLabel}</td>
            </tr>
            <tr>
              <td className="text-muted py-0.5">carrying</td>
              <td className="py-0.5 text-right">{cargoLabel}</td>
            </tr>
            <tr>
              <td className="text-muted py-0.5">position</td>
              <td className="py-0.5 text-right">
                {coyotePos ? `${String(coyotePos.x)}, ${String(coyotePos.y)}` : 'unknown'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <SectionHeader>actions</SectionHeader>
        <button
          type="button"
          className="text-permacomputer hover:text-pink w-full py-1 text-left text-xs transition-colors"
          onClick={handleSummon}
        >
          {'>'} summon coyote
        </button>
      </div>
    </div>
  )
}
