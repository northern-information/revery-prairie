import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { useEventLog, TOAST_DURATION } from '../useEventLog'

describe('useEventLog', () => {
  let rafCallbacks: Array<FrameRequestCallback>
  let rafIdCounter: number

  beforeEach(() => {
    rafCallbacks = []
    rafIdCounter = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb)
      return ++rafIdCounter
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const flushOneRafFrame = () => {
    const cbs = [...rafCallbacks]
    rafCallbacks = []
    cbs.forEach((cb) => {
      cb(performance.now())
    })
  }

  it('adds a toast on addEvent', () => {
    const { result } = renderHook(() => useEventLog())

    act(() => {
      result.current.addEvent('pickup', 'got bee', '*', '#FFD700', 10, 20)
    })

    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].text).toBe('got bee')
  })

  it('does not add dialog events as toasts', () => {
    const { result } = renderHook(() => useEventLog())

    act(() => {
      result.current.addEvent('dialog', 'hello', '?', '#fff', 0, 0)
    })

    expect(result.current.toasts).toHaveLength(0)
    expect(result.current.log).toHaveLength(1)
  })

  it('forces re-renders every rAF frame while toasts are active', () => {
    const renderCount = { value: 0 }
    const { result } = renderHook(() => {
      renderCount.value++
      return useEventLog()
    })

    act(() => {
      result.current.addEvent('pickup', 'got bee', '*', '#FFD700', 10, 20)
    })

    const countAfterAdd = renderCount.value

    // flush rAF frames one at a time — each act() boundary lets React process
    // the setTick state update and re-render
    for (let i = 0; i < 5; i++) {
      act(() => {
        flushOneRafFrame()
      })
    }

    const countAfterFrames = renderCount.value
    // each rAF frame increments the tick counter via setTick, triggering a re-render
    // we expect at least 5 additional renders (one per frame)
    expect(countAfterFrames - countAfterAdd).toBeGreaterThanOrEqual(5)
  })

  it('stops rAF loop when all toasts expire', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const { result } = renderHook(() => useEventLog())

    act(() => {
      result.current.addEvent('pickup', 'got bee', '*', '#FFD700', 10, 20)
    })

    expect(result.current.toasts).toHaveLength(1)

    // advance time past toast duration
    vi.spyOn(Date, 'now').mockReturnValue(now + TOAST_DURATION + 1)

    act(() => {
      flushOneRafFrame()
    })

    expect(result.current.toasts).toHaveLength(0)
  })

  it('does not run rAF loop when no toasts exist', () => {
    renderHook(() => useEventLog())

    // no toasts added — rAF should never have been called
    expect(rafCallbacks).toHaveLength(0)
  })
})
