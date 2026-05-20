interface WorldEntityEntry {
  name: string
  glyph: string
  glyphColor: string
  category: string
  unlockKey: string
}

const WORLD_ENTITIES = {
  beehive: {
    name: 'Beehive',
    glyph: '\u2302',
    glyphColor: '#DAA520',
    category: 'fauna',
    unlockKey: 'event:beehive-built',
  },
  monarch: {
    name: 'Monarch Butterfly',
    glyph: '*',
    glyphColor: '#FF8C00',
    category: 'fauna',
    unlockKey: 'entity:monarch',
  },
  oak: {
    name: 'White Oak',
    glyph: 'O',
    glyphColor: '#6B4423',
    category: 'life',
    unlockKey: 'entity:oak',
  },
} as const satisfies Record<string, WorldEntityEntry>

export interface WorldEntityDefinition extends WorldEntityEntry {
  id: string
}

export const WORLD_ENTITY_DEFINITIONS: Record<string, WorldEntityDefinition> = Object.fromEntries(
  Object.entries(WORLD_ENTITIES).map(([key, entry]) => [key, { ...entry, id: key }])
)
