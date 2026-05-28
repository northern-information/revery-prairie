import { createRef } from 'react'
import { InHandSlot } from '../InHandSlot'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { takeInHand } from '@/engine/inHand'
import { getDefinition } from '@/engine/items'
import { placeItem } from '@/engine/inventory'
import { createGameState } from '@/engine/state'
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
})
