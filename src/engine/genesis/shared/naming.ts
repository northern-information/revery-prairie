import { hashString } from './math'

// City name fragments for ruin generation
const RUIN_NAME_PREFIXES = ['Ash', 'Old', 'Lost', 'Deep', 'High', 'Iron', 'Salt', 'Dusk', 'Dawn', 'Red']
const RUIN_NAME_SUFFIXES = ['hold', 'gate', 'well', 'ford', 'mere', 'fell', 'reach', 'vale', 'mound', 'barrow']

export const generateRuinName = (rng: () => number): string =>
  RUIN_NAME_PREFIXES[Math.floor(rng() * RUIN_NAME_PREFIXES.length)] +
  RUIN_NAME_SUFFIXES[Math.floor(rng() * RUIN_NAME_SUFFIXES.length)]

/** Hash a steward name to a seed number. */
export const nameToSeed = (name: string): number => hashString(name)
