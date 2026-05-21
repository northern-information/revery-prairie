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

import { sha256Sync } from './crypto'
import { tileHash } from './position'

// --- EGREGORE_GLYPHS -------------------------------------------------------
//
// The locked 8-glyph alphabet for all not-of-this-Earth content: egregore
// tiles in 8a, egregoric flora species in 8b, and any future egregoric
// entities. Code points are drawn from the kreativekorp Voynich Unicode
// font's Private Use Area (U+F121..U+F2FF). The font is bundled as a
// required asset; see public/fonts/voynich.ttf and the @font-face
// declaration in src/styles/index.css.
//
// Picks were made visually via docs/voynich-specimen.html. The render
// order is meaningful — `tileHash % EGREGORE_GLYPHS.length` indexes
// into this array. Reordering changes which tiles render which glyph
// for an existing save; if a future change reorders, it is a content
// change, not a refactor.
//
// The four PUA slots U+F120, U+F1A0, U+F220, U+F2A0 are mapped in the
// font cmap but render as zero-length glyphs. They live in
// EMPTY_PUA_BLOCKLIST below and must never appear in EGREGORE_GLYPHS or
// EVA_TOKENS. See harness/specs/precis-8a-egregoric-thematic.yaml
// (behavior `egregore-glyph-registry`) for the locked-content contract.
export const EGREGORE_GLYPHS = [
  '\u{F166}',
  '\u{F174}',
  '\u{F182}',
  '\u{F1B4}',
  '\u{F12A}',
  '\u{F1A1}',
  '\u{F1B1}',
  '\u{F1FD}',
] as const

// Code points the kreativekorp Voynich cmap claims to support but whose
// glyph data is zero-length. Treated as a hard blocklist for all
// egregoric content. If a future change to the font adds glyph data for
// any of these, drop them from this list AND the matching failure
// condition in the spec.
export const EMPTY_PUA_BLOCKLIST = ['\u{F120}', '\u{F1A0}', '\u{F220}', '\u{F2A0}'] as const

// --- EVA tokens ------------------------------------------------------------
//
// Body text for procedurally-generated egregore manual entries. Each
// token is a string of Voynich glyphs (code points in U+F121..U+F2FF,
// none from EMPTY_PUA_BLOCKLIST). Rendered in the Voynich typeface —
// the player sees actual Voynich script, never Latin letters. Token
// lengths vary 3–7 to give the body the visual rhythm of a manuscript
// page.
//
// EVA_TOKENS is a wider pool than EGREGORE_GLYPHS because bodies can
// recruit more of the font's expressive range; the 8-glyph tile alphabet
// is the cosmology's "letterhead," the body uses the whole script.
const EVA_TOKENS = [
  '\u{F121}\u{F129}\u{F130}\u{F137}',
  '\u{F13E}\u{F146}\u{F14D}\u{F154}\u{F15B}',
  '\u{F163}\u{F16A}\u{F171}\u{F178}',
  '\u{F17F}\u{F188}\u{F18F}\u{F196}\u{F19D}\u{F1A5}',
  '\u{F1AC}\u{F1B3}\u{F1BA}\u{F1C1}\u{F1C8}',
  '\u{F1CF}\u{F1D6}\u{F1FD}',
  '\u{F226}\u{F22F}\u{F237}\u{F23E}\u{F246}\u{F24D}\u{F254}',
  '\u{F25B}\u{F263}\u{F26A}\u{F271}',
  '\u{F278}\u{F27F}\u{F29C}\u{F2A6}\u{F2AD}',
  '\u{F2B4}\u{F2BB}\u{F2C2}\u{F2C9}\u{F2D0}\u{F2D7}',
  '\u{F2DE}\u{F2E5}\u{F2EC}\u{F2F3}',
  '\u{F2FA}\u{F122}\u{F12A}\u{F131}\u{F138}',
  '\u{F13F}\u{F147}\u{F14E}\u{F155}',
  '\u{F15C}\u{F164}\u{F16B}\u{F172}\u{F179}\u{F182}',
  '\u{F189}\u{F190}\u{F197}',
  '\u{F19E}\u{F1A6}\u{F1AD}\u{F1B4}\u{F1BB}',
  '\u{F1C2}\u{F1C9}\u{F1D0}\u{F1D7}',
  '\u{F1FE}\u{F228}\u{F231}\u{F238}\u{F23F}\u{F247}',
  '\u{F24E}\u{F255}\u{F25C}\u{F264}\u{F26B}',
  '\u{F272}\u{F279}\u{F295}\u{F29E}',
  '\u{F2A7}\u{F2AE}\u{F2B5}\u{F2BC}\u{F2C3}\u{F2CA}\u{F2D1}',
  '\u{F2D8}\u{F2DF}\u{F2E6}\u{F2ED}\u{F2F4}',
  '\u{F2FB}\u{F123}\u{F12B}',
  '\u{F132}\u{F139}\u{F141}\u{F148}\u{F14F}\u{F156}',
  '\u{F15D}\u{F165}\u{F16C}\u{F173}',
  '\u{F17A}\u{F183}\u{F18A}\u{F191}\u{F198}',
  '\u{F19F}\u{F1A7}\u{F1AE}\u{F1B5}\u{F1BC}\u{F1C3}',
  '\u{F1CA}\u{F1D1}\u{F1D8}\u{F1FF}',
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
 * A 64-character hex identity for an egregore tile, derived from the
 * tile position via SHA256. Matches the shape of flora/oak identities so
 * GelBandView's hashToHexGrid can render an egregore scan with the same
 * 8x8 hex grid mapping as a flora scan — only palette and column
 * geometry differ. The "egregore:" namespace prefix keeps the identity
 * uncorrelated with the per-tile glyph/body hashes (which use tileHash
 * directly) so the gel reads as an independent signal, not a function
 * of the tile's visible glyph.
 */
export const getEgregoreTileIdentity = (x: number, y: number): string =>
  sha256Sync(`egregore:${String(x)},${String(y)}`)

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
