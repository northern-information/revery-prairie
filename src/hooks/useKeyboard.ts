import { useCallback, useEffect, useState } from 'react'

import { getCharacterDefinition } from '@/engine/characters'
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
import { DeepTimePhase, Zone } from '@/engine/types'
import { isInputGated } from '@/engine/zoneTransition'
import type { ItemInfoHandle } from '@/components/ItemInfo'
import type { GameState } from '@/engine/types'

export type PermacomputerScreen = 'system' | 'manual' | 'divination' | 'cantos' | 'coyote' | null

interface UseKeyboardOptions {
  state: GameState
  refreshUI: () => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
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
      // catches interact, harvest, and drop.
      if (isInputGated(state)) {
        const allowed = e.key === 'Tab' || e.key === 'q' || e.key === 'Q' || e.key === 'Escape'
        if (!allowed) return
      }

      // Escape: close dialog, then screen, then open system
      if (e.key === 'Escape') {
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

      // [x] — drop hovered inventory item to the ground. The cut-facing-
      // clover branch was deleted in precis #1 (harvest and cut mechanics
      // removed entirely; clover acquisition routes through ruin recovery).
      if (e.key === 'x' || e.key === 'X') {
        const hoveredId = itemInfoRef.current?.getCurrentId()
        if (hoveredId) {
          const success = dropItem(state, hoveredId)
          if (success) {
            itemInfoRef.current?.clear()
            updateFacingEntity(state)
            onDrop(hoveredId, state.player.x, state.player.y)
            refreshUI()
          }
        }
        return
      }

      // Block permacomputer during deep time burning/simulating
      const deepTimeBlocking = state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering

      // Tab — cycle the permacomputer; the legacy 'pack' screen was inlined
      // into the bottom-bar (see backpack-bottom-bar spec) so Tab now toggles
      // the manual.
      if (e.key === 'Tab') {
        e.preventDefault()
        if (activeScreen === 'system') return
        if (deepTimeBlocking) return
        setActiveScreen(activeScreen === 'manual' ? null : 'manual')
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
    [
      state,
      refreshUI,
      activeScreen,
      setActiveScreen,
      itemInfoRef,
      onDrop,
      onDialog,
      onDiscovery,
      onGift,
      isDraggingRef,
    ]
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const axis = keyToScreenAxis(e.key)
      if (axis) {
        state.heldKeys.delete(axis)
        state.heldDirection = resolveHeldDirection(state.heldKeys)
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

  return { activeScreen, setActiveScreen }
}
