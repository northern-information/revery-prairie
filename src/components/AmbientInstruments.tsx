import type { GameState } from '@/engine/types'

import {
  SEASON_LABEL,
  SKY_GLYPH_CLASS,
  VANE_GLYPH_CLASS,
  almanacState,
  moonGlyphClass,
  moonPhase,
  moonPhaseLabel,
  windSpeedLabel,
} from './ambientInstruments.helpers'

interface AmbientInstrumentsProps {
  state: GameState
}

// Radial timer dimensions. A simple SVG dial: outer ring + a filled
// sector that depletes clockwise from 12 o'clock as progress advances
// toward the next quarter bookmark. No numerals, no tick marks.
const DIAL_SIZE = 18
const DIAL_RADIUS = 7
const DIAL_CENTER = DIAL_SIZE / 2

// Computes the SVG path string for a circular sector centered at
// (DIAL_CENTER, DIAL_CENTER) starting at 12 o'clock and sweeping
// clockwise by `progress` (0..1) of a full turn. Returns empty path
// at progress = 0; returns a full disc at progress >= 1.
const sectorPath = (progress: number): string => {
  if (progress <= 0) return ''
  if (progress >= 1) {
    return `M ${String(DIAL_CENTER)} ${String(DIAL_CENTER)} m -${String(DIAL_RADIUS)} 0 a ${String(DIAL_RADIUS)} ${String(DIAL_RADIUS)} 0 1 0 ${String(DIAL_RADIUS * 2)} 0 a ${String(DIAL_RADIUS)} ${String(DIAL_RADIUS)} 0 1 0 -${String(DIAL_RADIUS * 2)} 0 Z`
  }
  const angle = progress * Math.PI * 2 - Math.PI / 2
  const x = DIAL_CENTER + DIAL_RADIUS * Math.cos(angle)
  const y = DIAL_CENTER + DIAL_RADIUS * Math.sin(angle)
  const largeArc = progress > 0.5 ? 1 : 0
  return `M ${String(DIAL_CENTER)} ${String(DIAL_CENTER)} L ${String(DIAL_CENTER)} ${String(DIAL_CENTER - DIAL_RADIUS)} A ${String(DIAL_RADIUS)} ${String(DIAL_RADIUS)} 0 ${String(largeArc)} 1 ${String(x)} ${String(y)} Z`
}

export const AmbientInstruments = ({ state }: AmbientInstrumentsProps) => {
  const direction = state.weather.windDirection
  const smoothSpeed = state.wind.smoothSpeed
  const sky = state.weather.sky
  const season = state.weather.season
  const seasonalPhase = state.seasonalPhase

  const phase = moonPhase(seasonalPhase)
  const moonClass = moonGlyphClass(phase)
  const moonName = moonPhaseLabel(phase)
  const almanac = almanacState(seasonalPhase)

  return (
    <div className="font-mono text-xs text-zinc-300 leading-tight flex flex-col gap-1 px-3">
      <div className="flex items-center gap-2">
        <i className={`wi ${VANE_GLYPH_CLASS[direction]}`} aria-hidden="true" />
        <span>{direction}</span>
        <span className="text-zinc-500">{windSpeedLabel(smoothSpeed)}</span>
      </div>
      <div className="flex items-center gap-2">
        <i className={`wi ${SKY_GLYPH_CLASS[sky]}`} aria-hidden="true" />
        <span>{SEASON_LABEL[season]}</span>
      </div>
      <div className="flex items-center gap-2">
        <i className={`wi ${moonClass}`} aria-hidden="true" />
        <span>{moonName}</span>
      </div>
      <div className="flex items-center gap-2">
        <svg
          width={DIAL_SIZE}
          height={DIAL_SIZE}
          viewBox={`0 0 ${String(DIAL_SIZE)} ${String(DIAL_SIZE)}`}
          aria-hidden="true"
        >
          <circle cx={DIAL_CENTER} cy={DIAL_CENTER} r={DIAL_RADIUS} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
          <path d={sectorPath(almanac.progress)} fill="currentColor" opacity="0.7" />
        </svg>
        <span className="text-zinc-400">{almanac.nextBookmark}</span>
      </div>
    </div>
  )
}
