import { Photograph } from '../Photograph'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EGREGORE_GLYPHS } from '@/engine/egregore'
import type { TimeLapseCell } from '@/engine/types'

// Regression: Photograph must render cells whose char is in the Voynich
// PUA range (U+F121..U+F2FF) with fontFamily="'Voynich', monospace",
// regardless of whether the glyph came from a predecessor glyphLeak or
// from an originally-captured Egregore tile. Album single-frame playback
// runs with `degradation` undefined — before the fix, PUA chars rendered
// in plain monospace and showed as tofu / missing-glyph squares.
// See harness/specs/bug-album-voynich-glyphs.yaml.
describe('voynich pua font swap', () => {
  const ascii = (i: number): TimeLapseCell => ({
    char: String.fromCharCode(97 + i),
    color: '#abcdef',
  })

  it('renders cells whose char is in U+F121..U+F2FF with Voynich fontFamily when degradation is undefined', () => {
    const cells: TimeLapseCell[] = Array.from({ length: 9 }, (_, i) => ascii(i))
    // Place a captured Voynich glyph in the center cell.
    cells[4] = { char: EGREGORE_GLYPHS[0], color: '#B080D0' }

    const { container } = render(<Photograph cells={cells} cellWidth={14} cellHeight={28} />)

    const texts = Array.from(container.querySelectorAll('text'))
    expect(texts.length).toBe(9)
    const centerText = texts[4]
    expect(centerText.textContent).toBe(EGREGORE_GLYPHS[0])
    expect(centerText.getAttribute('font-family')).toContain('Voynich')
  })

  it('leaves non-PUA cells in plain monospace when degradation is undefined', () => {
    const cells: TimeLapseCell[] = Array.from({ length: 9 }, (_, i) => ascii(i))
    const { container } = render(<Photograph cells={cells} cellWidth={14} cellHeight={28} />)
    const texts = Array.from(container.querySelectorAll('text'))
    texts.forEach(t => {
      const ff = t.getAttribute('font-family') ?? ''
      expect(ff).not.toContain('Voynich')
      expect(ff).toBe('monospace')
    })
  })

  it('applies Voynich fontFamily across every PUA code point in the range U+F121..U+F2FF', () => {
    // Sample EGREGORE_GLYPHS to confirm the predicate is range-based, not
    // a single-glyph special case.
    EGREGORE_GLYPHS.forEach(glyph => {
      const cells: TimeLapseCell[] = Array.from({ length: 9 }, (_, i) => ascii(i))
      cells[0] = { char: glyph, color: '#B080D0' }
      const { container, unmount } = render(<Photograph cells={cells} cellWidth={14} cellHeight={28} />)
      const t = container.querySelectorAll('text')[0]
      expect(t.getAttribute('font-family')).toContain('Voynich')
      unmount()
    })
  })

  it('mixed frame: PUA cell uses Voynich, ASCII cells use monospace', () => {
    const cells: TimeLapseCell[] = Array.from({ length: 9 }, (_, i) => ascii(i))
    cells[2] = { char: EGREGORE_GLYPHS[3], color: '#B080D0' }
    const { container } = render(<Photograph cells={cells} cellWidth={14} cellHeight={28} />)
    const texts = Array.from(container.querySelectorAll('text'))
    expect(texts[2].getAttribute('font-family')).toContain('Voynich')
    expect(texts[0].getAttribute('font-family')).toBe('monospace')
    expect(texts[8].getAttribute('font-family')).toBe('monospace')
  })
})
