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

describe('resolveHeldDirection (orthogonal)', () => {
  it('returns null for empty set', () => {
    expect(resolveHeldDirection(setOf(), false)).toBeNull()
  })

  it('returns the cardinal direction for a single key', () => {
    expect(resolveHeldDirection(setOf('up'), false)).toBe('up')
    expect(resolveHeldDirection(setOf('down'), false)).toBe('down')
    expect(resolveHeldDirection(setOf('left'), false)).toBe('left')
    expect(resolveHeldDirection(setOf('right'), false)).toBe('right')
  })

  it('cancels opposing keys to null', () => {
    expect(resolveHeldDirection(setOf('up', 'down'), false)).toBeNull()
    expect(resolveHeldDirection(setOf('left', 'right'), false)).toBeNull()
  })

  it('combines two-axis presses into a diagonal', () => {
    expect(resolveHeldDirection(setOf('up', 'left'), false)).toBe('upLeft')
    expect(resolveHeldDirection(setOf('up', 'right'), false)).toBe('upRight')
    expect(resolveHeldDirection(setOf('down', 'left'), false)).toBe('downLeft')
    expect(resolveHeldDirection(setOf('down', 'right'), false)).toBe('downRight')
  })

  it('cancellation overrides combo when 3 keys are held', () => {
    // up + down cancel; left alone wins
    expect(resolveHeldDirection(setOf('up', 'down', 'left'), false)).toBe('left')
  })
})

describe('resolveHeldDirection (isometric)', () => {
  it('single key maps to the iso screen-axis direction (a world diagonal)', () => {
    expect(resolveHeldDirection(setOf('up'), true)).toBe('upLeft')
    expect(resolveHeldDirection(setOf('down'), true)).toBe('downRight')
    expect(resolveHeldDirection(setOf('left'), true)).toBe('downLeft')
    expect(resolveHeldDirection(setOf('right'), true)).toBe('upRight')
  })

  it('two-key combos collapse to pure world cardinals', () => {
    // w+a: screen up + screen left = world (-1, 0) = "left" cardinal
    expect(resolveHeldDirection(setOf('up', 'left'), true)).toBe('left')
    expect(resolveHeldDirection(setOf('up', 'right'), true)).toBe('up')
    expect(resolveHeldDirection(setOf('down', 'left'), true)).toBe('down')
    expect(resolveHeldDirection(setOf('down', 'right'), true)).toBe('right')
  })

  it('cancels opposing keys to null', () => {
    expect(resolveHeldDirection(setOf('up', 'down'), true)).toBeNull()
    expect(resolveHeldDirection(setOf('left', 'right'), true)).toBeNull()
  })
})
