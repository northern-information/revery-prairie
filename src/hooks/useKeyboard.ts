import { useCallback, useEffect, useState } from 'react'

import { activateActionBarSlot, getActionBarPreview, getTargetingPreview } from '@/engine/actionBar'
import { getReveryDefinition } from '@/engine/reveries'
import { getCharacterDefinition } from '@/engine/characters'
import { cutClover, harvestClover, HarvestResult } from '@/engine/cloverLifecycle'
import { dropItem } from '@/engine/entities'
import { completeGenesis, GENESIS_EPOCHS } from '@/engine/genesis'
import { keyToScreenAxis, resolveHeldDirection } from '@/engine/heldKeys'
import {
  advanceDialog,
  breakWall,
  clearRuinDebris,
  getAdjacentCharacter,
  interactWithCharacter,
  isFacingLockedDoor,
  openLockedGateDialog,
  unlockRuinDoor,
  updateFacingEntity,
} from '@/engine/interaction'
import { getDefinition } from '@/engine/items'
import { DeepTimePhase, Zone } from '@/engine/types'
import { isInputGated } from '@/engine/zoneTransition'
import type { ItemInfoHandle } from '@/components/ItemInfo'
import type { GameState } from '@/engine/types'

export type PermacomputerScreen = 'pack' | 'system' | 'manual' | 'divination' | 'reveries' | 'cantos' | 'coyote' | null

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
  const [activeScreen, setActiveScreenRaw] = useState<PermacomputerScreen>(null)

  const setActiveScreen = useCallback(
    (screen: PermacomputerScreen | ((prev: PermacomputerScreen) => PermacomputerScreen)) => {
      state.panelOpenMoveCount = 0
      setActiveScreenRaw(screen)
    },
    [state]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // When a text input has focus, only allow Escape and Tab through
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key !== 'Escape' && e.key !== 'Tab') return
      }

      // During genesis, Escape/Space/Enter skip; block all other keys
      if (state.genesis && state.genesis.epochIndex < GENESIS_EPOCHS.length) {
        if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
          completeGenesis(state)
          refreshUI()
        }
        return
      }

      // Dev panel: backtick toggles, Escape closes, block all other game keys
      if (state.devPanelOpen) {
        if (e.key === '`' && import.meta.env.DEV) {
          state.devPanelOpen = false
          refreshUI()
          return
        }
        if (e.key === 'Escape') {
          state.devPanelOpen = false
          refreshUI()
          return
        }
        // Block all other game controls while dev panel is active
        return
      }

      if (e.key === 'Shift') {
        state.sprinting = !state.sprinting
        return
      }

      // Reject gameplay input while a zone transition or boot title card
      // is in flight. Only Tab (inventory), Q (manual), Escape
      // (menu/dialog), and Shift (sprint toggle, handled above) remain
      // available. WASD is also dropped by movePlayer itself; this
      // catches action-bar keys, interact, harvest, drop, and revery
      // toggles.
      if (isInputGated(state)) {
        const allowed = e.key === 'Tab' || e.key === 'q' || e.key === 'Q' || e.key === 'Escape'
        if (!allowed) return
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
        if (state.deepTime?.active) return
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

      // [e] — advance dialog / talk / break wall / toss coins
      if (e.key === 'e' || e.key === 'E') {
        // Divination panel owns [e] for tossing — don't interfere
        if (activeScreen === 'divination') return
        if (state.activeDialog) {
          const result = advanceDialog(state, performance.now())
          if (result.gift) {
            onGift(
              `Received ${result.gift.name}.`,
              result.gift.glyphs[0],
              result.gift.glyphColor,
              state.player.x,
              state.player.y
            )
          }
          refreshUI()
          return
        }
        if (activeScreen !== 'system') {
          // Clear facing ruin rubble (mirrors cave breakable wall)
          if (state.currentZone === Zone.Ruin) {
            if (clearRuinDebris(state)) {
              refreshUI()
              return
            }
          }
          // Facing a locked ruin door — unlock if we have a key, otherwise
          // open the locked gate dialog so the player gets a visible reason.
          if (isFacingLockedDoor(state)) {
            if (unlockRuinDoor(state)) {
              onDiscovery('the lock turns', state.player.x, state.player.y)
            } else {
              openLockedGateDialog(state)
            }
            refreshUI()
            return
          }
          // Break facing breakable wall
          if (state.currentZone === Zone.Cave && !state.caveRevealed) {
            if (breakWall(state, performance.now())) {
              onDiscovery('Discovered hidden room.', state.player.x, state.player.y)
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
              refreshUI()
            }
          }
          return
        }
      }

      // While dragging in pack, only allow movement
      if (isDraggingRef.current) {
        const axis = keyToScreenAxis(e.key)
        if (axis && activeScreen !== 'system') {
          e.preventDefault()
          state.heldKeys.add(axis)
          state.heldDirection = resolveHeldDirection(state.heldKeys)
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
        const harvestResult = harvestClover(state, performance.now())
        if (harvestResult === HarvestResult.Success) {
          const def = getDefinition('clover')
          onPickup(def.name, def.glyph, def.glyphColor, state.player.x, state.player.y)
          updateFacingEntity(state)
          refreshUI()
        } else if (harvestResult === HarvestResult.BackpackFull) {
          onDiscovery('Backpack full.', state.player.x, state.player.y)
        } else if (harvestResult === HarvestResult.Dying) {
          onDiscovery('Too withered to harvest.', state.player.x, state.player.y)
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
            onDiscovery('Clover trimmed.', state.player.x, state.player.y, '%', '#50C878')
            updateFacingEntity(state)
            refreshUI()
          }
        }
        return
      }

      // Toggle reveries screen
      // Block when modifier held (Cmd+R / Ctrl+R is browser refresh)
      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (activeScreen === 'system') return
        setActiveScreen(activeScreen === 'reveries' ? null : 'reveries')
        return
      }

      // Block permacomputer during deep time burning/simulating
      const deepTimeBlocking =
        state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering

      // Toggle pack
      if (e.key === 'Tab') {
        e.preventDefault()
        if (activeScreen === 'system') return
        if (deepTimeBlocking) return
        setActiveScreen(activeScreen === 'pack' ? null : 'pack')
        return
      }

      // Toggle dev panel (dev only)
      if (e.key === '`' && import.meta.env.DEV) {
        state.devPanelOpen = !state.devPanelOpen
        refreshUI()
        return
      }

      // Toggle manual
      if (e.key === 'q' || e.key === 'Q') {
        if (activeScreen === 'system') return
        if (deepTimeBlocking) return
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
      const axis = keyToScreenAxis(e.key)
      if (axis && activeScreen === 'system') {
        state.heldKeys.clear()
        state.heldDirection = null
        setActiveScreen(null)
        return
      }
      if (axis && state.activeDialog) {
        state.heldKeys.clear()
        state.heldDirection = null
        state.activeDialog = null
        refreshUI()
        return
      }
      if (axis) {
        e.preventDefault()
        state.heldKeys.add(axis)
        state.heldDirection = resolveHeldDirection(state.heldKeys)
        if (!e.repeat) {
          state.path = null
          state.pathWaypoints = []
          state.pendingAction = null
          state.pendingInteractionTarget = null
          state.previewFn = null
        }
      }
    },
    [state, refreshUI, activeScreen, setActiveScreen, itemInfoRef, onPickup, onDrop, onDialog, onDiscovery, onGift, isDraggingRef]
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const axis = keyToScreenAxis(e.key)
      if (axis) {
        state.heldKeys.delete(axis)
        state.heldDirection = resolveHeldDirection(state.heldKeys)
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
