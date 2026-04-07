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
    postGiftDialog: ['...'],
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
