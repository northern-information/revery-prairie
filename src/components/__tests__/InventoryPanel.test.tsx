import { createRef } from 'react'
import { InventoryPanel } from '../InventoryPanel'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createOmniboxContainer } from '@/engine/inventory'
import { openOmnibox } from '@/engine/omnibox'
import { createGameState } from '@/engine/state'
import type { ItemInfoHandle } from '../ItemInfo'

const defaultInfoRef = createRef<ItemInfoHandle>()

describe('InventoryPanel', () => {
  it('renders backpack header', () => {
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
        dragOverlayRef={createRef()}
      />
    )

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
        dragOverlayRef={createRef()}
      />
    )

    // Weight display should contain a number followed by 'w'
    expect(screen.getByText(/\d+w/)).toBeInTheDocument()
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
        dragOverlayRef={createRef()}
      />
    )

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
        dragOverlayRef={createRef()}
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
        dragOverlayRef={createRef()}
      />
    )

    // Starting inventory should include at least one of each starting item glyph
    expect(screen.getAllByText('*').length).toBeGreaterThan(0) // bees
    expect(screen.getAllByText('%').length).toBeGreaterThan(0) // clovers
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
        dragOverlayRef={createRef()}
      />
    )

    const grids = document.querySelectorAll('.inline-grid')
    expect(grids).toHaveLength(1)
  })

  it('renders open omnibox container with its grid', () => {
    const state = createGameState('Test', 80, 40)
    createOmniboxContainer(state, 'uid-1')
    openOmnibox(state, 'uid-1')

    render(
      <InventoryPanel
        state={state}
        refreshUI={vi.fn()}
        itemInfoRef={defaultInfoRef}
        onCombineLog={vi.fn()}
        onDropLog={vi.fn()}
        metricsRef={createRef()}
        isDraggingRef={{ current: false }}
        dragOverlayRef={createRef()}
      />
    )

    // Should have omnibox grid + backpack grid (omnibox is on the left)
    const grids = document.querySelectorAll('.inline-grid')
    expect(grids).toHaveLength(2)
    // omnibox #1 header
    expect(screen.getByText('omnibox #1')).toBeInTheDocument()
    // 5x5 = 25 cells for omnibox (first grid, left side)
    expect(grids[0].children).toHaveLength(25)
  })

  it('opening a second omnibox replaces the first', () => {
    const state = createGameState('Test', 80, 40)
    createOmniboxContainer(state, 'uid-1')
    createOmniboxContainer(state, 'uid-2')
    openOmnibox(state, 'uid-1')
    openOmnibox(state, 'uid-2')

    render(
      <InventoryPanel
        state={state}
        refreshUI={vi.fn()}
        itemInfoRef={defaultInfoRef}
        onCombineLog={vi.fn()}
        onDropLog={vi.fn()}
        metricsRef={createRef()}
        isDraggingRef={{ current: false }}
        dragOverlayRef={createRef()}
      />
    )

    // Only one omnibox open at a time — backpack + 1 omnibox = 2 grids
    const grids = document.querySelectorAll('.inline-grid')
    expect(grids).toHaveLength(2)
    // Second omnibox replaced the first
    expect(screen.getByText('omnibox #2')).toBeInTheDocument()
  })
})
