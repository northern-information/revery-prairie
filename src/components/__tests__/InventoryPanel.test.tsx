import { createRef } from 'react'
import { InventoryPanel } from '../InventoryPanel'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { placeItem } from '@/engine/inventory'
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

    expect(screen.getByText('Backpack')).toBeInTheDocument()
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

    // 10x5 = 50 cells (backpack inlined into bottom bar; see backpack-bottom-bar spec)
    const gridCells = container.querySelectorAll('.inline-grid > div')
    expect(gridCells).toHaveLength(50)
  })

  it('renders item icons in the grid', () => {
    const state = createGameState('Test', 80, 40)
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
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

    expect(screen.getAllByText('*').length).toBeGreaterThan(0) // bees
    expect(screen.getAllByText('%').length).toBeGreaterThan(0) // clovers
  })

  it('clears cursor tile/screen info while hovered (bottom-bar widget)', () => {
    const state = createGameState('Test', 80, 40)
    state.cursorScreenPos = { x: 100, y: 100 }
    state.cursorTile = { x: 5, y: 5 }
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

    const panel = container.querySelector('[data-panel="inventory"]')
    expect(panel).not.toBeNull()
    if (!panel) throw new Error('panel missing')
    fireEvent.mouseEnter(panel)
    expect(state.cursorScreenPos).toBeNull()
    expect(state.cursorTile).toBeNull()
  })

  it('uses overflow-hidden so the 10x5 grid never scrolls', () => {
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

    const panel = container.querySelector('[data-panel="inventory"]')
    expect(panel?.className).toContain('overflow-hidden')
    expect(panel?.className).not.toMatch(/overflow-(y-)?(auto|scroll)/)
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
