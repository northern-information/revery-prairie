import type { CharacterDefinition } from './types'

interface CharacterEntry {
  name: string
  glyph: string
  glyphColor: string
  portrait?: string
  dialog: string[]
  music?: string
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
    music: '/music/gron.mp3',
  },
  moab: {
    name: 'Moab Coldë',
    glyph: 'M',
    glyphColor: '#FFFFFF',
    dialog: ['...', '...', '...fine.'],
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

export const registerGhostDefinitions = (numbers: number[]): void => {
  for (const n of numbers) {
    const def = createGhostDefinition(n)
    CHARACTER_DEFINITIONS[def.id] = def
  }
}

