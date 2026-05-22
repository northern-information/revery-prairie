import type { GameState } from '@/engine/types'

import {
  SEASON_LABEL,
  SKY_GLYPH_CLASS,
  VANE_GLYPH_CLASS,
  almanacReadout,
  moonGlyphClass,
  moonIlluminationPercent,
  moonPhase,
  windSpeedLabel,
} from './ambientInstruments.helpers'

interface AmbientInstrumentsProps {
  state: GameState
}

export const AmbientInstruments = ({ state }: AmbientInstrumentsProps) => {
  const direction = state.weather.windDirection
  const smoothSpeed = state.wind.smoothSpeed
  const sky = state.weather.sky
  const season = state.weather.season
  const seasonalPhase = state.seasonalPhase

  const phase = moonPhase(seasonalPhase)
  const moonClass = moonGlyphClass(phase)
  const illumination = moonIlluminationPercent(phase)

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
        <span>{String(illumination)}%</span>
      </div>
      <div className="text-zinc-400">{almanacReadout(seasonalPhase)}</div>
    </div>
  )
}
