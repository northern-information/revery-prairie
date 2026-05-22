import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AmbientInstruments } from '../AmbientInstruments'
import {
  LUNATIONS_PER_YEAR,
  almanacState,
  moonGlyphClass,
  moonPhase,
  moonPhaseLabel,
  windSpeedLabel,
} from '../ambientInstruments.helpers'
import { Season, Sky, WindDirection } from '@/engine/types'
import type { GameState } from '@/engine/types'
import { MAX_WIND_SPEED } from '@/engine/weather/wind'

const stubState = (overrides: {
  windDirection?: WindDirection
  smoothSpeed?: number
  sky?: Sky
  season?: Season
  seasonalPhase?: number
}): GameState => {
  const state = {
    weather: {
      windDirection: overrides.windDirection ?? WindDirection.N,
      sky: overrides.sky ?? Sky.Sun,
      season: overrides.season ?? Season.Spring,
      temperatureF: 55,
      windSpeed: 0,
      humidity: 50,
    },
    wind: {
      smoothSpeed: overrides.smoothSpeed ?? 0,
    },
    seasonalPhase: overrides.seasonalPhase ?? 0,
  }
  return state as unknown as GameState
}

describe('AmbientInstruments — windSpeedLabel', () => {
  it.each([
    [0, 'still'],
    [4.999, 'still'],
    [5, 'breeze'],
    [9.999, 'breeze'],
    [10, 'brisk'],
    [15, 'gusty'],
    [20, 'gale'],
    [MAX_WIND_SPEED, 'gale'],
  ])('windSpeedLabel(%f) === %s', (speed, expected) => {
    expect(windSpeedLabel(speed)).toBe(expected)
  })

  it('clamps overflow to gale rather than returning undefined', () => {
    expect(windSpeedLabel(MAX_WIND_SPEED * 2)).toBe('gale')
  })
})

describe('AmbientInstruments — moonPhase', () => {
  it('returns 0 at seasonalPhase 0', () => {
    expect(moonPhase(0)).toBe(0)
  })

  it('completes ~12.3683 cycles per in-game year', () => {
    expect(LUNATIONS_PER_YEAR).toBeCloseTo(365.25 / 29.530588, 6)
  })

  it('is approximately 0.18415 at seasonalPhase 0.5', () => {
    expect(moonPhase(0.5)).toBeCloseTo((0.5 * LUNATIONS_PER_YEAR) % 1, 6)
  })

  it('returns values in [0, 1) for arbitrary seasonalPhase inputs', () => {
    for (const p of [0, 0.1, 0.333, 0.5, 0.789, 0.999]) {
      const phase = moonPhase(p)
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThan(1)
    }
  })
})

describe('AmbientInstruments — moonGlyphClass', () => {
  it('returns wi-moon-new at phase 0', () => {
    expect(moonGlyphClass(0)).toBe('wi-moon-new')
  })

  it('returns wi-moon-first-quarter at phase 0.25', () => {
    expect(moonGlyphClass(0.25)).toBe('wi-moon-first-quarter')
  })

  it('returns wi-moon-full at phase 0.5', () => {
    expect(moonGlyphClass(0.5)).toBe('wi-moon-full')
  })

  it('returns wi-moon-third-quarter at phase 0.75', () => {
    expect(moonGlyphClass(0.75)).toBe('wi-moon-third-quarter')
  })

  it('returns wi-moon-waning-crescent-6 at phase 0.999', () => {
    expect(moonGlyphClass(0.999)).toBe('wi-moon-waning-crescent-6')
  })

  it('is monotonic through the 28-glyph cycle', () => {
    const seen: string[] = []
    for (let i = 0; i < 28; i++) {
      const glyph = moonGlyphClass(i / 28)
      seen.push(glyph)
    }
    expect(new Set(seen).size).toBe(28)
  })
})

describe('AmbientInstruments — moonPhaseLabel', () => {
  it.each([
    [0, 'New Moon'],
    [0.25, 'First Quarter'],
    [0.5, 'Full Moon'],
    [0.75, 'Third Quarter'],
    [0.999, 'Waning Crescent'],
  ])('moonPhaseLabel(%f) === "%s"', (phase, expected) => {
    expect(moonPhaseLabel(phase)).toBe(expected)
  })

  it('returns "Waxing Crescent" for the six waxing-crescent buckets', () => {
    for (let i = 1; i <= 6; i++) {
      expect(moonPhaseLabel(i / 28)).toBe('Waxing Crescent')
    }
  })

  it('returns "Waning Gibbous" for the six waning-gibbous buckets', () => {
    for (let i = 15; i <= 20; i++) {
      expect(moonPhaseLabel(i / 28)).toBe('Waning Gibbous')
    }
  })
})

describe('AmbientInstruments — almanacState', () => {
  it.each([
    [0.0, 0, 'Summer Solstice'],
    [0.125, 0.5, 'Summer Solstice'],
    [0.25, 0, 'Autumn Equinox'],
    [0.5, 0, 'Winter Solstice'],
    [0.75, 0, 'Spring Equinox'],
    [0.875, 0.5, 'Spring Equinox'],
  ])('almanacState(%f) returns progress %f toward "%s"', (phase, expectedProgress, expectedBookmark) => {
    const { progress, nextBookmark } = almanacState(phase)
    expect(progress).toBeCloseTo(expectedProgress, 5)
    expect(nextBookmark).toBe(expectedBookmark)
  })

  it('progress is always in [0, 1) across the year', () => {
    for (let p = 0; p < 1; p += 0.05) {
      const { progress } = almanacState(p)
      expect(progress).toBeGreaterThanOrEqual(0)
      expect(progress).toBeLessThan(1)
    }
  })
})

describe('AmbientInstruments — render', () => {
  it('renders the weathervane glyph and uppercase letter for state.weather.windDirection', () => {
    const { container, getByText } = render(<AmbientInstruments state={stubState({ windDirection: WindDirection.NE })} />)
    expect(container.querySelector('.wi-direction-up-right')).not.toBeNull()
    expect(getByText('NE')).not.toBeNull()
  })

  it('renders the wind-speed label adjacent to the vane', () => {
    const { getByText } = render(<AmbientInstruments state={stubState({ smoothSpeed: 12 })} />)
    expect(getByText('brisk')).not.toBeNull()
  })

  it('renders the sky glyph for state.weather.sky', () => {
    const { container } = render(<AmbientInstruments state={stubState({ sky: Sky.Rain })} />)
    expect(container.querySelector('.wi-rain')).not.toBeNull()
  })

  it('renders the Title Case season label', () => {
    const { getByText } = render(<AmbientInstruments state={stubState({ season: Season.Autumn })} />)
    expect(getByText('Autumn')).not.toBeNull()
  })

  it('renders the moon glyph and Title Case phase label', () => {
    const { container, getByText } = render(<AmbientInstruments state={stubState({ seasonalPhase: 0 })} />)
    expect(container.querySelector('.wi-moon-new')).not.toBeNull()
    expect(getByText('New Moon')).not.toBeNull()
  })

  it('renders the radial almanac timer with the upcoming bookmark name', () => {
    const { container, getByText } = render(<AmbientInstruments state={stubState({ seasonalPhase: 0.125 })} />)
    expect(container.querySelector('svg path')).not.toBeNull()
    expect(getByText('Summer Solstice')).not.toBeNull()
  })

  it('does not render any percentage text', () => {
    const { container } = render(<AmbientInstruments state={stubState({ seasonalPhase: 0.5 })} />)
    expect(container.textContent).not.toMatch(/%/)
  })

  it('renders all four bands of the widget for a typical mid-summer afternoon', () => {
    const { container } = render(
      <AmbientInstruments
        state={stubState({
          windDirection: WindDirection.SW,
          smoothSpeed: 7,
          sky: Sky.Cloudy,
          season: Season.Summer,
          seasonalPhase: 0.375,
        })}
      />
    )
    expect(container.querySelector('.wi-direction-down-left')).not.toBeNull()
    expect(container.querySelector('.wi-cloudy')).not.toBeNull()
    expect(container.textContent).toContain('SW')
    expect(container.textContent).toContain('breeze')
    expect(container.textContent).toContain('Summer')
    expect(container.textContent).toContain('Autumn Equinox')
  })
})

describe('AmbientInstruments — discipline', () => {
  it('does not use React state hooks (useState / useEffect / useRef)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AmbientInstruments.tsx'), 'utf8')
    expect(source).not.toMatch(/\buseState\b/)
    expect(source).not.toMatch(/\buseEffect\b/)
    expect(source).not.toMatch(/\buseRef\b/)
    expect(source).not.toMatch(/\buseReducer\b/)
    expect(source).not.toMatch(/\buseLayoutEffect\b/)
  })
})
