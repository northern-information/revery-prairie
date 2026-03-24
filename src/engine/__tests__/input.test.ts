import { keyToDirection } from '../input'
import { describe, expect, it } from 'vitest'

describe('keyToDirection', () => {
  it('maps arrow keys to directions', () => {
    expect(keyToDirection('ArrowUp')).toBe('up')
    expect(keyToDirection('ArrowDown')).toBe('down')
    expect(keyToDirection('ArrowLeft')).toBe('left')
    expect(keyToDirection('ArrowRight')).toBe('right')
  })

  it('maps WASD to directions (lowercase)', () => {
    expect(keyToDirection('w')).toBe('up')
    expect(keyToDirection('a')).toBe('left')
    expect(keyToDirection('s')).toBe('down')
    expect(keyToDirection('d')).toBe('right')
  })

  it('maps WASD to directions (uppercase)', () => {
    expect(keyToDirection('W')).toBe('up')
    expect(keyToDirection('A')).toBe('left')
    expect(keyToDirection('S')).toBe('down')
    expect(keyToDirection('D')).toBe('right')
  })

  it('returns null for unmapped keys', () => {
    expect(keyToDirection('x')).toBeNull()
    expect(keyToDirection('Enter')).toBeNull()
    expect(keyToDirection(' ')).toBeNull()
  })
})
