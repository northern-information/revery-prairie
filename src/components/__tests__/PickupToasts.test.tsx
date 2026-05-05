import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PickupToasts } from '../PickupToasts'
import { createGameState } from '@/engine/state'
import { worldToScreen } from '@/engine/projection'
import type { CharMetrics } from '@/engine/types'
import type { GameEvent } from '@/hooks/useEventLog'

const makeMetrics = (): CharMetrics => ({
  charWidth: 10,
  charHeight: 16,
  font: '16px monospace',
})

const makeToast = (overrides?: Partial<GameEvent>): GameEvent => ({
  id: 't1',
  kind: 'pickup',
  text: 'Clover',
  icon: '%',
  iconColor: '#7ed957',
  timestamp: Date.now(),
  worldX: 0,
  worldY: 0,
  ...overrides,
})

describe('PickupToasts iso position', () => {
  it('positions toast at iso projection of (worldX, worldY)', () => {
    const metrics = makeMetrics()
    const metricsRef = { current: metrics }
    const state = createGameState('alice', 60, 30)
    state.camera.x = 50
    state.camera.y = 50

    const toast = makeToast({ worldX: 55, worldY: 53 })
    const { container } = render(
      <PickupToasts toasts={[toast]} state={state} metricsRef={metricsRef} />,
    )

    const el = container.querySelector<HTMLElement>('div.absolute')
    expect(el).not.toBeNull()
    if (!el) return

    const expected = worldToScreen(
      toast.worldX,
      toast.worldY,
      state.camera,
      metrics.charWidth,
      metrics.charHeight,
      state.viewportWidth,
      state.viewportHeight,
    )
    expect(parseFloat(el.style.left)).toBeCloseTo(expected.px, 5)
    // top = py - 2.5*charHeight - progress*charHeight - stackOffset
    // single toast: stackOffset=0; progress is small (just-fired). Tolerate the
    // age-dependent term by asserting top is within one charHeight of the
    // expected baseline (py - 2.5*charHeight).
    const baseline = expected.py - 2.5 * metrics.charHeight
    expect(parseFloat(el.style.top)).toBeLessThanOrEqual(baseline)
    expect(parseFloat(el.style.top)).toBeGreaterThan(baseline - metrics.charHeight - 1)
  })

  it('toast far from camera center is offset by iso skew, not the orthogonal rect', () => {
    // Regression: under the old (worldX-camera.x)*charWidth formula a toast
    // many tiles away from camera center would render at the orthogonal
    // offset. Iso projection shifts x by (vx - vy) * charWidth, so a tile
    // with equal +vx and +vy collapses to camera-center x.
    const metrics = makeMetrics()
    const metricsRef = { current: metrics }
    const state = createGameState('bob', 60, 30)
    state.camera.x = 50
    state.camera.y = 50

    const toast = makeToast({ id: 't2', worldX: 55, worldY: 55 })
    const { container } = render(
      <PickupToasts toasts={[toast]} state={state} metricsRef={metricsRef} />,
    )

    const el = container.querySelector<HTMLElement>('div.absolute')
    expect(el).not.toBeNull()
    if (!el) return
    const expected = worldToScreen(
      toast.worldX,
      toast.worldY,
      state.camera,
      metrics.charWidth,
      metrics.charHeight,
      state.viewportWidth,
      state.viewportHeight,
    )
    // Iso: vx-vy = 0 here, so px equals the centerline of the iso footprint.
    // Orthogonal would have placed it at +5*charWidth = +50 to the right.
    expect(parseFloat(el.style.left)).toBeCloseTo(expected.px, 5)
    expect(parseFloat(el.style.left)).not.toBeCloseTo(
      (toast.worldX - state.camera.x) * metrics.charWidth,
      5,
    )
  })

  it('renders nothing when toasts list is empty', () => {
    const metricsRef = { current: makeMetrics() }
    const state = createGameState('carol', 60, 30)
    const { container } = render(
      <PickupToasts toasts={[]} state={state} metricsRef={metricsRef} />,
    )
    expect(container.innerHTML).toBe('')
  })
})
