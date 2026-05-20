import { useKeyboard } from '../useKeyboard'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestState } from '@/engine/__tests__/helpers'
import { dropItem } from '@/engine/entities'
import { commitScan, selectScanTarget } from '@/engine/scan'
import { FloraSpecies } from '@/engine/types'
import {
  advanceDialog,
  breakWall,
  getAdjacentCharacter,
  interactWithCharacter,
  updateFacingEntity,
} from '@/engine/interaction'
import { movePlayer } from '@/engine/movement'
import { Zone } from '@/engine/types'
import type { ItemInfoHandle } from '@/components/ItemInfo'
import type { GameState } from '@/engine/types'

// --- mocks ---

vi.mock('@/engine/entities', async importOriginal => {
  const actual = await importOriginal<typeof import('@/engine/entities')>()
  return {
    ...actual,
    dropItem: vi.fn(() => false),
  }
})

vi.mock('@/engine/movement', () => ({
  movePlayer: vi.fn(() => true),
}))

vi.mock('@/engine/scan', () => ({
  selectScanTarget: vi.fn(() => null),
  commitScan: vi.fn(() => true),
}))

vi.mock('@/engine/interaction', () => ({
  advanceDialog: vi.fn(() => ({ continuing: false, gift: null })),
  breakWall: vi.fn(() => false),
  getAdjacentCharacter: vi.fn(() => null),
  giveCharacterGift: vi.fn(() => null),
  interactWithCharacter: vi.fn(() => ({ opened: false, gift: null })),
  isFacingLockedDoor: vi.fn(() => false),
  openLockedGateDialog: vi.fn(),
  unlockRuinDoor: vi.fn(() => false),
  updateFacingEntity: vi.fn(),
}))

vi.mock('@/engine/input', async importOriginal => {
  const actual = await importOriginal<typeof import('@/engine/input')>()
  return {
    ...actual,
    keyToDirection: vi.fn((key: string) => {
      const map: Record<string, string> = {
        w: 'upLeft',
        W: 'upLeft',
        a: 'downLeft',
        A: 'downLeft',
        s: 'downRight',
        S: 'downRight',
        d: 'upRight',
        D: 'upRight',
        ArrowUp: 'upLeft',
        ArrowDown: 'downRight',
        ArrowLeft: 'downLeft',
        ArrowRight: 'upRight',
      }
      return map[key] ?? null
    }),
  }
})

vi.mock('@/engine/items', async importOriginal => {
  const actual = await importOriginal<typeof import('@/engine/items')>()
  return {
    ...actual,
    getDefinition: vi.fn(() => ({
      id: 'test-item',
      name: 'Test Item',
      glyph: 'T',
      glyphColor: '#fff',
      shape: [[true]],
      category: 'Tool',
      description: '',
    })),
  }
})

vi.mock('@/engine/characters', async importOriginal => {
  const actual = await importOriginal<typeof import('@/engine/characters')>()
  return {
    ...actual,
    getCharacterDefinition: vi.fn(() => ({
      name: 'Test Ghost',
      glyph: 'ö',
      glyphColor: '#fff',
    })),
  }
})

// --- helpers ---

const fireKey = (key: string, opts?: Partial<KeyboardEventInit>) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }))
}

const fireKeyUp = (key: string) => {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
}

// --- setup ---

let state: GameState
let refreshUI: ReturnType<typeof vi.fn>
let itemInfoRef: React.RefObject<ItemInfoHandle | null>
let isDraggingRef: React.RefObject<boolean>

const makeItemInfoRef = (getCurrentId?: () => string | null, getCurrentUid?: () => string | null) => ({
  current: {
    show: vi.fn(),
    clear: vi.fn(),
    setDragging: vi.fn(),
    getCurrentId: vi.fn(getCurrentId ?? (() => null)),
    getCurrentUid: vi.fn(getCurrentUid ?? (() => null)),
  } as unknown as ItemInfoHandle,
})

const renderKeyboardHook = () =>
  renderHook(() =>
    useKeyboard({
      state,
      refreshUI,
      itemInfoRef,
      isDraggingRef,
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
  state = createTestState()
  refreshUI = vi.fn()
  itemInfoRef = makeItemInfoRef()
  isDraggingRef = { current: false }

  // Reset all mock return values (clearAllMocks only clears call history)
  vi.mocked(movePlayer).mockReturnValue(true)
  vi.mocked(advanceDialog).mockReturnValue({ continuing: false, gift: null })
  vi.mocked(selectScanTarget).mockReturnValue(null)
  vi.mocked(breakWall).mockReturnValue(false)
  vi.mocked(getAdjacentCharacter).mockReturnValue(null)
  vi.mocked(interactWithCharacter).mockReturnValue({ opened: false, gift: null, coyoteToggled: false })
  vi.mocked(dropItem).mockReturnValue(false)
})

// --- tests ---

describe('useKeyboard', () => {
  describe('Escape — priority stack', () => {
    it('closes active dialog first', () => {
      state.activeDialog = { characterId: 'gron', lineIndex: 0 } as GameState['activeDialog']
      const { result } = renderKeyboardHook()

      act(() => {
        fireKey('Escape')
      })

      expect(state.activeDialog).toBeNull()
      expect(refreshUI).toHaveBeenCalledOnce()
      // Screen should not change
      expect(result.current.activeScreen).toBeNull()
    })

    it('closes system screen when no dialog', () => {
      const { result } = renderKeyboardHook()

      // Open menu first
      act(() => {
        result.current.setActiveScreen('system')
      })
      expect(result.current.activeScreen).toBe('system')

      act(() => {
        fireKey('Escape')
      })
      expect(result.current.activeScreen).toBeNull()
    })

    it('closes manual screen when no dialog', () => {
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActiveScreen('manual')
      })
      act(() => {
        fireKey('Escape')
      })

      expect(result.current.activeScreen).toBeNull()
    })

    it('opens system when nothing is open', () => {
      const { result } = renderKeyboardHook()

      act(() => {
        fireKey('Escape')
      })

      expect(result.current.activeScreen).toBe('system')
    })
  })

  describe('E key — dialog branch', () => {
    it('advances dialog', () => {
      state.activeDialog = { characterId: 'gron', lineIndex: 0 } as GameState['activeDialog']
      vi.mocked(advanceDialog).mockReturnValue({ continuing: true, gift: null })
      renderKeyboardHook()

      act(() => {
        fireKey('f')
      })

      expect(advanceDialog).toHaveBeenCalledWith(state, expect.any(Number))
      expect(refreshUI).toHaveBeenCalledOnce()
    })

    it('simply advances dialog without gift check', () => {
      state.activeDialog = { characterId: 'moab', lineIndex: 0 } as GameState['activeDialog']
      vi.mocked(advanceDialog).mockReturnValue({ continuing: false, gift: null })
      renderKeyboardHook()

      act(() => {
        fireKey('f')
      })

      expect(advanceDialog).toHaveBeenCalledWith(state, expect.any(Number))
      expect(refreshUI).toHaveBeenCalled()
    })
  })

  describe('E key — break wall', () => {
    it('calls breakWall in cave zone when not revealed', () => {
      state.currentZone = Zone.Cave
      state.caveRevealed = false
      vi.mocked(breakWall).mockReturnValue(true)
      renderKeyboardHook()

      act(() => {
        fireKey('f')
      })

      expect(breakWall).toHaveBeenCalledWith(state, expect.any(Number))
      expect(refreshUI).toHaveBeenCalled()
    })

    it('does not call breakWall when cave already revealed', () => {
      state.currentZone = Zone.Cave
      state.caveRevealed = true
      renderKeyboardHook()

      act(() => {
        fireKey('f')
      })

      expect(breakWall).not.toHaveBeenCalled()
    })
  })

  describe('E key — character interaction', () => {
    it('calls interactWithCharacter when adjacent', () => {
      const character = { definitionId: 'gron', pos: { x: state.player.x + 1, y: state.player.y } }
      vi.mocked(getAdjacentCharacter).mockReturnValue(character)
      vi.mocked(interactWithCharacter).mockReturnValue({ opened: true, gift: null, coyoteToggled: false })
      renderKeyboardHook()

      act(() => {
        fireKey('f')
      })

      expect(interactWithCharacter).toHaveBeenCalledWith(state)
      expect(refreshUI).toHaveBeenCalled()
    })

    it('does nothing when no adjacent character', () => {
      vi.mocked(getAdjacentCharacter).mockReturnValue(null)
      renderKeyboardHook()

      act(() => {
        fireKey('f')
      })

      expect(interactWithCharacter).not.toHaveBeenCalled()
    })
  })

  describe('E key — blocked by system', () => {
    it('does nothing when system is open', () => {
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActiveScreen('system')
      })
      act(() => {
        fireKey('f')
      })

      expect(advanceDialog).not.toHaveBeenCalled()
      expect(interactWithCharacter).not.toHaveBeenCalled()
    })
  })

  describe('WASD — movement', () => {
    it('sets heldDirection on keydown', () => {
      renderKeyboardHook()

      act(() => {
        fireKey('d')
      })

      expect(state.heldDirection).toBe('upRight')
    })

    it('clears path and pending state', () => {
      state.path = [{ x: 1, y: 1 }]
      state.pathWaypoints = [{ x: 2, y: 2 }]
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      state.pendingAction = () => {}
      state.pendingInteractionTarget = { x: 3, y: 3 }
      state.previewFn = () => []
      renderKeyboardHook()

      act(() => {
        fireKey('w')
      })

      expect(state.path).toBeNull()
      expect(state.pathWaypoints).toEqual([])
      expect(state.pendingAction).toBeNull()
      expect(state.pendingInteractionTarget).toBeNull()
      expect(state.previewFn).toBeNull()
    })

    it('does not call movePlayer directly — game loop handles movement', () => {
      renderKeyboardHook()

      act(() => {
        fireKey('w')
      })

      expect(movePlayer).not.toHaveBeenCalled()
    })

    it('does not add the cursor-hidden class to documentElement', () => {
      document.documentElement.classList.remove('cursor-hidden')
      renderKeyboardHook()

      act(() => {
        fireKey('w')
      })

      expect(document.documentElement.classList.contains('cursor-hidden')).toBe(false)
    })
  })

  describe('WASD — repeat events', () => {
    it('sets heldDirection but does not call movePlayer', () => {
      renderKeyboardHook()

      act(() => {
        fireKey('w', { repeat: true })
      })

      expect(state.heldDirection).toBe('upLeft')
      expect(movePlayer).not.toHaveBeenCalled()
    })
  })

  describe('WASD — menu/dialog interaction', () => {
    it('closes system on movement key without moving', () => {
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActiveScreen('system')
      })
      act(() => {
        fireKey('w')
      })

      expect(result.current.activeScreen).toBeNull()
      expect(state.heldDirection).toBeNull()
      expect(movePlayer).not.toHaveBeenCalled()
    })

    it('closes dialog on movement key without moving', () => {
      state.activeDialog = { characterId: 'gron', lineIndex: 0 } as GameState['activeDialog']
      renderKeyboardHook()

      act(() => {
        fireKey('w')
      })

      expect(state.activeDialog).toBeNull()
      expect(state.heldDirection).toBeNull()
      expect(movePlayer).not.toHaveBeenCalled()
      expect(refreshUI).toHaveBeenCalled()
    })
  })

  describe('X key — drop item', () => {
    // The backpack lives in the bottom bar now (see backpack-bottom-bar
    // spec); the pack permacomputer screen no longer exists, so [x] drops
    // whatever the inventory grid is currently hovering — no screen gate.
    it('drops hovered item without any screen gate', () => {
      itemInfoRef = makeItemInfoRef(() => 'bee')
      vi.mocked(dropItem).mockReturnValue(true)
      renderKeyboardHook()

      act(() => {
        fireKey('x')
      })

      expect(dropItem).toHaveBeenCalledWith(state, 'bee', expect.any(Number))
      expect((itemInfoRef.current as unknown as { clear: ReturnType<typeof vi.fn> }).clear).toHaveBeenCalled()
      expect(updateFacingEntity).toHaveBeenCalledWith(state)
      expect(refreshUI).toHaveBeenCalled()
    })

    it('does nothing when not hovering', () => {
      itemInfoRef = makeItemInfoRef(() => null)
      renderKeyboardHook()

      act(() => {
        fireKey('x')
      })

      expect(dropItem).not.toHaveBeenCalled()
    })
  })

  describe('WASD during drag', () => {
    it('sets heldDirection while dragging', () => {
      isDraggingRef = { current: true }
      renderKeyboardHook()

      act(() => {
        fireKey('w')
      })

      expect(state.heldDirection).toBe('upLeft')
    })

    it('blocks non-movement keys while dragging', () => {
      isDraggingRef = { current: true }
      itemInfoRef = makeItemInfoRef(() => 'bee')
      vi.mocked(dropItem).mockReturnValue(true)
      renderKeyboardHook()

      // x should be blocked
      act(() => {
        fireKey('x')
      })
      expect(dropItem).not.toHaveBeenCalled()

      // f should be blocked
      act(() => {
        fireKey('f')
      })
      expect(interactWithCharacter).not.toHaveBeenCalled()
    })
  })

  describe('handleKeyUp', () => {
    it('clears heldDirection when matching', () => {
      renderKeyboardHook()

      act(() => {
        fireKey('w')
      })
      expect(state.heldDirection).toBe('upLeft')

      act(() => {
        fireKeyUp('w')
      })
      expect(state.heldDirection).toBeNull()
    })

    it('does not clear heldDirection for non-matching key', () => {
      renderKeyboardHook()

      act(() => {
        fireKey('w')
      })
      expect(state.heldDirection).toBe('upLeft')

      act(() => {
        fireKeyUp('a')
      })
      expect(state.heldDirection).toBe('upLeft')
    })
  })

  describe('[f] hold-to-scan (precis #6)', () => {
    const stubTarget = {
      position: { x: 10, y: 10 },
      species: FloraSpecies.Clover,
      identity: 'a'.repeat(64),
    }

    it('begins a scan on keydown when a target is available', () => {
      vi.mocked(selectScanTarget).mockReturnValue(stubTarget)
      renderKeyboardHook()
      act(() => {
        fireKey('f')
      })
      expect(state.scanInProgress).not.toBeNull()
      expect(state.scanInProgress?.species).toBe(FloraSpecies.Clover)
    })

    it('does not begin a scan when there is no target', () => {
      vi.mocked(selectScanTarget).mockReturnValue(null)
      renderKeyboardHook()
      act(() => {
        fireKey('f')
      })
      expect(state.scanInProgress).toBeNull()
    })

    it('ignores key repeat — does not reset startTime', () => {
      vi.mocked(selectScanTarget).mockReturnValue(stubTarget)
      renderKeyboardHook()
      act(() => {
        fireKey('f')
      })
      const firstStart = state.scanInProgress?.startTime ?? 0
      act(() => {
        fireKey('f', { repeat: true })
      })
      expect(state.scanInProgress?.startTime).toBe(firstStart)
    })

    it('keyup never commits — it only aborts (auto-commit runs in the game loop)', () => {
      vi.mocked(selectScanTarget).mockReturnValue(stubTarget)
      renderKeyboardHook()
      act(() => {
        fireKey('f')
      })
      // Even if the player held past SCAN_DURATION_MS, the keyup itself
      // does not call commitScan — the game loop is responsible for that.
      if (state.scanInProgress) state.scanInProgress.startTime = performance.now() - 5000
      act(() => {
        fireKeyUp('f')
      })
      expect(commitScan).not.toHaveBeenCalled()
      expect(state.scanInProgress).toBeNull()
    })

    it('keyup aborts the scan when the hold was incomplete', () => {
      vi.mocked(selectScanTarget).mockReturnValue(stubTarget)
      renderKeyboardHook()
      act(() => {
        fireKey('f')
      })
      if (state.scanInProgress) state.scanInProgress.startTime = performance.now() - 100
      act(() => {
        fireKeyUp('f')
      })
      expect(commitScan).not.toHaveBeenCalled()
      expect(state.scanInProgress).toBeNull()
    })

    it('aborts the scan when the player presses a movement key', () => {
      vi.mocked(selectScanTarget).mockReturnValue(stubTarget)
      renderKeyboardHook()
      act(() => {
        fireKey('f')
      })
      expect(state.scanInProgress).not.toBeNull()
      act(() => {
        fireKey('w') // movement
      })
      expect(state.scanInProgress).toBeNull()
    })

    it('suppresses the keydown while a dialog is open', () => {
      vi.mocked(selectScanTarget).mockReturnValue(stubTarget)
      state.activeDialog = { characterId: 'gron', lineIndex: 0 } as GameState['activeDialog']
      renderKeyboardHook()
      act(() => {
        fireKey('f')
      })
      expect(state.scanInProgress).toBeNull()
    })
  })

  describe('[f] shares with interact (precis #6 + remap)', () => {
    const stubTarget = {
      position: { x: 10, y: 10 },
      species: FloraSpecies.Clover,
      identity: 'b'.repeat(64),
    }

    it('interact wins when both an adjacent character and a scan target are in range', () => {
      const character = { definitionId: 'gron', pos: { x: state.player.x + 1, y: state.player.y } }
      vi.mocked(getAdjacentCharacter).mockReturnValue(character)
      vi.mocked(interactWithCharacter).mockReturnValue({ opened: true, gift: null, coyoteToggled: false })
      vi.mocked(selectScanTarget).mockReturnValue(stubTarget)
      renderKeyboardHook()

      act(() => {
        fireKey('f')
      })

      expect(interactWithCharacter).toHaveBeenCalledWith(state)
      expect(state.scanInProgress).toBeNull()
    })

    it('falls through to scan when no interactable is in range', () => {
      vi.mocked(getAdjacentCharacter).mockReturnValue(null)
      vi.mocked(selectScanTarget).mockReturnValue(stubTarget)
      renderKeyboardHook()

      act(() => {
        fireKey('f')
      })

      expect(interactWithCharacter).not.toHaveBeenCalled()
      expect(state.scanInProgress).not.toBeNull()
      expect(state.scanInProgress?.species).toBe(FloraSpecies.Clover)
    })
  })
})
