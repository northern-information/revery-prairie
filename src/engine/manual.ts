import { CHARACTER_DEFINITIONS } from './characters'
import { COIN_GLINTING_COLOR, TILE_CHARS, TILE_COLORS } from './constants'
import { GENESIS_EPOCHS } from './genesis'
import { KEYBINDINGS } from './input'
import { ITEM_DEFINITIONS } from './items'
import { recipeKey, RECIPES } from './recipes'
import { REVERY_DEFINITIONS } from './reveries'
import { ItemCategory, TileType } from './types'
import { WORLD_ENTITY_DEFINITIONS } from './worldEntities'

import type { GameState } from './types'

// --- Categories ---

export const ManualCategory = {
  Flora: 'flora',
  Fauna: 'fauna',
  Celestial: 'celestial',
  Object: 'object',
  Person: 'person',
  Revery: 'revery',
  Zone: 'zone',
  Recipe: 'recipe',
  Control: 'control',
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
  crossRefs?: string[]
  unlockKey: string
  sourceKind: 'item' | 'recipe' | 'character' | 'revery' | 'zone' | 'event' | 'manual-only'
}

// --- Hand-authored lore ---

const MANUAL_LORE: Partial<Record<string, { lore: string; hints?: ManualHint[] }>> = {
  // Items — lore will be filled in by the user via /maintain-manual
  // Recipes — auto-use recipe description as lore
  // Manual-only entries have lore inline below
  // Reveries
  earth: { lore: 'a memory of the land beneath. the scan reveals soil health as color — red earth is exhausted, violet earth is thriving.' },
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

// --- Builder functions ---

const buildItemEntries = (): ManualEntry[] =>
  Object.values(ITEM_DEFINITIONS).map(def => {
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
      unlockKey: `item:${def.id}`,
      sourceKind: 'item',
    }
  })

const buildReveryEntries = (): ManualEntry[] =>
  Object.values(REVERY_DEFINITIONS).map(def => {
    const loreData = MANUAL_LORE[def.id]
    return {
      id: `revery:${def.id}`,
      name: def.name,
      category: ManualCategory.Revery,
      glyph: def.glyphs[0],
      glyphColor: def.glyphColor,
      summary: def.description,
      lore: loreData?.lore ?? def.description,
      hints: loreData?.hints ?? [],
      unlockKey: `revery:${def.id}`,
      sourceKind: 'revery' as const,
    }
  })

const buildRecipeEntries = (): ManualEntry[] =>
  RECIPES.map(recipe => {
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

    entries.push({
      id: def.id,
      name: def.name,
      category: ManualCategory.Person,
      glyph: def.glyph,
      glyphColor: def.glyphColor,
      summary: loreData?.lore ?? def.name,
      lore: loreData?.lore ?? def.name,
      hints: loreData?.hints ?? [],
      unlockKey: `character:${def.id}`,
      sourceKind: 'character',
    })
  }

  return entries
}

// --- World entity entries (auto-derived from world entity registry) ---

const buildWorldEntityEntries = (): ManualEntry[] =>
  Object.values(WORLD_ENTITY_DEFINITIONS).map(def => {
    const loreData = MANUAL_LORE[def.id]
    return {
      id: def.id,
      name: def.name,
      category: def.category as ManualCategory,
      glyph: def.glyph,
      glyphColor: def.glyphColor,
      summary: def.summary,
      lore: loreData?.lore ?? def.summary,
      hints: loreData?.hints ?? [],
      unlockKey: def.unlockKey,
      sourceKind: 'manual-only' as const,
    }
  })

// --- Control entries (auto-derived from keybinding registry) ---

const buildControlEntries = (): ManualEntry[] =>
  KEYBINDINGS.map(kb => ({
    id: `control:${kb.key}`,
    name: `[${kb.key}] ${kb.action}`,
    category: ManualCategory.Control,
    glyph: '',
    glyphColor: '#ff69b4',
    summary: kb.context ?? '',
    lore: kb.context ?? '',
    hints: [],
    unlockKey: 'always',
    sourceKind: 'manual-only' as const,
  }))

// --- Genesis entry (auto-derived from epoch registry) ---

const buildGenesisEntry = (): ManualEntry => {
  const epochList = GENESIS_EPOCHS.map(e => e.commentary.replace(/\.\.\.$/, '')).join(', ')
  return {
    id: 'genesis',
    name: 'Genesis',
    category: ManualCategory.Zone,
    glyph: '~',
    glyphColor: '#FF4500',
    summary: 'the geological history that shaped this land',
    lore:
      MANUAL_LORE.genesis?.lore ??
      `before the prairie was a prairie, it was magma — and before that, void. ` +
      `a billion years of geological history flash before you each time a new world is born: ${epochList}. ` +
      `every patch of soil remembers what happened to it. volcanic hotspots left minerals behind. ` +
      `glaciers scraped the highlands bare. rivers carved alluvial deltas rich with sediment. ` +
      `ancient civilizations rose and fell, their aqueducts buried deep beneath the dirt. ` +
      `the soil health you see today is the sum of all these forces.`,
    hints: MANUAL_LORE.genesis?.hints ?? [
      { prompt: 'how it works', answer: 'genesis runs between the name prompt and gameplay. it simulates 14 geological epochs in ~25 seconds.' },
      { prompt: 'skip', answer: 'press any key during the genesis sequence to skip ahead.' },
      { prompt: 'determinism', answer: 'the same steward name always produces the same world.' },
      { prompt: 'soil', answer: 'volcanic regions, river deltas, and civilization ruins have richer soil. glacial paths and barren highlands have poorer soil.' },
      { prompt: 'ruins', answer: 'civilization ruins are buried underground. their aqueducts once connected great cities.' },
    ],
    unlockKey: 'always',
    sourceKind: 'event',
  }
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
    lore:
      MANUAL_LORE.ghosts?.lore ??
      'three ghosts drift across the land. they move slowly and unpredictably. each has something to say if you stop to listen.',
    hints: MANUAL_LORE.ghosts?.hints ?? [],
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
    lore:
      MANUAL_LORE.cave?.lore ??
      'a winding cave accessible through an entrance on the surface. corridors lead upward to a chamber.',
    hints: MANUAL_LORE.cave?.hints ?? [],
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
    lore:
      MANUAL_LORE['shooting-star']?.lore ??
      'shooting stars appear randomly in the space around the prairie. most pass harmlessly, but some land as meteorites.',
    hints: MANUAL_LORE['shooting-star']?.hints ?? [],
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
    lore:
      MANUAL_LORE['chain-explosion']?.lore ??
      'when a meteorite is picked up, there is a chance it detonates, scattering more meteorites nearby. chain meteorites cannot trigger further chains.',
    hints: MANUAL_LORE['chain-explosion']?.hints ?? [],
    unlockKey: 'event:chain-explosion',
    sourceKind: 'event',
  },
  {
    id: 'meteor-shower',
    name: 'Meteor Shower',
    category: ManualCategory.Celestial,
    glyph: '*',
    glyphColor: '#FFD700',
    summary: 'a burst of shooting stars raining down on the prairie',
    lore:
      MANUAL_LORE['meteor-shower']?.lore ??
      'occasionally the sky erupts with shooting stars, all streaking from the same direction. most land as meteorites scattered across the prairie.',
    hints: MANUAL_LORE['meteor-shower']?.hints ?? [],
    unlockKey: 'event:meteor-shower',
    sourceKind: 'event',
  },
  {
    id: 'clover-growth',
    name: 'Clover Growth',
    category: ManualCategory.Flora,
    glyph: '%',
    glyphColor: '#90EE90',
    summary: 'clover spreads across the prairie',
    lore:
      MANUAL_LORE['clover-growth']?.lore ??
      'when bees settle on a clover patch, the clover begins to grow in spiraling patterns across the dirt. the more bees tend a patch, the faster it spreads.',
    hints: MANUAL_LORE['clover-growth']?.hints ?? [],
    unlockKey: 'event:clover-growth',
    sourceKind: 'event',
  },
  {
    id: 'clover-death',
    name: 'Clover Death',
    category: ManualCategory.Flora,
    glyph: '%',
    glyphColor: '#8B6914',
    summary: 'clover withers without light and water',
    lore:
      MANUAL_LORE['clover-death']?.lore ??
      'clover needs both light and water to survive. without them it slowly browns, then blinks red in distress, turns black, and finally decomposes back into the earth — enriching the soil as it goes.',
    hints: MANUAL_LORE['clover-death']?.hints ?? [],
    unlockKey: 'event:clover-death',
    sourceKind: 'event',
  },
  {
    id: 'clover-harvest',
    name: 'Clover Harvest',
    category: ManualCategory.Flora,
    glyph: '%',
    glyphColor: '#50C878',
    summary: 'harvesting clover with [f]',
    lore:
      MANUAL_LORE['clover-harvest']?.lore ??
      'pressing [f] while facing clover harvests it into your backpack. the tile returns to bare dirt. harvested clover does not enrich the soil.',
    hints: MANUAL_LORE['clover-harvest']?.hints ?? [],
    unlockKey: 'event:clover-harvest',
    sourceKind: 'event',
  },
  {
    id: 'clover-cut',
    name: 'Clover Cut',
    category: ManualCategory.Flora,
    glyph: '%',
    glyphColor: '#50C878',
    summary: 'cutting clover with [x]',
    lore:
      MANUAL_LORE['clover-cut']?.lore ??
      'pressing [x] while facing clover cuts it down to bare dirt. unlike harvesting, cutting returns nutrients to the earth, enriching the soil.',
    hints: MANUAL_LORE['clover-cut']?.hints ?? [],
    unlockKey: 'event:clover-cut',
    sourceKind: 'event',
  },
  {
    id: 'hexagram-cast',
    name: 'Hexagram Casting',
    category: ManualCategory.Object,
    glyph: '¤',
    glyphColor: COIN_GLINTING_COLOR,
    summary: 'divination with three coins',
    lore:
      MANUAL_LORE['hexagram-cast']?.lore ??
      'three ancient coins, tossed six times. each toss builds a line — solid or broken, stable or changing. the hexagram that forms speaks in the language of the prairie. listen closely.',
    hints: MANUAL_LORE['hexagram-cast']?.hints ?? [
      { prompt: 'how to cast', answer: 'collect 3 glinting coins and press [c] on the overworld.' },
      { prompt: 'changing lines', answer: 'old yin (6) and old yang (9) are changing lines. they transform the hexagram into a second reading.' },
    ],
    unlockKey: 'event:hexagram-cast',
    sourceKind: 'event',
  },
]

// --- Registry assembly ---

export const MANUAL_ENTRIES: Record<string, ManualEntry> = Object.fromEntries(
  [
    ...buildItemEntries(),
    ...buildReveryEntries(),
    ...buildRecipeEntries(),
    ...buildCharacterEntries(),
    ...buildWorldEntityEntries(),
    ...buildControlEntries(),
    ...MANUAL_ONLY_ENTRIES,
    buildGenesisEntry(),
  ].map(entry => [entry.id, entry])
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
  Object.values(MANUAL_ENTRIES).filter(e => e.category === category)

// --- Search ---

export const filterManualEntries = (entries: ManualEntry[], query: string): ManualEntry[] => {
  if (!query.trim()) return entries
  const q = query.toLowerCase()
  return entries.filter(e => {
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
  ManualCategory.Revery,
  ManualCategory.Zone,
  ManualCategory.Recipe,
  ManualCategory.Control,
]
