import { createRef } from 'react'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InventoryGrid } from '../InventoryGrid'
import { COIN_POP_DURATION_MS } from '@/engine/constants'
import { placeItem } from '@/engine/inventory'
import { createGameState } from '@/engine/state'
import type { ItemInfoHandle } from '../ItemInfo'

const itemInfoRef = createRef<ItemInfoHandle>()

const renderGrid = (state: ReturnType<typeof createGameState>) =>
  render(
    <InventoryGrid
      container={state.backpack}
      containerId={state.backpack.id}
      dragState={null}
      onStartDrag={vi.fn()}
      onUpdatePreview={vi.fn()}
      onDrop={vi.fn()}
      itemInfoRef={itemInfoRef}
      glintingCoins={state.glintingCoins}
      coinGlintPopTimes={state.coinGlintPopTimes}
    />
  )

describe('InventoryGrid coin glint states', () => {
  // Anchor performance.now to a known value so test pop-time deltas are stable.
  const mockNow = 10_000

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(mockNow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders data-coin-state="dull" for an unglinted coin', () => {
    const state = createGameState('Test', 80, 40)
    const placed = placeItem(state.backpack, 'coin', 0, 0)
    if (placed === null) throw new Error('expected coin placement')

    const { container } = renderGrid(state)
    const dullCell = container.querySelector('[data-coin-state="dull"]')
    expect(dullCell).not.toBeNull()
    expect(container.querySelectorAll('[data-coin-state="glint"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-coin-state="glint-pop"]')).toHaveLength(0)
  })

  it('renders data-coin-state="glint" for a glinted coin with no recent pop', () => {
    const state = createGameState('Test', 80, 40)
    const placed = placeItem(state.backpack, 'coin', 0, 0)
    if (placed === null) throw new Error('expected coin placement')
    state.glintingCoins.add(placed.uid)
    // No pop time recorded — sustained shimmer only.

    const { container } = renderGrid(state)
    expect(container.querySelector('[data-coin-state="glint"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-coin-state="glint-pop"]')).toHaveLength(0)
    expect(container.querySelector('.coin-cell-glint')).not.toBeNull()
  })

  it('renders data-coin-state="glint-pop" when popTime is recent', () => {
    const state = createGameState('Test', 80, 40)
    const placed = placeItem(state.backpack, 'coin', 0, 0)
    if (placed === null) throw new Error('expected coin placement')
    state.glintingCoins.add(placed.uid)
    state.coinGlintPopTimes.set(placed.uid, mockNow - Math.floor(COIN_POP_DURATION_MS / 4))

    const { container } = renderGrid(state)
    expect(container.querySelector('[data-coin-state="glint-pop"]')).not.toBeNull()
    expect(container.querySelector('.coin-cell-pop')).not.toBeNull()
  })

  it('downgrades to "glint" when popTime is stale', () => {
    const state = createGameState('Test', 80, 40)
    const placed = placeItem(state.backpack, 'coin', 0, 0)
    if (placed === null) throw new Error('expected coin placement')
    state.glintingCoins.add(placed.uid)
    state.coinGlintPopTimes.set(placed.uid, mockNow - COIN_POP_DURATION_MS - 100)

    const { container } = renderGrid(state)
    expect(container.querySelector('[data-coin-state="glint-pop"]')).toBeNull()
    expect(container.querySelector('[data-coin-state="glint"]')).not.toBeNull()
  })

  it('survives a missing coinGlintPopTimes prop (legacy save) and renders glint state', () => {
    const state = createGameState('Test', 80, 40)
    const placed = placeItem(state.backpack, 'coin', 0, 0)
    if (placed === null) throw new Error('expected coin placement')
    state.glintingCoins.add(placed.uid)

    const { container } = render(
      <InventoryGrid
        container={state.backpack}
        containerId={state.backpack.id}
        dragState={null}
        onStartDrag={vi.fn()}
        onUpdatePreview={vi.fn()}
        onDrop={vi.fn()}
        itemInfoRef={itemInfoRef}
        glintingCoins={state.glintingCoins}
      />
    )
    expect(container.querySelector('[data-coin-state="glint"]')).not.toBeNull()
    expect(container.querySelector('[data-coin-state="glint-pop"]')).toBeNull()
  })

  it('does not set data-coin-state on non-coin items', () => {
    const state = createGameState('Test', 80, 40)
    placeItem(state.backpack, 'bee', 0, 0)

    const { container } = renderGrid(state)
    expect(container.querySelectorAll('[data-coin-state]')).toHaveLength(0)
  })
})
