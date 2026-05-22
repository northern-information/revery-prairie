import { MAX_WIND_SPEED } from '@/engine/weather/wind'
import { Season } from '@/engine/types'
import type { WindDirection } from '@/engine/types'

// Rotation in degrees from "up" (N) for each rotated cardinal. The
// base arrow SVG points N; the component applies CSS transform:
// rotate(...) to produce the other seven directions. No translation
// layer between state and screen — the enum reads directly under
// precis-30's rotated frame.
export const VANE_ROTATION_DEG: Record<WindDirection, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
}

export const SEASON_LABEL: Record<Season, string> = {
  [Season.Spring]: 'Spring',
  [Season.Summer]: 'Summer',
  [Season.Autumn]: 'Autumn',
  [Season.Winter]: 'Winter',
}

export const WIND_SPEED_LABELS = ['still', 'breeze', 'brisk', 'gusty', 'gale'] as const

// Astronomical year length divided by mean synodic month — the
// fractional number of lunations in one in-game year. Integer
// approximation (12 or 13) would desynchronize the moon from the
// seasonal cycle within a single year.
export const LUNATIONS_PER_YEAR = 365.25 / 29.530588

// Eight Title Case phase names spanning the lunar cycle. The
// 28-bucket finer cycle collapses to these eight named phases via
// index ranges (see moonPhaseLabel below).
export const MOON_PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Third Quarter',
  'Waning Crescent',
] as const

export type MoonPhaseName = (typeof MOON_PHASE_NAMES)[number]

// Bucket boundaries (in units of 1/28) that map a moon phase to one
// of the eight phase names. A bucket index `b` in [0, 28) maps via:
//   b=0       → New Moon
//   b in 1-6  → Waxing Crescent
//   b=7       → First Quarter
//   b in 8-13 → Waxing Gibbous
//   b=14      → Full Moon
//   b in 15-20 → Waning Gibbous
//   b=21      → Third Quarter
//   b in 22-27 → Waning Crescent
const MOON_PHASE_NAME_BY_BUCKET: readonly MoonPhaseName[] = [
  'New Moon',
  'Waxing Crescent',
  'Waxing Crescent',
  'Waxing Crescent',
  'Waxing Crescent',
  'Waxing Crescent',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Waxing Gibbous',
  'Waxing Gibbous',
  'Waxing Gibbous',
  'Waxing Gibbous',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Waning Gibbous',
  'Waning Gibbous',
  'Waning Gibbous',
  'Waning Gibbous',
  'Waning Gibbous',
  'Third Quarter',
  'Waning Crescent',
  'Waning Crescent',
  'Waning Crescent',
  'Waning Crescent',
  'Waning Crescent',
  'Waning Crescent',
] as const

export const windSpeedLabel = (smoothSpeed: number): (typeof WIND_SPEED_LABELS)[number] => {
  const bandWidth = MAX_WIND_SPEED / WIND_SPEED_LABELS.length
  const index = Math.min(WIND_SPEED_LABELS.length - 1, Math.max(0, Math.floor(smoothSpeed / bandWidth)))
  return WIND_SPEED_LABELS[index]
}

export const moonPhase = (seasonalPhase: number): number => {
  const raw = (seasonalPhase * LUNATIONS_PER_YEAR) % 1
  return raw < 0 ? raw + 1 : raw
}

export const moonPhaseLabel = (phase: number): MoonPhaseName => {
  const bucket = Math.min(
    MOON_PHASE_NAME_BY_BUCKET.length - 1,
    Math.max(0, Math.floor(phase * MOON_PHASE_NAME_BY_BUCKET.length))
  )
  return MOON_PHASE_NAME_BY_BUCKET[bucket]
}

export interface AlmanacState {
  // Progress from the current quarter-bookmark (0) to the next (1).
  // Drives the radial sector fill.
  progress: number
  // The name of the bookmark currently being approached.
  nextBookmark: string
}

const ALMANAC_BOOKMARKS = [
  { phase: 0, name: 'Spring Equinox' },
  { phase: 0.25, name: 'Summer Solstice' },
  { phase: 0.5, name: 'Autumn Equinox' },
  { phase: 0.75, name: 'Winter Solstice' },
] as const

export const almanacState = (seasonalPhase: number): AlmanacState => {
  const quarterIndex = Math.floor(seasonalPhase / 0.25)
  const quarterStart = quarterIndex * 0.25
  const progress = (seasonalPhase - quarterStart) / 0.25
  const nextBookmark = ALMANAC_BOOKMARKS[(quarterIndex + 1) % ALMANAC_BOOKMARKS.length]
  return { progress, nextBookmark: nextBookmark.name }
}
