import { createRef } from 'react'
import { InventoryPanel } from '../InventoryPanel'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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

    // 10x100 = 1000 cells
    const gridCells = container.querySelectorAll('.inline-grid > div')
    expect(gridCells).toHaveLength(1000)
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
})
