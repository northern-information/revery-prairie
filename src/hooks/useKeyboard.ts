import { useCallback, useEffect, useState } from 'react'

import { dropItem } from '@/engine/entities'
import { completeGenesis, GENESIS_EPOCHS } from '@/engine/genesis'
import { keyToScreenAxis, resolveHeldDirection } from '@/engine/heldKeys'
import { recordDiscovery } from '@/engine/manual'
import { selectScanTarget } from '@/engine/scan'
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
import { DeepTimePhase, OverlayMode, Zone } from '@/engine/types'
import { isInputGated } from '@/engine/zoneTransition'
import type { ItemInfoHandle } from '@/components/ItemInfo'
import type { GameState } from '@/engine/types'

export type PermacomputerScreen =
  | 'system'
  | 'manual'
  | 'divination'
  | 'cantos'
  | 'coyote'
  | 'scan-result'
  | null

interface UseKeyboardOptions {
  state: GameState
  refreshUI: () => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
  isDraggingRef: React.RefObject<boolean>
}

export const useKeyboard = ({
  state,
  refreshUI,
  itemInfoRef,
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
      // is in flight. Only Tab (manual), Escape (menu/dialog), and Shift
      // (sprint toggle, handled above) remain available. WASD is also
      // dropped by movePlayer itself; this catches interact and drop.
      if (isInputGated(state)) {
        const allowed = e.key === 'Tab' || e.key === 'Escape'
        if (!allowed) return
      }

      // RP-4 — Revery hard input lock. During Observing, every keypress
      // is swallowed. During Summary, any keypress dismisses the overlay and
      // advances to Closing (handled by the GameScreen-level dismiss listener
      // wired in Tier 8c — useKeyboard just returns early so gameplay keys
      // don't double-fire).
      if (state.revery?.active) return

      // RP-6 — scan-result modal hard input lock. The modal owns its
      // own keydown handler (dismiss after fully revealed); useKeyboard
      // returns early so gameplay keys, screen toggles, and Escape don't
      // race the modal's dismiss logic.
      if (activeScreen === 'scan-result') return

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

      // [f] — interact: advance dialog / talk / break wall / unlock door.
      // Key repeat is ignored so a held [f] doesn't re-trigger; the second
      // keydown falls through to the scan handler below, which also ignores
      // repeats. If no interaction fires, we fall through so the same press
      // can begin a hold-to-scan (RP-6) when a scannable target exists.
      if ((e.key === 'f' || e.key === 'F') && !e.repeat) {
        // Divination panel owns [f] for tossing — don't interfere
        if (activeScreen === 'divination') return
        if (state.activeDialog) {
          advanceDialog(state, performance.now())
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
            if (!unlockRuinDoor(state)) {
              openLockedGateDialog(state)
            }
            refreshUI()
            return
          }
          // Break facing breakable wall
          if (state.currentZone === Zone.Cave && !state.caveRevealed) {
            if (breakWall(state, performance.now())) {
              refreshUI()
              return
            }
          }
          // Interact with adjacent character
          const adjacent = getAdjacentCharacter(state)
          if (adjacent) {
            const result = interactWithCharacter(state)
            if (result.opened) {
              refreshUI()
            }
            return
          }
          // Nothing to interact with — fall through to the scan handler below.
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
      // clover branch was deleted in RP-1 (harvest and cut mechanics
      // removed entirely; clover acquisition routes through ruin recovery).
      if (e.key === 'x' || e.key === 'X') {
        const hoveredId = itemInfoRef.current?.getCurrentId()
        if (hoveredId) {
          const success = dropItem(state, hoveredId, performance.now())
          if (success) {
            itemInfoRef.current?.clear()
            updateFacingEntity(state)
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

      // RP-17 — overlay view modes. [1] default, [2] family-tree
      // lineage overlay (records the discovery on first press), [3]
      // placeholder for the future root/mycelium view (no-op — logs in
      // DEV but does not change overlayMode; a toast surface isn't in
      // the codebase yet, so the placeholder UI is deferred until one
      // lands).
      if (e.key === '1') {
        state.overlayMode = OverlayMode.Default
        refreshUI()
        return
      }
      if (e.key === '2') {
        state.overlayMode = OverlayMode.FamilyTree
        recordDiscovery(state, 'event:lineage-overlay-toggled')
        refreshUI()
        return
      }
      if (e.key === '3') {
        // Placeholder for the root/mycelium overlay (reserved for a
        // future backlog item). Consumed so it doesn't fall through to other
        // handlers, but overlayMode is not changed. No toast surface
        // exists in the codebase yet; this becomes a visible "not yet"
        // hint once one lands.
        return
      }

      // Toggle divination
      if (e.key === 'c' || e.key === 'C') {
        if (state.activeDialog) return
        if (activeScreen === 'system') return
        if (deepTimeBlocking) return
        if (state.currentZone !== Zone.Overworld) return
        if (activeScreen === 'divination') {
          setActiveScreen(null)
          return
        }
        setActiveScreen('divination')
        return
      }

      // [f] — hold-to-scan flora with the permacomputer (RP-6).
      // Keydown begins a scan if there's a valid target nearby. Modal
      // blocks (system menu, dialog) suppress. Key repeat on a held f
      // is ignored — the original startTime stands.
      if (e.key === 'f' || e.key === 'F') {
        if (e.repeat) return
        if (state.activeDialog) return
        if (activeScreen === 'system') return
        if (state.scanInProgress) return
        const target = selectScanTarget(state)
        if (!target) return
        if (target.kind === 'flora') {
          state.scanInProgress = {
            kind: 'flora',
            target: target.position,
            species: target.species,
            startTime: performance.now(),
          }
        } else if (target.kind === 'egregore') {
          state.scanInProgress = {
            kind: 'egregore',
            target: target.position,
            startTime: performance.now(),
          }
        } else {
          state.scanInProgress = {
            kind: 'oak',
            target: target.position,
            startTime: performance.now(),
          }
        }
        refreshUI()
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
        // Movement aborts an active scan — RP-6.
        if (state.scanInProgress) {
          state.scanInProgress = null
        }
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
    [state, refreshUI, activeScreen, setActiveScreen, itemInfoRef, isDraggingRef]
  )

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      // RP-6 — scan-result modal owns input; gameplay keyup logic
      // is suppressed while the modal is open.
      if (activeScreen === 'scan-result') return

      const axis = keyToScreenAxis(e.key)
      if (axis) {
        state.heldKeys.delete(axis)
        state.heldDirection = resolveHeldDirection(state.heldKeys)
      }

      // [f] release — abort the scan (RP-6). Commit is auto-fired
      // by the game loop once elapsed >= SCAN_DURATION_MS; releasing
      // early just clears the in-progress state and shows nothing.
      if (e.key === 'f' || e.key === 'F') {
        if (state.scanInProgress) {
          state.scanInProgress = null
          refreshUI()
        }
      }
    },
    [state, refreshUI, activeScreen]
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
