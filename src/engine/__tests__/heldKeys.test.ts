import { describe, expect, it } from 'vitest'

import { keyToScreenAxis, resolveHeldDirection } from '../heldKeys'

import type { ScreenAxisKey } from '../types'

const setOf = (...keys: ScreenAxisKey[]): Set<ScreenAxisKey> => new Set(keys)

describe('keyToScreenAxis', () => {
  it('maps WASD to screen-axis keys', () => {
    expect(keyToScreenAxis('w')).toBe('up')
    expect(keyToScreenAxis('a')).toBe('left')
    expect(keyToScreenAxis('s')).toBe('down')
    expect(keyToScreenAxis('d')).toBe('right')
  })

  it('maps capital WASD identically', () => {
    expect(keyToScreenAxis('W')).toBe('up')
    expect(keyToScreenAxis('A')).toBe('left')
  })

  it('maps arrow keys to screen-axis keys', () => {
    expect(keyToScreenAxis('ArrowUp')).toBe('up')
    expect(keyToScreenAxis('ArrowDown')).toBe('down')
    expect(keyToScreenAxis('ArrowLeft')).toBe('left')
    expect(keyToScreenAxis('ArrowRight')).toBe('right')
  })

  it('returns null for non-movement keys', () => {
    expect(keyToScreenAxis('e')).toBeNull()
    expect(keyToScreenAxis(' ')).toBeNull()
    expect(keyToScreenAxis('Shift')).toBeNull()
  })
})

describe('resolveHeldDirection', () => {
  it('returns null for empty set', () => {
    expect(resolveHeldDirection(setOf())).toBeNull()
  })

  it('single key maps to the screen-axis direction (a world diagonal)', () => {
    expect(resolveHeldDirection(setOf('up'))).toBe('upLeft')
    expect(resolveHeldDirection(setOf('down'))).toBe('downRight')
    expect(resolveHeldDirection(setOf('left'))).toBe('downLeft')
    expect(resolveHeldDirection(setOf('right'))).toBe('upRight')
  })

  it('two-key combos collapse to pure world cardinals', () => {
    // w+a: screen up + screen left = world (-1, 0) = "left" cardinal
    expect(resolveHeldDirection(setOf('up', 'left'))).toBe('left')
    expect(resolveHeldDirection(setOf('up', 'right'))).toBe('up')
    expect(resolveHeldDirection(setOf('down', 'left'))).toBe('down')
    expect(resolveHeldDirection(setOf('down', 'right'))).toBe('right')
  })

  it('cancels opposing keys to null', () => {
    expect(resolveHeldDirection(setOf('up', 'down'))).toBeNull()
    expect(resolveHeldDirection(setOf('left', 'right'))).toBeNull()
  })

  it('cancellation overrides combo when 3 keys are held', () => {
    // up + down cancel; left alone wins (now produces "downLeft" world direction)
    expect(resolveHeldDirection(setOf('up', 'down', 'left'))).toBe('downLeft')
  })
})
