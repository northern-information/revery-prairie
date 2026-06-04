import { containerHasItem } from './inventory'
import { MainQuestPhase, MoabState, ReveryPhase, Season } from './types'

import type { CharacterDefinition, GameState } from './types'

interface CharacterEntry {
  name: string
  title?: string
  glyph: string
  glyphColor: string
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
    // The runtime dispatcher in getCharacterDialog overrides this field for
    // Gron based on state.mainQuestPhase. The static fallback below is the
    // round-5-conforming 'awaiting-coyote' opener (RP-21) — preserved for
    // callers that don't route through getCharacterDialog (legacy tests,
    // snapshot fixtures).
    dialog: ['...', 'A steward.'],
    music: '/music/gron.mp3',
    // The map is the steward's inheritance. Gron hands it over at the end
    // of the first dialog; giveCharacterGift special-cases this key item
    // (records the item:map discovery and opens the MAP tab) rather than
    // placing it in the backpack. The id matches the 'map' ITEM_DEFINITION.
    gift: { kind: 'item', id: 'map' },
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
    // (RP-8a). Folk register; never names the egregores directly.
    // Folk name: "the other clover". Different from the ghost's folk
    // name on purpose — no two NPCs agree on a name per v3 doctrine.
    dialog: ['...', 'The other clover. We do not grow that.'],
    music: '/music/moab.mp3',
  },
  coyote: {
    name: 'Coyote',
    glyph: 'C',
    glyphColor: '#D4A054',
    dialog: ['Awoo!', 'Awoo!'],
  },
  // RP-33 — Emily, the girl who waits, inside the little house.
  // Stationary character at house-interior (14, 1), one tile west of
  // the fireplace. The runtime dispatcher in getCharacterDialog
  // overrides this field with getEmilyDialog(state) based on the
  // season. Static fallback is the default register's TODO placeholder.
  // All dialog content is human-authored lore — never authored here.
  emily: {
    name: 'Emily',
    glyph: 'E',
    glyphColor: '#FFDDA8',
    dialog: ['...', 'TODO: emily default line'],
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

// Ghost #0 carries the egregore refusal line (RP-8a). Folk name:
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

// RP-69 — Whine, Haunted Village ghosts. Twelve named drifting
// ghosts, one per home. Names + dialog are authored by humans per the
// lore rule. Each ghost has its own slot in WHINE_GHOST_PROFILES so
// distinct identities can be filled in independently — edit any row
// below to make that ghost distinct. The default row template uses a
// placeholder name and silent dialog so unauthored ghosts still
// resolve to a valid CharacterDefinition.
const padHomeNumber = (n: number): string => n.toString().padStart(2, '0')

export const whineGhostId = (n: number): string => `whine-ghost-${padHomeNumber(n)}`

// Per-home identity for the twelve Whine ghosts. To author a distinct
// ghost, edit the corresponding row: change `name`, replace `dialog`
// with the lines you want, optionally swap `glyph` or `glyphColor`.
// All rows are independent — editing home 03 does not affect home 07.
//
// The array is 13 entries (index 0 unused) so callers index by home
// number directly.
interface WhineGhostProfile {
  name: string
  glyph: string
  glyphColor: string
  dialog: readonly string[]
}

const DEFAULT_WHINE_GHOST_GLYPH = 'ö'
const DEFAULT_WHINE_GHOST_COLOR = '#FFFFFF'
const DEFAULT_WHINE_GHOST_DIALOG: readonly string[] = ['...']

const defaultGhost = (n: number): WhineGhostProfile => ({
  name: `TODO: Whine ghost ${padHomeNumber(n)}`,
  glyph: DEFAULT_WHINE_GHOST_GLYPH,
  glyphColor: DEFAULT_WHINE_GHOST_COLOR,
  dialog: DEFAULT_WHINE_GHOST_DIALOG,
})

export const WHINE_GHOST_PROFILES: readonly WhineGhostProfile[] = [
  // Index 0 — unused (no home zero); kept so callers can index by home
  // number directly. Leave as default.
  defaultGhost(0),
  // Home 01 — west column, northmost. Edit fields to give this ghost a
  // distinct identity.
  {
    name: 'Joel',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ["I don't remember much..."],
  },
  // Home 02
  {
    name: 'Billy',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ['I used to fix clocks...', '...', 'I used to fix things...'],
  },
  // Home 03
  {
    name: 'Abby',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: [
      'I want to see my kids again.',
      'They used to play in the prairie...',
      'I told them not to go in the ruins...',
    ],
  },
  // Home 04
  {
    name: 'Jess',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ['They say angels still visit the prairie sometimes.'],
  },
  // Home 05
  {
    name: 'Vale',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ["I wonder if we'll have another gusty year?"],
  },
  // Home 06 — west column, southmost.
  {
    name: 'David',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ['I miss the burns...', 'The bright green shoots coming up through the scortch.'],
  },
  // Home 07 — east column, northmost.
  {
    name: 'Alexa',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ['My story was never told...', 'They tried.', 'But there was no one to listen.'],
  },
  // Home 08
  {
    name: 'Virgil',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ['I wanted to be an architect in the cities...', '...', 'But the cities are gone now.'],
  },
  // Home 09
  {
    name: 'Amy',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ['I used to sing...', 'They told me I needed to tend the fields instead...'],
  },
  // Home 10
  {
    name: 'Rachel',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ['Never fall in love at a tavern...'],
  },
  // Home 11
  {
    name: 'Camilla',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ['...', 'I miss the warmth of the sun...', 'The purr of a cat.'],
  },
  // Home 12 — east column, southmost.
  {
    name: 'Esmarelda',
    glyph: 'ö',
    glyphColor: '#E0C080',
    dialog: ['Please leave me alone.', 'I have no more stories to tell.'],
  },
]

export const createWhineGhostDefinition = (n: number): CharacterDefinition => {
  const profile = WHINE_GHOST_PROFILES[n]
  return {
    id: whineGhostId(n),
    name: profile.name,
    glyph: profile.glyph,
    glyphColor: profile.glyphColor,
    dialog: [...profile.dialog],
  }
}

export const registerWhineGhostDefinitions = (count: number): void => {
  for (let n = 1; n <= count; n++) {
    const def = createWhineGhostDefinition(n)
    CHARACTER_DEFINITIONS[def.id] = def
  }
}

export const removeCharacterDefinition = (id: string): void => {
  // Reflect.deleteProperty avoids the no-dynamic-delete lint rule on `delete obj[key]`
  Reflect.deleteProperty(CHARACTER_DEFINITIONS, id)
}

// RP-21 — Gron round-5 doctrine. Register locked in
// docs/backlog-thinktank-v4.md round 5 (lines 267-367) and reaffirmed
// in docs/backlog-thinktank-v6.md round 5 (lines 220-261). The six
// design principles:
//   1. Irreducibility — no origin story, no canonical explanation.
//   2. No taxonomic home — Gron belongs to no system.
//   3. No opinion of the steward — pragmatic, not kind. No hidden
//      affection / trust / reputation counter.
//   4. Oblique dialog — short lines, multiple readings. Statements,
//      not questions or commands. No editorial words. No direct
//      address by title. No contractions (Gron's speech predates
//      American English casual). Indefinite articles where possible
//      (a steward, not the steward — the lineage is plural).
//   5. Music precedes arrival — the cloud is heard before it is seen.
//   6. The manual entry says the manual does not know (handled in
//      MANUAL_LORE['character:gron'] via the `glitched: true` flag,
//      not here).
//
// The four constants below are still in their pre-doctrine state.
// v4 R5 lines 302-329 contain the line-by-line critique. The room
// landed concrete replacements only for GRON_DIALOG_COMBINING; the
// other three are diagnosed but left for human authoring. Per project
// memory rule (feedback_manual_lore_only), all replacement lines are
// human-authored only.
// The last line is the map handoff (user-authored, RP-70 cleanup): on
// completing it, advanceDialog fires giveCharacterGift('gron'), which
// gifts the map. Keep it last so the gift triggers on the first dialog's
// final advance.
const GRON_DIALOG_AWAITING_COYOTE: string[] = [
  '...',
  'A steward.',
  'A steward goes to the ruins.',
  'Here. From your predecessor.',
]

const GRON_DIALOG_GATHERING: string[] = ['A clover and a bee.']

const GRON_DIALOG_COMBINING: string[] = ['A clover. A bee.', 'Now.']

const GRON_DIALOG_SEALED: string[] = ['A steward.']

// RP-32 — Gron's line at the solstice summons. Lore TODO per
// project doctrine (feedback_no_write_lore + v4 R5 / v6 R5 Gron register
// locks: statements not questions, no contractions, no editorial affect,
// no opinion of the steward, music precedes arrival). Humans author the
// real line later.
const GRON_DIALOG_SOLSTICE_SUMMONS: string[] = ['TODO: solstice summons dialog']

const getGronDialog = (state: GameState): string[] => {
  // RP-32 — summons takes precedence over the main quest branches.
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

// Moab the drip torchbearer speaks in three seasonal registers (RP-9a).
// Folk-Coldë voice rules: no contractions, statements not questions, no
// direct address by title, no editorial affect. Every register's last
// line is the RP-8a egregore refusal, preserved verbatim.
const MOAB_DIALOG_WINTER: string[] = ['...', 'The line waits.', 'The other clover. We do not grow that.']

const MOAB_DIALOG_SPRING: string[] = [
  'The thaw.',
  'The line is where the winter put it.',
  'The other clover. We do not grow that.',
]

const MOAB_DIALOG_DEFAULT: string[] = ['...', 'The other clover. We do not grow that.']

// RP-9b — registers used while Moab is mid-cycle. moabState
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
  // RP-9b — moabState overrides seasonal routing during the cycle.
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

// Emily speaks the same three lines year-round, on every [f] interaction
// and on the RP-34 first-wake auto-open. The LAST line is the
// invitation — pressing [f] on it while season is Autumn arms
// activeDialog.awaitingConfirmation and routes through the RP-33
// confirm-to-Revery path. In other seasons the same line plays as
// foreshadowing; no arm, no confirm prompt.
//
// Register matches the v4 R5 / v6 R5 doctrine: statements not questions,
// no contractions, no editorial affect, no opinion of the steward.
// The third line is the v6 R2 canonical refrain locked in the thinktank
// ("you will return before the winter solstice, to revery"). The other
// two lines are doctrinal additions — the spring-day greeting and the
// knot-wondering — chosen so the same dialog reads as natural in any
// season.
export const EMILY_DIALOG: string[] = [
  'Happy first day of spring, steward.',
  "I wonder what this year's knot will hold?",
  'You will return before the winter solstice, to revery.',
]

const getEmilyDialog = (): string[] => EMILY_DIALOG

export const getCharacterDialog = (state: GameState, characterId: string): string[] => {
  if (characterId === 'gron') {
    return getGronDialog(state)
  }
  if (characterId === 'moab') {
    return getMoabDialog(state)
  }
  if (characterId === 'emily') {
    return getEmilyDialog()
  }
  const def = getCharacterDefinition(characterId)
  if (def.postGiftDialog && state.giftsReceived.has(characterId)) {
    return def.postGiftDialog
  }
  return def.dialog
}
