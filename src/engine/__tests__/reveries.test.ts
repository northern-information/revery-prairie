import { describe, expect, it } from 'vitest'

import { getReveryDefinition, REVERY_DEFINITIONS } from '../reveries'

describe('revery registry', () => {
  it('defines fire and water reveries', () => {
    expect(REVERY_DEFINITIONS.fire).toBeDefined()
    expect(REVERY_DEFINITIONS.water).toBeDefined()
  })

  it('injects id from key', () => {
    expect(REVERY_DEFINITIONS.fire.id).toBe('fire')
    expect(REVERY_DEFINITIONS.water.id).toBe('water')
  })

  it('fire revery has correct fields', () => {
    const fire = REVERY_DEFINITIONS.fire
    expect(fire.name).toBe('Fire Revery')
    expect(fire.glyphs).toEqual(['^', '~', '*'])
    expect(fire.glyphColor).toBe('#FF4500')
    expect(fire.cooldownMs).toBeGreaterThan(0)
  })

  it('water revery has correct fields', () => {
    const water = REVERY_DEFINITIONS.water
    expect(water.name).toBe('Water Revery')
    expect(water.glyphs.length).toBeGreaterThan(0)
    expect(water.glyphColor).toBe('#4488CC')
    expect(water.cooldownMs).toBeGreaterThan(0)
  })
})

describe('getReveryDefinition', () => {
  it('returns the definition for a valid id', () => {
    const def = getReveryDefinition('fire')
    expect(def.id).toBe('fire')
    expect(def.name).toBe('Fire Revery')
  })

  it('throws for unknown id', () => {
    expect(() => getReveryDefinition('ice')).toThrow('unknown revery definition: ice')
  })
})
