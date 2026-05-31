import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { WearBar } from '../WearBar'

describe('WearBar', () => {
  const renderBar = (wear: number) => render(<WearBar wear={wear} color="#FFD700" />)

  const getFill = (container: HTMLElement): HTMLElement => {
    const meter = container.querySelector('[role="meter"]')
    if (!meter) throw new Error('meter not found')
    const fill = meter.firstElementChild
    if (!(fill instanceof HTMLElement)) throw new Error('fill not found')
    return fill
  }

  it('renders a fully filled bar when wear is 0', () => {
    const { container } = renderBar(0)
    expect(getFill(container).style.width).toBe('100%')
  })

  it('renders a half-filled bar when wear is 0.5', () => {
    const { container } = renderBar(0.5)
    expect(getFill(container).style.width).toBe('50%')
  })

  it('renders an empty bar when wear is 1', () => {
    const { container } = renderBar(1)
    expect(getFill(container).style.width).toBe('0%')
  })

  it('clamps wear values above 1 to a 0% fill', () => {
    const { container } = renderBar(1.5)
    expect(getFill(container).style.width).toBe('0%')
  })

  it('clamps negative wear to a 100% fill', () => {
    const { container } = renderBar(-0.2)
    expect(getFill(container).style.width).toBe('100%')
  })

  it('applies the passed color to the fill', () => {
    const { container } = render(<WearBar wear={0.3} color="rgb(255, 0, 128)" />)
    expect(getFill(container).style.backgroundColor).toBe('rgb(255, 0, 128)')
  })

  it('exposes meter ARIA attributes with the clamped value', () => {
    const { container } = renderBar(0.42)
    const meter = container.querySelector('[role="meter"]')
    expect(meter?.getAttribute('aria-valuenow')).toBe('0.42')
    expect(meter?.getAttribute('aria-valuemin')).toBe('0')
    expect(meter?.getAttribute('aria-valuemax')).toBe('1')
  })
})
