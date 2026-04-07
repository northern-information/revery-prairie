import type { Position, ReveryDefinition } from './types'

interface ReveryEntry {
  name: string
  description: string
  glyphs: string[]
  glyphColor: string
  cooldownMs: number
  castDurationMs: number
  castStyle: 'tile' | 'rain'
  castPattern: Position[]
}

// Cross shape: center + 4 cardinal neighbors
const CROSS_PATTERN: Position[] = [
  { x: 0, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
]

const SINGLE_PATTERN: Position[] = [{ x: 0, y: 0 }]

const REVERIES = {
  fire: {
    name: 'Fire Revery',
    description: 'a memory of flame',
    glyphs: ['^', '~', '*'],
    glyphColor: '#FF4500',
    cooldownMs: 12000,
    castDurationMs: 1200,
    castStyle: 'tile' as const,
    castPattern: SINGLE_PATTERN,
  },
  water: {
    name: 'Water Revery',
    description: 'a memory of flowing water',
    glyphs: ['|', ':', '.', ','],
    glyphColor: '#4488CC',
    cooldownMs: 12000,
    castDurationMs: 10000,
    castStyle: 'rain' as const,
    castPattern: CROSS_PATTERN,
  },
} as const satisfies Record<string, ReveryEntry>

export const REVERY_DEFINITIONS: Record<string, ReveryDefinition> = Object.fromEntries(
  Object.entries(REVERIES).map(([key, entry]) => [key, { ...entry, id: key }]),
)

export const getReveryDefinition = (id: string): ReveryDefinition => {
  const def = REVERY_DEFINITIONS[id]
  if (!def) {
    throw new Error(`unknown revery definition: ${id}`)
  }
  return def
}
