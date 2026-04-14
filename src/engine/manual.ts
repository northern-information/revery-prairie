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
  sourceKind: 'item' | 'recipe' | 'character' | 'revery' | 'zone' | 'event' | 'entity' | 'manual-only'
}

// --- Hand-authored lore ---

const MANUAL_LORE: Partial<Record<string, { lore: string; hints?: ManualHint[] }>> = {
  // Items
  'item:bee': { lore: 'TODO' },
  'item:clover': { lore: 'TODO' },
  'item:meteorite': { lore: 'TODO' },
  'item:permacomputer': { lore: 'TODO' },
  'item:omnibox': { lore: 'TODO' },
  'item:honey': { lore: 'TODO' },
  'item:coin': { lore: 'TODO' },
  // Reveries
  'revery:fire': { lore: 'TODO' },
  'revery:water': { lore: 'TODO' },
  'revery:earth': { lore: 'TODO' },
  'revery:deep-time': { lore: 'TODO' },
  // World entities
  'entity:beehive': { lore: 'TODO' },
  // Characters
  'character:gron': { lore: 'TODO' },
  'character:moab': { lore: 'TODO' },
  'character:ghosts': { lore: 'TODO' },
  'character:coyote': { lore: 'TODO' },
  // Weather events
  'event:lightning-strike': { lore: 'TODO' },
  'event:wildfire': { lore: 'TODO' },
  'event:lightning-attraction': { lore: 'TODO' },
  'event:lightning-revery': { lore: 'TODO' },
  'revery:lightning': { lore: 'TODO' },
  // Glinting zones
  'event:glint-zone': { lore: 'TODO' },
  // Deep time
  'event:deep-time': { lore: 'TODO' },
  'event:gron-deep-time': { lore: 'TODO' },
  // Angels
  'event:angel': { lore: 'TODO' },
  'event:angel-canto': { lore: 'TODO' },
  // Recipes
  'recipe:bee+clover': { lore: 'TODO' },
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
    const loreData = MANUAL_LORE[`item:${def.id}`]
    return {
      id: `item:${def.id}`,
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
    const loreData = MANUAL_LORE[`revery:${def.id}`]
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
      crossRefs: recipe.ingredients.map(id => `item:${id}`),
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

    const loreData = MANUAL_LORE[`character:${def.id}`]

    entries.push({
      id: `character:${def.id}`,
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
    const loreData = MANUAL_LORE[`entity:${def.id}`]
    return {
      id: `entity:${def.id}`,
      name: def.name,
      category: def.category as ManualCategory,
      glyph: def.glyph,
      glyphColor: def.glyphColor,
      summary: def.summary,
      lore: loreData?.lore ?? def.summary,
      hints: loreData?.hints ?? [],
      unlockKey: def.unlockKey,
      sourceKind: 'entity' as const,
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
    id: 'event:genesis',
    name: 'Genesis',
    category: ManualCategory.Zone,
    glyph: '~',
    glyphColor: '#FF4500',
    summary: 'the geological history that shaped this land',
    lore:
      MANUAL_LORE['event:genesis']?.lore ??
      `before the prairie was a prairie, it was magma — and before that, void. ` +
        `a billion years of geological history flash before you each time a new world is born: ${epochList}. ` +
        `every patch of soil remembers what happened to it. volcanic hotspots left minerals behind. ` +
        `glaciers scraped the highlands bare. rivers carved alluvial deltas rich with sediment. ` +
        `ancient civilizations rose and fell, their aqueducts buried deep beneath the dirt. ` +
        `the soil health you see today is the sum of all these forces.`,
    hints: MANUAL_LORE['event:genesis']?.hints ?? [
      {
        prompt: 'how it works',
        answer: 'genesis runs between the name prompt and gameplay. it simulates 14 geological epochs in ~25 seconds.',
      },
      { prompt: 'skip', answer: 'press any key during the genesis sequence to skip ahead.' },
      { prompt: 'determinism', answer: 'the same steward name always produces the same world.' },
      {
        prompt: 'soil',
        answer:
          'volcanic regions, river deltas, and civilization ruins have richer soil. glacial paths and barren highlands have poorer soil.',
      },
      {
        prompt: 'ruins',
        answer: 'civilization ruins are buried underground. their aqueducts once connected great cities.',
      },
    ],
    unlockKey: 'always',
    sourceKind: 'event',
  }
}

// --- Manual-only entries (zones, events) ---

const MANUAL_ONLY_ENTRIES: ManualEntry[] = [
  {
    id: 'character:ghosts',
    name: 'Ghosts',
    category: ManualCategory.Person,
    glyph: 'ö',
    glyphColor: '#FFFFFF',
    summary: 'wandering spirits on the prairie',
    lore:
      MANUAL_LORE['character:ghosts']?.lore ??
      'three ghosts drift across the land. they move slowly and unpredictably. each has something to say if you stop to listen.',
    hints: MANUAL_LORE['character:ghosts']?.hints ?? [],
    unlockKey: 'character:ghost-1',
    sourceKind: 'character',
  },
  {
    id: 'zone:overworld',
    name: 'The Prairie',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.Dirt],
    glyphColor: TILE_COLORS[TileType.Dirt],
    summary: 'a dirt island surrounded by stars',
    lore: MANUAL_LORE['zone:overworld']?.lore ?? 'a dirt island surrounded by stars. the land responds to care.',
    hints: MANUAL_LORE['zone:overworld']?.hints ?? [],
    unlockKey: 'always',
    sourceKind: 'zone',
  },
  {
    id: 'zone:cave',
    name: 'The Cave',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.CaveEntrance],
    glyphColor: TILE_COLORS[TileType.CaveEntrance],
    summary: 'a dark passage beneath the land',
    lore:
      MANUAL_LORE['zone:cave']?.lore ??
      'a winding cave accessible through an entrance on the surface. corridors lead upward to a chamber.',
    hints: MANUAL_LORE['zone:cave']?.hints ?? [],
    unlockKey: 'zone:cave',
    sourceKind: 'zone',
  },
  {
    id: 'event:shooting-star',
    name: 'Shooting Star',
    category: ManualCategory.Celestial,
    glyph: '*',
    glyphColor: '#FFFFFF',
    summary: 'a streak of light across the sky',
    lore:
      MANUAL_LORE['event:shooting-star']?.lore ??
      'shooting stars appear randomly in the space around the prairie. most pass harmlessly, but some land as meteorites.',
    hints: MANUAL_LORE['event:shooting-star']?.hints ?? [],
    unlockKey: 'always',
    sourceKind: 'event',
  },
  {
    id: 'event:chain-explosion',
    name: 'Chain Explosion',
    category: ManualCategory.Celestial,
    glyph: '+',
    glyphColor: '#FFD700',
    summary: 'a cascade of meteorite impacts',
    lore:
      MANUAL_LORE['event:chain-explosion']?.lore ??
      'when a meteorite is picked up, there is a chance it detonates, scattering more meteorites nearby. chain meteorites cannot trigger further chains.',
    hints: MANUAL_LORE['event:chain-explosion']?.hints ?? [],
    unlockKey: 'event:chain-explosion',
    sourceKind: 'event',
  },
  {
    id: 'event:meteor-shower',
    name: 'Meteor Shower',
    category: ManualCategory.Celestial,
    glyph: '*',
    glyphColor: '#FFD700',
    summary: 'a burst of shooting stars raining down on the prairie',
    lore:
      MANUAL_LORE['event:meteor-shower']?.lore ??
      'occasionally the sky erupts with shooting stars, all streaking from the same direction. most land as meteorites scattered across the prairie.',
    hints: MANUAL_LORE['event:meteor-shower']?.hints ?? [],
    unlockKey: 'event:meteor-shower',
    sourceKind: 'event',
  },
  {
    id: 'event:clover-growth',
    name: 'Clover Growth',
    category: ManualCategory.Flora,
    glyph: '%',
    glyphColor: '#90EE90',
    summary: 'clover spreads across the prairie',
    lore:
      MANUAL_LORE['event:clover-growth']?.lore ??
      'when bees settle on a clover patch, the clover begins to grow in spiraling patterns across the dirt. the more bees tend a patch, the faster it spreads.',
    hints: MANUAL_LORE['event:clover-growth']?.hints ?? [],
    unlockKey: 'event:clover-growth',
    sourceKind: 'event',
  },
  {
    id: 'event:clover-death',
    name: 'Clover Death',
    category: ManualCategory.Flora,
    glyph: '%',
    glyphColor: '#8B6914',
    summary: 'clover withers without light and water',
    lore:
      MANUAL_LORE['event:clover-death']?.lore ??
      'clover needs both light and water to survive. without them it slowly browns, then blinks red in distress, turns black, and finally decomposes back into the earth — enriching the soil as it goes.',
    hints: MANUAL_LORE['event:clover-death']?.hints ?? [],
    unlockKey: 'event:clover-death',
    sourceKind: 'event',
  },
  {
    id: 'event:clover-harvest',
    name: 'Clover Harvest',
    category: ManualCategory.Flora,
    glyph: '%',
    glyphColor: '#50C878',
    summary: 'harvesting clover with [f]',
    lore:
      MANUAL_LORE['event:clover-harvest']?.lore ??
      'pressing [f] while facing clover harvests it into your backpack. the tile returns to bare dirt. harvested clover does not enrich the soil.',
    hints: MANUAL_LORE['event:clover-harvest']?.hints ?? [],
    unlockKey: 'event:clover-harvest',
    sourceKind: 'event',
  },
  {
    id: 'event:clover-cut',
    name: 'Clover Cut',
    category: ManualCategory.Flora,
    glyph: '%',
    glyphColor: '#50C878',
    summary: 'cutting clover with [x]',
    lore:
      MANUAL_LORE['event:clover-cut']?.lore ??
      'pressing [x] while facing clover cuts it down to bare dirt. unlike harvesting, cutting returns nutrients to the earth, enriching the soil.',
    hints: MANUAL_LORE['event:clover-cut']?.hints ?? [],
    unlockKey: 'event:clover-cut',
    sourceKind: 'event',
  },
  {
    id: 'event:hexagram-cast',
    name: 'Hexagram Casting',
    category: ManualCategory.Object,
    glyph: '¤',
    glyphColor: COIN_GLINTING_COLOR,
    summary: 'divination with three coins',
    lore:
      MANUAL_LORE['event:hexagram-cast']?.lore ??
      'three ancient coins, tossed six times. each toss builds a line — solid or broken, stable or changing. the hexagram that forms speaks in the language of the prairie. listen closely.',
    hints: MANUAL_LORE['event:hexagram-cast']?.hints ?? [
      { prompt: 'how to cast', answer: 'collect 3 glinting coins and press [c] on the overworld.' },
      {
        prompt: 'changing lines',
        answer: 'old yin (6) and old yang (9) are changing lines. they transform the hexagram into a second reading.',
      },
    ],
    unlockKey: 'event:hexagram-cast',
    sourceKind: 'event',
  },
  {
    id: 'event:lightning-strike',
    name: 'Lightning Strike',
    category: ManualCategory.Celestial,
    glyph: '|',
    glyphColor: '#FFFFFF',
    summary: 'a bolt from the sky',
    lore:
      MANUAL_LORE['event:lightning-strike']?.lore ??
      'lightning strikes the prairie during storms. rain, high humidity, and strong wind all increase the chance. the bolt is brief but unmistakable — the whole sky flashes white.',
    hints: MANUAL_LORE['event:lightning-strike']?.hints ?? [],
    unlockKey: 'event:lightning-strike',
    sourceKind: 'event',
    crossRefs: ['event:wildfire', 'event:lightning-attraction'],
  },
  {
    id: 'event:wildfire',
    name: 'Wildfire',
    category: ManualCategory.Flora,
    glyph: '^',
    glyphColor: '#FF4500',
    summary: 'fire spreads across dry clover',
    lore:
      MANUAL_LORE['event:wildfire']?.lore ??
      'when lightning strikes dry clover, fire spreads to neighboring patches. the drier the clover, the farther it burns. wet clover resists ignition. the fire enriches the soil as it passes.',
    hints: MANUAL_LORE['event:wildfire']?.hints ?? [],
    unlockKey: 'event:wildfire',
    sourceKind: 'event',
    crossRefs: ['event:lightning-strike', 'event:lightning-attraction'],
  },
  {
    id: 'event:lightning-attraction',
    name: 'Lightning Attraction',
    category: ManualCategory.Celestial,
    glyph: '|',
    glyphColor: '#E0E0FF',
    summary: 'what draws lightning to a place',
    lore:
      MANUAL_LORE['event:lightning-attraction']?.lore ??
      'high ground draws lightning down from the clouds. water-soaked earth conducts the charge — tiles near ponds and rivers are struck more often. metal objects left on the ground act as conductors — meteorites and omniboxes attract bolts. a lone beehive standing in open dirt is a target — isolated tall features on flat terrain invite strikes. clover fields conduct slightly better than bare dirt.',
    hints: MANUAL_LORE['event:lightning-attraction']?.hints ?? [
      {
        prompt: 'how to protect clover',
        answer: 'keep fields hydrated. wet clover resists ignition. remove metal objects from valuable patches.',
      },
    ],
    unlockKey: 'event:lightning-strike',
    sourceKind: 'event',
    crossRefs: ['event:lightning-strike', 'event:wildfire'],
  },
  {
    id: 'event:lightning-revery',
    name: 'Lightning Revery Cast',
    category: ManualCategory.Celestial,
    glyph: '|',
    glyphColor: '#FFFFFF',
    summary: 'calling the storm down',
    lore:
      MANUAL_LORE['event:lightning-revery']?.lore ??
      'the lightning revery lets you choose where the bolt falls. press the hotkey to enter targeting mode, then click a tile within range. the strike follows the same rules as natural lightning — dry clover ignites, fire spreads, soil enriches.',
    hints: MANUAL_LORE['event:lightning-revery']?.hints ?? [
      {
        prompt: 'how to target',
        answer: 'press the action bar key, then click a tile within 20 steps. press Esc or right-click to cancel.',
      },
    ],
    unlockKey: 'event:lightning-revery',
    sourceKind: 'event',
    crossRefs: ['event:lightning-strike', 'event:wildfire', 'event:lightning-attraction'],
  },
  {
    id: 'event:glint-zone',
    name: 'Glinting Zone',
    category: ManualCategory.Zone,
    glyph: '\u2726',
    glyphColor: '#C9B037',
    summary: 'patches of golden light on the prairie',
    lore:
      MANUAL_LORE['event:glint-zone']?.lore ??
      'TODO',
    hints: MANUAL_LORE['event:glint-zone']?.hints ?? [],
    unlockKey: 'event:glint-zone',
    sourceKind: 'event',
  },
  {
    id: 'event:deep-time',
    name: 'Deep Time',
    category: ManualCategory.Revery,
    glyph: '⧖',
    glyphColor: '#FFFFFF',
    summary: 'The final act of stewardship. A controlled burn followed by a millennium of observation.',
    lore:
      MANUAL_LORE['event:deep-time']?.lore ??
      'The final act of stewardship. A controlled burn followed by a millennium of observation.',
    hints: MANUAL_LORE['event:deep-time']?.hints ?? [],
    unlockKey: 'event:deep-time',
    sourceKind: 'event',
  },
  {
    id: 'event:gron-deep-time',
    name: "Gron's Final Words",
    category: ManualCategory.Person,
    glyph: 'G',
    glyphColor: '#FFFFFF',
    summary: 'Gron speaks of the Deep Time revery and what it means to let go.',
    lore:
      MANUAL_LORE['event:gron-deep-time']?.lore ??
      'Gron speaks of the Deep Time revery and what it means to let go.',
    hints: MANUAL_LORE['event:gron-deep-time']?.hints ?? [],
    unlockKey: 'event:gron-deep-time',
    sourceKind: 'event',
  },
  {
    id: 'event:angel',
    name: 'Angel',
    category: ManualCategory.Celestial,
    glyph: 'O',
    glyphColor: '#FFFFFF',
    summary: 'a biblically accurate celestial being drifting across the prairie',
    lore: MANUAL_LORE['event:angel']?.lore ?? 'TODO',
    hints: MANUAL_LORE['event:angel']?.hints ?? [],
    unlockKey: 'event:angel',
    sourceKind: 'event',
    crossRefs: ['event:angel-canto'],
  },
  {
    id: 'event:angel-canto',
    name: 'Angel Canto',
    category: ManualCategory.Celestial,
    glyph: '#',
    glyphColor: '#E8E8FF',
    summary: 'a sha256 hash spoken by an angel, recorded in the permacomputer',
    lore: MANUAL_LORE['event:angel-canto']?.lore ?? 'TODO',
    hints: MANUAL_LORE['event:angel-canto']?.hints ?? [],
    unlockKey: 'event:angel-canto',
    sourceKind: 'event',
    crossRefs: ['event:angel'],
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
