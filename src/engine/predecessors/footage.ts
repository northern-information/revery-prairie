// RP-24 — predecessor footage + degradation derivation.
//
// Two deterministic pure functions:
//   - generatePredecessorFootage(genesisSeed, index) → TimeLapseFrame[]
//   - derivePredecessorDegradation(genesisSeed, index, tenure) → degradation
//
// Frames are synthesized purely from the seed — no live game state is
// read. This matches the found-footage cosmology: the camera does not
// know what the prairie looks like now, only what it looked like to
// the predecessor at recording time. Egregoric content is NOT
// introduced here; the per-cell glyph substitution is applied at
// render time inside Photograph.tsx via the `glyphLeak` channel.
//
// Per-cell content is drawn from a weighted three-pool mix:
//   - 60% terrain (TILE_CHARS — walkable / ambient subset)
//   - 30% flora (FLORA_SPECIES glyphs)
//   - 10% entity (BEE / MONARCH)

import {
  BEE_CHAR,
  BEE_COLOR,
  MONARCH_CHAR,
  MONARCH_COLOR,
  PREDECESSOR_EGREGORE_DOMINANT_RATE,
  PREDECESSOR_EGREGORE_LIGHT_RATE,
  PREDECESSOR_FRAMES_MAX,
  PREDECESSOR_FRAMES_MIN,
  PREDECESSOR_GLYPH_LEAK_DOMINANT,
  PREDECESSOR_GLYPH_LEAK_LIGHT,
  TILE_CHARS,
  TILE_COLORS,
} from '../constants'
import { sha256Sync } from '../crypto'
import { FLORA_SPECIES } from '../flora/species'
import { FloraSpecies, TileType } from '../types'

import type { TimeLapseCell, TimeLapseFrame } from '../types'

// Tunable mix thresholds (cumulative). A roll r ∈ [0, 1) picks the
// terrain pool when r < TERRAIN, the flora pool when r < FLORA,
// otherwise the entity pool.
export const PREDECESSOR_FRAME_MIX = {
  terrain: 0.6,
  flora: 0.9,
  entity: 1.0,
} as const

// Per-predecessor degradation values. PhotographDegradation lives in
// the component layer (engine code must not import from src/components/),
// so this engine-side type mirrors its shape; the playback layer maps
// one to the other at the call site.
export interface PhotographDegradationValue {
  grain: number
  tint: string
  glyphLeak: number
}

// Grain — linear in tenure, hard cap. Tenure 1 → 0.23, tenure 5 →
// 0.55, tenure 10 → 0.95 then clamped to 0.9, tenure 20 → 0.9.
export const PREDECESSOR_GRAIN_BASE = 0.15
export const PREDECESSOR_GRAIN_PER_TENURE = 0.08
export const PREDECESSOR_GRAIN_CAP = 0.9

// Tint — hash-rolled hue within a constrained sepia / gold / dim-warm
// range. Saturation and lightness are fixed; only hue varies.
export const PREDECESSOR_TINT_HUE_MIN = 25
export const PREDECESSOR_TINT_HUE_MAX = 50
export const PREDECESSOR_TINT_SATURATION = 35
export const PREDECESSOR_TINT_LIGHTNESS = 40

// Terrain pool — walkable / ambient tile types only. Excludes egregore
// (delivered through the glyphLeak channel instead), space (blank),
// and explicit structure tiles. Keeps the photographic content
// recognizable as prairie.
const TERRAIN_TILES: readonly TileType[] = [
  TileType.Dirt,
  TileType.Flora,
  TileType.Sand,
  TileType.CaveFloor,
  TileType.RuinFloor,
] as const

const FLORA_SPECIES_LIST: readonly FloraSpecies[] = [FloraSpecies.Clover, FloraSpecies.Wildflower, FloraSpecies.TallGrass]

const ENTITY_PICKS: readonly { char: string; color: string }[] = [
  { char: BEE_CHAR, color: BEE_COLOR },
  { char: MONARCH_CHAR, color: MONARCH_COLOR },
] as const

// Lower 32 bits of the FNV-style hash, treated as a non-negative integer.
const hashTo32 = (message: string): number => parseInt(sha256Sync(message).slice(0, 8), 16) >>> 0

// `r ∈ [0, 1)` from a hash-keyed message.
const rollUnit = (message: string): number => hashTo32(message) / 0x100000000

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

const pickTerrainCell = (h: number): TimeLapseCell => {
  const tile = TERRAIN_TILES[h % TERRAIN_TILES.length]
  return { char: TILE_CHARS[tile], color: TILE_COLORS[tile] }
}

const pickFloraCell = (h: number): TimeLapseCell => {
  const species = FLORA_SPECIES_LIST[h % FLORA_SPECIES_LIST.length]
  const def = FLORA_SPECIES[species]
  return { char: def.glyph, color: def.color }
}

const pickEntityCell = (h: number): TimeLapseCell => {
  const pick = ENTITY_PICKS[h % ENTITY_PICKS.length]
  return { char: pick.char, color: pick.color }
}

const generateCell = (genesisSeed: number, index: number, frame: number, cellIdx: number): TimeLapseCell => {
  const root = `predecessors:${String(genesisSeed)}:predecessor:${String(index)}:frame:${String(frame)}:cell:${String(cellIdx)}`
  const r = rollUnit(`${root}:mix`)
  const h = hashTo32(`${root}:pick`)
  if (r < PREDECESSOR_FRAME_MIX.terrain) return pickTerrainCell(h)
  if (r < PREDECESSOR_FRAME_MIX.flora) return pickFloraCell(h)
  return pickEntityCell(h)
}

const deriveFrameCount = (genesisSeed: number, index: number): number => {
  const h = hashTo32(`predecessors:${String(genesisSeed)}:frames:${String(index)}`)
  const span = PREDECESSOR_FRAMES_MAX - PREDECESSOR_FRAMES_MIN + 1
  return PREDECESSOR_FRAMES_MIN + (h % span)
}

export const generatePredecessorFootage = (genesisSeed: number, index: number): TimeLapseFrame[] => {
  const frameCount = deriveFrameCount(genesisSeed, index)
  const frames: TimeLapseFrame[] = []
  for (let j = 0; j < frameCount; j++) {
    const cells: TimeLapseCell[] = []
    for (let k = 0; k < 9; k++) cells.push(generateCell(genesisSeed, index, j, k))
    frames.push({ recordedAt: 0, cells })
  }
  return frames
}

const deriveGlyphLeak = (genesisSeed: number, index: number): number => {
  const r = rollUnit(`predecessors:${String(genesisSeed)}:predecessor:${String(index)}:egregore`)
  if (r < PREDECESSOR_EGREGORE_DOMINANT_RATE) return PREDECESSOR_GLYPH_LEAK_DOMINANT
  if (r < PREDECESSOR_EGREGORE_LIGHT_RATE) return PREDECESSOR_GLYPH_LEAK_LIGHT
  return 0
}

const deriveTint = (genesisSeed: number, index: number): string => {
  const r = rollUnit(`predecessors:${String(genesisSeed)}:predecessor:${String(index)}:tint`)
  const span = PREDECESSOR_TINT_HUE_MAX - PREDECESSOR_TINT_HUE_MIN
  const hue = Math.floor(PREDECESSOR_TINT_HUE_MIN + r * span)
  return `hsl(${String(hue)}, ${String(PREDECESSOR_TINT_SATURATION)}%, ${String(PREDECESSOR_TINT_LIGHTNESS)}%)`
}

const deriveGrain = (tenure: number): number =>
  Math.min(PREDECESSOR_GRAIN_CAP, PREDECESSOR_GRAIN_BASE + tenure * PREDECESSOR_GRAIN_PER_TENURE)

export const derivePredecessorDegradation = (
  genesisSeed: number,
  index: number,
  tenure: number
): PhotographDegradationValue => ({
  grain: clamp01(deriveGrain(tenure)),
  tint: deriveTint(genesisSeed, index),
  glyphLeak: deriveGlyphLeak(genesisSeed, index),
})
