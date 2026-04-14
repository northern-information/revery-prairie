import type { GameState } from './types'

// --- Hexagram line types ---

export const LineType = {
  OldYin: 6, // broken, changing
  YoungYang: 7, // solid, stable
  YoungYin: 8, // broken, stable
  OldYang: 9, // solid, changing
} as const

export type LineType = (typeof LineType)[keyof typeof LineType]

export interface HexagramLine {
  value: LineType
  yang: boolean // true = solid, false = broken
  changing: boolean // true = old (transforms)
}

export interface HexagramDefinition {
  id: number // 1-64
  name: string
  lines: [boolean, boolean, boolean, boolean, boolean, boolean] // bottom-to-top, true=yang
  meaning: string
}

export interface CastResult {
  lines: HexagramLine[]
  primary: HexagramDefinition
  transformed: HexagramDefinition | null // non-null when changing lines exist
}

// --- Toss logic ---

const tossOneCoin = (): 2 | 3 => (Math.random() < 0.5 ? 2 : 3)

export const tossThreeCoins = (): LineType => {
  const sum = tossOneCoin() + tossOneCoin() + tossOneCoin()
  return sum as LineType
}

export const lineFromValue = (value: LineType): HexagramLine => ({
  value,
  yang: value === LineType.YoungYang || value === LineType.OldYang,
  changing: value === LineType.OldYin || value === LineType.OldYang,
})

// --- Hexagram lookup ---

const linesToKey = (lines: boolean[]): string => lines.map(l => (l ? '1' : '0')).join('')

let hexagramIndex: Map<string, HexagramDefinition> | null = null

const getIndex = (): Map<string, HexagramDefinition> => {
  if (!hexagramIndex) {
    hexagramIndex = new Map()
    for (const h of HEXAGRAMS) {
      hexagramIndex.set(linesToKey(h.lines), h)
    }
  }
  return hexagramIndex
}

export const lookupHexagram = (lines: boolean[]): HexagramDefinition => {
  const key = linesToKey(lines)
  const h = getIndex().get(key)
  if (!h) throw new Error(`no hexagram for pattern: ${key}`)
  return h
}

// --- Casting ---

export const completeCast = (lineValues: LineType[]): CastResult => {
  const lines = lineValues.map(lineFromValue)
  const primaryPattern = lines.map(l => l.yang)
  const primary = lookupHexagram(primaryPattern)

  const hasChanging = lines.some(l => l.changing)
  let transformed: HexagramDefinition | null = null
  if (hasChanging) {
    const transformedPattern = lines.map(l => {
      if (!l.changing) return l.yang
      return !l.yang // flip changing lines
    })
    transformed = lookupHexagram(transformedPattern)
  }

  return { lines, primary, transformed }
}

// --- Divined tracking ---

export const recordDivinedHexagrams = (state: GameState, result: CastResult): void => {
  state.divinedHexagrams.add(result.primary.id)
  if (result.transformed) {
    state.divinedHexagrams.add(result.transformed.id)
  }
}

// --- Trigram helpers (for 8x8 grid layout) ---

// Lower trigram = lines[0..2], upper trigram = lines[3..5]
// Each trigram is a 3-bit number (0-7) giving natural row/column indices
export const trigramIndex = (lines: boolean[], offset: number): number =>
  (lines[offset] ? 1 : 0) | (lines[offset + 1] ? 2 : 0) | (lines[offset + 2] ? 4 : 0)

// --- Glinting ---

export const getGlintingBackpackCoins = (state: GameState): string[] =>
  state.backpack.items
    .filter(item => item.definitionId === 'coin' && state.glintingCoins.has(item.uid))
    .map(item => item.uid)

export const canCast = (state: GameState): boolean => getGlintingBackpackCoins(state).length >= 3

export const consumeGlint = (state: GameState): void => {
  const uids = getGlintingBackpackCoins(state).slice(0, 3)
  for (const uid of uids) {
    state.glintingCoins.delete(uid)
  }
}

// --- ASCII rendering helpers ---

export const renderLine = (yang: boolean, changing: boolean): string => {
  if (yang && changing) return '---o---' // old yang
  if (yang) return '-------' // young yang
  if (changing) return '--- ---x' // old yin — not standard but the x helps
  return '---  ---' // young yin — not standard but the gap helps
}

export const renderHexagramAscii = (lines: boolean[]): string[] =>
  // lines are bottom-to-top, render top-to-bottom
  [...lines].reverse().map(l => (l ? '———————' : '——— ———'))

// --- 64 hexagram definitions ---
// lines: [bottom, 2, 3, 4, 5, top], true=yang(solid), false=yin(broken)

export const HEXAGRAMS: HexagramDefinition[] = [
  {
    id: 1,
    name: 'The Creative',
    lines: [true, true, true, true, true, true],
    meaning:
      'The prairie stretches unbroken to the horizon. Pure initiative — plant the first seed, break the first furrow. Everything begins with a single step into open dirt.',
  },
  {
    id: 2,
    name: 'The Receptive',
    lines: [false, false, false, false, false, false],
    meaning:
      'The soil waits without complaint. It accepts rain, seed, and root alike. Yield to the shape of things. The ground knows what it needs before you do.',
  },
  {
    id: 3,
    name: 'Difficulty at the Beginning',
    lines: [true, false, false, false, true, false],
    meaning:
      'A clover seed lodged between stones. The first push through hard ground is the hardest. Persist — the root will find its way, but not by force.',
  },
  {
    id: 4,
    name: 'Youthful Folly',
    lines: [false, true, false, false, false, true],
    meaning:
      'A bee circles the same flower three times. Not all wandering is wasted, but listen when the wind shifts. The prairie teaches those who stop to watch.',
  },
  {
    id: 5,
    name: 'Waiting',
    lines: [true, true, true, false, true, false],
    meaning:
      'Clouds gather but the rain has not come. The clover thirsts. Patience is not idleness — it is the root drinking deep before the storm.',
  },
  {
    id: 6,
    name: 'Conflict',
    lines: [false, true, false, true, true, true],
    meaning:
      'Two winds meet above the flatland and twist. When forces pull against each other, neither can grow. Step back and let the gust pass — the grass will right itself.',
  },
  {
    id: 7,
    name: 'The Army',
    lines: [false, true, false, false, false, false],
    meaning:
      'A column of ants crosses the dirt path. Small things in number become a force. Organize what you have before seeking more.',
  },
  {
    id: 8,
    name: 'Holding Together',
    lines: [false, false, false, false, true, false],
    meaning:
      'Clover grows in patches, not alone. The roots intertwine below the surface where no eye sees. Community is the hidden architecture of survival.',
  },
  {
    id: 9,
    name: 'Small Taming',
    lines: [true, true, false, true, true, true],
    meaning:
      'A light breeze bends the tallest grass. Gentle, persistent pressure shapes more than sudden force. Tend the small things daily.',
  },
  {
    id: 10,
    name: 'Treading',
    lines: [true, true, true, false, true, true],
    meaning:
      'Walking the edge where dirt meets sand. Careful steps near the boundary — the ground is solid if you know where to place your feet.',
  },
  {
    id: 11,
    name: 'Peace',
    lines: [true, true, true, false, false, false],
    meaning:
      'Rain falls on fertile soil. The clover drinks and the bees hum low. Everything is where it should be — savor this; seasons turn.',
  },
  {
    id: 12,
    name: 'Standstill',
    lines: [false, false, false, true, true, true],
    meaning:
      'The sky is bright but the earth is dry. Energy moves upward and away, leaving the roots parched. Wait — this too will reverse.',
  },
  {
    id: 13,
    name: 'Fellowship',
    lines: [true, false, true, true, true, true],
    meaning:
      'Ghosts and stewards share the same dirt. Even those who drift without purpose belong to the prairie. Walk alongside what you do not understand.',
  },
  {
    id: 14,
    name: 'Great Possession',
    lines: [true, true, true, true, false, true],
    meaning:
      'The backpack is full and honey gleams golden. Abundance carries responsibility — what you hoard rots, what you circulate grows.',
  },
  {
    id: 15,
    name: 'Modesty',
    lines: [false, false, true, false, false, false],
    meaning:
      'The deepest roots are invisible. The strongest clover grows low. Let your work speak through the soil, not the bloom.',
  },
  {
    id: 16,
    name: 'Enthusiasm',
    lines: [false, false, false, true, false, false],
    meaning:
      'A shooting star streaks across the black. That sudden spark of joy — follow it. Plant where the meteorite fell. The prairie rewards delight.',
  },
  {
    id: 17,
    name: 'Following',
    lines: [true, false, false, true, true, false],
    meaning:
      'A bee finds the clover by scent, not sight. Trust the trail even when you cannot see the destination. The path reveals itself to those in motion.',
  },
  {
    id: 18,
    name: 'Work on What Has Been Spoiled',
    lines: [false, true, true, false, false, true],
    meaning:
      'Brown clover and cracked dirt. What was neglected can be restored — cut the dead growth, enrich the soil. Decay is not the end but a turning point.',
  },
  {
    id: 19,
    name: 'Approach',
    lines: [true, true, false, false, false, false],
    meaning:
      'The cave entrance looms dark ahead. Approach with openness, not dread. What waits below the surface was always part of the prairie.',
  },
  {
    id: 20,
    name: 'Contemplation',
    lines: [false, false, false, false, true, true],
    meaning:
      'Stand still on the highest dirt tile and look out. The whole prairie is visible from here — the patterns, the gaps, the places where clover should be.',
  },
  {
    id: 21,
    name: 'Biting Through',
    lines: [true, false, false, true, false, true],
    meaning:
      'A breakable wall stands between you and the hidden chamber. Some obstacles exist to be shattered. Strike with purpose, not anger.',
  },
  {
    id: 22,
    name: 'Grace',
    lines: [true, false, true, false, false, true],
    meaning:
      'Starlight on sand. Beauty adorns the prairie without effort — the gold of honey, the green of clover. Ornament follows substance, not the reverse.',
  },
  {
    id: 23,
    name: 'Splitting Apart',
    lines: [false, false, false, false, false, true],
    meaning:
      'The coastline crumbles grain by grain. What held firm is giving way. Do not cling — let what must fall, fall. New ground forms from the debris.',
  },
  {
    id: 24,
    name: 'Return',
    lines: [true, false, false, false, false, false],
    meaning:
      'A single green shoot in blackened dirt. After the longest absence, life stirs again. The cycle has no memory of endings — only beginnings.',
  },
  {
    id: 25,
    name: 'Innocence',
    lines: [true, false, false, true, true, true],
    meaning:
      'Walk the prairie without a plan. The bee does not strategize; it follows sweetness. Act from instinct and the prairie will meet you halfway.',
  },
  {
    id: 26,
    name: 'Great Taming',
    lines: [true, true, true, false, false, true],
    meaning:
      'The backpack holds more than its shape suggests. Contain great things in small vessels. Discipline is the container; potential is the contents.',
  },
  {
    id: 27,
    name: 'Nourishment',
    lines: [true, false, false, false, false, true],
    meaning:
      'What do you feed and what feeds you? The clover feeds the bee, the bee feeds the prairie. Examine what you take in — it becomes what you put out.',
  },
  {
    id: 28,
    name: 'Great Excess',
    lines: [false, true, true, true, true, false],
    meaning:
      'The backpack groans. Too much meteorite, too little space. The beam bends under the weight of hoarding. Lighten the load before it breaks.',
  },
  {
    id: 29,
    name: 'The Abysmal',
    lines: [false, true, false, false, true, false],
    meaning:
      'Rain on rain on rain. The prairie floods and the dirt turns to mud. Danger doubled teaches you to swim. Move through the water, not around it.',
  },
  {
    id: 30,
    name: 'The Clinging',
    lines: [true, false, true, true, false, true],
    meaning:
      'Fire clings to what feeds it. The sun clings to the sky. Brightness depends on something solid to hold. Tend your fuel — illumination follows.',
  },
  {
    id: 31,
    name: 'Influence',
    lines: [false, false, true, true, true, false],
    meaning:
      'A hand touches the dirt and the dirt remembers. Every step enriches or depletes the soil. You are never not influencing the ground beneath you.',
  },
  {
    id: 32,
    name: 'Duration',
    lines: [false, true, true, true, false, false],
    meaning:
      'The prairie was here before the steward and will remain after. Endurance is not rigidity but the willingness to bend through every season and straighten again.',
  },
  {
    id: 33,
    name: 'Retreat',
    lines: [false, false, true, true, true, true],
    meaning:
      'Sometimes the wisest move is back toward the entrance. Retreat is not failure — it is choosing the ground where you are strongest.',
  },
  {
    id: 34,
    name: 'Great Power',
    lines: [true, true, true, true, false, false],
    meaning:
      'A meteor shower lights the sky. Raw power descends from above. Channel it or be struck by it — the prairie does not care which.',
  },
  {
    id: 35,
    name: 'Progress',
    lines: [false, false, false, true, false, true],
    meaning:
      'The sun rises over green fields. Each day the clover grows a little taller, a little wider. Progress is cumulative — trust the direction, not the pace.',
  },
  {
    id: 36,
    name: 'Darkening of the Light',
    lines: [true, false, true, false, false, false],
    meaning:
      'The sun drops below the flatline horizon. In the cave, no light reaches the clover. Protect what burns inside you when the world goes dark.',
  },
  {
    id: 37,
    name: 'The Family',
    lines: [true, false, true, false, true, true],
    meaning:
      'The beehive hums as one. Every worker knows its task without being told. Harmony in the small circle radiates outward to the whole prairie.',
  },
  {
    id: 38,
    name: 'Opposition',
    lines: [true, true, false, true, false, true],
    meaning:
      'Fire and water on the same tile. The rain falls on the torch. Opposition is not contradiction — it is the tension from which new things are forged.',
  },
  {
    id: 39,
    name: 'Obstruction',
    lines: [false, false, true, false, true, false],
    meaning:
      'A ghost blocks the only path forward. The cave wall does not yield. When the way is barred, look sideways — the prairie is wider than any single route.',
  },
  {
    id: 40,
    name: 'Deliverance',
    lines: [false, true, false, true, false, false],
    meaning:
      'The wall crumbles. The storm passes. The path that was blocked is suddenly open. Move quickly through the gap — liberation has a short window.',
  },
  {
    id: 41,
    name: 'Decrease',
    lines: [true, true, false, false, false, true],
    meaning:
      'The water meter drops. The clover browns at the edges. Decrease is not loss but simplification. Cut away what cannot be sustained and strengthen what remains.',
  },
  {
    id: 42,
    name: 'Increase',
    lines: [true, false, false, false, true, true],
    meaning:
      'Rain after drought. The soil health ticks upward. When increase comes, share it — pour your surplus into the places that need it most.',
  },
  {
    id: 43,
    name: 'Breakthrough',
    lines: [true, true, true, true, true, false],
    meaning:
      'Five solid lines push against one yielding. The breakthrough is inevitable but must be announced — act decisively, but tell the prairie what you are doing.',
  },
  {
    id: 44,
    name: 'Coming to Meet',
    lines: [false, true, true, true, true, true],
    meaning:
      'A stranger appears at the edge of the dirt. The ghost drifts toward you uninvited. Not all encounters are chosen — meet what arrives with open hands.',
  },
  {
    id: 45,
    name: 'Gathering Together',
    lines: [false, false, false, true, true, false],
    meaning:
      'Bees cluster on the richest clover. Resources flow to where attention gathers. Create a center worth gathering around and the prairie will come to you.',
  },
  {
    id: 46,
    name: 'Pushing Upward',
    lines: [false, true, true, false, false, false],
    meaning:
      'The seed pushes through dirt toward light it has never seen. Upward growth requires no permission. Rise steadily, without haste, without rest.',
  },
  {
    id: 47,
    name: 'Oppression',
    lines: [false, true, false, true, true, false],
    meaning:
      'The backpack is empty and the ground is bare. Words fail; the manual has no entry for this. Endure in silence — the prairie listens even when it does not answer.',
  },
  {
    id: 48,
    name: 'The Well',
    lines: [false, true, true, false, true, false],
    meaning:
      'Deep beneath the cave floor, water collects. The well does not move but all who thirst find it. Be inexhaustible by drawing from what is deep, not what is visible.',
  },
  {
    id: 49,
    name: 'Revolution',
    lines: [true, false, true, true, true, false],
    meaning:
      'The old clover field is cut to the root. Revolution is not destruction but transformation at the proper time. When the season demands change, change completely.',
  },
  {
    id: 50,
    name: 'The Cauldron',
    lines: [false, true, true, true, false, true],
    meaning:
      'The prairie transmutes what is given to it. Base materials become something greater through patience and intention. Combine with care.',
  },
  {
    id: 51,
    name: 'The Arousing',
    lines: [true, false, false, true, false, false],
    meaning:
      'Thunder rolls across the flatland with no mountain to stop it. The shock arrives twice — once to startle, once to teach. After the trembling, clarity.',
  },
  {
    id: 52,
    name: 'Keeping Still',
    lines: [false, false, true, false, false, true],
    meaning:
      'The cave wall stands immovable. Stillness is not the absence of motion but the presence of certainty. Rest your back against the stone and stop seeking.',
  },
  {
    id: 53,
    name: 'Development',
    lines: [false, false, true, false, true, true],
    meaning:
      'The clover grows by stages: seed, sprout, leaf, bloom. No stage can be skipped. Gradual development is the only kind that lasts on the prairie.',
  },
  {
    id: 54,
    name: 'The Marrying Maiden',
    lines: [true, true, false, true, false, false],
    meaning:
      'The bee enters a flower not its own. Some journeys begin from obligation, not desire. Find meaning in the task assigned, not only the task chosen.',
  },
  {
    id: 55,
    name: 'Abundance',
    lines: [true, false, true, true, false, false],
    meaning:
      'The prairie is thick with clover and the sky is bright. Abundance is midday — brilliant but brief. Use the fullness before the shadow lengthens.',
  },
  {
    id: 56,
    name: 'The Wanderer',
    lines: [false, false, true, true, false, true],
    meaning:
      'The steward walks without a path, without a destination. To wander is not to be lost — it is to let the prairie choose where you are needed.',
  },
  {
    id: 57,
    name: 'The Gentle',
    lines: [false, true, true, false, true, true],
    meaning:
      'Wind moves through the clover without breaking a single stem. Gentle penetration: the idea that enters through repetition, not force. Say it again, softly.',
  },
  {
    id: 58,
    name: 'The Joyous',
    lines: [true, true, false, true, true, false],
    meaning:
      'Two lakes reflect each other. Joy shared doubles; joy hoarded evaporates. Speak your gladness aloud on the prairie — even the ghosts are listening.',
  },
  {
    id: 59,
    name: 'Dispersion',
    lines: [false, true, false, false, true, true],
    meaning:
      'The morning mist lifts and the prairie is revealed whole. What seemed solid dissolves; what seemed hidden appears. Let rigidity melt — flow finds every crack.',
  },
  {
    id: 60,
    name: 'Limitation',
    lines: [true, true, false, false, true, false],
    meaning:
      'The backpack has edges. The map has borders. The day has a horizon. Limits are not punishments — they are the shape of the vessel that gives water its form.',
  },
  {
    id: 61,
    name: 'Inner Truth',
    lines: [true, true, false, false, true, true],
    meaning:
      'The wind blows across the open plain and nothing stops it. Inner truth resonates like a sound with no wall to echo from — it simply is. Trust what rings clear.',
  },
  {
    id: 62,
    name: 'Small Exceeding',
    lines: [false, false, true, true, false, false],
    meaning:
      'A bee flies higher than it should. Small things overreach — and sometimes they succeed. Attempt the small excess; avoid the great one. Fly low but far.',
  },
  {
    id: 63,
    name: 'After Completion',
    lines: [true, false, true, false, true, false],
    meaning:
      'Every tile is planted. Every bee has a hive. The work is done — and this is the most dangerous moment. Completion invites complacency. Tend what you have finished.',
  },
  {
    id: 64,
    name: 'Before Completion',
    lines: [false, true, false, true, false, true],
    meaning:
      'The last tile is dirt. The last coin has not yet been tossed. Almost-done is not done. The prairie is patient with the unfinished — it has all the time there is.',
  },
]

// --- 8x8 grid indexed by [lowerTrigram][upperTrigram] ---

const buildHexagramGrid = (): HexagramDefinition[][] => {
  const grid: HexagramDefinition[][] = Array.from({ length: 8 }, () =>
    Array(8).fill(null) as HexagramDefinition[]
  )
  for (const h of HEXAGRAMS) {
    const row = trigramIndex(h.lines, 0) // lower trigram
    const col = trigramIndex(h.lines, 3) // upper trigram
    grid[row][col] = h
  }
  return grid
}

export const HEXAGRAM_GRID: HexagramDefinition[][] = buildHexagramGrid()
