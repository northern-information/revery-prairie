import { getCharacterDefinition } from '../characters'
import { describe, expect, it } from 'vitest'

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
