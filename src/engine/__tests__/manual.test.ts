import { CHARACTER_DEFINITIONS } from '../characters'
import { ITEM_DEFINITIONS } from '../items'
import {
  CATEGORY_ORDER,
  filterManualEntries,
  getEntriesByCategory,
  isDiscovered,
  MANUAL_ENTRIES,
  ManualCategory,
  recordDiscovery,
} from '../manual'
import { recipeKey, RECIPES } from '../recipes'
import { createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

describe('manual', () => {
  describe('MANUAL_ENTRIES registry', () => {
    it('has an entry for every non-hidden item definition', () => {
      // The clover item is intentionally hidden from the manual in RP-1
      // because the flora:clover species entry covers the same concept with
      // richer lore. The item still exists in the inventory.
      const hiddenItemIds = new Set(['clover'])
      for (const id of Object.keys(ITEM_DEFINITIONS)) {
        if (hiddenItemIds.has(id)) {
          expect(MANUAL_ENTRIES[`item:${id}`]).toBeUndefined()
          continue
        }
        expect(MANUAL_ENTRIES[`item:${id}`]).toBeDefined()
        expect(MANUAL_ENTRIES[`item:${id}`].sourceKind).toBe('item')
      }
    })

    it('has an entry for every recipe', () => {
      for (const recipe of RECIPES) {
        const id = `recipe:${recipeKey(recipe)}`
        expect(MANUAL_ENTRIES[id]).toBeDefined()
        expect(MANUAL_ENTRIES[id].sourceKind).toBe('recipe')
      }
    })

    it('has an entry for each non-ghost world character (excluding the synthetic gate speaker)', () => {
      for (const def of Object.values(CHARACTER_DEFINITIONS)) {
        if (def.id.startsWith('ghost-')) continue
        if (def.id === 'gate') continue
        expect(MANUAL_ENTRIES[`character:${def.id}`]).toBeDefined()
        expect(MANUAL_ENTRIES[`character:${def.id}`].sourceKind).toBe('character')
      }
    })

    it('has a single collective entry for ghosts', () => {
      expect(MANUAL_ENTRIES['character:ghosts']).toBeDefined()
      expect(MANUAL_ENTRIES['character:ghosts'].category).toBe(ManualCategory.Person)
      expect(MANUAL_ENTRIES['character:ghosts'].glyph).toBe('ö')
    })

    it('has manual-only entries for zones and events', () => {
      expect(MANUAL_ENTRIES['zone:overworld']).toBeDefined()
      expect(MANUAL_ENTRIES['zone:cave']).toBeDefined()
      expect(MANUAL_ENTRIES['event:shooting-star']).toBeDefined()
    })

    it('every entry has required fields', () => {
      for (const entry of Object.values(MANUAL_ENTRIES)) {
        expect(entry.id).toBeTruthy()
        expect(entry.name).toBeTruthy()
        expect(entry.category).toBeTruthy()
        // Control entries have no glyph (context-dependent)
        if (entry.category !== ManualCategory.Control) {
          expect(entry.glyph).toBeTruthy()
          expect(entry.lore).toBeTruthy()
        }
        expect(entry.glyphColor).toBeTruthy()
        expect(entry.unlockKey).toBeTruthy()
        expect(entry.sourceKind).toBeTruthy()
        expect(Array.isArray(entry.hints)).toBe(true)
      }
    })

    it('item entries derive category from item definition', () => {
      expect(MANUAL_ENTRIES['item:bee'].category).toBe(ManualCategory.Life)
      expect(MANUAL_ENTRIES['item:honey'].category).toBe(ManualCategory.Life)
      expect(MANUAL_ENTRIES['item:meteorite'].category).toBe(ManualCategory.Celestial)
    })

    it('recipe entries use hot pink glyph color', () => {
      for (const recipe of RECIPES) {
        const id = `recipe:${recipeKey(recipe)}`
        expect(MANUAL_ENTRIES[id].glyphColor).toBe('#ff69b4')
      }
    })
  })

  describe('cross-refs', () => {
    it('only recipe and event entries have cross-refs', () => {
      for (const entry of Object.values(MANUAL_ENTRIES)) {
        if (entry.sourceKind === 'recipe' || entry.sourceKind === 'event') {
          if (entry.crossRefs) {
            expect(entry.crossRefs.length).toBeGreaterThan(0)
          }
        } else {
          expect(entry.crossRefs).toBeUndefined()
        }
      }
    })

    it('recipe entries cross-ref their ingredients', () => {
      // The clover ingredient cross-refs the flora:clover species entry
      // because item:clover is hidden from the manual (see manual.ts
      // MANUAL_ITEM_REDIRECTS).
      const prairieRecipe = MANUAL_ENTRIES['recipe:bee+clover']
      expect(prairieRecipe.crossRefs).toContain('item:bee')
      expect(prairieRecipe.crossRefs).toContain('flora:clover')
    })

    it('all cross-refs point to valid entry IDs', () => {
      for (const entry of Object.values(MANUAL_ENTRIES)) {
        for (const ref of entry.crossRefs ?? []) {
          expect(MANUAL_ENTRIES[ref]).toBeDefined()
        }
      }
    })
  })

  describe('recordDiscovery', () => {
    it('adds key to manualDiscoveries set', () => {
      const state = createTestState()
      recordDiscovery(state, 'item:meteorite')
      expect(state.manualDiscoveries.has('item:meteorite')).toBe(true)
    })

    it('returns true for new discoveries', () => {
      const state = createTestState()
      expect(recordDiscovery(state, 'item:meteorite')).toBe(true)
    })

    it('returns false for duplicate discoveries', () => {
      const state = createTestState()
      recordDiscovery(state, 'item:meteorite')
      expect(recordDiscovery(state, 'item:meteorite')).toBe(false)
    })

    it('is idempotent — set size does not grow on duplicate', () => {
      const state = createTestState()
      recordDiscovery(state, 'item:bee')
      const size = state.manualDiscoveries.size
      recordDiscovery(state, 'item:bee')
      expect(state.manualDiscoveries.size).toBe(size)
    })
  })

  describe('isDiscovered', () => {
    it('returns true for entries with unlockKey "always"', () => {
      const discoveries = new Set<string>()
      expect(isDiscovered(discoveries, MANUAL_ENTRIES['zone:overworld'])).toBe(true)
      expect(isDiscovered(discoveries, MANUAL_ENTRIES['event:shooting-star'])).toBe(true)
    })

    it('returns false for undiscovered entries', () => {
      const discoveries = new Set<string>()
      expect(isDiscovered(discoveries, MANUAL_ENTRIES['zone:cave'])).toBe(false)
    })

    it('returns true when discovery set has the unlock key', () => {
      const discoveries = new Set<string>(['zone:cave'])
      expect(isDiscovered(discoveries, MANUAL_ENTRIES['zone:cave'])).toBe(true)
    })
  })

  describe('getEntriesByCategory', () => {
    it('returns only entries matching the category', () => {
      const life = getEntriesByCategory(ManualCategory.Life)
      expect(life.length).toBeGreaterThan(0)
      for (const entry of life) {
        expect(entry.category).toBe(ManualCategory.Life)
      }
    })

    it('returns recipes when filtering by Recipe category', () => {
      const recipes = getEntriesByCategory(ManualCategory.Recipe)
      expect(recipes.length).toBe(RECIPES.length)
    })
  })

  describe('filterManualEntries', () => {
    const allEntries = Object.values(MANUAL_ENTRIES)

    it('returns all entries for empty query', () => {
      expect(filterManualEntries(allEntries, '')).toEqual(allEntries)
      expect(filterManualEntries(allEntries, '  ')).toEqual(allEntries)
    })

    it('filters by name', () => {
      const results = filterManualEntries(allEntries, 'bee')
      expect(results.some(e => e.id === 'item:bee')).toBe(true)
    })

    it('is case-insensitive', () => {
      const lower = filterManualEntries(allEntries, 'bee')
      const upper = filterManualEntries(allEntries, 'BEE')
      expect(lower).toEqual(upper)
    })

    it('searches in name', () => {
      const results = filterManualEntries(allEntries, 'meteorite')
      expect(results.some(e => e.id === 'item:meteorite')).toBe(true)
    })

    it('searches in lore', () => {
      const results = filterManualEntries(allEntries, 'prairie')
      expect(results.length).toBeGreaterThan(0)
    })

    it('returns empty for no matches', () => {
      const results = filterManualEntries(allEntries, 'xyznonexistent123')
      expect(results).toEqual([])
    })
  })

  describe('CATEGORY_ORDER', () => {
    it('includes all ManualCategory values', () => {
      const allCategories = Object.values(ManualCategory)
      for (const cat of allCategories) {
        expect(CATEGORY_ORDER).toContain(cat)
      }
    })

    it('has no duplicates', () => {
      expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length)
    })
  })
})
