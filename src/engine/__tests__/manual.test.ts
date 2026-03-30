import { describe, expect, it } from 'vitest'

import { ITEM_DEFINITIONS } from '../items'
import {
  CATEGORY_ORDER,
  MANUAL_ENTRIES,
  ManualCategory,
  filterManualEntries,
  getEntriesByCategory,
  isDiscovered,
  recordDiscovery,
} from '../manual'
import { RECIPES, recipeKey } from '../recipes'
import { CHARACTER_DEFINITIONS } from '../characters'

import { createTestState } from './helpers'

describe('manual', () => {
  describe('MANUAL_ENTRIES registry', () => {
    it('has an entry for every item definition', () => {
      for (const id of Object.keys(ITEM_DEFINITIONS)) {
        expect(MANUAL_ENTRIES[id]).toBeDefined()
        expect(MANUAL_ENTRIES[id].sourceKind).toBe('item')
      }
    })

    it('has an entry for every recipe', () => {
      for (const recipe of RECIPES) {
        const id = `recipe:${recipeKey(recipe)}`
        expect(MANUAL_ENTRIES[id]).toBeDefined()
        expect(MANUAL_ENTRIES[id].sourceKind).toBe('recipe')
      }
    })

    it('has an entry for each non-ghost character', () => {
      for (const def of Object.values(CHARACTER_DEFINITIONS)) {
        if (def.id.startsWith('ghost-')) continue
        expect(MANUAL_ENTRIES[def.id]).toBeDefined()
        expect(MANUAL_ENTRIES[def.id].sourceKind).toBe('character')
      }
    })

    it('has a single collective entry for ghosts', () => {
      expect(MANUAL_ENTRIES.ghosts).toBeDefined()
      expect(MANUAL_ENTRIES.ghosts.category).toBe(ManualCategory.Person)
      expect(MANUAL_ENTRIES.ghosts.glyph).toBe('ö')
    })

    it('has manual-only entries for zones and events', () => {
      expect(MANUAL_ENTRIES.overworld).toBeDefined()
      expect(MANUAL_ENTRIES.cave).toBeDefined()
      expect(MANUAL_ENTRIES['shooting-star']).toBeDefined()
      expect(MANUAL_ENTRIES['chain-explosion']).toBeDefined()
    })

    it('every entry has required fields', () => {
      for (const entry of Object.values(MANUAL_ENTRIES)) {
        expect(entry.id).toBeTruthy()
        expect(entry.name).toBeTruthy()
        expect(entry.category).toBeTruthy()
        // Control entries have no glyph or summary (context-dependent)
        if (entry.category !== ManualCategory.Control) {
          expect(entry.glyph).toBeTruthy()
          expect(entry.summary).toBeTruthy()
          expect(entry.lore).toBeTruthy()
        }
        expect(entry.glyphColor).toBeTruthy()
        expect(entry.unlockKey).toBeTruthy()
        expect(entry.sourceKind).toBeTruthy()
        expect(Array.isArray(entry.hints)).toBe(true)
      }
    })

    it('item entries derive category from item definition', () => {
      expect(MANUAL_ENTRIES.bee.category).toBe(ManualCategory.Fauna)
      expect(MANUAL_ENTRIES.clover.category).toBe(ManualCategory.Flora)
      expect(MANUAL_ENTRIES.meteorite.category).toBe(ManualCategory.Celestial)
      expect(MANUAL_ENTRIES.permacomputer.category).toBe(ManualCategory.Object)
      expect(MANUAL_ENTRIES.omnibox.category).toBe(ManualCategory.Object)
    })

    it('recipe entries use hot pink glyph color', () => {
      for (const recipe of RECIPES) {
        const id = `recipe:${recipeKey(recipe)}`
        expect(MANUAL_ENTRIES[id].glyphColor).toBe('#ff69b4')
      }
    })
  })

  describe('cross-refs', () => {
    it('only recipe entries have cross-refs', () => {
      for (const entry of Object.values(MANUAL_ENTRIES)) {
        if (entry.sourceKind === 'recipe') {
          expect(entry.crossRefs).toBeDefined()
          expect(entry.crossRefs?.length).toBeGreaterThan(0)
        } else {
          expect(entry.crossRefs).toBeUndefined()
        }
      }
    })

    it('recipe entries cross-ref their ingredients', () => {
      const prairieRecipe = MANUAL_ENTRIES['recipe:bee+clover']
      expect(prairieRecipe.crossRefs).toContain('bee')
      expect(prairieRecipe.crossRefs).toContain('clover')
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
      expect(isDiscovered(discoveries, MANUAL_ENTRIES.overworld)).toBe(true)
      expect(isDiscovered(discoveries, MANUAL_ENTRIES['shooting-star'])).toBe(true)
    })

    it('returns false for undiscovered entries', () => {
      const discoveries = new Set<string>()
      expect(isDiscovered(discoveries, MANUAL_ENTRIES.cave)).toBe(false)
    })

    it('returns true when discovery set has the unlock key', () => {
      const discoveries = new Set<string>(['zone:cave'])
      expect(isDiscovered(discoveries, MANUAL_ENTRIES.cave)).toBe(true)
    })
  })

  describe('getEntriesByCategory', () => {
    it('returns only entries matching the category', () => {
      const fauna = getEntriesByCategory(ManualCategory.Fauna)
      expect(fauna.length).toBeGreaterThan(0)
      for (const entry of fauna) {
        expect(entry.category).toBe(ManualCategory.Fauna)
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
      expect(results.some((e) => e.id === 'bee')).toBe(true)
    })

    it('is case-insensitive', () => {
      const lower = filterManualEntries(allEntries, 'bee')
      const upper = filterManualEntries(allEntries, 'BEE')
      expect(lower).toEqual(upper)
    })

    it('searches in summary', () => {
      const results = filterManualEntries(allEntries, 'fallen star')
      expect(results.some((e) => e.id === 'meteorite')).toBe(true)
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
