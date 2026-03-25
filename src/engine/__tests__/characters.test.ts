import { characterBlockedSet, getCharacterDefinition, isCharacterAt } from '../characters'
import { describe, expect, it } from 'vitest'

import type { Character } from '../types'

describe('getCharacterDefinition', () => {
  it('returns the gron definition', () => {
    const def = getCharacterDefinition('gron')
    expect(def.id).toBe('gron')
    expect(def.name).toBe('Gron')
    expect(def.glyph).toBe('G')
    expect(def.dialog.length).toBeGreaterThan(0)
  })

  it('includes the portrait path for gron', () => {
    const def = getCharacterDefinition('gron')
    expect(def.portrait).toBe('/gron.gif')
  })

  it('throws on unknown id', () => {
    expect(() => getCharacterDefinition('nobody')).toThrow('unknown character definition: nobody')
  })
})

describe('isCharacterAt', () => {
  const characters: Character[] = [{ definitionId: 'gron', pos: { x: 10, y: 5 } }]

  it('returns true when a character is at the position', () => {
    expect(isCharacterAt(characters, 10, 5)).toBe(true)
  })

  it('returns false when no character is at the position', () => {
    expect(isCharacterAt(characters, 11, 5)).toBe(false)
  })

  it('returns false for empty character list', () => {
    expect(isCharacterAt([], 10, 5)).toBe(false)
  })
})

describe('characterBlockedSet', () => {
  it('builds a set of character position keys', () => {
    const characters: Character[] = [
      { definitionId: 'gron', pos: { x: 3, y: 7 } },
      { definitionId: 'gron', pos: { x: 10, y: 2 } },
    ]
    const set = characterBlockedSet(characters)
    expect(set.has('3,7')).toBe(true)
    expect(set.has('10,2')).toBe(true)
    expect(set.has('0,0')).toBe(false)
    expect(set.size).toBe(2)
  })

  it('returns empty set for no characters', () => {
    const set = characterBlockedSet([])
    expect(set.size).toBe(0)
  })
})
