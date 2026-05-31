import { COIN_GLINTING_COLOR } from './constants'
import { ItemCategory } from './types'

import type { Container, ItemCategory as ItemCategoryType, ItemDefinition } from './types'

interface ItemEntry {
  name: string
  glyph: string
  glyphColor: string
  category: ItemCategoryType
  maxUses?: number
}

const ITEMS = {
  bee: {
    name: 'Bee',
    glyph: '*',
    glyphColor: '#FFD700',
    category: ItemCategory.Fauna,
  },
  clover: {
    name: 'Clover',
    glyph: '%',
    glyphColor: '#50C878',
    category: ItemCategory.Flora,
  },
  meteorite: {
    name: 'Meteorite',
    glyph: '\u2726',
    glyphColor: '#FFE4B5',
    category: ItemCategory.CelestialDebris,
  },
  honey: {
    name: 'Honey',
    glyph: '~',
    glyphColor: '#DAA520',
    category: ItemCategory.Zoogenic,
  },
  coin: {
    name: 'Coin',
    glyph: '¤',
    glyphColor: COIN_GLINTING_COLOR,
    category: ItemCategory.Tool,
  },
  // Seed items reintroduced in RP-5 as DormantGarden vault
  // payloads. Recategorized to ItemCategory.Seed and made
  // genetics-bearing in RP-11 — each seed carries a FloraGenome
  // via state.seedGenomes (uid-keyed side-table, mirrors
  // glintingCoins). Dropping a seed onto an adjacent Dirt tile
  // plants a stage-Healthy flora plant with the seed's genome.
  // milkweedSeeds remains absent (no FloraSpecies entry).
  wildflowerSeeds: {
    name: 'Wildflower Seeds',
    glyph: '*',
    glyphColor: '#D85FB7',
    category: ItemCategory.Seed,
  },
  tallGrassSeeds: {
    name: 'Tall Grass Seeds',
    glyph: '"',
    glyphColor: '#A89968',
    category: ItemCategory.Seed,
  },
  stoneTablet: {
    name: 'Stone Tablet',
    glyph: '▪',
    glyphColor: '#C2B280',
    category: ItemCategory.Artifact,
  },
  aqueductKey: {
    name: 'Aqueduct Key',
    glyph: '†',
    glyphColor: '#B87333',
    category: ItemCategory.Tool,
  },
  // Time-lapse camera (precis #23). Spawned in deep-time-regenerated
  // ruins. Two wear surfaces (RP-15): film is the reloadable consumable
  // — combine a filmRoll with the camera in the backpack to refill —
  // and body wear is permanent in v1, ticking once per archived season
  // (maxUses = 12, three game years) and gating placement at wear 1.0.
  // Repair is deferred to a follow-up backlog item; a worn-out camera
  // stays in inventory as an inert tool until then. Placed on a tile
  // to record meaningful events in the 3x3 footprint for one season.
  camera: {
    name: 'Field Camera',
    glyph: '⌖',
    glyphColor: '#FFD700',
    category: ItemCategory.Tool,
    maxUses: 12,
  },
  // N-INFO 400 film roll. Single-use loader for a camera. Spawned in
  // deep-time-regenerated ruins alongside the camera.
  filmRoll: {
    name: 'Film Roll',
    glyph: '⊐',
    glyphColor: '#C2B280',
    category: ItemCategory.Tool,
  },
} as const satisfies Record<string, ItemEntry>

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = Object.fromEntries(
  Object.entries(ITEMS).map(([key, entry]) => [key, { ...entry, id: key }])
)

export const getDefinition = (id: string): ItemDefinition => {
  const def = ITEM_DEFINITIONS[id]
  if (!def) {
    throw new Error(`unknown item definition: ${id}`)
  }
  return def
}

export const BACKPACK_WIDTH = 10
export const BACKPACK_HEIGHT = 5

export const createBackpack = (): Container => ({
  id: 'backpack',
  name: 'Backpack',
  width: BACKPACK_WIDTH,
  height: BACKPACK_HEIGHT,
  items: [],
})

export const createContainer = (id: string, name: string, width: number, height: number): Container => ({
  id,
  name,
  width,
  height,
  items: [],
})
