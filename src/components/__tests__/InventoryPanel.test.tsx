import { createRef } from 'react'
import { InventoryPanel } from '../InventoryPanel'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createGameState } from '@/engine/state'
import type { ItemInfoHandle } from '../ItemInfo'

const defaultInfoRef = createRef<ItemInfoHandle>()

describe('InventoryPanel', () => {
  it('renders inventory title and backpack header', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <InventoryPanel
        state={state}
        refreshUI={vi.fn()}
        itemInfoRef={defaultInfoRef}
        onCombineLog={vi.fn()}
        onDropLog={vi.fn()}
        metricsRef={createRef()}
        isDraggingRef={{ current: false }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('inventory')).toBeInTheDocument()
    expect(screen.getByText('backpack')).toBeInTheDocument()
  })

  it('renders weight display', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <InventoryPanel
        state={state}
        refreshUI={vi.fn()}
        itemInfoRef={defaultInfoRef}
        onCombineLog={vi.fn()}
        onDropLog={vi.fn()}
        metricsRef={createRef()}
        isDraggingRef={{ current: false }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('9w')).toBeInTheDocument()
  })

  it('renders keybind hints', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <InventoryPanel
        state={state}
        refreshUI={vi.fn()}
        itemInfoRef={defaultInfoRef}
        onCombineLog={vi.fn()}
        onDropLog={vi.fn()}
        metricsRef={createRef()}
        isDraggingRef={{ current: false }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('[x] drop')).toBeInTheDocument()
    expect(screen.getByText('[r]otate')).toBeInTheDocument()
    expect(screen.getByText('sort')).toBeInTheDocument()
  })

  it('renders correct number of grid cells for backpack', () => {
    const state = createGameState('Test', 80, 40)
    const { container } = render(
      <InventoryPanel
        state={state}
        refreshUI={vi.fn()}
        itemInfoRef={defaultInfoRef}
        onCombineLog={vi.fn()}
        onDropLog={vi.fn()}
        metricsRef={createRef()}
        isDraggingRef={{ current: false }}
        onClose={vi.fn()}
      />
    )

    // 6x4 = 24 cells
    const gridCells = container.querySelectorAll('.inline-grid > div')
    expect(gridCells).toHaveLength(24)
  })

  it('renders item icons in the grid', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <InventoryPanel
        state={state}
        refreshUI={vi.fn()}
        itemInfoRef={defaultInfoRef}
        onCombineLog={vi.fn()}
        onDropLog={vi.fn()}
        metricsRef={createRef()}
        isDraggingRef={{ current: false }}
        onClose={vi.fn()}
      />
    )

    expect(screen.getAllByText('*')).toHaveLength(3)
    expect(screen.getAllByText('%')).toHaveLength(3)
    expect(screen.getByText('☷')).toBeInTheDocument()
  })

  it('does not render open container when null', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <InventoryPanel
        state={state}
        refreshUI={vi.fn()}
        itemInfoRef={defaultInfoRef}
        onCombineLog={vi.fn()}
        onDropLog={vi.fn()}
        metricsRef={createRef()}
        isDraggingRef={{ current: false }}
        onClose={vi.fn()}
      />
    )

    const grids = document.querySelectorAll('.inline-grid')
    expect(grids).toHaveLength(1)
  })

  it('renders close button that calls onClose', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const state = createGameState('Test', 80, 40)
    const onClose = vi.fn()
    render(
      <InventoryPanel
        state={state}
        refreshUI={vi.fn()}
        itemInfoRef={defaultInfoRef}
        onCombineLog={vi.fn()}
        onDropLog={vi.fn()}
        metricsRef={createRef()}
        isDraggingRef={{ current: false }}
        onClose={onClose}
      />
    )

    const closeButton = screen.getByText('x')
    await userEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
