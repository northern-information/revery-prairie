import { createRef } from 'react'
import { InHandSlot } from '../InHandSlot'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ACTION_COLOR } from '@/engine/constants'
import { takeInHand } from '@/engine/inHand'
import { getDefinition } from '@/engine/items'
import { placeItem } from '@/engine/inventory'
import { createGameState } from '@/engine/state'
import type { DragState } from '@/engine/drag'
import type { ItemInfoHandle } from '../ItemInfo'

const itemInfoRef = createRef<ItemInfoHandle>()

const renderSlot = (state: ReturnType<typeof createGameState>) =>
  render(
    <InHandSlot
      state={state}
      dragState={null}
      refreshUI={vi.fn()}
      cancelDrag={vi.fn()}
      startDrag={vi.fn()}
      itemInfoRef={itemInfoRef}
    />
  )

describe('InHandSlot', () => {
  it('renders the in-hand item glyph and name when an item is held', () => {
    const state = createGameState('Test', 80, 40)
    const item = placeItem(state.backpack, 'meteorite', 0, 0)
    if (!item) throw new Error('expected meteorite placement')
    takeInHand(state, item.uid)

    const { getByTestId, getByText } = renderSlot(state)
    const slot = getByTestId('in-hand-slot')
    expect(slot.textContent).toContain(getDefinition('meteorite').glyph)
    expect(getByText(getDefinition('meteorite').name)).toBeTruthy()
  })

  it('renders an empty placeholder when nothing is in hand', () => {
    const state = createGameState('Test', 80, 40)

    const { getByTestId } = renderSlot(state)
    const slot = getByTestId('in-hand-slot')
    expect(slot.textContent).not.toContain(getDefinition('meteorite').glyph)
    expect(slot.textContent).toMatch(/empty/i)
  })

  it('inverts to a pink drop target with a black glyph while a placeable is dragged over it', () => {
    const state = createGameState('Test', 80, 40)
    const item = placeItem(state.backpack, 'meteorite', 0, 0)
    if (!item) throw new Error('expected meteorite placement')

    const dragState: DragState = {
      item,
      sourceContainerId: state.backpack.id,
      targetContainerId: state.backpack.id,
      previewX: 0,
      previewY: 0,
      isValid: true,
      combineTarget: null,
      cannotCombine: false,
    }

    const { getByTestId } = render(
      <InHandSlot
        state={state}
        dragState={dragState}
        refreshUI={vi.fn()}
        cancelDrag={vi.fn()}
        startDrag={vi.fn()}
        itemInfoRef={itemInfoRef}
      />
    )
    const slot = getByTestId('in-hand-slot')
    expect(slot.dataset.dropTarget).toBeUndefined()

    fireEvent.mouseEnter(slot)
    expect(slot.dataset.dropTarget).toBe('true')
    expect(slot.style.backgroundColor).toBe('rgb(255, 105, 180)') // ACTION_COLOR
    const glyphSpan = slot.querySelector('span')
    expect(glyphSpan?.textContent).toBe(getDefinition('meteorite').glyph)
    expect(glyphSpan?.style.color).toBe('rgb(0, 0, 0)')
    expect(ACTION_COLOR).toBe('#ff69b4')
  })
})
