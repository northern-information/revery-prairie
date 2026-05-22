import { MAX_WIND_SPEED } from '@/engine/weather/wind'
import { Season } from '@/engine/types'
import type { Sky, WindDirection } from '@/engine/types'

// Mapping from the rotated cardinal frame (precis-30) to Weather Icons
// direction glyph classes. Each WindDirection enum key denotes a
// diamond-tip or diamond-edge on screen; the icon points the same way.
// No translation layer — the enum key reads directly.
export const VANE_GLYPH_CLASS: Record<WindDirection, string> = {
  N: 'wi-direction-up',
  NE: 'wi-direction-up-right',
  E: 'wi-direction-right',
  SE: 'wi-direction-down-right',
  S: 'wi-direction-down',
  SW: 'wi-direction-down-left',
  W: 'wi-direction-left',
  NW: 'wi-direction-up-left',
}

export const SKY_GLYPH_CLASS: Record<Sky, string> = {
  sun: 'wi-day-sunny',
  cloudy: 'wi-cloudy',
  rain: 'wi-rain',
  snow: 'wi-snow',
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

// Eight Title Case phase labels covering the lunar cycle. Maps to the
// 28-bucket MOON_GLYPH_CYCLE below via index ranges:
//   index 0          → New Moon
//   index 1-6        → Waxing Crescent
//   index 7          → First Quarter
//   index 8-13       → Waxing Gibbous
//   index 14         → Full Moon
//   index 15-20      → Waning Gibbous
//   index 21         → Third Quarter
//   index 22-27      → Waning Crescent
export const MOON_PHASE_LABEL = [
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

export const MOON_GLYPH_CYCLE = [
  'wi-moon-new',
  'wi-moon-waxing-crescent-1',
  'wi-moon-waxing-crescent-2',
  'wi-moon-waxing-crescent-3',
  'wi-moon-waxing-crescent-4',
  'wi-moon-waxing-crescent-5',
  'wi-moon-waxing-crescent-6',
  'wi-moon-first-quarter',
  'wi-moon-waxing-gibbous-1',
  'wi-moon-waxing-gibbous-2',
  'wi-moon-waxing-gibbous-3',
  'wi-moon-waxing-gibbous-4',
  'wi-moon-waxing-gibbous-5',
  'wi-moon-waxing-gibbous-6',
  'wi-moon-full',
  'wi-moon-waning-gibbous-1',
  'wi-moon-waning-gibbous-2',
  'wi-moon-waning-gibbous-3',
  'wi-moon-waning-gibbous-4',
  'wi-moon-waning-gibbous-5',
  'wi-moon-waning-gibbous-6',
  'wi-moon-third-quarter',
  'wi-moon-waning-crescent-1',
  'wi-moon-waning-crescent-2',
  'wi-moon-waning-crescent-3',
  'wi-moon-waning-crescent-4',
  'wi-moon-waning-crescent-5',
  'wi-moon-waning-crescent-6',
] as const

const ALMANAC_BOOKMARKS = [
  { phase: 0, name: 'Spring Equinox' },
  { phase: 0.25, name: 'Summer Solstice' },
  { phase: 0.5, name: 'Autumn Equinox' },
  { phase: 0.75, name: 'Winter Solstice' },
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

export const moonGlyphClass = (phase: number): (typeof MOON_GLYPH_CYCLE)[number] => {
  const index = Math.min(MOON_GLYPH_CYCLE.length - 1, Math.max(0, Math.floor(phase * MOON_GLYPH_CYCLE.length)))
  return MOON_GLYPH_CYCLE[index]
}

export const moonPhaseLabel = (phase: number): (typeof MOON_PHASE_LABEL)[number] => {
  const index = Math.min(MOON_PHASE_LABEL.length - 1, Math.max(0, Math.floor(phase * MOON_PHASE_LABEL.length)))
  return MOON_PHASE_LABEL[index]
}

export interface AlmanacState {
  // Progress from the current quarter-bookmark (0) to the next (1).
  // Drives the radial sector fill.
  progress: number
  // The name of the bookmark currently being approached.
  nextBookmark: string
}

export const almanacState = (seasonalPhase: number): AlmanacState => {
  const quarterIndex = Math.floor(seasonalPhase / 0.25)
  const quarterStart = quarterIndex * 0.25
  const progress = (seasonalPhase - quarterStart) / 0.25
  const nextBookmark = ALMANAC_BOOKMARKS[(quarterIndex + 1) % ALMANAC_BOOKMARKS.length]
  return { progress, nextBookmark: nextBookmark.name }
}
