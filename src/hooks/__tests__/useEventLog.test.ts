import { useEventLog } from '../useEventLog'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('useEventLog', () => {
  it('appends events to the log on addEvent', () => {
    const { result } = renderHook(() => useEventLog())

    act(() => {
      result.current.addEvent('pickup', 'got bee', '*', '#FFD700', 10, 20)
    })

    expect(result.current.log).toHaveLength(1)
    expect(result.current.log[0].text).toBe('got bee')
  })

  it('logs dialog events alongside other kinds', () => {
    const { result } = renderHook(() => useEventLog())

    act(() => {
      result.current.addEvent('dialog', 'hello', '?', '#fff', 0, 0)
    })

    expect(result.current.log).toHaveLength(1)
    expect(result.current.log[0].kind).toBe('dialog')
  })

  it('places newest entries at the front of the log buffer', () => {
    const { result } = renderHook(() => useEventLog())

    act(() => {
      result.current.addEvent('pickup', 'first', '*', '#fff', 0, 0)
      result.current.addEvent('pickup', 'second', '*', '#fff', 0, 0)
    })

    expect(result.current.log[0].text).toBe('second')
    expect(result.current.log[1].text).toBe('first')
  })

  it('caps the log buffer at 50 entries', () => {
    const { result } = renderHook(() => useEventLog())

    act(() => {
      for (let i = 0; i < 60; i++) {
        result.current.addEvent('pickup', `event ${String(i)}`, '*', '#fff', 0, 0)
      }
    })

    expect(result.current.log).toHaveLength(50)
    expect(result.current.log[0].text).toBe('event 59')
  })

  it('exposes only { log, addEvent } — no toast state', () => {
    const { result } = renderHook(() => useEventLog())
    expect(Object.keys(result.current).sort()).toEqual(['addEvent', 'log'])
  })
})
