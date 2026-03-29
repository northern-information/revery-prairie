import { CHARACTER_DEFINITIONS } from './characters'
import { TILE_CHARS, TILE_COLORS } from './constants'
import { ITEM_DEFINITIONS } from './items'
import { RECIPES, recipeKey } from './recipes'
import { ItemCategory, TileType } from './types'

import type { GameState } from './types'

// --- Categories ---

export const ManualCategory = {
  Flora: 'flora',
  Fauna: 'fauna',
  Celestial: 'celestial',
  Object: 'object',
  Person: 'person',
  Zone: 'zone',
  Recipe: 'recipe',
} as const

export type ManualCategory = (typeof ManualCategory)[keyof typeof ManualCategory]

// --- Entry types ---

export interface ManualHint {
  prompt: string
  answer: string
}

export interface ManualEntry {
  id: string
  name: string
  category: ManualCategory
  glyph: string
  glyphColor: string
  summary: string
  lore: string
  hints: ManualHint[]
  crossRefs: string[]
  unlockKey: string
  sourceKind: 'item' | 'recipe' | 'character' | 'zone' | 'event' | 'manual-only'
}

// --- Hand-authored lore ---

const MANUAL_LORE: Partial<Record<string, { lore: string; hints?: ManualHint[] }>> = {
  // Items — lore will be filled in by the user via /maintain-manual
  // Recipes — auto-use recipe description as lore
  // Characters — auto-use first dialog line as summary
  // Manual-only entries have lore inline below
}

// --- Category mapping ---

const itemCategoryToManualCategory = (cat: ItemCategory): ManualCategory => {
  switch (cat) {
    case ItemCategory.Fauna:
      return ManualCategory.Fauna
    case ItemCategory.Flora:
      return ManualCategory.Flora
    case ItemCategory.CelestialDebris:
      return ManualCategory.Celestial
    case ItemCategory.Tool:
    case ItemCategory.Gizmo:
      return ManualCategory.Object
    default:
      return ManualCategory.Object
  }
}

// --- Cross-ref derivation ---

const deriveItemCrossRefs = (itemId: string): string[] => {
  const refs: string[] = []
  for (const recipe of RECIPES) {
    if (!recipe.ingredients.includes(itemId)) continue
    const rId = `recipe:${recipeKey(recipe)}`
    refs.push(rId)
    for (const ing of recipe.ingredients) {
      if (ing !== itemId) refs.push(ing)
    }
  }
  return [...new Set(refs)]
}

// --- Builder functions ---

const buildItemEntries = (): ManualEntry[] =>
  Object.values(ITEM_DEFINITIONS).map((def) => {
    const loreData = MANUAL_LORE[def.id]
    return {
      id: def.id,
      name: def.name,
      category: itemCategoryToManualCategory(def.category),
      glyph: def.glyph,
      glyphColor: def.glyphColor,
      summary: def.description,
      lore: loreData?.lore ?? def.description,
      hints: loreData?.hints ?? [],
      crossRefs: deriveItemCrossRefs(def.id),
      unlockKey: `item:${def.id}`,
      sourceKind: 'item',
    }
  })

const buildRecipeEntries = (): ManualEntry[] =>
  RECIPES.map((recipe) => {
    const key = recipeKey(recipe)
    const id = `recipe:${key}`
    const loreData = MANUAL_LORE[id]
    return {
      id,
      name: recipe.resultName,
      category: ManualCategory.Recipe,
      glyph: recipe.resultIcon ?? '!',
      glyphColor: '#ff69b4',
      summary: recipe.description.split('\n')[0],
      lore: loreData?.lore ?? recipe.description,
      hints: loreData?.hints ?? [],
      crossRefs: [...recipe.ingredients],
      unlockKey: `recipe:${key}`,
      sourceKind: 'recipe',
    }
  })

const buildCharacterEntries = (): ManualEntry[] => {
  const entries: ManualEntry[] = []

  for (const def of Object.values(CHARACTER_DEFINITIONS)) {
    // Ghost definitions are registered dynamically at runtime — skip them.
    // Ghosts have a collective manual-only entry below.
    if (def.id.startsWith('ghost-')) continue

    const loreData = MANUAL_LORE[def.id]
    const crossRefs: string[] = []
    if (def.id === 'moab') crossRefs.push('cave')
    if (def.id === 'gron') crossRefs.push('overworld')

    entries.push({
      id: def.id,
      name: def.name,
      category: ManualCategory.Person,
      glyph: def.glyph,
      glyphColor: def.glyphColor,
      summary: def.dialog[0] ?? '',
      lore: loreData?.lore ?? def.dialog.join(' '),
      hints: loreData?.hints ?? [],
      crossRefs,
      unlockKey: `character:${def.id}`,
      sourceKind: 'character',
    })
  }

  return entries
}

// --- Manual-only entries (zones, events) ---

const MANUAL_ONLY_ENTRIES: ManualEntry[] = [
  {
    id: 'ghosts',
    name: 'Ghosts',
    category: ManualCategory.Person,
    glyph: 'ö',
    glyphColor: '#FFFFFF',
    summary: 'wandering spirits on the prairie',
    lore: MANUAL_LORE.ghosts?.lore ?? 'three ghosts drift across the land. they move slowly and unpredictably. each has something to say if you stop to listen.',
    hints: MANUAL_LORE.ghosts?.hints ?? [],
    crossRefs: ['overworld'],
    unlockKey: 'character:ghost-1',
    sourceKind: 'character',
  },
  {
    id: 'overworld',
    name: 'The Prairie',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.Dirt],
    glyphColor: TILE_COLORS[TileType.Dirt],
    summary: 'a dirt island surrounded by stars',
    lore: MANUAL_LORE.overworld?.lore ?? 'a dirt island surrounded by stars. the land responds to care.',
    hints: MANUAL_LORE.overworld?.hints ?? [],
    crossRefs: ['bee', 'clover', 'recipe:bee+clover', 'gron', 'ghosts'],
    unlockKey: 'always',
    sourceKind: 'zone',
  },
  {
    id: 'cave',
    name: 'The Cave',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.CaveEntrance],
    glyphColor: TILE_COLORS[TileType.CaveEntrance],
    summary: 'a dark passage beneath the land',
    lore: MANUAL_LORE.cave?.lore ?? 'a winding cave accessible through an entrance on the surface. corridors lead upward to a chamber.',
    hints: MANUAL_LORE.cave?.hints ?? [],
    crossRefs: ['overworld', 'moab'],
    unlockKey: 'zone:cave',
    sourceKind: 'zone',
  },
  {
    id: 'shooting-star',
    name: 'Shooting Star',
    category: ManualCategory.Celestial,
    glyph: '*',
    glyphColor: '#FFFFFF',
    summary: 'a streak of light across the sky',
    lore: MANUAL_LORE['shooting-star']?.lore ?? 'shooting stars appear randomly in the space around the prairie. most pass harmlessly, but some land as meteorites.',
    hints: MANUAL_LORE['shooting-star']?.hints ?? [],
    crossRefs: ['meteorite', 'chain-explosion'],
    unlockKey: 'always',
    sourceKind: 'event',
  },
  {
    id: 'chain-explosion',
    name: 'Chain Explosion',
    category: ManualCategory.Celestial,
    glyph: '+',
    glyphColor: '#FFD700',
    summary: 'a cascade of meteorite impacts',
    lore: MANUAL_LORE['chain-explosion']?.lore ?? 'when a meteorite is picked up, there is a chance it detonates, scattering more meteorites nearby. chain meteorites cannot trigger further chains.',
    hints: MANUAL_LORE['chain-explosion']?.hints ?? [],
    crossRefs: ['meteorite', 'shooting-star'],
    unlockKey: 'event:chain-explosion',
    sourceKind: 'event',
  },
]

// --- Registry assembly ---

export const MANUAL_ENTRIES: Record<string, ManualEntry> = Object.fromEntries(
  [
    ...buildItemEntries(),
    ...buildRecipeEntries(),
    ...buildCharacterEntries(),
    ...MANUAL_ONLY_ENTRIES,
  ].map((entry) => [entry.id, entry]),
)

// --- Discovery helpers ---

export const recordDiscovery = (state: GameState, key: string): boolean => {
  if (state.manualDiscoveries.has(key)) return false
  state.manualDiscoveries.add(key)
  return true
}

export const isDiscovered = (discoveries: Set<string>, entry: ManualEntry): boolean => {
  if (entry.unlockKey === 'always') return true
  return discoveries.has(entry.unlockKey)
}

// --- Query functions ---

export const getEntriesByCategory = (category: ManualCategory): ManualEntry[] =>
  Object.values(MANUAL_ENTRIES).filter((e) => e.category === category)

export const getRelatedEntries = (entryId: string): ManualEntry[] => {
  const entry = MANUAL_ENTRIES[entryId]
  if (!entry) return []
  return entry.crossRefs
    .map((ref) => MANUAL_ENTRIES[ref])
    .filter((e): e is ManualEntry => e !== undefined)
}

// --- Search ---

export const filterManualEntries = (
  entries: ManualEntry[],
  query: string,
): ManualEntry[] => {
  if (!query.trim()) return entries
  const q = query.toLowerCase()
  return entries.filter((e) => {
    if (e.name.toLowerCase().includes(q)) return true
    if (e.summary.toLowerCase().includes(q)) return true
    if (e.lore.toLowerCase().includes(q)) return true
    for (const hint of e.hints) {
      if (hint.prompt.toLowerCase().includes(q)) return true
      if (hint.answer.toLowerCase().includes(q)) return true
    }
    return false
  })
}

// --- Category ordering ---

export const CATEGORY_ORDER: ManualCategory[] = [
  ManualCategory.Flora,
  ManualCategory.Fauna,
  ManualCategory.Celestial,
  ManualCategory.Object,
  ManualCategory.Person,
  ManualCategory.Zone,
  ManualCategory.Recipe,
]
