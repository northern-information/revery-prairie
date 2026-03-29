import { useCallback, useEffect, useState } from 'react'

import { dropItem, pickUpGroundItems } from '@/engine/entities'
import { ComponentType } from '@/engine/ecs/types'
import { advanceDialog, breakWall, getAdjacentCharacter, giveMoabGift, interactWithCharacter, updateFacingEntity } from '@/engine/interaction'
import { movePlayer } from '@/engine/movement'
import { closeOmnibox, grabOmnibox, toggleFacingOmnibox, toggleOmnibox } from '@/engine/omnibox'
import { getCharacterDefinition } from '@/engine/characters'
import { keyToDirection } from '@/engine/input'
import { findItemByDefinition, moveItem } from '@/engine/inventory'
import { getDefinition } from '@/engine/items'
import { Rotation, Zone } from '@/engine/types'
import type { ItemInfoHandle } from '@/components/ItemInfo'
import type { GameState } from '@/engine/types'

export type Panel = 'inventory' | 'menu' | 'manual' | null

interface UseKeyboardOptions {
  state: GameState
  refreshUI: () => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
  onPickup: (name: string, icon: string, iconColor: string, worldX: number, worldY: number) => void
  onDrop: (definitionId: string, worldX: number, worldY: number) => void
  onDialog: (characterName: string, glyph: string, glyphColor: string, worldX: number, worldY: number) => void
  onDiscovery: (text: string, worldX: number, worldY: number) => void
  onGift: (text: string, icon: string, iconColor: string, worldX: number, worldY: number) => void
  isDraggingRef: React.RefObject<boolean>
}

export const useKeyboard = ({
  state,
  refreshUI,
  itemInfoRef,
  onPickup,
  onDrop,
  onDialog,
  onDiscovery,
  onGift,
  isDraggingRef,
}: UseKeyboardOptions) => {
  const [activePanel, setActivePanel] = useState<Panel>(null)

  const handlePickups = useCallback(
    (result: { pickedUp: string[]; chainExplosions: number }) => {
      for (const defId of result.pickedUp) {
        const def = getDefinition(defId)
        onPickup(def.name, def.glyph, def.glyphColor, state.player.x, state.player.y)
      }
      if (result.chainExplosions > 0) {
        onDiscovery('oh my!', state.player.x, state.player.y)
      }
    },
    [onPickup, onDiscovery, state]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape: close dialog first, then panel, then open menu
      if (e.key === 'Escape') {
        if (state.activeDialog) {
          state.activeDialog = null
          refreshUI()
          return
        }
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

      // [e] — advance dialog / pick up or close open omnibox / open omnibox / talk
      if (e.key === 'e' || e.key === 'E') {
        if (state.activeDialog) {
          const dialogCharId = state.activeDialog.characterId
          const dialogContinues = advanceDialog(state)
          if (!dialogContinues && dialogCharId === 'moab' && !state.moabGiftGiven) {
            if (giveMoabGift(state)) {
              const def = getDefinition('omnibox')
              onGift('given an omnibox', def.glyph, def.glyphColor, state.player.x, state.player.y)
            }
          }
          refreshUI()
          return
        }
        if (activePanel !== 'menu') {
          // If an omnibox is open: pick up (ground) or close (backpack)
          if (state.openContainer) {
            const openId = state.openContainer.id
            let isGround = false
            for (const eid of state.world.query(ComponentType.OmniboxLink, ComponentType.EntityTag)) {
              if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundOmnibox') continue
              const link = state.world.getComponent(eid, ComponentType.OmniboxLink)
              if (link?.uid === openId) { isGround = true; break }
            }
            if (isGround) {
              const uid = grabOmnibox(state)
              if (uid) {
                const def = getDefinition('omnibox')
                onPickup(def.name, def.glyph, def.glyphColor, state.player.x, state.player.y)
              }
              closeOmnibox(state)
            } else {
              closeOmnibox(state)
            }
            refreshUI()
            return
          }
          // Open hovered omnibox in inventory
          if (activePanel === 'inventory') {
            const hoveredId = itemInfoRef.current?.getCurrentId()
            const hoveredUid = itemInfoRef.current?.getCurrentUid()
            if (hoveredId === 'omnibox' && hoveredUid) {
              toggleOmnibox(state, hoveredUid)
              refreshUI()
              return
            }
          }
          // Open facing ground omnibox
          if (toggleFacingOmnibox(state)) {
            if (activePanel !== 'inventory') {
              setActivePanel('inventory')
            }
            refreshUI()
            return
          }
          // Break facing breakable wall
          if (state.currentZone === Zone.Cave && !state.caveRevealed) {
            if (breakWall(state, performance.now())) {
              onDiscovery('discovered hidden room!', state.player.x, state.player.y)
              refreshUI()
              return
            }
          }
          // Interact with adjacent character
          const adjacent = getAdjacentCharacter(state)
          if (adjacent && interactWithCharacter(state)) {
            const def = getCharacterDefinition(adjacent.definitionId)
            onDialog(def.name, def.glyph, def.glyphColor, state.player.x, state.player.y)
            refreshUI()
          }
          return
        }
      }

      // While dragging in inventory, only allow movement
      if (isDraggingRef.current) {
        const dir = keyToDirection(e.key)
        if (dir && activePanel !== 'menu') {
          e.preventDefault()
          state.heldDirection = dir
          if (!e.repeat) {
            state.path = null
            state.pathWaypoints = []
            state.pendingAction = null
            state.pendingInteractionTarget = null
            if (movePlayer(state, dir)) {
              const result = pickUpGroundItems(state, performance.now())
              handlePickups(result)
              refreshUI()
            }
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
              updateFacingEntity(state)
              onDrop(hoveredId, state.player.x, state.player.y)
              refreshUI()
            }
            return
          }
        }
      }

      // Rotate hovered item, or toggle inventory
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
          // Not hovering — close inventory
          setActivePanel(null)
          return
        }
        // Inventory not open — open it
        if (activePanel !== 'menu') {
          setActivePanel('inventory')
        }
        return
      }

      // Toggle manual
      if (e.key === 'Tab') {
        e.preventDefault()
        if (activePanel === 'menu') return
        setActivePanel(activePanel === 'manual' ? null : 'manual')
        return
      }

      // Movement (allowed with inventory open; WASD closes menu)
      const dir = keyToDirection(e.key)
      if (dir && activePanel === 'menu') {
        state.heldDirection = null
        setActivePanel(null)
        return
      }
      if (dir && state.activeDialog) {
        state.heldDirection = null
        state.activeDialog = null
        refreshUI()
        return
      }
      if (dir) {
        e.preventDefault()
        state.heldDirection = dir
        if (!e.repeat) {
          state.path = null
          state.pathWaypoints = []
          state.pendingAction = null
          state.pendingInteractionTarget = null
          state.previewFn = null
          if (movePlayer(state, dir)) {
            const result = pickUpGroundItems(state, performance.now())
            handlePickups(result)
            refreshUI()
          }
        }
      }
    },
    [state, refreshUI, activePanel, itemInfoRef, handlePickups, onPickup, onDrop, onDialog, onDiscovery, onGift, isDraggingRef]
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const dir = keyToDirection(e.key)
      if (dir && dir === state.heldDirection) {
        state.heldDirection = null
      }
    },
    [state]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  return { activePanel, setActivePanel }
}
