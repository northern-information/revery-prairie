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
  lore: string
  hints: ManualHint[]
  crossRefs?: string[]
  unlockKey: string
  sourceKind: 'item' | 'recipe' | 'character' | 'revery' | 'zone' | 'event' | 'entity' | 'manual-only'
}

// --- Hand-authored lore ---

const MANUAL_LORE: Partial<Record<string, { lore: string; hints?: ManualHint[] }>> = {
  // Items
  'item:bee': { lore: 'Apis mellifera.' },
  'item:clover': { lore: 'Dalea purpurea.' },
  'item:meteorite': {
    lore: 'O, fallen stars! What celestial bounty do ye bring? Shower us with your metals, your riches, your mystery.',
  },
  'item:honey': {
    lore: 'Out of the eater came something to eat, and out of the strong came something sweet. - Judges 14:14',
  },
  'item:coin': {
    lore: 'A relic from a more barbaric age. Still has some utility for divination, if you can find the glint.',
  },
  'item:wildflowerSeeds': { lore: 'TODO' },
  'item:tallGrassSeeds': { lore: 'TODO' },
  'item:milkweedSeeds': { lore: 'TODO' },
  'item:stoneTablet': { lore: 'TODO' },
  'item:aqueductKey': { lore: 'Its verdigris filigree promises passage.' },
  // Reveries
  'revery:fire': { lore: 'TODO' },
  'revery:water': { lore: 'TODO' },
  'revery:earth': { lore: 'TODO' },
  'revery:lightning': { lore: 'TODO' },
  'revery:deep-time': { lore: 'TODO' },
  // World entities
  'entity:beehive': { lore: 'Awareness is to watch as the millions of drones you captured just walk away.' },
  // Characters
  'character:gron': {
    lore: 'A rain curse follows this immortal codger around rendering his coarse cloak both damp and smelly.',
  },
  'character:moab': {
    lore: 'Not much to see but an emaciated skeleton draped in a tattered red and gold imperial mantle.',
  },
  'character:coyote': {
    lore: 'What is a steward without their coyote? And what is a coyote without their inherent bestness?',
  },
  // Zones
  'zone:ruin-dormant-garden': { lore: 'TODO' },
  'event:cave-fog': { lore: 'TODO' },
  // Recipes
  'recipe:bee+clover': {
    lore: [
      'to make a prairie it takes a clover and one bee,',
      'one clover, and a bee.',
      '',
      'and revery.',
      'the revery alone will do,',
      'if bees are few.',
      '',
      '— emily dickinson',
    ].join('\n'),
  },
  // Entities
  'entity:monarch': { lore: 'Danaus plexippus. Milkweed is vital to its lifecycle.' },
  // Events
  'event:glint-zone': { lore: 'Glinting light cast from the local star. Recharges coins.' },
  'event:angel': { lore: 'Flaming orreries of eyes encrusted in feather and wheel.' },
  'event:angel-canto': {
    lore: 'It is said their choirs are arranged in fractals and have sung the cantos since time immemorial.',
  },
  'event:satellite-impact': {
    lore: 'Failing mechanical devices from both this world and beyond. Who knows what you might find?',
  },
}

// --- Lore lookup for UI components ---

export const getLore = (key: string): string => MANUAL_LORE[key]?.lore ?? ''

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
    case ItemCategory.Artifact:
      return ManualCategory.Object
    case ItemCategory.Seed:
      return ManualCategory.Flora
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
      lore: loreData?.lore ?? def.name,
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
      lore: loreData?.lore ?? def.name,
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
      lore: loreData?.lore ?? recipe.resultName,
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
      lore: loreData?.lore ?? def.name,
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
    lore:
      MANUAL_LORE['event:genesis']?.lore ??
      `Before the prairie was a prairie, it was magma — and before that, void. ` +
        `A billion years of geological history flash before you each time a new world is born: ${epochList}. ` +
        `Every patch of soil remembers what happened to it. Volcanic hotspots left minerals behind. ` +
        `Glaciers scraped the highlands bare. Rivers carved alluvial deltas rich with sediment. ` +
        `Ancient civilizations rose and fell, their aqueducts buried deep beneath the dirt. ` +
        `The soil health you see today is the sum of all these forces.`,
    hints: MANUAL_LORE['event:genesis']?.hints ?? [
      {
        prompt: 'How it works',
        answer: 'Genesis runs between the name prompt and gameplay. It simulates 14 geological epochs in ~25 seconds.',
      },
      { prompt: 'Skip', answer: 'Press any key during the genesis sequence to skip ahead.' },
      { prompt: 'Determinism', answer: 'The same steward name always produces the same world.' },
      {
        prompt: 'Soil',
        answer:
          'Volcanic regions, river deltas, and civilization ruins have richer soil. Glacial paths and barren highlands have poorer soil.',
      },
      {
        prompt: 'Ruins',
        answer: 'Civilization ruins are buried underground. Their aqueducts once connected great cities.',
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
    lore:
      MANUAL_LORE['character:ghosts']?.lore ??
      'Three ghosts drift across the land. They move slowly and unpredictably. Each has something to say if you stop to listen.',
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
    lore: MANUAL_LORE['zone:overworld']?.lore ?? 'A dirt island surrounded by stars. The land responds to care.',
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
    lore:
      MANUAL_LORE['zone:cave']?.lore ??
      'A winding cave accessible through an entrance on the surface. Corridors lead upward to a chamber.',
    hints: MANUAL_LORE['zone:cave']?.hints ?? [],
    unlockKey: 'zone:cave',
    sourceKind: 'zone',
  },
  {
    id: 'event:cave-fog',
    name: 'Cave Darkness',
    category: ManualCategory.Zone,
    glyph: '#',
    glyphColor: '#444444',
    lore: MANUAL_LORE['event:cave-fog']?.lore ?? 'TODO',
    hints: MANUAL_LORE['event:cave-fog']?.hints ?? [],
    unlockKey: 'zone:cave',
    sourceKind: 'event',
  },
  {
    id: 'zone:ruin-dormant-garden',
    name: 'Dormant Garden',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.RuinAqueduct],
    glyphColor: TILE_COLORS[TileType.RuinAqueduct],
    lore: MANUAL_LORE['zone:ruin-dormant-garden']?.lore ?? 'TODO',
    hints: MANUAL_LORE['zone:ruin-dormant-garden']?.hints ?? [],
    unlockKey: 'zone:ruin-dormant-garden',
    sourceKind: 'zone',
  },
  {
    id: 'event:shooting-star',
    name: 'Shooting Star',
    category: ManualCategory.Celestial,
    glyph: '*',
    glyphColor: '#FFFFFF',
    lore:
      MANUAL_LORE['event:shooting-star']?.lore ??
      'Shooting stars appear randomly in the space around the prairie. Most pass harmlessly, but some land as meteorites.',
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
    lore:
      MANUAL_LORE['event:chain-explosion']?.lore ??
      'When a meteorite is picked up, there is a chance it detonates, scattering more meteorites nearby. Chain meteorites cannot trigger further chains.',
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
    lore:
      MANUAL_LORE['event:meteor-shower']?.lore ??
      'Occasionally the sky erupts with shooting stars, all streaking from the same direction. Most land as meteorites scattered across the prairie.',
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
    lore:
      MANUAL_LORE['event:clover-growth']?.lore ??
      'When bees settle on a clover patch, the clover begins to grow in spiraling patterns across the dirt. The more bees tend a patch, the faster it spreads.',
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
    lore:
      MANUAL_LORE['event:clover-death']?.lore ??
      'Clover needs both light and water to survive. Without them it slowly browns, then blinks red in distress, turns black, and finally decomposes back into the earth — enriching the soil as it goes.',
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
    lore:
      MANUAL_LORE['event:clover-harvest']?.lore ??
      'Pressing [f] while facing clover harvests it into your backpack. The tile returns to bare dirt. Harvested clover does not enrich the soil.',
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
    lore:
      MANUAL_LORE['event:clover-cut']?.lore ??
      'Pressing [x] while facing clover cuts it down to bare dirt. Unlike harvesting, cutting returns nutrients to the earth, enriching the soil.',
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
    lore:
      MANUAL_LORE['event:hexagram-cast']?.lore ??
      'Three ancient coins, tossed six times. Each toss builds a line — solid or broken, stable or changing. The hexagram that forms speaks in the language of the prairie. Listen closely.',
    hints: MANUAL_LORE['event:hexagram-cast']?.hints ?? [
      { prompt: 'How to cast', answer: 'Collect 3 glinting coins and press [c] on the overworld.' },
      {
        prompt: 'Changing lines',
        answer: 'Old yin (6) and old yang (9) are changing lines. They transform the hexagram into a second reading.',
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
    lore:
      MANUAL_LORE['event:lightning-strike']?.lore ??
      'Lightning strikes the prairie during storms. Rain, high humidity, and strong wind all increase the chance. The bolt is brief but unmistakable — the whole sky flashes white.',
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
    lore:
      MANUAL_LORE['event:wildfire']?.lore ??
      'When lightning strikes dry clover, fire spreads to neighboring patches. The drier the clover, the farther it burns. Wet clover resists ignition. The fire enriches the soil as it passes.',
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
    lore:
      MANUAL_LORE['event:lightning-attraction']?.lore ??
      'High ground draws lightning down from the clouds. Water-soaked earth conducts the charge — tiles near ponds and rivers are struck more often. Metal objects left on the ground act as conductors — meteorites attract bolts. A lone beehive standing in open dirt is a target — isolated tall features on flat terrain invite strikes. Clover fields conduct slightly better than bare dirt.',
    hints: MANUAL_LORE['event:lightning-attraction']?.hints ?? [
      {
        prompt: 'How to protect clover',
        answer: 'Keep fields hydrated. Wet clover resists ignition. Remove metal objects from valuable patches.',
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
    lore:
      MANUAL_LORE['event:lightning-revery']?.lore ??
      'The lightning revery lets you choose where the bolt falls. Press the hotkey to enter targeting mode, then click a tile within range. The strike follows the same rules as natural lightning — dry clover ignites, fire spreads, soil enriches.',
    hints: MANUAL_LORE['event:lightning-revery']?.hints ?? [
      {
        prompt: 'How to target',
        answer: 'Press the action bar key, then click a tile within 20 steps. Press Esc or right-click to cancel.',
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
    lore: MANUAL_LORE['event:glint-zone']?.lore ?? 'TODO',
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
    lore:
      MANUAL_LORE['event:gron-deep-time']?.lore ?? 'Gron speaks of the Deep Time revery and what it means to let go.',
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
    lore: MANUAL_LORE['event:angel-canto']?.lore ?? 'TODO',
    hints: MANUAL_LORE['event:angel-canto']?.hints ?? [],
    unlockKey: 'event:angel-canto',
    sourceKind: 'event',
    crossRefs: ['event:angel'],
  },
  {
    id: 'event:satellite-impact',
    name: 'Satellite Impact',
    category: ManualCategory.Celestial,
    glyph: '░',
    glyphColor: '#FF4444',
    lore: MANUAL_LORE['event:satellite-impact']?.lore ?? 'TODO',
    hints: MANUAL_LORE['event:satellite-impact']?.hints ?? [],
    unlockKey: 'event:satellite-impact',
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
