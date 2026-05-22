import { Sky } from '@/engine/types'
import type { GameState } from '@/engine/types'

import {
  SEASON_LABEL,
  VANE_ROTATION_DEG,
  almanacState,
  moonPhase,
  moonPhaseLabel,
  windSpeedLabel,
} from './ambientInstruments.helpers'

interface AmbientInstrumentsProps {
  state: GameState
}

// All glyphs render at this pixel size in their own square box so
// the four rows line up visually with the text labels.
const GLYPH_SIZE = 22

// Uniform stroke for line-based glyphs (arrow, cloud outline,
// almanac dial). Uses currentColor for color inheritance.
const STROKE = 1

// Compact arrow pointing toward the top of its viewport. The
// component applies a transform: rotate(...) per cardinal to point
// it in the right direction. Pure outline; same stroke as the rest
// of the widget for visual consistency.
const ArrowGlyph = ({ rotationDeg }: { rotationDeg: number }) => (
  <svg
    width={GLYPH_SIZE}
    height={GLYPH_SIZE}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={STROKE}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transform: `rotate(${String(rotationDeg)}deg)` }}
    aria-hidden="true"
  >
    <line x1="8" y1="3" x2="8" y2="13" />
    <polyline points="4,7 8,3 12,7" />
  </svg>
)

const SunGlyph = () => (
  <svg
    width={GLYPH_SIZE}
    height={GLYPH_SIZE}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={STROKE}
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="3" />
    <line x1="8" y1="1" x2="8" y2="3" />
    <line x1="8" y1="13" x2="8" y2="15" />
    <line x1="1" y1="8" x2="3" y2="8" />
    <line x1="13" y1="8" x2="15" y2="8" />
    <line x1="3" y1="3" x2="4.5" y2="4.5" />
    <line x1="11.5" y1="11.5" x2="13" y2="13" />
    <line x1="13" y1="3" x2="11.5" y2="4.5" />
    <line x1="4.5" y1="11.5" x2="3" y2="13" />
  </svg>
)

const CloudGlyph = () => (
  <svg
    width={GLYPH_SIZE}
    height={GLYPH_SIZE}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={STROKE}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 11 a3 3 0 0 1 0 -6 a4 4 0 0 1 8 0.5 a2 2 0 0 1 0.5 5.5 Z" />
  </svg>
)

const RainGlyph = () => (
  <svg
    width={GLYPH_SIZE}
    height={GLYPH_SIZE}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={STROKE}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 8 a2.5 2.5 0 0 1 0 -5 a3.5 3.5 0 0 1 7 0.5 a1.75 1.75 0 0 1 0.5 4.5 Z" />
    <line x1="5" y1="11" x2="4" y2="14" />
    <line x1="8" y1="11" x2="7" y2="14" />
    <line x1="11" y1="11" x2="10" y2="14" />
  </svg>
)

const SnowGlyph = () => (
  <svg
    width={GLYPH_SIZE}
    height={GLYPH_SIZE}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={STROKE}
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="8" y1="2" x2="8" y2="14" />
    <line x1="2" y1="8" x2="14" y2="8" />
    <line x1="3.5" y1="3.5" x2="12.5" y2="12.5" />
    <line x1="12.5" y1="3.5" x2="3.5" y2="12.5" />
  </svg>
)

const SkyGlyph = ({ sky }: { sky: Sky }) => {
  switch (sky) {
    case Sky.Sun:
      return <SunGlyph />
    case Sky.Cloudy:
      return <CloudGlyph />
    case Sky.Rain:
      return <RainGlyph />
    case Sky.Snow:
      return <SnowGlyph />
  }
}

// Moon glyph: a circle outline at 8x radius=6 with a shadow disc
// (background-color) drawn over the lit half. The shadow disc's
// horizontal center shifts across the moon to create each phase
// shape. Phase 0 (New Moon) = shadow disc fully overlaps;
// 0.5 (Full Moon) = shadow disc fully outside; intermediate phases
// = partial overlap producing crescent or gibbous shapes.
//
// The disc uses a special "background" color via a clip-path so the
// shape reads as a sliver of light on dark, even when the widget
// itself sits on the bottom-bar's translucent overlay.
const MoonGlyph = ({ phaseName }: { phaseName: string }) => {
  // Each named phase has a deterministic visual recipe:
  //   - fill: how much of the circle is lit (0 = new, 1 = full)
  //   - side: 'right' (waxing) or 'left' (waning) or null (new/full)
  const recipe = MOON_VISUAL_RECIPE[phaseName] ?? { fill: 0, side: null }
  const r = 6
  const cx = 8
  const cy = 8

  if (recipe.fill === 0) {
    // New moon — outline only.
    return (
      <svg
        width={GLYPH_SIZE}
        height={GLYPH_SIZE}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        aria-hidden="true"
      >
        <circle cx={cx} cy={cy} r={r} />
      </svg>
    )
  }

  if (recipe.fill === 1) {
    // Full moon — filled disc.
    return (
      <svg
        width={GLYPH_SIZE}
        height={GLYPH_SIZE}
        viewBox="0 0 16 16"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={STROKE}
        aria-hidden="true"
      >
        <circle cx={cx} cy={cy} r={r} />
      </svg>
    )
  }

  // Partial phases — use a clip-path to mask the lit portion of a
  // filled disc. The lit portion is a vertical band whose width
  // and side depend on the recipe.
  // For quarter phases (fill 0.5), the band covers exactly half.
  // For crescents (fill 0.25), a thin sliver. For gibbous (fill 0.75),
  // most of the disc.
  const litWidth = r * 2 * recipe.fill
  const litX = recipe.side === 'right' ? cx : cx - litWidth
  return (
    <svg
      width={GLYPH_SIZE}
      height={GLYPH_SIZE}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`moon-clip-${recipe.side ?? 'none'}-${String(recipe.fill)}`}>
          <rect x={litX} y={cy - r} width={litWidth} height={r * 2} />
        </clipPath>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={STROKE} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="currentColor"
        clipPath={`url(#moon-clip-${recipe.side ?? 'none'}-${String(recipe.fill)})`}
      />
    </svg>
  )
}

interface MoonVisualRecipe {
  fill: number
  side: 'right' | 'left' | null
}

const MOON_VISUAL_RECIPE: Record<string, MoonVisualRecipe> = {
  'New Moon': { fill: 0, side: null },
  'Waxing Crescent': { fill: 0.25, side: 'right' },
  'First Quarter': { fill: 0.5, side: 'right' },
  'Waxing Gibbous': { fill: 0.75, side: 'right' },
  'Full Moon': { fill: 1, side: null },
  'Waning Gibbous': { fill: 0.75, side: 'left' },
  'Third Quarter': { fill: 0.5, side: 'left' },
  'Waning Crescent': { fill: 0.25, side: 'left' },
}

// Radial almanac dial: outline ring + filled sector that fills
// clockwise from 12 o'clock as the year advances toward the next
// quarter-bookmark. Radius matches the moon glyph's r=6 so the two
// circular instruments read at the same visual scale.
const DIAL_RADIUS = 6

const sectorPath = (progress: number): string => {
  if (progress <= 0) return ''
  if (progress >= 1) {
    return `M 8 8 m -${String(DIAL_RADIUS)} 0 a ${String(DIAL_RADIUS)} ${String(DIAL_RADIUS)} 0 1 0 ${String(DIAL_RADIUS * 2)} 0 a ${String(DIAL_RADIUS)} ${String(DIAL_RADIUS)} 0 1 0 -${String(DIAL_RADIUS * 2)} 0 Z`
  }
  const angle = progress * Math.PI * 2 - Math.PI / 2
  const x = 8 + DIAL_RADIUS * Math.cos(angle)
  const y = 8 + DIAL_RADIUS * Math.sin(angle)
  const largeArc = progress > 0.5 ? 1 : 0
  return `M 8 8 L 8 ${String(8 - DIAL_RADIUS)} A ${String(DIAL_RADIUS)} ${String(DIAL_RADIUS)} 0 ${String(largeArc)} 1 ${String(x)} ${String(y)} Z`
}

const AlmanacGlyph = ({ progress }: { progress: number }) => (
  <svg
    width={GLYPH_SIZE}
    height={GLYPH_SIZE}
    viewBox="0 0 16 16"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r={DIAL_RADIUS} fill="none" stroke="currentColor" strokeWidth={STROKE} />
    <path d={sectorPath(progress)} fill="currentColor" />
  </svg>
)

export const AmbientInstruments = ({ state }: AmbientInstrumentsProps) => {
  const direction = state.weather.windDirection
  const smoothSpeed = state.wind.smoothSpeed
  const sky = state.weather.sky
  const season = state.weather.season
  const seasonalPhase = state.seasonalPhase

  const phase = moonPhase(seasonalPhase)
  const moonName = moonPhaseLabel(phase)
  const almanac = almanacState(seasonalPhase)

  // Single styling for every row: same font, same color, same
  // weight. Glyph column is fixed-width so labels start at the
  // same x across all four rows.
  const rowClass = 'flex items-center gap-2 font-mono text-xs text-zinc-400 font-normal'
  const glyphClass = 'flex-shrink-0 flex items-center justify-center'
  const glyphStyle = { width: GLYPH_SIZE, height: GLYPH_SIZE }

  return (
    <div className="flex flex-col gap-1 px-3">
      <div className={rowClass}>
        <span className={glyphClass} style={glyphStyle}>
          <ArrowGlyph rotationDeg={VANE_ROTATION_DEG[direction]} />
        </span>
        <span>
          {direction} {windSpeedLabel(smoothSpeed)}
        </span>
      </div>
      <div className={rowClass}>
        <span className={glyphClass} style={glyphStyle}>
          <SkyGlyph sky={sky} />
        </span>
        <span>{SEASON_LABEL[season]}</span>
      </div>
      <div className={rowClass}>
        <span className={glyphClass} style={glyphStyle}>
          <MoonGlyph phaseName={moonName} />
        </span>
        <span>{moonName}</span>
      </div>
      <div className={rowClass}>
        <span className={glyphClass} style={glyphStyle}>
          <AlmanacGlyph progress={almanac.progress} />
        </span>
        <span>{almanac.nextBookmark}</span>
      </div>
    </div>
  )
}
