import { createRef } from 'react'
import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ItemInfo } from '../ItemInfo'
import type { ItemInfoHandle } from '../ItemInfo'

const renderInfo = (itemWear?: Record<string, number>, cameraFilm?: Map<string, number>) => {
  const ref = createRef<ItemInfoHandle>()
  const result = render(<ItemInfo ref={ref} cameraFilm={cameraFilm} itemWear={itemWear} />)
  return { ref, ...result }
}

const showCamera = (ref: React.RefObject<ItemInfoHandle | null>, uid: string) => {
  act(() => {
    ref.current?.show('camera', uid)
  })
}

const getMeter = (container: HTMLElement): HTMLElement | null => container.querySelector('[role="meter"]')

describe('ItemInfo wear bar', () => {
  it('renders a wear bar when a wear-bearing item is shown', () => {
    const { ref, container } = renderInfo({ 'cam-1': 0.5 })
    showCamera(ref, 'cam-1')
    expect(getMeter(container)).not.toBeNull()
  })

  it('reflects the itemWear value in the bar fill', () => {
    const { ref, container } = renderInfo({ 'cam-1': 0.25 })
    showCamera(ref, 'cam-1')
    const meter = getMeter(container)
    if (!meter) throw new Error('meter missing')
    expect(meter.getAttribute('aria-valuenow')).toBe('0.25')
    const fill = meter.firstElementChild as HTMLElement
    expect(fill.style.width).toBe('75%')
  })

  it('treats an undefined wear value as 0 and does not show the worn-out line', () => {
    const { ref, container } = renderInfo()
    showCamera(ref, 'cam-1')
    const meter = getMeter(container)
    if (!meter) throw new Error('meter missing')
    expect(meter.getAttribute('aria-valuenow')).toBe('0')
    expect(container.textContent).not.toMatch(/Worn out/)
  })

  it('shows the worn-out repair line when wear is 1.0', () => {
    const { ref, container } = renderInfo({ 'cam-1': 1 })
    showCamera(ref, 'cam-1')
    expect(container.textContent).toMatch(/Worn out — repair needed\./)
  })

  it('does not render a wear bar for items without maxUses', () => {
    const ref = createRef<ItemInfoHandle>()
    const { container } = render(<ItemInfo ref={ref} itemWear={{ 'm-1': 0.5 }} />)
    act(() => {
      ref.current?.show('meteorite', 'm-1')
    })
    expect(getMeter(container)).toBeNull()
    expect(container.textContent).not.toMatch(/Worn out/)
  })

  it('renders the wear bar alongside the existing film status block for cameras', () => {
    const film = new Map<string, number>([['cam-1', 7]])
    const { ref, container } = renderInfo({ 'cam-1': 0.5 }, film)
    showCamera(ref, 'cam-1')
    expect(getMeter(container)).not.toBeNull()
    expect(container.textContent).toMatch(/Film: 7/)
  })
})
