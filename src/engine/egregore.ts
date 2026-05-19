// Egregoric flora — thematic substrate (precis #8a).
//
// The egregores are "not-of-this-Earth" per v3 cosmology doctrine. They
// have no Latin binomial, no FloraSpecies id, no growth lifecycle. This
// module is the procedural-content engine for the inert TileType.Egregore:
// it picks a Voynich glyph per tile, samples an EVA-token body for the
// tile's manual entry, and decides whether the entry contains a Latin
// "pierce" — a single readable English word from the cosmology
// vocabulary. All selections are deterministic per tile position.
//
// Per repo policy, the prose generated here is not human-authored "lore."
// The EVA tokens and pierce words are procedurally sampled from curated
// allowlists. The result is *Voynich script with occasional Latin* — a
// medium-is-the-message effect, not prose.

import { tileHash } from './position'

// --- EGREGORE_GLYPHS -------------------------------------------------------
//
// Five glyphs sampled from the Voynich Unicode block (U+0AB00..U+0AB1F).
// Per v3 doctrine: "single Voynich glyph from a small consistent subset."
// The glyphs render correctly when the Voynich font (kreativekorp/
// voynich-unicode) is loaded; otherwise the browser substitutes its
// missing-glyph fallback (□ or ?) — this is intended behavior per
// doctrine and MUST NOT be patched.
export const EGREGORE_GLYPHS = [
  '\u{0AB10}',
  '\u{0AB12}',
  '\u{0AB15}',
  '\u{0AB18}',
  '\u{0AB1A}',
] as const

// --- EVA tokens ------------------------------------------------------------
//
// EVA (European Voynich Alphabet) is the standard Latin transliteration of
// the Voynich manuscript script. We treat these tokens as raw glyph strings
// to be rendered in the Voynich typeface — the @font-face declaration in
// src/styles/index.css maps Latin letters to Voynich glyphs for the
// `font-family: 'Voynich'` typeface. (Or the typeface ships with EVA →
// Voynich glyph mappings directly; either way the player sees Voynich,
// the source contains EVA.)
//
// Tokens chosen for visual variety; no semantic intent.
const EVA_TOKENS = [
  'qokeey',
  'chedy',
  'qokedy',
  'shedy',
  'qokar',
  'okeey',
  'cheey',
  'qol',
  'sheey',
  'okal',
  'dar',
  'qokal',
  'chol',
  'shol',
  'aiin',
  'daiin',
  'qokaiin',
  'or',
  'oraiin',
  'cheor',
  'qotedy',
  'qotchedy',
  'kchedy',
  'lchedy',
  'pchedy',
  'tchedy',
  'okechy',
  'okeody',
] as const

// --- Latin pierces ---------------------------------------------------------
//
// The exact word list locked in v3 doctrine (egregores in detail, 8a):
// vocabulary of cosmology and presence. Roughly 1 tile in 5 contains
// exactly one pierce; the rest are pure Voynich.
const LATIN_PIERCE_WORDS = [
  'threshold',
  'between',
  'garden',
  'before',
  'not',
  'here',
  'was',
  'meteor',
  'Earth',
  'line',
  'thin',
  'near',
  'moved',
  'past',
  'us',
  'them',
] as const

// 1 tile in 5 gets a pierce. The trigger uses a separate hash channel
// from the glyph/body picks so the three signals are uncorrelated.
const PIERCE_RATE_BUCKET = 5

// --- Per-position generators -----------------------------------------------

// Stable secondary hash so each procedural choice draws from an
// uncorrelated stream — glyph, body tokens, and pierce decision should
// not lock together.
const reseed = (h: number, salt: number): number => Math.imul((h ^ salt) + 0x6d2b79f5, 0x85ebca6b) >>> 0

/**
 * The single Voynich glyph this egregore tile renders as. Stable across
 * reloads for a given steward name (since tileHash is position-only and
 * positions are deterministic per genesis seed).
 */
export const getEgregoreGlyph = (x: number, y: number): string => {
  const h = tileHash(x, y)
  return EGREGORE_GLYPHS[h % EGREGORE_GLYPHS.length]
}

/**
 * Returns the body content for this tile's manual entry. The body is a
 * string of EVA tokens separated by spaces, with at most one Latin pierce
 * word embedded if the tile's pierce-hash bucket falls in the 1-in-5 slot.
 *
 * Stable per-position. Different positions produce different strings.
 */
export const getEgregoreManualBody = (x: number, y: number): string => {
  const h = tileHash(x, y)
  // 5–8 EVA tokens for body length variety.
  const tokenCount = 5 + (reseed(h, 0x01) % 4)
  const tokens: string[] = []
  for (let i = 0; i < tokenCount; i++) {
    const pick = reseed(h, 0x10 + i) % EVA_TOKENS.length
    tokens.push(EVA_TOKENS[pick])
  }

  const pierce = getEgregoreLatinPierce(x, y)
  if (pierce !== null) {
    // Insert at a stable interior position.
    const slot = 1 + (reseed(h, 0x20) % Math.max(1, tokens.length - 1))
    tokens.splice(slot, 0, pierce)
  }

  return tokens.join(' ')
}

/**
 * If this tile's hash falls in the 1-in-5 pierce bucket, return one Latin
 * pierce word from LATIN_PIERCE_WORDS. Otherwise return null.
 *
 * The pierce decision is stable per-position. Roughly 1/5 of all egregore
 * tiles will return a non-null pierce.
 */
export const getEgregoreLatinPierce = (x: number, y: number): string | null => {
  const h = tileHash(x, y)
  const hasPierce = reseed(h, 0x100) % PIERCE_RATE_BUCKET === 0
  if (!hasPierce) return null
  const pick = reseed(h, 0x101) % LATIN_PIERCE_WORDS.length
  return LATIN_PIERCE_WORDS[pick]
}

/**
 * A short EVA binomial-line string used as the manual entry's display name
 * (no English binomial — egregores have none per doctrine). Two short
 * tokens, stable per-position. Distinct from the body so the binomial line
 * reads as a name, not a sentence fragment.
 */
export const getEgregoreBinomial = (x: number, y: number): string => {
  const h = tileHash(x, y)
  const a = EVA_TOKENS[reseed(h, 0x200) % EVA_TOKENS.length]
  const b = EVA_TOKENS[reseed(h, 0x201) % EVA_TOKENS.length]
  return `${a} ${b}`
}

// --- Exports for testing ---------------------------------------------------

export const EVA_TOKEN_COUNT = EVA_TOKENS.length
export const LATIN_PIERCE_WORD_COUNT = LATIN_PIERCE_WORDS.length
