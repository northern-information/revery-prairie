import { createRef } from 'react'
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { GenesisScreen } from '../GenesisScreen'
import { Sidebar } from '../Sidebar'
import { ActionBar } from '../ActionBar'
import { createGameState } from '@/engine/state'
import type { ItemInfoHandle } from '../ItemInfo'

// Mock HTMLAudioElement (needed for music during genesis)
class MockAudio {
  src = ''
  loop = false
  volume = 0
  muted = false
  paused = true
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
}
vi.stubGlobal('Audio', MockAudio)

// Mock canvas context
const mockCtx = {
  fillStyle: '',
  fillRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({
    width: 10,
    actualBoundingBoxAscent: 12,
    actualBoundingBoxDescent: 2,
  })),
  scale: vi.fn(),
  font: '',
  textBaseline: '',
}

HTMLCanvasElement.prototype.getContext = vi.fn(
  () => mockCtx,
) as unknown as typeof HTMLCanvasElement.prototype.getContext

describe('genesis transition', () => {
  it('genesis canvas has no fixed or inset-0 positioning', () => {
    const onComplete = vi.fn()
    render(<GenesisScreen stewardName="test" onComplete={onComplete} />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
    expect(canvas?.classList.contains('fixed')).toBe(false)
    expect(canvas?.classList.contains('inset-0')).toBe(false)
  })

  it('sidebar mounts without fade-in animation', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={createRef<ItemInfoHandle>()}
        eventLog={[]}
        metricsRef={createRef()}
        refreshUI={() => undefined}
      />,
    )
    const sidebar = document.querySelector('[data-panel="sidebar"]')
    expect(sidebar).toBeInTheDocument()
    expect(sidebar?.classList.contains('animate-fade-in')).toBe(false)
  })

  it('action bar mounts without fade-in animation', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <ActionBar
        state={state}
        refreshUI={() => undefined}
        dragState={null}
        onSetActionBarTarget={() => undefined}
        onTogglePermacomputer={() => undefined}
      />,
    )
    const actionBar = document.querySelector('.fixed.bottom-4')
    expect(actionBar).toBeInTheDocument()
    expect(actionBar?.classList.contains('animate-fade-in')).toBe(false)
  })
})
