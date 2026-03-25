import { createBackpack, createContainer, getDefinition, ITEM_DEFINITIONS } from '../items'
import { ItemCategory } from '../types'
import { describe, expect, it } from 'vitest'

describe('getDefinition', () => {
  it('returns correct definition for bee', () => {
    const def = getDefinition('bee')
    expect(def.id).toBe('bee')
    expect(def.name).toBe('Bee')
    expect(def.glyph).toBe('*')
    expect(def.glyphColor).toBe('#FFD700')
    expect(def.category).toBe(ItemCategory.Fauna)
    expect(def.weight).toBe(1)
    expect(def.shape).toEqual([[true]])
  })

  it('returns correct definition for clover', () => {
    const def = getDefinition('clover')
    expect(def.id).toBe('clover')
    expect(def.name).toBe('Clover')
    expect(def.glyph).toBe('%')
    expect(def.glyphColor).toBe('#50C878')
    expect(def.category).toBe(ItemCategory.Flora)
    expect(def.weight).toBe(1)
    expect(def.shape).toEqual([[true]])
  })

  it('returns correct definition for permacomputer', () => {
    const def = getDefinition('permacomputer')
    expect(def.id).toBe('permacomputer')
    expect(def.name).toBe('Permacomputer')
    expect(def.glyph).toBe('⚙')
    expect(def.glyphColor).toBe('#8B7355')
    expect(def.category).toBe(ItemCategory.Gizmo)
    expect(def.weight).toBe(3)
    expect(def.shape).toEqual([[true, true]])
  })

  it('throws for unknown id', () => {
    expect(() => getDefinition('nonexistent')).toThrow('unknown item definition: nonexistent')
  })
})

describe('ITEM_DEFINITIONS', () => {
  it('all entries have id matching their key', () => {
    for (const [key, def] of Object.entries(ITEM_DEFINITIONS)) {
      expect(def.id).toBe(key)
    }
  })

  it('all entries have required fields', () => {
    for (const def of Object.values(ITEM_DEFINITIONS)) {
      expect(def.name).toBeTruthy()
      expect(def.description).toBeTruthy()
      expect(def.glyph).toBeTruthy()
      expect(def.glyphColor).toBeTruthy()
      expect(def.weight).toBeGreaterThan(0)
      expect(def.category).toBeTruthy()
      expect(def.shape.length).toBeGreaterThan(0)
    }
  })
})

describe('createBackpack', () => {
  it('returns correct id and name', () => {
    const backpack = createBackpack()
    expect(backpack.id).toBe('backpack')
    expect(backpack.name).toBe('Backpack')
  })

  it('returns correct dimensions', () => {
    const backpack = createBackpack()
    expect(backpack.width).toBe(4)
    expect(backpack.height).toBe(6)
  })

  it('starts with empty items', () => {
    const backpack = createBackpack()
    expect(backpack.items).toEqual([])
  })
})

describe('createContainer', () => {
  it('returns correct id and name', () => {
    const container = createContainer('chest', 'Chest', 8, 4)
    expect(container.id).toBe('chest')
    expect(container.name).toBe('Chest')
  })

  it('returns correct dimensions', () => {
    const container = createContainer('chest', 'Chest', 8, 4)
    expect(container.width).toBe(8)
    expect(container.height).toBe(4)
  })

  it('starts with empty items', () => {
    const container = createContainer('chest', 'Chest', 8, 4)
    expect(container.items).toEqual([])
  })
})
