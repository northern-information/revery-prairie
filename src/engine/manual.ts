import { CHARACTER_DEFINITIONS } from './characters'
import { COIN_GLINTING_COLOR, TILE_CHARS, TILE_COLORS } from './constants'
import {
  getEgregoreGlyph,
  getEgregoreIncompatibilityFootnote,
  getEgregoreLatinPierce,
  getEgregoreManualBody,
} from './egregore'
import { KEYBINDINGS } from './input'
import { ITEM_DEFINITIONS } from './items'
import { recipeKey, RECIPES } from './recipes'
import { ItemCategory, TileType } from './types'
import { WORLD_ENTITY_DEFINITIONS } from './worldEntities'

import type { GameState } from './types'

// --- Categories ---

export const ManualCategory = {
  Life: 'life',
  Celestial: 'celestial',
  Object: 'object',
  Person: 'person',
  Zone: 'zone',
  // RP-22 — named regions detected at genesis (the village, the cave
  // mouth, the south ridge, the west pond, …). Per-tenure entries
  // generated dynamically from state.namedRegions.
  Region: 'region',
  Recipe: 'recipe',
  Control: 'control',
  // Egregoric flora — manual entries render in the Voynich typeface
  // and have no English name. Distinct category so the UI can lay them
  // out under their own header (label TBD by ManualPanel — likely
  // rendered in Voynich script).
  Egregore: 'egregore',
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
  sourceKind: 'item' | 'recipe' | 'character' | 'zone' | 'event' | 'entity' | 'manual-only'
  // RP-21 — when true, the entry's lore body renders in the Voynich
  // typeface via ManualPanel's GlitchedLore branch. The manual entry
  // for Gron uses this to signal "the manual does not know."
  glitched?: boolean
}

// --- Hand-authored lore ---

const MANUAL_LORE: Partial<Record<string, { lore: string; hints?: ManualHint[]; glitched?: boolean }>> = {
  // Items
  'item:bee': { lore: 'Apis mellifera.' },
  // Seed items — reintroduced in RP-5 as ruin-recovery payloads.
  // Lore is TODO per repo policy (lore is human-authored only).
  'item:wildflowerSeeds': { lore: 'TODO' },
  'item:tallGrassSeeds': { lore: 'TODO' },
  // Flora species — clover lore preserved; wildflower and tall grass
  // are TODO per repo policy (lore is human-authored only).
  'flora:clover': { lore: 'Trifolium repens.' },
  'flora:wildflower': { lore: 'TODO' },
  'flora:tallGrass': { lore: 'TODO' },
  'item:meteorite': {
    lore: 'Fallen star used for creating hallowed ground to keep flora in… or out.',
  },
  'item:honey': {
    lore: 'Out of the eater came something to eat, and out of the strong came something sweet. - Judges 14:14',
  },
  'item:coin': {
    lore: 'A relic from a more barbaric age. Still has some utility for divination, if you can find the glint.',
  },
  'item:stoneTablet': { lore: 'TODO' },
  'item:aqueductKey': { lore: 'Its verdigris filigree promises passage.' },
  'item:camera': { lore: 'Weatherproof, permacomputer augmented.' },
  'item:filmRoll': { lore: 'Unused N-INFO 400 film roll.' },
  // World entities
  'entity:beehive': { lore: 'Awareness is to watch as the millions of drones you captured just walk away.' },
  'entity:monarch': { lore: 'Danaus plexippus. Milkweed is vital to its lifecycle.' },
  'entity:oak': { lore: 'TODO' },
  // Characters
  // RP-21 — Gron's manual entry uses the round-5 doctrine phrase
  // verbatim. Rendered in Voynich via the glitched flag (see
  // ManualPanel's GlitchedLore branch). The previous "rain curse" line
  // violated round-5 principles by declaring Gron immortal, classifying
  // him as a codger, explaining the rain as a curse, and editorializing
  // in an authoritative register about an unknowable figure
  // (v4 R5 line 339).
  'character:gron': {
    lore: 'The manual does not know.',
    glitched: true,
  },
  'character:moab': { lore: 'TODO' },
  'character:coyote': {
    lore: 'What is a steward without their coyote? And what is a coyote without their inherent bestness?',
  },
  'character:ghosts': {
    lore: 'Three ghosts drift across the land. They move slowly and unpredictably. Each has something to say if you stop to listen.',
  },
  'character:emily': { lore: 'TODO' },
  // RP-36 — lore is human-authored; the entry exists so the manual
  // auto-iteration over ITEM_DEFINITIONS picks up the Knot and surfaces
  // it under Items with a TODO placeholder until it is filled in.
  'item:reveryKnot': { lore: 'TODO' },
  // Zones
  'zone:overworld': { lore: 'A dirt island surrounded by stars. The land responds to care.' },
  'zone:cave': {
    lore: 'A winding cave accessible through an entrance on the surface. Corridors lead upward to a chamber.',
  },
  'zone:ruin-dormant-garden': { lore: 'TODO' },
  'zone:house': { lore: 'TODO' },
  // RP-37 — the Knot Cellar. Discovery on first cellar enter (either
  // via the back-yard bulkhead OR via the post-Revery awaken hook,
  // whichever fires first). Lore is human-authored later.
  'zone:knotCellar': { lore: 'TODO' },
  // RP-69 — Whine, Haunted Village. Lore TODO per the lore-authoring
  // rule. The village's twelve named ghosts auto-derive into the
  // manual via buildCharacterEntries; their character: keys land
  // alongside in MANUAL_LORE (loop below this block).
  'zone:whine': { lore: 'TODO' },
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
  // Loaded Camera (filmRoll + camera) — TODO per repo policy (lore is
  // human-authored only). Without this key the entry falls back to its
  // resultName.
  'recipe:camera+filmRoll': { lore: 'TODO' },
  // Events — celestial
  'event:shooting-star': {
    lore: 'Shooting stars appear randomly in the space around the prairie. Most pass harmlessly, but some land as meteorites.',
  },
  'event:meteor-shower': {
    lore: 'Occasionally the sky erupts with shooting stars, all streaking from the same direction. Most land as meteorites scattered across the prairie.',
  },
  'event:satellite-impact': {
    lore: 'Failing mechanical devices from both this world and beyond. Who knows what you might find?',
  },
  'event:angel': { lore: 'Flaming orreries of eyes encrusted in feather and wheel.' },
  // Events — flora
  'event:clover-growth': {
    lore: 'When bees settle on a clover patch, the clover begins to grow in spiraling patterns across the dirt. The more bees tend a patch, the faster it spreads.',
  },
  'event:flora-death': {
    lore: 'Flora needs both light and water to survive. Without them it slowly browns, then blinks red in distress, turns black, and finally decomposes back into the earth — enriching the soil as it goes. Every native species follows the same path.',
  },
  // Events — lightning
  'event:lightning-strike': {
    lore: 'Lightning strikes the prairie during storms. Rain, high humidity, and strong wind all increase the chance. The bolt is brief but unmistakable — the whole sky flashes white.',
  },
  'event:wildfire': {
    lore: 'When lightning strikes dry flora, fire spreads to neighboring patches. The drier the plants, the farther it burns. Wet flora resists ignition. The fire enriches the soil as it passes.',
  },
  // Events — Torchbearer (RP-9b). Lore is human-authored; both
  // entries land with TODO placeholders pending prose.
  'event:torchbearer-walk': { lore: 'TODO' },
  'event:torchbearer-refused': { lore: 'TODO' },
  'event:lightning-attraction': {
    lore: 'High ground draws lightning down from the clouds. Water-soaked earth conducts the charge — tiles near ponds and rivers are struck more often. Metal objects left on the ground act as conductors — meteorites attract bolts. A lone beehive standing in open dirt is a target — isolated tall features on flat terrain invite strikes. Flora fields conduct slightly better than bare dirt.',
    hints: [
      {
        prompt: 'How to protect clover',
        answer: 'Keep fields hydrated. Wet clover resists ignition. Remove metal objects from valuable patches.',
      },
    ],
  },
  // Events — divination
  'event:hexagram-cast': {
    lore: 'Three ancient coins, tossed six times. Each toss builds a line — solid or broken, stable or changing. The hexagram that forms speaks in the language of the prairie. Listen closely.',
    hints: [
      { prompt: 'How to cast', answer: 'Collect 3 glinting coins and press [c] on the overworld.' },
      {
        prompt: 'Changing lines',
        answer: 'Old yin (6) and old yang (9) are changing lines. They transform the hexagram into a second reading.',
      },
    ],
  },
  'event:glint-zone': { lore: 'Glinting light cast from the local star. Recharges coins.' },
  // Events — cave
  'event:cave-fog': { lore: 'TODO' },
  // Events — wind
  'event:wind-sway': { lore: 'TODO' },
  'event:pollen': { lore: 'TODO' },
  // Events — endgame
  'event:rescue-coyote': { lore: 'TODO' },
  'event:steward-sealed': { lore: 'TODO' },
  // Events — RP-17 (autonomous flora spread + ceremony + pollination)
  // Lore is human-authored only; placeholders land here so recordDiscovery
  // surfaces the entries on first trigger.
  'event:flora-spread': { lore: 'TODO' },
  'event:ceremony-cast': { lore: 'TODO' },
  'event:cross-pollinated': { lore: 'TODO' },
  'event:lineage-overlay-toggled': { lore: 'TODO' },
  'event:wildflower-growth': { lore: 'TODO' },
  'event:tallgrass-growth': { lore: 'TODO' },
}

// RP-69 — register MANUAL_LORE slots for the twelve Whine ghosts at
// module-load time. Each entry is a TODO placeholder so the character-
// entry auto-derivation in buildCharacterEntries surfaces the ghost
// with a recognizable name; lore is human-authored later per the
// lore-authoring rule.
const WHINE_GHOST_COUNT_FOR_MANUAL = 12
for (let n = 1; n <= WHINE_GHOST_COUNT_FOR_MANUAL; n++) {
  const id = `character:whine-ghost-${n.toString().padStart(2, '0')}`
  MANUAL_LORE[id] = { lore: 'TODO' }
}

// --- Lore lookup for UI components ---

export const getLore = (key: string): string => MANUAL_LORE[key]?.lore ?? ''

export const getHints = (key: string): ManualHint[] => MANUAL_LORE[key]?.hints ?? []

// RP-21 — optional half-Voynich flag for manual entries.
export const getGlitched = (key: string): boolean | undefined => MANUAL_LORE[key]?.glitched

// --- Category mapping ---

const itemCategoryToManualCategory = (cat: ItemCategory): ManualCategory => {
  switch (cat) {
    case ItemCategory.Fauna:
    case ItemCategory.Flora:
    case ItemCategory.Seed:
    case ItemCategory.Zoogenic:
      return ManualCategory.Life
    case ItemCategory.CelestialDebris:
      return ManualCategory.Celestial
    case ItemCategory.Tool:
    case ItemCategory.Gizmo:
    case ItemCategory.Artifact:
      return ManualCategory.Object
    default:
      return ManualCategory.Object
  }
}

// --- Builder functions ---

// Items that exist in the inventory but should not generate their own
// manual entry — typically because a richer entry exists elsewhere (the
// clover item is documented via the flora:clover species entry).
const MANUAL_HIDDEN_ITEM_IDS: ReadonlySet<string> = new Set(['clover'])

// When a hidden item is referenced by another entry's crossRefs (e.g. a
// recipe ingredient), the cross-ref redirects to the alternate manual
// entry that documents the same concept.
const MANUAL_ITEM_REDIRECTS: Record<string, string> = {
  clover: 'flora:clover',
}

const itemCrossRefId = (itemId: string): string => {
  const redirect = MANUAL_ITEM_REDIRECTS[itemId]
  return redirect ?? `item:${itemId}`
}

const buildItemEntries = (): ManualEntry[] =>
  Object.values(ITEM_DEFINITIONS)
    .filter(def => !MANUAL_HIDDEN_ITEM_IDS.has(def.id))
    .map(def => {
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
        glitched: loreData?.glitched,
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
      crossRefs: recipe.ingredients.map(itemCrossRefId),
      unlockKey: `recipe:${key}`,
      sourceKind: 'recipe',
      glitched: loreData?.glitched,
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
      glitched: loreData?.glitched,
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
      glitched: loreData?.glitched,
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

// --- Manual-only entries (zones, events, ghosts) ---
//
// Skeletons hold structural metadata only — id, glyph, color, unlock key,
// cross-refs. Lore and hints come from MANUAL_LORE via the same lookup the
// auto-builders use. To author lore for one of these, add an entry to
// MANUAL_LORE keyed by the skeleton's id.

type ManualOnlySkeleton = Omit<ManualEntry, 'lore' | 'hints'>

const MANUAL_ONLY_SKELETONS: ManualOnlySkeleton[] = [
  {
    id: 'character:ghosts',
    name: 'Ghosts',
    category: ManualCategory.Person,
    glyph: 'ö',
    glyphColor: '#FFFFFF',
    unlockKey: 'character:ghost-1',
    sourceKind: 'character',
  },
  {
    id: 'zone:overworld',
    name: 'The Prairie',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.Dirt],
    glyphColor: TILE_COLORS[TileType.Dirt],
    unlockKey: 'always',
    sourceKind: 'zone',
  },
  {
    id: 'zone:cave',
    name: 'The Cave',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.CaveEntrance],
    glyphColor: TILE_COLORS[TileType.CaveEntrance],
    unlockKey: 'zone:cave',
    sourceKind: 'zone',
  },
  {
    // RP-33 — the little house. Discovery key is 'zone:house',
    // recorded by enterHouse on first entry. Since the player spawns
    // inside the house at tenure start, this entry unlocks naturally
    // on the very first frame.
    id: 'zone:house',
    name: 'The Little House',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.HouseEntrance],
    glyphColor: TILE_COLORS[TileType.HouseEntrance],
    unlockKey: 'zone:house',
    sourceKind: 'zone',
  },
  {
    // RP-37 — the Knot Cellar. Discovered the first time the steward
    // enters via the back-yard bulkhead OR awakens here at the end of
    // a Revery, whichever fires first. The cellar is the architectural
    // cognate of the Revery: above sleeps the present, below sleeps
    // the past.
    id: 'zone:knotCellar',
    name: 'The Knot Cellar',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.CellarBulkhead],
    glyphColor: TILE_COLORS[TileType.CellarBulkhead],
    unlockKey: 'zone:knotCellar',
    sourceKind: 'zone',
  },
  {
    id: 'event:cave-fog',
    name: 'Cave Darkness',
    category: ManualCategory.Zone,
    glyph: '#',
    glyphColor: '#444444',
    unlockKey: 'zone:cave',
    sourceKind: 'event',
  },
  {
    id: 'zone:ruin-dormant-garden',
    name: 'Dormant Garden',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.RuinAqueduct],
    glyphColor: TILE_COLORS[TileType.RuinAqueduct],
    unlockKey: 'zone:ruin-dormant-garden',
    sourceKind: 'zone',
  },
  {
    // RP-69 — Whine, Haunted Village. Unlocked on first Whine enter
    // via recordDiscovery('zone:whine') in enterWhineVillage.
    id: 'zone:whine',
    name: 'Whine, Haunted Village',
    category: ManualCategory.Zone,
    glyph: TILE_CHARS[TileType.WhineEntrance],
    glyphColor: TILE_COLORS[TileType.WhineEntrance],
    unlockKey: 'zone:whine',
    sourceKind: 'zone',
  },
  {
    id: 'event:shooting-star',
    name: 'Shooting Star',
    category: ManualCategory.Celestial,
    glyph: '*',
    glyphColor: '#FFFFFF',
    unlockKey: 'always',
    sourceKind: 'event',
  },
  {
    id: 'event:meteor-shower',
    name: 'Meteor Shower',
    category: ManualCategory.Celestial,
    glyph: '*',
    glyphColor: '#FFD700',
    unlockKey: 'event:meteor-shower',
    sourceKind: 'event',
  },
  {
    id: 'event:clover-growth',
    name: 'Clover Growth',
    category: ManualCategory.Life,
    glyph: '%',
    glyphColor: '#90EE90',
    unlockKey: 'event:clover-growth',
    sourceKind: 'event',
  },
  {
    id: 'event:flora-death',
    name: 'Flora Death',
    category: ManualCategory.Life,
    glyph: '%',
    glyphColor: '#8B6914',
    unlockKey: 'event:flora-death',
    sourceKind: 'event',
  },
  // Flora species — one entry per species. The Latin binomials and
  // visual identity come from FLORA_SPECIES (src/engine/flora/species.ts).
  // Per cosmology doctrine the prairie is a fragment of Earth, so native
  // flora carry real binomials.
  {
    id: 'flora:clover',
    name: 'Clover (Trifolium repens)',
    category: ManualCategory.Life,
    glyph: '%',
    glyphColor: '#50C878',
    unlockKey: 'flora:clover',
    sourceKind: 'manual-only',
  },
  {
    id: 'flora:wildflower',
    name: 'Purple Coneflower (Echinacea purpurea)',
    category: ManualCategory.Life,
    glyph: '*',
    glyphColor: '#D85FB7',
    unlockKey: 'flora:wildflower',
    sourceKind: 'manual-only',
  },
  {
    id: 'flora:tallGrass',
    name: 'Big Bluestem (Andropogon gerardii)',
    category: ManualCategory.Life,
    glyph: '"',
    glyphColor: '#A89968',
    unlockKey: 'flora:tallGrass',
    sourceKind: 'manual-only',
  },
  {
    id: 'event:hexagram-cast',
    name: 'Hexagram Casting',
    category: ManualCategory.Object,
    glyph: '¤',
    glyphColor: COIN_GLINTING_COLOR,
    unlockKey: 'event:hexagram-cast',
    sourceKind: 'event',
  },
  {
    id: 'event:lightning-strike',
    name: 'Lightning Strike',
    category: ManualCategory.Celestial,
    glyph: '|',
    glyphColor: '#FFFFFF',
    unlockKey: 'event:lightning-strike',
    sourceKind: 'event',
    crossRefs: ['event:wildfire', 'event:lightning-attraction'],
  },
  {
    id: 'event:wildfire',
    name: 'Wildfire',
    category: ManualCategory.Life,
    glyph: '^',
    glyphColor: '#FF4500',
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
    unlockKey: 'event:lightning-strike',
    sourceKind: 'event',
    crossRefs: ['event:lightning-strike', 'event:wildfire'],
  },
  {
    id: 'event:glint-zone',
    name: 'Glinting Zone',
    category: ManualCategory.Zone,
    glyph: '\u2726',
    glyphColor: '#C9B037',
    unlockKey: 'event:glint-zone',
    sourceKind: 'event',
  },
  {
    id: 'event:wind-sway',
    name: 'Flora Sway',
    category: ManualCategory.Life,
    glyph: '%',
    glyphColor: '#90EE90',
    unlockKey: 'event:wind-sway',
    sourceKind: 'event',
  },
  {
    id: 'event:pollen',
    name: 'Pollen',
    category: ManualCategory.Life,
    glyph: '.',
    glyphColor: '#b07fc7',
    unlockKey: 'event:pollen',
    sourceKind: 'event',
  },
  {
    id: 'event:angel',
    name: 'Angel',
    category: ManualCategory.Celestial,
    glyph: 'O',
    glyphColor: '#FFFFFF',
    unlockKey: 'event:angel',
    sourceKind: 'event',
  },
  {
    id: 'event:satellite-impact',
    name: 'Satellite Impact',
    category: ManualCategory.Celestial,
    glyph: '░',
    glyphColor: '#FF4444',
    unlockKey: 'event:satellite-impact',
    sourceKind: 'event',
  },
  {
    id: 'event:rescue-coyote',
    name: 'Coyote Rescue',
    category: ManualCategory.Person,
    glyph: 'C',
    glyphColor: '#D4A054',
    unlockKey: 'event:rescue-coyote',
    sourceKind: 'event',
    crossRefs: ['character:coyote', 'zone:ruin-dormant-garden'],
  },
  {
    id: 'event:steward-sealed',
    name: 'Steward Sealed',
    category: ManualCategory.Person,
    glyph: 'G',
    glyphColor: '#FFFFFF',
    unlockKey: 'event:steward-sealed',
    sourceKind: 'event',
    crossRefs: ['character:gron', 'recipe:bee+clover'],
  },
  // RP-9b — Torchbearer controlled-burn events
  {
    id: 'event:torchbearer-walk',
    name: 'The Line Was Walked',
    category: ManualCategory.Life,
    glyph: 'M',
    glyphColor: '#E58A1E',
    unlockKey: 'event:torchbearer-walk',
    sourceKind: 'event',
    crossRefs: ['character:moab'],
  },
  {
    id: 'event:torchbearer-refused',
    name: 'The Line Was Refused',
    category: ManualCategory.Life,
    glyph: 'M',
    glyphColor: '#3D2B1F',
    unlockKey: 'event:torchbearer-refused',
    sourceKind: 'event',
    crossRefs: ['character:moab'],
  },
  // RP-17 — autonomous flora spread, bee+clover ceremony,
  // bee-mediated cross-pollination, lineage overlay. recordDiscovery
  // fires for each of these in engine code; skeletons surface them in
  // the manual UI. Lore stubs already exist in MANUAL_LORE as TODO.
  {
    id: 'event:flora-spread',
    name: 'Flora Spread',
    category: ManualCategory.Life,
    glyph: '%',
    glyphColor: '#90EE90',
    unlockKey: 'event:flora-spread',
    sourceKind: 'event',
  },
  {
    id: 'event:ceremony-cast',
    name: 'Prairie Ceremony',
    category: ManualCategory.Life,
    glyph: '%',
    glyphColor: '#50C878',
    unlockKey: 'event:ceremony-cast',
    sourceKind: 'event',
    crossRefs: ['recipe:bee+clover', 'flora:clover'],
  },
  {
    id: 'event:cross-pollinated',
    name: 'Cross-Pollination',
    category: ManualCategory.Life,
    glyph: '*',
    glyphColor: '#FFD700',
    unlockKey: 'event:cross-pollinated',
    sourceKind: 'event',
    crossRefs: ['item:bee', 'event:pollen'],
  },
  {
    id: 'event:lineage-overlay-toggled',
    name: 'Lineage Overlay',
    category: ManualCategory.Life,
    glyph: '%',
    glyphColor: '#90EE90',
    unlockKey: 'event:lineage-overlay-toggled',
    sourceKind: 'event',
  },
  {
    id: 'event:wildflower-growth',
    name: 'Wildflower Growth',
    category: ManualCategory.Life,
    glyph: '*',
    glyphColor: '#D85FB7',
    unlockKey: 'event:wildflower-growth',
    sourceKind: 'event',
    crossRefs: ['flora:wildflower'],
  },
  {
    id: 'event:tallgrass-growth',
    name: 'Tall Grass Growth',
    category: ManualCategory.Life,
    glyph: '"',
    glyphColor: '#A89968',
    unlockKey: 'event:tallgrass-growth',
    sourceKind: 'event',
    crossRefs: ['flora:tallGrass'],
  },
]

const buildManualOnlyEntries = (): ManualEntry[] =>
  MANUAL_ONLY_SKELETONS.map(skel => ({
    ...skel,
    lore: getLore(skel.id),
    hints: getHints(skel.id),
    glitched: getGlitched(skel.id),
  }))

// --- Registry assembly ---

export const MANUAL_ENTRIES: Record<string, ManualEntry> = Object.fromEntries(
  [
    ...buildItemEntries(),
    ...buildRecipeEntries(),
    ...buildCharacterEntries(),
    ...buildWorldEntityEntries(),
    ...buildControlEntries(),
    ...buildManualOnlyEntries(),
  ].map(entry => [entry.id, entry])
)

// --- Egregore manual entries (RP-8a) ---
//
// Egregore entries are per-tile and dynamic — they depend on
// state.egregorePositions which is set during genesis. They cannot
// live in the module-level MANUAL_ENTRIES constant. Callers (e.g.
// ManualPanel) merge these with the static entries at render time.
//
// Each egregore tile produces one entry whose name, lore body, and
// optional Latin pierce are sampled deterministically per position
// from the egregore.ts allowlists. The entry's manual category is
// ManualCategory.Egregore. The unlockKey is `egregore:{x},{y}` so
// recordDiscovery can target a specific tile when the player first
// sees it.

export const egregoreUnlockKey = (x: number, y: number): string => `egregore:${String(x)},${String(y)}`

/**
 * Parse the id of an egregore manual entry back into its tile position
 * and return the Latin pierce word (if any) that should render in ASCII
 * font, leaving the surrounding EVA tokens to render in Voynich. Null
 * means the entry has no pierce — the whole lore renders in Voynich.
 */
export const getEgregoreLatinPierceForEntry = (entryId: string): string | null => {
  const match = /^egregore:(-?\d+),(-?\d+)$/.exec(entryId)
  if (!match) return null
  const x = Number(match[1])
  const y = Number(match[2])
  // Re-import in this scope would create a cycle; instead require the
  // caller to already know the pierce by re-deriving it from egregore.ts.
  // For ergonomics, expose via egregore.ts directly:
  return getEgregoreLatinPierce(x, y)
}

// RP-8b — once the player has discovered any native flora species
// (via the permacomputer scan, etc.), every egregore manual entry gains
// a Voynich footnote line. The cosmology refuses the question the
// player has started asking; the doctrine reads it as "no compatible
// regions" but the rendered tokens are pure EVA — players see Voynich,
// not English.
export const hasAnyNativeFloraDiscovery = (state: GameState): boolean => {
  for (const id of state.manualDiscoveries) {
    if (id.startsWith('flora:')) return true
  }
  return false
}

// RP-22 — region manual entries. One per detected NamedRegion (except
// the prairie fallback, which is the background and not surfaced as a
// browsable entry). Discovery-gated via `region:{regionId}` keys in
// state.manualDiscoveries; the proximity hook in movement.ts writes
// those keys.
export const getRegionManualEntries = (state: GameState): ManualEntry[] => {
  const entries: ManualEntry[] = []
  for (const region of state.namedRegions) {
    if (region.kind === 'prairie') continue
    const id = `region:${region.id}`
    entries.push({
      id,
      name: capitalizeName(region.name),
      category: ManualCategory.Region,
      glyph: '~',
      glyphColor: '#A0A0A0',
      // Lore is human-authored; the chronicle subsection in ManualPanel
      // is the dynamic content. Per the repo policy in CLAUDE.md, never
      // author lore prose — keep this as a TODO until a human writes it.
      lore: 'TODO',
      hints: [],
      unlockKey: id,
      sourceKind: 'manual-only',
    })
  }
  return entries
}

const capitalizeName = (s: string): string => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1))

export const getEgregoreManualEntries = (state: GameState): ManualEntry[] => {
  if (state.egregorePositions.length === 0) return []
  const showFootnote = hasAnyNativeFloraDiscovery(state)
  const entries: ManualEntry[] = []
  for (const pos of state.egregorePositions) {
    const id = `egregore:${String(pos.x)},${String(pos.y)}`
    const body = getEgregoreManualBody(pos.x, pos.y)
    const glyph = getEgregoreGlyph(pos.x, pos.y)
    const lore = showFootnote ? `${body}\n${getEgregoreIncompatibilityFootnote(pos.x, pos.y).join(' ')}` : body
    // Egregore entries have no name line — per doctrine the cosmology
    // has no readable name. ManualPanel hides the name span for
    // ManualCategory.Egregore entries; this empty string keeps the
    // ManualEntry shape consistent with other categories.
    entries.push({
      id,
      name: '',
      category: ManualCategory.Egregore,
      glyph,
      glyphColor: '#B080D0',
      lore,
      hints: [],
      unlockKey: id,
      sourceKind: 'manual-only',
    })
  }
  return entries
}

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
  ManualCategory.Life,
  ManualCategory.Celestial,
  ManualCategory.Object,
  ManualCategory.Person,
  ManualCategory.Zone,
  ManualCategory.Region,
  ManualCategory.Recipe,
  ManualCategory.Control,
  // Egregoric entries last — discovered late in play, resist naming.
  ManualCategory.Egregore,
]
