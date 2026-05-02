import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { assignActionBarSlot } from '@/engine/actionBar'
import { completeGenesis } from '@/engine/genesis'
import { createGameState } from '@/engine/state'

import { ActionBar } from '../ActionBar'

const noop = () => undefined

const flushFrame = () => {
  act(() => {
    vi.advanceTimersByTime(20)
  })
}

describe('ActionBar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders cooldown overlay in hot pink when a revery slot is on cooldown', () => {
    const state = createGameState('Tester', 80, 40)
    completeGenesis(state)
    assignActionBarSlot(state, 0, 'revery', 'earth')
    const slot = state.actionBar[0]
    if (slot === null) throw new Error('expected slot 0 assigned')
    slot.cooldownEndTime = performance.now() + 5000
    slot.cooldownDurationMs = 5000

    const { container } = render(
      <ActionBar state={state} refreshUI={noop} dragState={null} onSetActionBarTarget={noop} />
    )
    flushFrame()

    const overlays = container.querySelectorAll('div[style*="conic-gradient"]')
    expect(overlays.length).toBeGreaterThan(0)
    const overlayHtml = Array.from(overlays).map((el) => el.getAttribute('style') ?? '').join('\n')
    // jsdom normalizes hex (#ff69b4) to rgb(255, 105, 180)
    expect(overlayHtml).toMatch(/rgb\(\s*255,\s*105,\s*180\s*\)/)
    expect(overlayHtml).not.toMatch(/rgb\(\s*218,\s*165,\s*32\s*\)/) // gold rgb
    expect(overlayHtml).not.toMatch(/#daa520/i)
  })

  it('mounts a cast flash on the slot whose cooldown just transitioned from 0 to >0', () => {
    const state = createGameState('Tester', 80, 40)
    completeGenesis(state)
    assignActionBarSlot(state, 0, 'revery', 'earth')
    assignActionBarSlot(state, 1, 'revery', 'fire')

    const { container } = render(
      <ActionBar state={state} refreshUI={noop} dragState={null} onSetActionBarTarget={noop} />
    )
    flushFrame()

    // No flash on initial mount (no cooldown active)
    expect(container.querySelectorAll('[data-cast-flash]')).toHaveLength(0)

    // Simulate cast on slot 0 only: set cooldown directly
    const slot0 = state.actionBar[0]
    if (slot0 === null) throw new Error('expected slot 0 assigned')
    slot0.cooldownEndTime = performance.now() + 6000
    slot0.cooldownDurationMs = 6000

    flushFrame()

    const flashes = container.querySelectorAll('[data-cast-flash]')
    expect(flashes).toHaveLength(1)

    const buttons = container.querySelectorAll('button')
    expect(buttons[0]?.contains(flashes[0] ?? null)).toBe(true)
    expect(buttons[1]?.querySelector('[data-cast-flash]')).toBeNull()
  })

  it('does not mount a cast flash on item slots', () => {
    const state = createGameState('Tester', 80, 40)
    completeGenesis(state)
    assignActionBarSlot(state, 0, 'item', 'clover')

    const { container } = render(
      <ActionBar state={state} refreshUI={noop} dragState={null} onSetActionBarTarget={noop} />
    )
    flushFrame()

    // Force a 0 → >0 transition that would flash a revery slot
    const slot0 = state.actionBar[0]
    if (slot0 === null) throw new Error('expected slot 0 assigned')
    slot0.cooldownEndTime = performance.now() + 5000
    slot0.cooldownDurationMs = 5000

    flushFrame()

    expect(container.querySelectorAll('[data-cast-flash]')).toHaveLength(0)
  })
})
