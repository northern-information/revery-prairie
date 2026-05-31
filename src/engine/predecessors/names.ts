// RP-24 — steward-name generator for seeded predecessors.
//
// Deterministic SHA256 substrate keyed on (genesisSeed, index). The
// algorithm concatenates a prefix and a suffix drawn from two
// hand-authored morpheme tables. Names that collide with player-
// visible character names (Gron, the steward, etc.) are not in the
// tables by construction.
//
// All selection arithmetic uses `index mod table.length`, so the
// function cannot throw or read out-of-bounds for any non-negative
// integer (genesisSeed, index) pair. The same pair always returns
// the same name.

import { sha256Sync } from '../crypto'

// Period-appropriate prefixes. Short, evocative; no anachronisms;
// none collide with named characters (Gron, Emily, Moab).
const PREFIXES = [
  'Ar',
  'Bry',
  'Cae',
  'Dav',
  'Ei',
  'Fyn',
  'Gae',
  'Hal',
  'Ire',
  'Jor',
  'Kel',
  'Lyr',
  'Mae',
  'Nev',
  'Or',
  'Per',
  'Quen',
  'Ros',
  'Syl',
  'Tav',
  'Ul',
  'Ven',
  'Wyn',
  'Yar',
] as const

// Single- or double-syllable endings. Pairs with any prefix without
// producing the locked-out names above.
const SUFFIXES = [
  'a',
  'an',
  'as',
  'eth',
  'el',
  'en',
  'in',
  'is',
  'on',
  'or',
  'us',
  'ya',
  'wen',
  'rin',
  'lin',
  'mar',
  'dor',
  'nis',
  'wyn',
  'tha',
] as const

// Lower 32 bits of an FNV-style hash, treated as a non-negative integer.
const hashTo32 = (message: string): number => {
  const hex = sha256Sync(message)
  return parseInt(hex.slice(0, 8), 16) >>> 0
}

export const generatePredecessorName = (genesisSeed: number, index: number): string => {
  const prefixHash = hashTo32(`predecessors:${String(genesisSeed)}:name:${String(index)}:prefix`)
  const suffixHash = hashTo32(`predecessors:${String(genesisSeed)}:name:${String(index)}:suffix`)
  const prefix = PREFIXES[prefixHash % PREFIXES.length]
  const suffix = SUFFIXES[suffixHash % SUFFIXES.length]
  return `${prefix}${suffix}`
}
