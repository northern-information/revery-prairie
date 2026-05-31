import { createRef } from 'react'
import { InHandSlot } from '../InHandSlot'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { takeInHand } from '@/engine/inHand'
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

const getMeter = (container: HTMLElement): HTMLElement | null => container.querySelector('[role="meter"]')

describe('InHandSlot wear bar', () => {
  it('renders a wear bar when a wear-bearing item (camera) is in hand', () => {
    const state = createGameState('Test', 80, 40)
    const item = placeItem(state.backpack, 'camera', 0, 0)
    if (!item) throw new Error('expected camera placement')
    takeInHand(state, item.uid)

    const { container } = renderSlot(state)
    expect(getMeter(container)).not.toBeNull()
  })

  it('reflects the current itemWear value in the bar fill', () => {
    const state = createGameState('Test', 80, 40)
    const item = placeItem(state.backpack, 'camera', 0, 0)
    if (!item) throw new Error('expected camera placement')
    takeInHand(state, item.uid)
    state.itemWear[item.uid] = 0.25

    const { container } = renderSlot(state)
    const meter = getMeter(container)
    if (!meter) throw new Error('meter missing')
    expect(meter.getAttribute('aria-valuenow')).toBe('0.25')
    const fill = meter.firstElementChild as HTMLElement
    expect(fill.style.width).toBe('75%')
  })

  it('treats an undefined wear value as 0 (bar fully filled)', () => {
    const state = createGameState('Test', 80, 40)
    const item = placeItem(state.backpack, 'camera', 0, 0)
    if (!item) throw new Error('expected camera placement')
    takeInHand(state, item.uid)

    const { container } = renderSlot(state)
    const meter = getMeter(container)
    if (!meter) throw new Error('meter missing')
    expect(meter.getAttribute('aria-valuenow')).toBe('0')
    const fill = meter.firstElementChild as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('does not render a wear bar for non-wear-bearing items (meteorite)', () => {
    const state = createGameState('Test', 80, 40)
    const item = placeItem(state.backpack, 'meteorite', 0, 0)
    if (!item) throw new Error('expected meteorite placement')
    takeInHand(state, item.uid)

    const { container } = renderSlot(state)
    expect(getMeter(container)).toBeNull()
  })

  it('does not render a wear bar when nothing is in hand', () => {
    const state = createGameState('Test', 80, 40)
    const { container } = renderSlot(state)
    expect(getMeter(container)).toBeNull()
  })
})
