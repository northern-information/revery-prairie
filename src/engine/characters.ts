import type { CharacterDefinition, GameState } from './types'

interface CharacterEntry {
  name: string
  glyph: string
  glyphColor: string
  portrait?: string
  dialog: string[]
  music?: string
  gift?: { kind: 'revery' | 'item'; id: string }
  postGiftDialog?: string[]
  postGiftAction?: (state: GameState) => void
}

const CHARACTERS = {
  gron: {
    name: 'Gron',
    glyph: 'G',
    glyphColor: '#FFFFFF',
    portrait: '/gron.gif',
    dialog: ['...'],
    music: '/music/gron.mp3',
    gift: { kind: 'revery' as const, id: 'water' },
    postGiftDialog: [
      'Your final act as steward is casting the Deep Time revery. It will initiate a controlled burn and exile you from the prairie forever. 1000 years will melt before your eyes and you will become a ghost. Plan carefully. Good stewardship means being able to let go and trust in your meritorious deeds.',
      'Are you ready to burn the prairie and leave forever?',
    ],
    postGiftAction: (state: GameState) => {
      state.reveries.push('deep-time')
    },
  },
  moab: {
    name: 'Moab Coldë',
    glyph: 'M',
    glyphColor: '#FFFFFF',
    dialog: ['...'],
    gift: { kind: 'revery' as const, id: 'fire' },
    postGiftDialog: ['...'],
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

export const getCharacterDialog = (state: GameState, characterId: string): string[] => {
  const def = getCharacterDefinition(characterId)
  if (def.postGiftDialog && state.giftsReceived.has(characterId)) {
    return def.postGiftDialog
  }
  return def.dialog
}
