import { containerHasItem } from './inventory'
import { MainQuestPhase, MoabState, ReveryPhase, Season } from './types'

import type { CharacterDefinition, GameState } from './types'

interface CharacterEntry {
  name: string
  title?: string
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
    // Folk register, lowercase, no leading article. The drip torch is
    // the wildland-fire tool he carries when he walks the burn line.
    title: 'drip torchbearer',
    glyph: 'M',
    glyphColor: '#FFFFFF',
    // The runtime dispatcher in getCharacterDialog overrides this field
    // for Moab based on state.weather.season. The static fallback below
    // is the default (Summer/Autumn) register — preserved for callers
    // that don't route through getCharacterDialog (legacy tests,
    // snapshot fixtures). Last line is Moab's egregore refusal
    // (precis #8a). Folk register; never names the egregores directly.
    // Folk name: "the other clover". Different from the ghost's folk
    // name on purpose — no two NPCs agree on a name per v3 doctrine.
    dialog: ['...', 'The other clover. We do not grow that.'],
    music: '/music/moab.mp3',
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

// Ghost #0 carries the egregore refusal line (precis #8a). Folk name:
// "the Far Garden" — distinct from Moab's "the other clover" so the
// folk-name divergence rule from v3 doctrine is observable on a
// single playthrough.
const GHOST_DIALOGS_BY_INDEX: Record<number, string[]> = {
  0: ['...', 'Oh... a steward...', 'The Far Garden. We do not go there.'],
}

const DEFAULT_GHOST_DIALOG = ['...', 'Oh... a steward...', '... I sure would love some clover tea.']

export const createGhostDefinition = (n: number): CharacterDefinition => ({
  id: `ghost-${String(n)}`,
  name: `Ghost #${String(n)}`,
  glyph: 'ö',
  glyphColor: '#FFFFFF',
  dialog: GHOST_DIALOGS_BY_INDEX[n] ?? DEFAULT_GHOST_DIALOG,
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

// Precis #32 — Gron's line at the solstice summons. Lore TODO per
// project doctrine (feedback_no_write_lore + v4 R5 / v6 R5 Gron register
// locks: statements not questions, no contractions, no editorial affect,
// no opinion of the steward, music precedes arrival). Humans author the
// real line later.
const GRON_DIALOG_SOLSTICE_SUMMONS: string[] = ['TODO: solstice summons dialog']

const getGronDialog = (state: GameState): string[] => {
  // Precis #32 — summons takes precedence over the main quest branches.
  // Returned when the active Revery is a pressure-ceiling-path summons
  // and the phase is still Omen (i.e. Gron has just teleported in).
  if (state.revery?.summons === true && state.revery.phase === ReveryPhase.Omen) {
    return GRON_DIALOG_SOLSTICE_SUMMONS
  }
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

// Moab the drip torchbearer speaks in three seasonal registers (precis #9a).
// Folk-Coldë voice rules: no contractions, statements not questions, no
// direct address by title, no editorial affect. Every register's last
// line is the precis #8a egregore refusal, preserved verbatim.
const MOAB_DIALOG_WINTER: string[] = [
  '...',
  'The line waits.',
  'The other clover. We do not grow that.',
]

const MOAB_DIALOG_SPRING: string[] = [
  'The thaw.',
  'The line is where the winter put it.',
  'The other clover. We do not grow that.',
]

const MOAB_DIALOG_DEFAULT: string[] = ['...', 'The other clover. We do not grow that.']

// Precis #9b — registers used while Moab is mid-cycle. moabState
// overrides season-routing when he is Walking, Refusing, or Dismissed.
const MOAB_DIALOG_WALKING: string[] = [
  'The line is where the winter put it.',
  'Walk with me.',
  'The other clover. We do not grow that.',
]

const MOAB_DIALOG_REFUSING: string[] = [
  'No.',
  'Not this line. Not this thaw.',
  'The other clover. We do not grow that.',
]

const MOAB_DIALOG_DISMISSED: string[] = [
  '...',
  'The line stays where the winter put it.',
  'The other clover. We do not grow that.',
]

const getMoabDialog = (state: GameState): string[] => {
  // Precis #9b — moabState overrides seasonal routing during the cycle.
  if (state.moabState === MoabState.Walking) return MOAB_DIALOG_WALKING
  if (state.moabState === MoabState.Refusing) return MOAB_DIALOG_REFUSING
  if (state.moabState === MoabState.Dismissed) return MOAB_DIALOG_DISMISSED
  switch (state.weather.season) {
    case Season.Winter:
      return MOAB_DIALOG_WINTER
    case Season.Spring:
      return MOAB_DIALOG_SPRING
    case Season.Summer:
    case Season.Autumn:
      return MOAB_DIALOG_DEFAULT
    default:
      return MOAB_DIALOG_DEFAULT
  }
}

export const getCharacterDialog = (state: GameState, characterId: string): string[] => {
  if (characterId === 'gron') {
    return getGronDialog(state)
  }
  if (characterId === 'moab') {
    return getMoabDialog(state)
  }
  const def = getCharacterDefinition(characterId)
  if (def.postGiftDialog && state.giftsReceived.has(characterId)) {
    return def.postGiftDialog
  }
  return def.dialog
}
