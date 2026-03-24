import { ItemCategory, Rotation } from './types'

import type { Container, ItemDefinition } from './types'

type ItemEntry = Omit<ItemDefinition, 'id'>

const ITEMS = {
  bee: {
    name: 'Bee',
    description: 'a single bee',
    icon: '*',
    iconColor: '#FFD700',
    weight: 1,
    category: ItemCategory.Critter,
    shape: [[true]],
  },
  clover: {
    name: 'Clover',
    description: 'a single clover',
    icon: '%',
    iconColor: '#50C878',
    weight: 1,
    category: ItemCategory.Flora,
    shape: [[true]],
  },
  soil_sampler: {
    name: 'Soil Sampler',
    description: 'tool for testing soil composition',
    icon: '☷',
    iconColor: '#8B7355',
    weight: 3,
    category: ItemCategory.Tool,
    shape: [[true], [true]],
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

export const DEFAULT_ROTATION = Rotation.R0
