import { useCallback, useEffect, useState } from 'react'

import { dropItem, movePlayer, pickUpGroundItems } from '@/engine/actions'
import { keyToDirection } from '@/engine/input'
import { findItemByDefinition, moveItem } from '@/engine/inventory'
import { getDefinition } from '@/engine/items'
import { Rotation } from '@/engine/types'
import type { ItemInfoHandle } from '@/components/ItemInfo'
import type { GameState } from '@/engine/types'

export type Panel = 'inventory' | 'menu' | null

interface UseKeyboardOptions {
  state: GameState
  refreshUI: () => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
  onPickup: (name: string, icon: string, iconColor: string, worldX: number, worldY: number) => void
  onDrop: (definitionId: string, worldX: number, worldY: number) => void
  isDraggingRef: React.RefObject<boolean>
}

export const useKeyboard = ({ state, refreshUI, itemInfoRef, onPickup, onDrop, isDraggingRef }: UseKeyboardOptions) => {
  const [activePanel, setActivePanel] = useState<Panel>('inventory')

  const handlePickups = useCallback(
    (pickedUp: string[]) => {
      for (const defId of pickedUp) {
        const def = getDefinition(defId)
        onPickup(def.name, def.icon, def.iconColor, state.player.x, state.player.y)
      }
    },
    [onPickup, state]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape: close panel if open, otherwise open menu
      if (e.key === 'Escape') {
        if (activePanel === 'menu') {
          setActivePanel(null)
          return
        }
        if (activePanel !== null) {
          setActivePanel(null)
          return
        }
        setActivePanel('menu')
        return
      }

      // Toggle inventory
      if (e.key === 'i' || e.key === 'I') {
        setActivePanel(prev => (prev === 'inventory' ? null : 'inventory'))
        return
      }

      // While dragging in inventory, only allow movement
      if (isDraggingRef.current) {
        const dir = keyToDirection(e.key)
        if (dir && activePanel !== 'menu') {
          e.preventDefault()
          state.path = null
          state.pendingAction = null
          if (movePlayer(state, dir)) {
            const pickedUp = pickUpGroundItems(state)
            handlePickups(pickedUp)
            refreshUI()
          }
        }
        return
      }

      // Drop item from inventory (only when hovering an item)
      if (e.key === 'x' || e.key === 'X') {
        if (activePanel === 'inventory') {
          const hoveredId = itemInfoRef.current?.getCurrentId()
          if (hoveredId) {
            const success = dropItem(state, hoveredId)
            if (success) {
              itemInfoRef.current?.clear()
              onDrop(hoveredId, state.player.x, state.player.y)
              refreshUI()
            }
            return
          }
        }
      }

      // Rotate hovered item in place
      if (e.key === 'r' || e.key === 'R') {
        if (activePanel === 'inventory') {
          const hoveredId = itemInfoRef.current?.getCurrentId()
          if (hoveredId) {
            const item = findItemByDefinition(state.backpack, hoveredId)
            if (item) {
              const nextRotation = ((item.rotation + 1) % 4) as Rotation
              moveItem(state.backpack, item.uid, item.gridX, item.gridY, nextRotation)
              refreshUI()
            }
            return
          }
        }
      }

      // Movement (allowed with inventory open, blocked in menu)
      if (activePanel !== 'menu') {
        const dir = keyToDirection(e.key)
        if (dir) {
          e.preventDefault()
          state.path = null
          state.pendingAction = null
          state.previewFn = null
          if (movePlayer(state, dir)) {
            const pickedUp = pickUpGroundItems(state)
            handlePickups(pickedUp)
            refreshUI()
          }
        }
      }
    },
    [state, refreshUI, activePanel, itemInfoRef, handlePickups, onDrop, isDraggingRef]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  return { activePanel, setActivePanel }
}
