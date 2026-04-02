import { ItemCategory } from './types'

import type { Container, ItemCategory as ItemCategoryType, ItemDefinition } from './types'

interface ItemEntry {
  name: string
  description: string
  glyph: string
  glyphColor: string
  weight: number
  category: ItemCategoryType
  shape: string[]
}

const parseShape = (rows: string[]): boolean[][] => rows.map(row => Array.from(row, ch => ch === '#'))

const ITEMS = {
  bee: {
    name: 'Bee',
    description: 'a single bee',
    glyph: '*',
    glyphColor: '#FFD700',
    weight: 1,
    category: ItemCategory.Fauna,
    shape: ['#'],
  },
  clover: {
    name: 'Clover',
    description: 'a single clover',
    glyph: '%',
    glyphColor: '#50C878',
    weight: 1,
    category: ItemCategory.Flora,
    shape: ['#'],
  },
  meteorite: {
    name: 'Meteorite',
    description: 'a fallen star',
    glyph: '\u2726',
    glyphColor: '#FFE4B5',
    weight: 2,
    category: ItemCategory.CelestialDebris,
    shape: ['#'],
  },
  permacomputer: {
    name: 'Permacomputer',
    description: 'standard issue fabrication omnitool',
    glyph: '⚙',
    glyphColor: '#8B7355',
    weight: 3,
    category: ItemCategory.Gizmo,
    shape: ['##'],
  },
  omnibox: {
    name: 'Omnibox',
    description: 'a portable container',
    glyph: '\u229E',
    glyphColor: '#C0C0C0',
    weight: 4,
    category: ItemCategory.Gizmo,
    shape: ['##', '##'],
  },
  honey: {
    name: 'Honey',
    description: 'golden nectar from the hive',
    glyph: '~',
    glyphColor: '#DAA520',
    weight: 1,
    category: ItemCategory.Flora,
    shape: ['#'],
  },
  coin: {
    name: 'Coin',
    description: 'an ancient divination coin',
    glyph: '¤',
    glyphColor: '#C9B037',
    weight: 1,
    category: ItemCategory.Tool,
    shape: ['#'],
  },
} as const satisfies Record<string, ItemEntry>

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = Object.fromEntries(
  Object.entries(ITEMS).map(([key, entry]) => [key, { ...entry, id: key, shape: parseShape(entry.shape) }])
)

export const getDefinition = (id: string): ItemDefinition => {
  const def = ITEM_DEFINITIONS[id]
  if (!def) {
    throw new Error(`unknown item definition: ${id}`)
  }
  return def
}

export const createBackpack = (): Container => ({
  id: 'backpack',
  name: 'Backpack',
  width: 4,
  height: 6,
  items: [],
})

export const BACKPACK_WIDTH = 4
export const BACKPACK_HEIGHT = 6

export const createContainer = (id: string, name: string, width: number, height: number): Container => ({
  id,
  name,
  width,
  height,
  items: [],
})
