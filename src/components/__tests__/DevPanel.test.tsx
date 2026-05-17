import { DevPanel } from '../DevPanel'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createGameState } from '@/engine/state'

const noop = () => {
  // intentionally empty for tests that don't trigger UI refresh
}

describe('DevPanel', () => {
  it('renders above all other UI layers', () => {
    const state = createGameState('Test', 80, 40)
    state.devPanelOpen = true

    const { container } = render(<DevPanel state={state} refreshUI={noop} metricsRef={{ current: null }} />)

    const panel = container.querySelector('[data-panel="dev-panel"]')
    expect(panel).toBeTruthy()

    // The dev panel must sit above every other fixed-position UI layer.
    // Highest other layer is DragCursor at z-50, so dev panel must be > 50.
    const className = panel?.getAttribute('class') ?? ''
    const match = /z-\[(\d+)\]/.exec(className) ?? /z-(\d+)/.exec(className)
    expect(match).toBeTruthy()
    const zIndex = match ? Number(match[1]) : 0
    expect(zIndex).toBeGreaterThan(50)
  })
})
