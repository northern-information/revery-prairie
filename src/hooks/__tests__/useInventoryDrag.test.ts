import { useInventoryDrag } from '../useInventoryDrag'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestState } from '@/engine/__tests__/helpers'
import {
  computePlacementPreview,
  computeRotation,
  executeCombine,
  executeStoreInOmnibox,
  isOmniboxSelfDrop,
} from '@/engine/drag'
import { moveItem, transferItem } from '@/engine/inventory'
import { Rotation } from '@/engine/types'
import type { CombineResult, PlacementPreview, StoreResult } from '@/engine/drag'
import type { Recipe } from '@/engine/recipes'
import type { Container, GameState, ItemInstance } from '@/engine/types'

// --- mocks ---

vi.mock('@/engine/drag', () => ({
  computePlacementPreview: vi.fn(),
  computeRotation: vi.fn(),
  executeCombine: vi.fn(),
  executeStoreInOmnibox: vi.fn(),
  isOmniboxSelfDrop: vi.fn(() => false),
}))

vi.mock('@/engine/inventory', async importOriginal => {
  const actual = await importOriginal<typeof import('@/engine/inventory')>()
  return {
    ...actual,
    moveItem: vi.fn(),
    transferItem: vi.fn(),
  }
})

// --- helpers ---

const makeItem = (overrides?: Partial<ItemInstance>): ItemInstance => ({
  uid: 'item-1',
  definitionId: 'bee',
  rotation: Rotation.R0,
  gridX: 0,
  gridY: 0,
  ...overrides,
})

const fakeRecipe: Recipe = {
  ingredients: ['bee', 'clover'],
  kind: 'macro',
  resultName: 'prairie',
  description: 'test recipe',
  execute: vi.fn(() => true),
}

const defaultPlacement: PlacementPreview = {
  isValid: true,
  combineTarget: null,
  storeTarget: null,
  cannotCombine: false,
}

// --- setup ---

let state: GameState
let onDrop: ReturnType<typeof vi.fn>
let onCombine: ReturnType<typeof vi.fn>
let onStore: ReturnType<typeof vi.fn>
let onStoreFail: ReturnType<typeof vi.fn>
let onCombineFail: ReturnType<typeof vi.fn>

const backpackContainers = () => [{ id: state.backpack.id, container: state.backpack }]

const withOmnibox = (omniboxContainer: Container) => [
  { id: state.backpack.id, container: state.backpack },
  { id: omniboxContainer.id, container: omniboxContainer },
]

const renderDragHook = (containers?: { id: string; container: Container }[]) =>
  renderHook(() =>
    useInventoryDrag({
      containers: containers ?? backpackContainers(),
      state,
      onDrop,
      onCombine,
      onStore,
      onStoreFail,
      onCombineFail,
    })
  )

beforeEach(() => {
  vi.clearAllMocks()
  state = createTestState()
  onDrop = vi.fn()
  onCombine = vi.fn()
  onStore = vi.fn()
  onStoreFail = vi.fn()
  onCombineFail = vi.fn()
  vi.mocked(computePlacementPreview).mockReturnValue(defaultPlacement)
})

// --- tests ---

describe('useInventoryDrag', () => {
  describe('startDrag', () => {
    it('sets dragState with item info and defaults', () => {
      const item = makeItem({ gridX: 2, gridY: 3, rotation: Rotation.R90 })
      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })

      expect(result.current.dragState).toEqual({
        item,
        sourceContainerId: state.backpack.id,
        targetContainerId: state.backpack.id,
        rotation: Rotation.R90,
        previewX: 2,
        previewY: 3,
        isValid: true,
        combineTarget: null,
        storeTarget: null,
        actionBarTarget: null,
        cannotCombine: false,
      })
    })
  })

  describe('updatePreview', () => {
    it('calls computePlacementPreview and merges result', () => {
      const item = makeItem()
      const placement: PlacementPreview = {
        isValid: false,
        combineTarget: { uid: 'target-1', recipe: fakeRecipe, isDiscovered: true },
        storeTarget: null,
        cannotCombine: false,
      }
      vi.mocked(computePlacementPreview).mockReturnValue(placement)

      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        result.current.updatePreview(3, 4, state.backpack.id)
      })

      expect(computePlacementPreview).toHaveBeenCalledWith(
        state.backpack,
        item,
        Rotation.R0,
        3,
        4,
        state.backpack.id,
        state.backpack.id,
        state.discoveredRecipes
      )
      expect(result.current.dragState?.previewX).toBe(3)
      expect(result.current.dragState?.previewY).toBe(4)
      expect(result.current.dragState?.isValid).toBe(false)
      expect(result.current.dragState?.combineTarget).toEqual(placement.combineTarget)
    })

    it('returns previous state when container not found', () => {
      const item = makeItem()
      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        result.current.updatePreview(3, 4, 'nonexistent-id')
      })

      // previewX/previewY stay at initial values
      expect(result.current.dragState?.previewX).toBe(0)
      expect(result.current.dragState?.previewY).toBe(0)
    })

    it('is a no-op when no drag is active', () => {
      const { result } = renderDragHook()

      act(() => {
        result.current.updatePreview(3, 4, state.backpack.id)
      })

      expect(result.current.dragState).toBeNull()
      expect(computePlacementPreview).not.toHaveBeenCalled()
    })
  })

  describe('cancelDrag', () => {
    it('clears dragState to null', () => {
      const item = makeItem()
      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      expect(result.current.dragState).not.toBeNull()

      act(() => {
        result.current.cancelDrag()
      })
      expect(result.current.dragState).toBeNull()
    })
  })

  describe('drop — store target', () => {
    it('calls executeStoreInOmnibox and onStore on success', () => {
      const item = makeItem()
      const storeResult: StoreResult = { outcome: 'stored', omniboxUid: 'omni-1' }
      vi.mocked(executeStoreInOmnibox).mockReturnValue(storeResult)
      vi.mocked(computePlacementPreview).mockReturnValue({
        ...defaultPlacement,
        storeTarget: { omniboxUid: 'omni-1' },
      })

      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        result.current.updatePreview(0, 0, state.backpack.id)
      })
      act(() => {
        result.current.drop(state.backpack.id)
      })

      expect(executeStoreInOmnibox).toHaveBeenCalledWith(state.backpack, item, 'omni-1', state.omniboxContainers)
      expect(onStore).toHaveBeenCalledWith('omni-1')
      expect(onDrop).toHaveBeenCalledOnce()
      expect(result.current.dragState).toBeNull()
    })

    it('calls onStoreFail on no-room', () => {
      const item = makeItem()
      vi.mocked(executeStoreInOmnibox).mockReturnValue({ outcome: 'no-room' })
      vi.mocked(computePlacementPreview).mockReturnValue({
        ...defaultPlacement,
        storeTarget: { omniboxUid: 'omni-1' },
      })

      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        result.current.updatePreview(0, 0, state.backpack.id)
      })
      act(() => {
        result.current.drop(state.backpack.id)
      })

      expect(onStoreFail).toHaveBeenCalledOnce()
      expect(onStore).not.toHaveBeenCalled()
      expect(onDrop).not.toHaveBeenCalled()
      expect(result.current.dragState).toBeNull()
    })
  })

  describe('drop — combine target', () => {
    it('calls executeCombine and onCombine on success', () => {
      const item = makeItem()
      const combineResult: CombineResult = { outcome: 'success' }
      vi.mocked(executeCombine).mockReturnValue(combineResult)
      vi.mocked(computePlacementPreview).mockReturnValue({
        ...defaultPlacement,
        combineTarget: { uid: 'target-1', recipe: fakeRecipe, isDiscovered: false },
      })

      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        result.current.updatePreview(0, 0, state.backpack.id)
      })
      act(() => {
        result.current.drop(state.backpack.id)
      })

      expect(executeCombine).toHaveBeenCalledWith(state, state.backpack, state.backpack, item, {
        uid: 'target-1',
        recipe: fakeRecipe,
        isDiscovered: false,
      })
      expect(onCombine).toHaveBeenCalledWith(fakeRecipe)
      expect(onDrop).toHaveBeenCalledOnce()
      expect(result.current.dragState).toBeNull()
    })

    it('calls onCombineFail on failure', () => {
      const item = makeItem()
      vi.mocked(executeCombine).mockReturnValue({ outcome: 'failed' })
      vi.mocked(computePlacementPreview).mockReturnValue({
        ...defaultPlacement,
        combineTarget: { uid: 'target-1', recipe: fakeRecipe, isDiscovered: false },
      })

      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        result.current.updatePreview(0, 0, state.backpack.id)
      })
      act(() => {
        result.current.drop(state.backpack.id)
      })

      expect(onCombineFail).toHaveBeenCalledOnce()
      expect(onCombine).not.toHaveBeenCalled()
      expect(result.current.dragState).toBeNull()
    })
  })

  describe('drop — normal placement', () => {
    it('calls moveItem for same-container drag', () => {
      const item = makeItem({ uid: 'item-1' })
      vi.mocked(computePlacementPreview).mockReturnValue({
        ...defaultPlacement,
        isValid: true,
      })

      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        result.current.updatePreview(2, 3, state.backpack.id)
      })
      act(() => {
        result.current.drop(state.backpack.id)
      })

      expect(moveItem).toHaveBeenCalledWith(state.backpack, 'item-1', 2, 3, Rotation.R0)
      expect(transferItem).not.toHaveBeenCalled()
      expect(onDrop).toHaveBeenCalledOnce()
      expect(result.current.dragState).toBeNull()
    })

    it('calls transferItem for cross-container drag', () => {
      const item = makeItem({ uid: 'item-1' })
      const omnibox: Container = {
        id: 'omni-container',
        name: 'omnibox #1',
        width: 5,
        height: 5,
        items: [],
      }
      vi.mocked(computePlacementPreview).mockReturnValue({
        ...defaultPlacement,
        isValid: true,
      })

      const { result } = renderDragHook(withOmnibox(omnibox))

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        result.current.updatePreview(1, 1, omnibox.id)
      })
      act(() => {
        result.current.drop(omnibox.id)
      })

      expect(transferItem).toHaveBeenCalledWith(state.backpack, omnibox, 'item-1', 1, 1, Rotation.R0)
      expect(moveItem).not.toHaveBeenCalled()
      expect(onDrop).toHaveBeenCalledOnce()
    })

    it('clears dragState on omnibox self-drop without moving', () => {
      const item = makeItem({ definitionId: 'omnibox', uid: 'omni-uid' })
      vi.mocked(isOmniboxSelfDrop).mockReturnValue(true)

      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        result.current.updatePreview(0, 0, state.backpack.id)
      })
      act(() => {
        result.current.drop(state.backpack.id)
      })

      expect(moveItem).not.toHaveBeenCalled()
      expect(transferItem).not.toHaveBeenCalled()
      expect(onDrop).not.toHaveBeenCalled()
      expect(result.current.dragState).toBeNull()
    })
  })

  describe('drop — edge cases', () => {
    it('is a no-op when no drag is active', () => {
      const { result } = renderDragHook()

      act(() => {
        result.current.drop(state.backpack.id)
      })

      expect(moveItem).not.toHaveBeenCalled()
      expect(transferItem).not.toHaveBeenCalled()
      expect(executeCombine).not.toHaveBeenCalled()
      expect(executeStoreInOmnibox).not.toHaveBeenCalled()
      expect(onDrop).not.toHaveBeenCalled()
    })

    it('clears dragState when target container not found', () => {
      const item = makeItem()
      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        result.current.updatePreview(0, 0, state.backpack.id)
      })
      act(() => {
        result.current.drop('nonexistent-container')
      })

      expect(moveItem).not.toHaveBeenCalled()
      expect(result.current.dragState).toBeNull()
    })
  })

  describe('keyboard during drag', () => {
    const fireKey = (key: string) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    }

    it('R key rotates drag preview', () => {
      const item = makeItem()
      vi.mocked(computeRotation).mockReturnValue({
        rotation: Rotation.R90,
        previewX: 1,
        previewY: 2,
        isValid: true,
      })

      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        fireKey('r')
      })

      expect(computeRotation).toHaveBeenCalledWith(state.backpack, item, Rotation.R0, 0, 0)
      expect(result.current.dragState?.rotation).toBe(Rotation.R90)
      expect(result.current.dragState?.combineTarget).toBeNull()
      expect(result.current.dragState?.storeTarget).toBeNull()
      expect(result.current.dragState?.cannotCombine).toBe(false)
    })

    it('Escape key cancels drag', () => {
      const item = makeItem()
      const { result } = renderDragHook()

      act(() => {
        result.current.startDrag(item, state.backpack.id)
      })
      act(() => {
        fireKey('Escape')
      })

      expect(result.current.dragState).toBeNull()
    })

    it('R and Escape are no-ops when no drag is active', () => {
      const { result } = renderDragHook()

      act(() => {
        fireKey('r')
      })
      act(() => {
        fireKey('Escape')
      })

      expect(result.current.dragState).toBeNull()
      expect(computeRotation).not.toHaveBeenCalled()
    })
  })
})
