import { useKeyboard } from '../useKeyboard'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGroundOmniboxTestEntity, createTestState } from '@/engine/__tests__/helpers'
import { dropItem, pickUpGroundItems } from '@/engine/entities'
import {
  advanceDialog,
  breakWall,
  getAdjacentCharacter,
  interactWithCharacter,
  updateFacingEntity,
} from '@/engine/interaction'
import { findItemByDefinition, moveItem } from '@/engine/inventory'
import { movePlayer } from '@/engine/movement'
import { closeOmnibox, grabOmnibox, toggleFacingOmnibox, toggleOmnibox } from '@/engine/omnibox'
import { Zone } from '@/engine/types'
import type { ItemInfoHandle } from '@/components/ItemInfo'
import type { GameState } from '@/engine/types'

// --- mocks ---

vi.mock('@/engine/actionBar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/actionBar')>()
  return {
    ...actual,
    activateActionBarSlot: vi.fn(() => false),
  }
})

vi.mock('@/engine/entities', async importOriginal => {
  const actual = await importOriginal<typeof import('@/engine/entities')>()
  return {
    ...actual,
    dropItem: vi.fn(() => false),
    pickUpGroundItems: vi.fn(() => ({ pickedUp: [], chainExplosions: 0 })),
  }
})

vi.mock('@/engine/movement', () => ({
  movePlayer: vi.fn(() => true),
}))

vi.mock('@/engine/interaction', () => ({
  advanceDialog: vi.fn(() => false),
  breakWall: vi.fn(() => false),
  getAdjacentCharacter: vi.fn(() => null),
  giveCharacterGift: vi.fn(() => null),
  interactWithCharacter: vi.fn(() => ({ opened: false, gift: null })),
  updateFacingEntity: vi.fn(),
}))

vi.mock('@/engine/omnibox', async importOriginal => {
  const actual = await importOriginal<typeof import('@/engine/omnibox')>()
  return {
    ...actual,
    closeOmnibox: vi.fn(),
    grabOmnibox: vi.fn(() => null),
    toggleFacingOmnibox: vi.fn(() => false),
    toggleOmnibox: vi.fn(() => false),
  }
})

vi.mock('@/engine/input', async importOriginal => {
  const actual = await importOriginal<typeof import('@/engine/input')>()
  return {
    ...actual,
    keyToDirection: vi.fn((key: string) => {
      const map: Record<string, string> = {
        w: 'up',
        W: 'up',
        a: 'left',
        A: 'left',
        s: 'down',
        S: 'down',
        d: 'right',
        D: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }
      return map[key] ?? null
    }),
  }
})

vi.mock('@/engine/inventory', async importOriginal => {
  const actual = await importOriginal<typeof import('@/engine/inventory')>()
  return {
    ...actual,
    findItemByDefinition: vi.fn(() => undefined),
    moveItem: vi.fn(),
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
let onPickup: ReturnType<typeof vi.fn>
let onDrop: ReturnType<typeof vi.fn>
let onDialog: ReturnType<typeof vi.fn>
let onDiscovery: ReturnType<typeof vi.fn>
let onGift: ReturnType<typeof vi.fn>
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
      onPickup,
      onDrop,
      onDialog,
      onDiscovery,
      onGift,
      isDraggingRef,
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
  state = createTestState()
  refreshUI = vi.fn()
  onPickup = vi.fn()
  onDrop = vi.fn()
  onDialog = vi.fn()
  onDiscovery = vi.fn()
  onGift = vi.fn()
  itemInfoRef = makeItemInfoRef()
  isDraggingRef = { current: false }

  // Reset all mock return values (clearAllMocks only clears call history)
  vi.mocked(movePlayer).mockReturnValue(true)
  vi.mocked(pickUpGroundItems).mockReturnValue({ pickedUp: [], chainExplosions: 0 })
  vi.mocked(advanceDialog).mockReturnValue(false)
  vi.mocked(breakWall).mockReturnValue(false)
  vi.mocked(getAdjacentCharacter).mockReturnValue(null)
  vi.mocked(interactWithCharacter).mockReturnValue({ opened: false, gift: null })
  vi.mocked(dropItem).mockReturnValue(false)
  vi.mocked(grabOmnibox).mockReturnValue(null)
  vi.mocked(toggleFacingOmnibox).mockReturnValue(false)
  vi.mocked(toggleOmnibox).mockReturnValue(false)
  vi.mocked(findItemByDefinition).mockReturnValue(undefined)
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
      // Panel should not change
      expect(result.current.activePanel).toBeNull()
    })

    it('closes menu panel when no dialog', () => {
      const { result } = renderKeyboardHook()

      // Open menu first
      act(() => {
        result.current.setActivePanel('menu')
      })
      expect(result.current.activePanel).toBe('menu')

      act(() => {
        fireKey('Escape')
      })
      expect(result.current.activePanel).toBeNull()
    })

    it('closes inventory panel when no dialog', () => {
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActivePanel('inventory')
      })
      act(() => {
        fireKey('Escape')
      })

      expect(result.current.activePanel).toBeNull()
    })

    it('opens menu when nothing is open', () => {
      const { result } = renderKeyboardHook()

      act(() => {
        fireKey('Escape')
      })

      expect(result.current.activePanel).toBe('menu')
    })
  })

  describe('E key — dialog branch', () => {
    it('advances dialog', () => {
      state.activeDialog = { characterId: 'gron', lineIndex: 0 } as GameState['activeDialog']
      vi.mocked(advanceDialog).mockReturnValue(true)
      renderKeyboardHook()

      act(() => {
        fireKey('e')
      })

      expect(advanceDialog).toHaveBeenCalledWith(state)
      expect(refreshUI).toHaveBeenCalledOnce()
    })

    it('simply advances dialog without gift check', () => {
      state.activeDialog = { characterId: 'moab', lineIndex: 0 } as GameState['activeDialog']
      vi.mocked(advanceDialog).mockReturnValue(false)
      renderKeyboardHook()

      act(() => {
        fireKey('e')
      })

      expect(advanceDialog).toHaveBeenCalledWith(state)
      expect(refreshUI).toHaveBeenCalled()
    })
  })

  describe('E key — open container branch', () => {
    it('grabs ground omnibox and closes container', () => {
      const container = { id: 'omni-uid', name: 'omnibox #1', width: 5, height: 5, items: [] }
      state.openContainer = container
      createGroundOmniboxTestEntity(state, 'omni-uid', state.player.x + 1, state.player.y)
      vi.mocked(grabOmnibox).mockReturnValue('omni-uid')
      renderKeyboardHook()

      act(() => {
        fireKey('e')
      })

      expect(grabOmnibox).toHaveBeenCalledWith(state)
      expect(onPickup).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        state.player.x,
        state.player.y
      )
      expect(closeOmnibox).toHaveBeenCalledWith(state)
      expect(refreshUI).toHaveBeenCalled()
    })

    it('closes non-ground omnibox container without grabbing', () => {
      const container = { id: 'backpack-omni', name: 'omnibox #2', width: 5, height: 5, items: [] }
      state.openContainer = container
      // Not a ground omnibox ECS entity — no groundOmnibox entities in world
      renderKeyboardHook()

      act(() => {
        fireKey('e')
      })

      expect(grabOmnibox).not.toHaveBeenCalled()
      expect(closeOmnibox).toHaveBeenCalledWith(state)
      expect(refreshUI).toHaveBeenCalled()
    })
  })

  describe('E key — inventory omnibox hover', () => {
    it('toggles omnibox when hovering omnibox in inventory', () => {
      itemInfoRef = makeItemInfoRef(
        () => 'omnibox',
        () => 'omni-uid-1'
      )
      vi.mocked(toggleOmnibox).mockReturnValue(true)
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActivePanel('inventory')
      })
      act(() => {
        fireKey('e')
      })

      expect(toggleOmnibox).toHaveBeenCalledWith(state, 'omni-uid-1')
      expect(refreshUI).toHaveBeenCalled()
    })
  })

  describe('E key — facing ground omnibox', () => {
    it('opens facing omnibox and sets inventory panel', () => {
      vi.mocked(toggleFacingOmnibox).mockReturnValue(true)
      const { result } = renderKeyboardHook()

      act(() => {
        fireKey('e')
      })

      expect(toggleFacingOmnibox).toHaveBeenCalledWith(state)
      expect(result.current.activePanel).toBe('inventory')
      expect(refreshUI).toHaveBeenCalled()
    })

    it('does not change panel if inventory already open', () => {
      vi.mocked(toggleFacingOmnibox).mockReturnValue(true)
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActivePanel('inventory')
      })
      act(() => {
        fireKey('e')
      })

      expect(result.current.activePanel).toBe('inventory')
    })
  })

  describe('E key — break wall', () => {
    it('calls breakWall in cave zone when not revealed', () => {
      state.currentZone = Zone.Cave
      state.caveRevealed = false
      vi.mocked(breakWall).mockReturnValue(true)
      renderKeyboardHook()

      act(() => {
        fireKey('e')
      })

      expect(breakWall).toHaveBeenCalledWith(state, expect.any(Number))
      expect(onDiscovery).toHaveBeenCalledWith('discovered hidden room!', state.player.x, state.player.y)
      expect(refreshUI).toHaveBeenCalled()
    })

    it('does not call breakWall when cave already revealed', () => {
      state.currentZone = Zone.Cave
      state.caveRevealed = true
      renderKeyboardHook()

      act(() => {
        fireKey('e')
      })

      expect(breakWall).not.toHaveBeenCalled()
    })
  })

  describe('E key — character interaction', () => {
    it('calls interactWithCharacter and fires onDialog', () => {
      const character = { definitionId: 'gron', pos: { x: state.player.x + 1, y: state.player.y } }
      vi.mocked(getAdjacentCharacter).mockReturnValue(character)
      vi.mocked(interactWithCharacter).mockReturnValue({ opened: true, gift: null })
      renderKeyboardHook()

      act(() => {
        fireKey('e')
      })

      expect(interactWithCharacter).toHaveBeenCalledWith(state)
      expect(onDialog).toHaveBeenCalledWith('Test Ghost', 'ö', '#fff', state.player.x, state.player.y)
      expect(refreshUI).toHaveBeenCalled()
    })

    it('does nothing when no adjacent character', () => {
      vi.mocked(getAdjacentCharacter).mockReturnValue(null)
      renderKeyboardHook()

      act(() => {
        fireKey('e')
      })

      expect(interactWithCharacter).not.toHaveBeenCalled()
      expect(onDialog).not.toHaveBeenCalled()
    })
  })

  describe('E key — blocked by menu', () => {
    it('does nothing when menu is open', () => {
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActivePanel('menu')
      })
      act(() => {
        fireKey('e')
      })

      expect(advanceDialog).not.toHaveBeenCalled()
      expect(interactWithCharacter).not.toHaveBeenCalled()
      expect(toggleFacingOmnibox).not.toHaveBeenCalled()
    })
  })

  describe('WASD — movement', () => {
    it('sets heldDirection on keydown', () => {
      renderKeyboardHook()

      act(() => {
        fireKey('d')
      })

      expect(state.heldDirection).toBe('right')
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
  })

  describe('WASD — repeat events', () => {
    it('sets heldDirection but does not call movePlayer', () => {
      renderKeyboardHook()

      act(() => {
        fireKey('w', { repeat: true })
      })

      expect(state.heldDirection).toBe('up')
      expect(movePlayer).not.toHaveBeenCalled()
    })
  })

  describe('WASD — menu/dialog interaction', () => {
    it('closes menu on movement key without moving', () => {
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActivePanel('menu')
      })
      act(() => {
        fireKey('w')
      })

      expect(result.current.activePanel).toBeNull()
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
    it('drops hovered item when inventory is open', () => {
      itemInfoRef = makeItemInfoRef(() => 'bee')
      vi.mocked(dropItem).mockReturnValue(true)
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActivePanel('inventory')
      })
      act(() => {
        fireKey('x')
      })

      expect(dropItem).toHaveBeenCalledWith(state, 'bee')
      expect((itemInfoRef.current as unknown as { clear: ReturnType<typeof vi.fn> }).clear).toHaveBeenCalled()
      expect(updateFacingEntity).toHaveBeenCalledWith(state)
      expect(onDrop).toHaveBeenCalledWith('bee', state.player.x, state.player.y)
      expect(refreshUI).toHaveBeenCalled()
    })

    it('does nothing when not hovering', () => {
      itemInfoRef = makeItemInfoRef(() => null)
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActivePanel('inventory')
      })
      act(() => {
        fireKey('x')
      })

      expect(dropItem).not.toHaveBeenCalled()
    })

    it('does nothing when inventory is closed', () => {
      itemInfoRef = makeItemInfoRef(() => 'bee')
      renderKeyboardHook()

      act(() => {
        fireKey('x')
      })

      expect(dropItem).not.toHaveBeenCalled()
    })
  })

  describe('R key — rotate or toggle inventory', () => {
    it('rotates hovered item in inventory', () => {
      itemInfoRef = makeItemInfoRef(() => 'meteorite')
      vi.mocked(findItemByDefinition).mockReturnValue({
        uid: 'u1',
        definitionId: 'meteorite',
        rotation: 0,
        gridX: 0,
        gridY: 0,
      })
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActivePanel('inventory')
      })
      act(() => {
        fireKey('r')
      })

      expect(moveItem).toHaveBeenCalledWith(state.backpack, 'u1', 0, 0, 1)
      expect(refreshUI).toHaveBeenCalled()
    })
  })

  describe('WASD during drag', () => {
    it('sets heldDirection while dragging', () => {
      isDraggingRef = { current: true }
      renderKeyboardHook()

      act(() => {
        fireKey('w')
      })

      expect(state.heldDirection).toBe('up')
    })

    it('blocks non-movement keys while dragging', () => {
      isDraggingRef = { current: true }
      itemInfoRef = makeItemInfoRef(() => 'bee')
      vi.mocked(dropItem).mockReturnValue(true)
      const { result } = renderKeyboardHook()

      act(() => {
        result.current.setActivePanel('inventory')
      })
      // x should be blocked
      act(() => {
        fireKey('x')
      })
      expect(dropItem).not.toHaveBeenCalled()

      // e should be blocked
      act(() => {
        fireKey('e')
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
      expect(state.heldDirection).toBe('up')

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
      expect(state.heldDirection).toBe('up')

      act(() => {
        fireKeyUp('a')
      })
      expect(state.heldDirection).toBe('up')
    })
  })
})
