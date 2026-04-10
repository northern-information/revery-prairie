import { GenesisScreen } from '../GenesisScreen'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { GenesisResult } from '@/engine/genesisTypes'

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
  () => mockCtx
) as unknown as typeof HTMLCanvasElement.prototype.getContext

describe('GenesisScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a canvas element', () => {
    const onComplete = vi.fn()
    render(<GenesisScreen stewardName="test" onComplete={onComplete} />)
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('calls onComplete when skip key is pressed', async () => {
    const onComplete = vi.fn<(result: GenesisResult) => void>()
    render(<GenesisScreen stewardName="test" onComplete={onComplete} />)

    await userEvent.keyboard('{Enter}')

    expect(onComplete).toHaveBeenCalledTimes(1)
    const result: GenesisResult = onComplete.mock.calls[0][0]
    expect(result).toHaveProperty('terrain')
    expect(result).toHaveProperty('soilHealth')
    expect(result).toHaveProperty('ruins')
  })

  it('provides valid terrain in result', async () => {
    const onComplete = vi.fn<(result: GenesisResult) => void>()
    render(<GenesisScreen stewardName="test" onComplete={onComplete} />)

    await userEvent.keyboard(' ')

    const result: GenesisResult = onComplete.mock.calls[0][0]
    expect(result.terrain.length).toBe(95)
    expect(result.terrain[0].length).toBe(170)
  })

  it('provides soil health map in result', async () => {
    const onComplete = vi.fn<(result: GenesisResult) => void>()
    render(<GenesisScreen stewardName="test" onComplete={onComplete} />)

    await userEvent.keyboard(' ')

    const result: GenesisResult = onComplete.mock.calls[0][0]
    expect(result.soilHealth.size).toBeGreaterThan(0)
  })
})
