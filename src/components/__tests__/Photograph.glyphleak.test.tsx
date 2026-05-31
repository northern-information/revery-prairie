import { Photograph } from '../Photograph'
import type { PhotographDegradation } from '../Photograph'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TILE_COLORS } from '@/engine/constants'
import { EGREGORE_GLYPHS } from '@/engine/egregore'
import { TileType } from '@/engine/types'
import type { TimeLapseCell } from '@/engine/types'

const LEAK_COLOR = TILE_COLORS[TileType.Egregore]

const baseCells = (): TimeLapseCell[] =>
  Array.from({ length: 9 }, (_, i) => ({ char: String.fromCharCode(97 + i), color: '#abcdef' }))

const countLeakedCells = (container: HTMLElement): number =>
  container.querySelectorAll('[data-leak="true"]').length

describe('Photograph glyphLeak substitution (RP-24)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders zero leaks when degradation is omitted', () => {
    const { container } = render(<Photograph cells={baseCells()} cellWidth={14} cellHeight={28} />)
    expect(countLeakedCells(container)).toBe(0)
  })

  it('renders zero leaks when degradation.glyphLeak === 0', () => {
    const degradation: PhotographDegradation = { grain: 0.5, tint: 'hsl(30, 35%, 40%)', glyphLeak: 0 }
    const { container } = render(
      <Photograph
        cells={baseCells()}
        cellWidth={14}
        cellHeight={28}
        degradation={degradation}
        seedSalt="seed-1:0"
        frameIndex={0}
      />
    )
    expect(countLeakedCells(container)).toBe(0)
  })

  it('renders zero leaks when seedSalt is missing (defensive fallback)', () => {
    const degradation: PhotographDegradation = { grain: 0.5, tint: 'hsl(30, 35%, 40%)', glyphLeak: 1.0 }
    const { container } = render(
      <Photograph cells={baseCells()} cellWidth={14} cellHeight={28} degradation={degradation} frameIndex={0} />
    )
    expect(countLeakedCells(container)).toBe(0)
  })

  it('renders zero leaks when frameIndex is missing (defensive fallback)', () => {
    const degradation: PhotographDegradation = { grain: 0.5, tint: 'hsl(30, 35%, 40%)', glyphLeak: 1.0 }
    const { container } = render(
      <Photograph cells={baseCells()} cellWidth={14} cellHeight={28} degradation={degradation} seedSalt="seed-1:0" />
    )
    expect(countLeakedCells(container)).toBe(0)
  })

  it('renders all 9 cells leaked when glyphLeak === 1.0 with salt + frame present', () => {
    const degradation: PhotographDegradation = { grain: 0.5, tint: 'hsl(30, 35%, 40%)', glyphLeak: 1.0 }
    const { container } = render(
      <Photograph
        cells={baseCells()}
        cellWidth={14}
        cellHeight={28}
        degradation={degradation}
        seedSalt="seed-1:0"
        frameIndex={0}
      />
    )
    expect(countLeakedCells(container)).toBe(9)
  })

  it('leaked cells render with the Egregore color and Voynich typeface', () => {
    const degradation: PhotographDegradation = { grain: 0.5, tint: 'hsl(30, 35%, 40%)', glyphLeak: 1.0 }
    const { container } = render(
      <Photograph
        cells={baseCells()}
        cellWidth={14}
        cellHeight={28}
        degradation={degradation}
        seedSalt="seed-1:0"
        frameIndex={0}
      />
    )
    const leakedTexts = container.querySelectorAll('[data-leak="true"] text')
    expect(leakedTexts.length).toBe(9)
    leakedTexts.forEach(t => {
      expect(t.getAttribute('fill')).toBe(LEAK_COLOR)
      expect(t.getAttribute('font-family')).toContain('Voynich')
      // Replaced char should be one of EGREGORE_GLYPHS.
      const char = t.textContent ?? ''
      expect((EGREGORE_GLYPHS as readonly string[]).includes(char)).toBe(true)
    })
  })

  it('mid-range glyphLeak yields a per-cell roll: some cells leak, some pass through', () => {
    // Sweep many salts to confirm the result is sensitive to seed +
    // frame, and that the count varies (not stuck at 0 or 9).
    const degradation: PhotographDegradation = { grain: 0.5, tint: 'hsl(30, 35%, 40%)', glyphLeak: 0.5 }
    const counts = new Set<number>()
    for (let s = 0; s < 12; s++) {
      const { container } = render(
        <Photograph
          cells={baseCells()}
          cellWidth={14}
          cellHeight={28}
          degradation={degradation}
          seedSalt={`seed-sweep:${String(s)}`}
          frameIndex={0}
        />
      )
      counts.add(countLeakedCells(container))
    }
    // At least two distinct leak counts across the sweep — confirms
    // per-cell rolls are independent.
    expect(counts.size).toBeGreaterThan(1)
  })

  it('substitution is deterministic for the same (seedSalt, frameIndex)', () => {
    const degradation: PhotographDegradation = { grain: 0.5, tint: 'hsl(30, 35%, 40%)', glyphLeak: 0.7 }
    const grab = (): string[] => {
      const { container, unmount } = render(
        <Photograph
          cells={baseCells()}
          cellWidth={14}
          cellHeight={28}
          degradation={degradation}
          seedSalt="seed-fixed"
          frameIndex={2}
        />
      )
      const texts = Array.from(container.querySelectorAll('text')).map(t => t.textContent ?? '')
      unmount()
      return texts
    }
    expect(grab()).toEqual(grab())
  })

  it('different frameIndex values produce different leak patterns at glyphLeak=1.0', () => {
    const degradation: PhotographDegradation = { grain: 0.5, tint: 'hsl(30, 35%, 40%)', glyphLeak: 1.0 }
    const collect = (frame: number): string[] => {
      const { container, unmount } = render(
        <Photograph
          cells={baseCells()}
          cellWidth={14}
          cellHeight={28}
          degradation={degradation}
          seedSalt="seed-frame-diff"
          frameIndex={frame}
        />
      )
      const texts = Array.from(container.querySelectorAll('[data-leak="true"] text')).map(t => t.textContent ?? '')
      unmount()
      return texts
    }
    expect(collect(0)).not.toEqual(collect(1))
  })
})
