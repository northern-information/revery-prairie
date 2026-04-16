import { getReveryDefinition, REVERY_DEFINITIONS } from '../reveries'
import { describe, expect, it } from 'vitest'

describe('revery registry', () => {
  it('defines fire, water, and earth reveries', () => {
    expect(REVERY_DEFINITIONS.fire).toBeDefined()
    expect(REVERY_DEFINITIONS.water).toBeDefined()
    expect(REVERY_DEFINITIONS.earth).toBeDefined()
  })

  it('injects id from key', () => {
    expect(REVERY_DEFINITIONS.fire.id).toBe('fire')
    expect(REVERY_DEFINITIONS.water.id).toBe('water')
    expect(REVERY_DEFINITIONS.earth.id).toBe('earth')
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

  it('earth revery has correct fields', () => {
    const earth = REVERY_DEFINITIONS.earth
    expect(earth.name).toBe('Earth Revery')
    expect(earth.castStyle).toBe('scan')
    expect(earth.castDurationMs).toBe(5500)
    expect(earth.castPattern).toEqual([])
    expect(earth.cooldownMs).toBe(6000)
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
