import { containerHasItem } from './inventory'
import { MainQuestPhase } from './types'

import type { CharacterDefinition, GameState } from './types'

interface CharacterEntry {
  name: string
  glyph: string
  glyphColor: string
  portrait?: string
  dialog: string[]
  music?: string
  gift?: { kind: 'item'; id: string }
  postGiftDialog?: string[]
  postGift?: { kind: 'item'; id: string }
}

const CHARACTERS = {
  gron: {
    name: 'Gron',
    glyph: 'G',
    glyphColor: '#FFFFFF',
    portrait: '/gron.gif',
    // The runtime dispatcher in getCharacterDialog overrides this field for
    // Gron based on state.mainQuestPhase. The static fallback below is the
    // 'awaiting-coyote' opener — preserved for callers that don't route
    // through getCharacterDialog (legacy tests, snapshot fixtures).
    dialog: ['...', 'Oh, you must be the new steward.'],
    music: '/music/gron.mp3',
  },
  moab: {
    name: 'Moab Coldë',
    glyph: 'M',
    glyphColor: '#FFFFFF',
    dialog: ['...'],
  },
  coyote: {
    name: 'Coyote',
    glyph: 'C',
    glyphColor: '#D4A054',
    portrait: '/gron.gif',
    dialog: ['Awoo!', 'Awoo!'],
  },
  gate: {
    name: 'Gate',
    glyph: '#',
    glyphColor: '#5FD3BC',
    dialog: ['The gate is locked.'],
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

export const removeCharacterDefinition = (id: string): void => {
  // Reflect.deleteProperty avoids the no-dynamic-delete lint rule on `delete obj[key]`
  Reflect.deleteProperty(CHARACTER_DEFINITIONS, id)
}

const GRON_DIALOG_AWAITING_COYOTE: string[] = [
  '...',
  'Oh, you must be the new steward.',
  "Coyote hasn't returned from the ruins in some time...",
  'Worrisome.',
  'What is a steward without their coyote?',
]

const GRON_DIALOG_GATHERING: string[] = ['It takes one clover and one bee.']

const GRON_DIALOG_COMBINING: string[] = ['Well what are you waiting for, steward? One clover and one bee.']

const GRON_DIALOG_SEALED: string[] = ['Ahhh, yes. You are indeed the steward.', "Here, I've been saving these."]

const getGronDialog = (state: GameState): string[] => {
  switch (state.mainQuestPhase) {
    case MainQuestPhase.AwaitingCoyote:
      return GRON_DIALOG_AWAITING_COYOTE
    case MainQuestPhase.Gathering: {
      const hasBee = containerHasItem(state.backpack, 'bee')
      const hasClover = containerHasItem(state.backpack, 'clover')
      return hasBee && hasClover ? GRON_DIALOG_COMBINING : GRON_DIALOG_GATHERING
    }
    case MainQuestPhase.Sealed:
      return GRON_DIALOG_SEALED
    default:
      return GRON_DIALOG_SEALED
  }
}

export const getCharacterDialog = (state: GameState, characterId: string): string[] => {
  if (characterId === 'gron') {
    return getGronDialog(state)
  }
  const def = getCharacterDefinition(characterId)
  if (def.postGiftDialog && state.giftsReceived.has(characterId)) {
    return def.postGiftDialog
  }
  return def.dialog
}
