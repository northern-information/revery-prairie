import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Minimap } from '../Minimap'

import { createGameState } from '@/engine/state'
import { Zone } from '@/engine/types'

describe('minimap', () => {
  it('renders a canvas element', () => {
    const state = createGameState('Test', 80, 40)
    const { getByTestId } = render(<Minimap state={state} />)

    const canvas = getByTestId('minimap-canvas')
    expect(canvas.tagName).toBe('CANVAS')
  })

  it('reads zone from state.currentZone so cave swap is reflected', () => {
    const state = createGameState('Test', 80, 40)
    // Render in overworld first, then mutate state to cave, then re-render.
    const { rerender } = render(<Minimap state={state} />)
    expect(state.currentZone).toBe(Zone.Overworld)

    // Simulate a zone swap by mutating in place. The Minimap RAF loop
    // recomputes its tile cache when state.map / state.currentZone change.
    state.currentZone = Zone.Cave
    rerender(<Minimap state={state} />)
    expect(state.currentZone).toBe(Zone.Cave)
  })

  it('does not throw when civilizationRuins is empty', () => {
    const state = createGameState('Test', 80, 40)
    state.civilizationRuins = []
    expect(() => render(<Minimap state={state} />)).not.toThrow()
  })

  it('handles a zero-size map without throwing', () => {
    const state = createGameState('Test', 80, 40)
    state.mapWidth = 0
    state.mapHeight = 0
    state.map = []
    expect(() => render(<Minimap state={state} />)).not.toThrow()
  })
})
