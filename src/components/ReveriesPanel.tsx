import { assignActionBarSlot, clearActionBarSlot } from '@/engine/actionBar'
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
    <div className="font-mono text-xs text-[--color-text]">
      {state.reveries.length === 0 && <div className="text-[--color-dim]">no reveries collected yet.</div>}

      {state.reveries.map(id => {
        const def = getReveryDefinition(id)
        const isEquipped = equippedIds.has(id)
        const slotIndex = state.actionBar.findIndex(s => s?.kind === 'revery' && s.id === id)

        return (
          <div
            key={id}
            className="mb-2 flex items-center gap-2 rounded border border-[--color-border]/50 p-2"
            style={{ backgroundColor: `${def.glyphColor}20` }}
          >
            <span className="text-lg" style={{ color: def.glyphColor }}>
              {def.glyphs[0]}
            </span>
            <div className="flex-1">
              <div style={{ color: def.glyphColor }}>{def.name.toLowerCase()}</div>
              <div className="text-[--color-dim]">{def.description}</div>
            </div>
            <div className="flex gap-1">
              {isEquipped && (
                <>
                  <button
                    className="rounded border border-[--color-border]/50 px-1 text-[--color-dim] hover:text-[--color-text]"
                    onClick={() => {
                      handleMoveSlot(id, -1)
                    }}
                    title="move left"
                  >
                    {'<'}
                  </button>
                  <span className="px-1 text-[--color-dim]">{String(slotIndex + 1)}</span>
                  <button
                    className="rounded border border-[--color-border]/50 px-1 text-[--color-dim] hover:text-[--color-text]"
                    onClick={() => {
                      handleMoveSlot(id, 1)
                    }}
                    title="move right"
                  >
                    {'>'}
                  </button>
                  <button
                    className="ml-1 rounded border border-[--color-border]/50 px-1 text-[--color-dim] hover:text-[--color-text]"
                    onClick={() => {
                      handleUnequip(id)
                    }}
                  >
                    unequip
                  </button>
                </>
              )}
              {!isEquipped && (
                <button
                  className="rounded border border-[--color-border]/50 px-1 text-[--color-dim] hover:text-[--color-text]"
                  onClick={() => {
                    handleEquip(id)
                  }}
                >
                  equip
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
