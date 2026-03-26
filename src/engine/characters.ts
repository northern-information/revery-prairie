import { posKey } from './position'

import type { Character, CharacterDefinition, Ghost } from './types'

interface CharacterEntry {
  name: string
  glyph: string
  glyphColor: string
  portrait?: string
  dialog: string[]
}

const CHARACTERS = {
  gron: {
    name: 'Gron',
    glyph: 'G',
    glyphColor: '#FFFFFF',
    portrait: '/gron.gif',
    dialog: [
      'the wind carries seeds further than you think.',
      'bees remember every flower they visit.',
      'this land was quiet before you came.',
    ],
  },
} as const satisfies Record<string, CharacterEntry>

export const CHARACTER_DEFINITIONS: Record<string, CharacterDefinition> = Object.fromEntries(
  Object.entries(CHARACTERS).map(([key, entry]) => [key, { ...entry, id: key }])
)

export const getCharacterDefinition = (id: string): CharacterDefinition => {
  const def = CHARACTER_DEFINITIONS[id]
  if (!def) {
    throw new Error(`unknown character definition: ${id}`)
  }
  return def
}

export const createGhostDefinition = (n: number): CharacterDefinition => ({
  id: `ghost-${String(n)}`,
  name: `Ghost #${String(n)}`,
  glyph: 'ö',
  glyphColor: '#FFFFFF',
  dialog: ['...', 'Oh... a steward...', '... I sure would love some clover tea.'],
})

export const registerGhosts = (ghosts: Ghost[]): void => {
  for (const ghost of ghosts) {
    const def = createGhostDefinition(ghost.number)
    CHARACTER_DEFINITIONS[def.id] = def
  }
}

export const isCharacterAt = (characters: Character[], x: number, y: number): boolean =>
  characters.some(c => c.pos.x === x && c.pos.y === y)

export const characterBlockedSet = (characters: Character[]): Set<string> => {
  const set = new Set<string>()
  for (const c of characters) {
    set.add(posKey(c.pos.x, c.pos.y))
  }
  return set
}
