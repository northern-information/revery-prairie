import { keyToDirection } from '../input'
import { describe, expect, it } from 'vitest'

describe('keyToDirection', () => {
  it('maps arrow keys to screen-axis world directions', () => {
    expect(keyToDirection('ArrowUp')).toBe('upLeft')
    expect(keyToDirection('ArrowDown')).toBe('downRight')
    expect(keyToDirection('ArrowLeft')).toBe('downLeft')
    expect(keyToDirection('ArrowRight')).toBe('upRight')
  })

  it('maps WASD to screen-axis world directions (lowercase)', () => {
    expect(keyToDirection('w')).toBe('upLeft')
    expect(keyToDirection('a')).toBe('downLeft')
    expect(keyToDirection('s')).toBe('downRight')
    expect(keyToDirection('d')).toBe('upRight')
  })

  it('maps WASD to screen-axis world directions (uppercase)', () => {
    expect(keyToDirection('W')).toBe('upLeft')
    expect(keyToDirection('A')).toBe('downLeft')
    expect(keyToDirection('S')).toBe('downRight')
    expect(keyToDirection('D')).toBe('upRight')
  })

  it('returns null for unmapped keys', () => {
    expect(keyToDirection('x')).toBeNull()
    expect(keyToDirection('Enter')).toBeNull()
    expect(keyToDirection(' ')).toBeNull()
  })
})
