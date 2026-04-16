import { ListCard, TextButton } from './PanelPrimitives'

import { assignActionBarSlot, clearActionBarSlot } from '@/engine/actionBar'
import { getLore } from '@/engine/manual'
import { getReveryDefinition } from '@/engine/reveries'
import type { GameState } from '@/engine/types'

interface ReveriesPanelProps {
  state: GameState
  refreshUI: () => void
}

export const ReveriesPanel = ({ state, refreshUI }: ReveriesPanelProps) => {
  const equippedIds = new Set(state.actionBar.filter(s => s?.kind === 'revery').map(s => s?.id))

  const handleEquip = (reveryId: string) => {
    // Find first empty slot
    const emptySlot = state.actionBar.findIndex(s => s === null)
    if (emptySlot === -1) return
    assignActionBarSlot(state, emptySlot, 'revery', reveryId)
    refreshUI()
  }

  const handleUnequip = (reveryId: string) => {
    const slotIndex = state.actionBar.findIndex(s => s?.kind === 'revery' && s.id === reveryId)
    if (slotIndex === -1) return
    clearActionBarSlot(state, slotIndex)
    refreshUI()
  }

  const handleMoveSlot = (reveryId: string, direction: -1 | 1) => {
    const fromIndex = state.actionBar.findIndex(s => s?.kind === 'revery' && s.id === reveryId)
    if (fromIndex === -1) return
    const toIndex = fromIndex + direction
    if (toIndex < 0 || toIndex >= state.actionBar.length) return

    // Swap
    const temp = state.actionBar[toIndex]
    state.actionBar[toIndex] = state.actionBar[fromIndex]
    state.actionBar[fromIndex] = temp
    refreshUI()
  }

  return (
    <div className="text-text font-mono text-xs">
      {state.reveries.length === 0 && <div className="text-dim">no reveries collected yet.</div>}

      {state.reveries.map(id => {
        const def = getReveryDefinition(id)
        const isEquipped = equippedIds.has(id)
        const slotIndex = state.actionBar.findIndex(s => s?.kind === 'revery' && s.id === id)

        return (
          <ListCard key={id} accentColor={def.glyphColor} className="flex items-center gap-2">
            <span className="text-base" style={{ color: def.glyphColor }}>
              {def.glyphs[0]}
            </span>
            <div className="flex-1">
              <div style={{ color: def.glyphColor }}>{def.name.toLowerCase()}</div>
              <div className="text-dim">{getLore(`revery:${id}`)}</div>
            </div>
            <div className="flex gap-1">
              {isEquipped && (
                <>
                  <TextButton
                    variant="secondary"
                    onClick={() => {
                      handleMoveSlot(id, -1)
                    }}
                    title="move left"
                  >
                    {'<'}
                  </TextButton>
                  <span className="text-dim px-1 py-1">{String(slotIndex + 1)}</span>
                  <TextButton
                    variant="secondary"
                    onClick={() => {
                      handleMoveSlot(id, 1)
                    }}
                    title="move right"
                  >
                    {'>'}
                  </TextButton>
                  <TextButton
                    variant="secondary"
                    className="ml-1"
                    onClick={() => {
                      handleUnequip(id)
                    }}
                  >
                    unequip
                  </TextButton>
                </>
              )}
              {!isEquipped && (
                <TextButton
                  variant="secondary"
                  onClick={() => {
                    handleEquip(id)
                  }}
                >
                  equip
                </TextButton>
              )}
            </div>
          </ListCard>
        )
      })}
    </div>
  )
}
