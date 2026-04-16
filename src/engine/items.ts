import { COIN_GLINTING_COLOR } from './constants'
import { ItemCategory } from './types'

import type { Container, ItemCategory as ItemCategoryType, ItemDefinition } from './types'

interface ItemEntry {
  name: string
  description: string
  glyph: string
  glyphColor: string
  category: ItemCategoryType
}

const ITEMS = {
  bee: {
    name: 'Bee',
    description: 'a single bee',
    glyph: '*',
    glyphColor: '#FFD700',
    category: ItemCategory.Fauna,
  },
  clover: {
    name: 'Clover',
    description: 'a single clover',
    glyph: '%',
    glyphColor: '#50C878',
    category: ItemCategory.Flora,
  },
  meteorite: {
    name: 'Meteorite',
    description: 'a fallen star',
    glyph: '\u2726',
    glyphColor: '#FFE4B5',
    category: ItemCategory.CelestialDebris,
  },
  honey: {
    name: 'Honey',
    description: 'golden nectar from the hive',
    glyph: '~',
    glyphColor: '#DAA520',
    category: ItemCategory.Flora,
  },
  coin: {
    name: 'Coin',
    description: 'an ancient divination coin',
    glyph: '¤',
    glyphColor: COIN_GLINTING_COLOR,
    category: ItemCategory.Tool,
  },
  wildflowerSeeds: {
    name: 'Wildflower Seeds',
    description: 'a handful of dormant prairie wildflower seeds',
    glyph: '·',
    glyphColor: '#DA70D6',
    category: ItemCategory.Seed,
  },
  tallGrassSeeds: {
    name: 'Tall Grass Seeds',
    description: 'seeds from grasses that once grew taller than a person',
    glyph: '·',
    glyphColor: '#8FBC8F',
    category: ItemCategory.Seed,
  },
  milkweedSeeds: {
    name: 'Milkweed Seeds',
    description: 'silky seeds that monarchs once depended on',
    glyph: '·',
    glyphColor: '#F5DEB3',
    category: ItemCategory.Seed,
  },
  stoneTablet: {
    name: 'Stone Tablet',
    description: 'an inscribed fragment from the old world',
    glyph: '▪',
    glyphColor: '#C2B280',
    category: ItemCategory.Artifact,
  },
  aqueductKey: {
    name: 'Aqueduct Key',
    description: 'a copper fitting from an ancient water system',
    glyph: '†',
    glyphColor: '#B87333',
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
export const BACKPACK_HEIGHT = 100

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
