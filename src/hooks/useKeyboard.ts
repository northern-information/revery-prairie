import { useCallback, useEffect, useState } from 'react'

import { activateActionBarSlot, getActionBarPreview, getTargetingPreview } from '@/engine/actionBar'
import { getReveryDefinition } from '@/engine/reveries'
import { getCharacterDefinition } from '@/engine/characters'
import { cutClover, harvestClover, HarvestResult } from '@/engine/cloverLifecycle'
import { ComponentType } from '@/engine/ecs/types'
import { dropItem } from '@/engine/entities'
import { keyToDirection } from '@/engine/input'
import {
  advanceDialog,
  breakWall,
  getAdjacentCharacter,
  interactWithCharacter,
  updateFacingEntity,
} from '@/engine/interaction'
import { findItemByDefinition, moveItem } from '@/engine/inventory'
import { getDefinition } from '@/engine/items'
import { closeOmnibox, grabOmnibox, toggleFacingOmnibox, toggleOmnibox } from '@/engine/omnibox'
import { Rotation, Zone } from '@/engine/types'
import type { ItemInfoHandle } from '@/components/ItemInfo'
import type { GameState } from '@/engine/types'

export type PermacomputerScreen = 'pack' | 'system' | 'manual' | 'divination' | 'reveries' | null

interface UseKeyboardOptions {
  state: GameState
  refreshUI: () => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
  onPickup: (name: string, icon: string, iconColor: string, worldX: number, worldY: number) => void
  onDrop: (definitionId: string, worldX: number, worldY: number) => void
  onDialog: (characterName: string, glyph: string, glyphColor: string, worldX: number, worldY: number) => void
  onDiscovery: (text: string, worldX: number, worldY: number, icon?: string, iconColor?: string) => void
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
  const [activeScreen, setActiveScreen] = useState<PermacomputerScreen>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // When a text input has focus, only allow Escape and Tab through
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key !== 'Escape' && e.key !== 'Tab') return
      }

      if (e.key === 'Shift') {
        state.sprinting = !state.sprinting
        return
      }

      // Escape: cancel targeting first, then close dialog, then screen, then open system
      if (e.key === 'Escape') {
        if (state.targetingSlot !== null) {
          state.targetingSlot = null
          state.previewFn = null
          refreshUI()
          return
        }
        if (state.activeDialog) {
          state.activeDialog = null
          refreshUI()
          return
        }
        if (activeScreen === 'system') {
          setActiveScreen(null)
          return
        }
        if (activeScreen !== null) {
          setActiveScreen(null)
          return
        }
        setActiveScreen('system')
        return
      }

      // [1-4] — hold to preview revery cast, release to cast
      if (e.key >= '1' && e.key <= '4') {
        if (state.activeDialog) return
        if (activeScreen === 'system') return
        if (e.repeat) return
        // Cancel active targeting if pressing a different slot
        if (state.targetingSlot !== null) {
          state.targetingSlot = null
          state.previewFn = null
        }
        const slotIndex = parseInt(e.key) - 1
        state.heldActionSlot = slotIndex
        state.previewFn = (s, _t) => getActionBarPreview(s, slotIndex)
        refreshUI()
        return
      }

      // [e] — advance dialog / pick up or close open omnibox / open omnibox / talk / toss coins
      if (e.key === 'e' || e.key === 'E') {
        // Divination panel owns [e] for tossing — don't interfere
        if (activeScreen === 'divination') return
        if (state.activeDialog) {
          advanceDialog(state)
          refreshUI()
          return
        }
        if (activeScreen !== 'system') {
          // If an omnibox is open: pick up (ground) or close (backpack)
          if (state.openContainer) {
            const openId = state.openContainer.id
            let isGround = false
            for (const eid of state.world.query(ComponentType.OmniboxLink, ComponentType.EntityTag)) {
              if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundOmnibox') continue
              if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== state.currentZone) continue
              const link = state.world.getComponent(eid, ComponentType.OmniboxLink)
              if (link?.uid === openId) {
                isGround = true
                break
              }
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
          if (activeScreen === 'pack') {
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
            if (activeScreen !== 'pack') {
              setActiveScreen('pack')
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
          if (adjacent) {
            const result = interactWithCharacter(state)
            if (result.opened) {
              const def = getCharacterDefinition(adjacent.definitionId)
              onDialog(def.name, def.glyph, def.glyphColor, state.player.x, state.player.y)
              if (result.gift) {
                onGift(
                  `received ${result.gift.name.toLowerCase()}`,
                  result.gift.glyphs[0],
                  result.gift.glyphColor,
                  state.player.x,
                  state.player.y
                )
              }
              refreshUI()
            }
          }
          return
        }
      }

      // While dragging in pack, only allow movement
      if (isDraggingRef.current) {
        const dir = keyToDirection(e.key)
        if (dir && activeScreen !== 'system') {
          e.preventDefault()
          state.heldDirection = dir
          document.documentElement.classList.add('cursor-hidden')
          if (!e.repeat) {
            state.path = null
            state.pathWaypoints = []
            state.pendingAction = null
            state.pendingInteractionTarget = null
          }
        }
        return
      }

      // [f] — harvest facing clover
      if (e.key === 'f' || e.key === 'F') {
        if (state.activeDialog) return
        if (activeScreen === 'system') return
        const harvestResult = harvestClover(state)
        if (harvestResult === HarvestResult.Success) {
          const def = getDefinition('clover')
          onPickup(def.name, def.glyph, def.glyphColor, state.player.x, state.player.y)
          updateFacingEntity(state)
          refreshUI()
        } else if (harvestResult === HarvestResult.BackpackFull) {
          onDiscovery('backpack full', state.player.x, state.player.y)
        } else if (harvestResult === HarvestResult.Dying) {
          onDiscovery('too withered to harvest', state.player.x, state.player.y)
        }
        return
      }

      // [x] — drop item from pack (only when hovering an item), or cut facing clover
      if (e.key === 'x' || e.key === 'X') {
        if (activeScreen === 'pack') {
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
        // Cut facing clover when no inventory item is hovered
        if (activeScreen !== 'system' && !state.activeDialog) {
          if (cutClover(state)) {
            onDiscovery('clover trimmed', state.player.x, state.player.y, '%', '#50C878')
            updateFacingEntity(state)
            refreshUI()
          }
        }
        return
      }

      // Rotate hovered item in pack, or toggle reveries screen
      if (e.key === 'r' || e.key === 'R') {
        if (activeScreen === 'pack') {
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
        if (activeScreen === 'system') return
        setActiveScreen(activeScreen === 'reveries' ? null : 'reveries')
        return
      }

      // Toggle pack
      if (e.key === 'Tab') {
        e.preventDefault()
        if (activeScreen === 'system') return
        setActiveScreen(activeScreen === 'pack' ? null : 'pack')
        return
      }

      // Toggle manual
      if (e.key === 'q' || e.key === 'Q') {
        if (activeScreen === 'system') return
        setActiveScreen(activeScreen === 'manual' ? null : 'manual')
        return
      }

      // Toggle divination
      if (e.key === 'c' || e.key === 'C') {
        if (state.activeDialog) return
        if (activeScreen === 'system') return
        if (state.currentZone !== Zone.Overworld) return
        if (activeScreen === 'divination') {
          setActiveScreen(null)
          return
        }
        setActiveScreen('divination')
        return
      }

      // Movement (allowed with pack open; WASD closes system)
      const dir = keyToDirection(e.key)
      if (dir && activeScreen === 'system') {
        state.heldDirection = null
        setActiveScreen(null)
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
        document.documentElement.classList.add('cursor-hidden')
        if (!e.repeat) {
          state.path = null
          state.pathWaypoints = []
          state.pendingAction = null
          state.pendingInteractionTarget = null
          state.previewFn = null
        }
      }
    },
    [state, refreshUI, activeScreen, itemInfoRef, onPickup, onDrop, onDialog, onDiscovery, onGift, isDraggingRef]
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const dir = keyToDirection(e.key)
      if (dir && dir === state.heldDirection) {
        state.heldDirection = null
      }

      // Release number key → cast revery or enter targeting mode
      if (e.key >= '1' && e.key <= '4') {
        const slotIndex = parseInt(e.key) - 1
        if (state.heldActionSlot === slotIndex) {
          state.heldActionSlot = null
          state.previewFn = null

          // Check if this is a targeted revery
          const slot = state.actionBar[slotIndex]
          if (slot?.kind === 'revery') {
            const def = getReveryDefinition(slot.id)
            if (def.castStyle === 'targeted' && performance.now() >= slot.cooldownEndTime) {
              // Enter targeting mode
              state.targetingSlot = slotIndex
              state.previewFn = (s, t) => getTargetingPreview(s, slotIndex, t)
              refreshUI()
              return
            }
          }

          activateActionBarSlot(state, slotIndex, performance.now())
          refreshUI()
        }
      }
    },
    [state, refreshUI]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  return { activeScreen, setActiveScreen }
}
