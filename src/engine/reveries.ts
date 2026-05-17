import type { Position, ReveryDefinition } from './types'

interface ReveryEntry {
  name: string
  glyphs: string[]
  glyphColor: string
  cooldownMs: number
  castDurationMs: number
  castStyle: 'tile' | 'rain' | 'aura' | 'scan' | 'targeted' | 'deepTime'
  castPattern: Position[]
}

const SINGLE_PATTERN: Position[] = [{ x: 0, y: 0 }]

const REVERIES = {
  fire: {
    name: 'Fire Revery',
    glyphs: ['^', '~', '*'],
    glyphColor: '#FF4500',
    cooldownMs: 12000,
    castDurationMs: 1200,
    castStyle: 'tile' as const,
    castPattern: SINGLE_PATTERN,
  },
  water: {
    name: 'Water Revery',
    glyphs: ['|', ':', '.', ','],
    glyphColor: '#4488CC',
    cooldownMs: 12000,
    castDurationMs: 0,
    castStyle: 'aura' as const,
    castPattern: [],
  },
  earth: {
    name: 'Earth Revery',
    glyphs: ['.'],
    glyphColor: '#33CC33',
    cooldownMs: 6000,
    castDurationMs: 5500,
    castStyle: 'scan' as const,
    castPattern: [],
  },
  lightning: {
    name: 'Lightning Revery',
    glyphs: ['|'],
    glyphColor: '#FFFFFF',
    cooldownMs: 15000,
    castDurationMs: 800,
    castStyle: 'targeted' as const,
    castPattern: [],
  },
  'deep-time': {
    name: 'Deep Time Revery',
    glyphs: ['⧖', '◷', '∞'],
    glyphColor: '#FFFFFF',
    cooldownMs: Infinity,
    castDurationMs: 0,
    castStyle: 'deepTime' as const,
    castPattern: [],
  },
} as const satisfies Record<string, ReveryEntry>

export const REVERY_DEFINITIONS: Record<string, ReveryDefinition> = Object.fromEntries(
  Object.entries(REVERIES).map(([key, entry]) => [key, { ...entry, id: key }])
)

export const getReveryDefinition = (id: string): ReveryDefinition => {
  const def = REVERY_DEFINITIONS[id]
  if (!def) {
    throw new Error(`unknown revery definition: ${id}`)
  }
  return def
}
