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
} as const satisfies Record<string, WorldEntityEntry>

export interface WorldEntityDefinition extends WorldEntityEntry {
  id: string
}

export const WORLD_ENTITY_DEFINITIONS: Record<string, WorldEntityDefinition> = Object.fromEntries(
  Object.entries(WORLD_ENTITIES).map(([key, entry]) => [key, { ...entry, id: key }])
)
