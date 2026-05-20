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
// Five code points from the Latin Extended-E block (U+AB10..U+AB1F).
// There is no official Voynich Unicode block; the kreativekorp Voynich
// Unicode font maps its glyphs in the BMP Private Use Area (U+F120..U+F15F).
// We deliberately render these tiles using Latin Extended-E code points
// instead so that — even when the Voynich font is not loaded — most
// default OS UI fonts substitute a visible Latin-ish glyph (Ħ, H, etc.)
// rather than the bare missing-glyph indicator (□). The rendered character
// is not what matters; the *visual texture* of "not-Earth script" is.
//
// If the Voynich font is loaded the renderer still applies font-family
// 'Voynich' to these tiles, but the typeface does not map this range,
// so the OS fallback wins. Treat this as intentional: the doctrine
// "the medium failing is the cosmology" is preserved, but we prefer
// visible glyphs to empty boxes when the medium fails.
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

// --- Incompatibility footnote (precis #8b) ---------------------------------
//
// Appended to every egregore manual entry once the player has discovered
// any native flora species (precis #8b doctrine: "the cosmology refuses
// the question once the player has started asking it"). The tokens are
// drawn from the same EVA_TOKENS allowlist as the body, with a separate
// hash channel so the footnote is uncorrelated with the body.
//
// **Engineering-only translation, never rendered:** the curated EVA-token
// sequence is meant to read as "no compatible regions" in the doctrinal
// register. The English string is intentionally not surfaced anywhere
// (no constant, no helper, no comment line that the renderer can read).
// Players see only the Voynich glyphs; precis-12 will surface the
// player-readable "no compatible regions" line in the crossbreed UX.

const FOOTNOTE_LENGTH_BUCKET = 3 // 3..5 tokens

/**
 * Returns the EVA tokens for an egregore manual entry's "no compatible
 * regions" footnote line. Stable per-position. Length varies in [3, 5].
 * Different positions produce different sequences.
 */
export const getEgregoreIncompatibilityFootnote = (x: number, y: number): string[] => {
  const h = tileHash(x, y)
  const length = 3 + (reseed(h, 0x300) % FOOTNOTE_LENGTH_BUCKET)
  const tokens: string[] = []
  for (let i = 0; i < length; i++) {
    const pick = reseed(h, 0x310 + i) % EVA_TOKENS.length
    tokens.push(EVA_TOKENS[pick])
  }
  return tokens
}

// --- Exports for testing ---------------------------------------------------

export const EVA_TOKEN_COUNT = EVA_TOKENS.length
export const LATIN_PIERCE_WORD_COUNT = LATIN_PIERCE_WORDS.length
