import { ScanProgressBar } from '../ScanProgressBar'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createTestState } from '@/engine/__tests__/helpers'
import { FloraSpecies } from '@/engine/types'

describe('ScanProgressBar', () => {
  it('renders nothing when scanInProgress is null', () => {
    const state = createTestState()
    state.scanInProgress = null
    render(<ScanProgressBar state={state} />)
    expect(screen.queryByTestId('scan-progress-bar')).not.toBeInTheDocument()
  })

  it('renders the "Sequencing..." label when scanInProgress is non-null', () => {
    const state = createTestState()
    state.scanInProgress = { target: { x: 0, y: 0 }, species: FloraSpecies.Clover, startTime: performance.now() }
    render(<ScanProgressBar state={state} />)
    expect(screen.getByTestId('scan-progress-bar')).toBeInTheDocument()
    expect(screen.getByText('Sequencing...')).toBeInTheDocument()
  })

  it('fill width matches elapsed / SCAN_DURATION_MS', () => {
    const state = createTestState()
    const now = 1_000_000
    vi.spyOn(performance, 'now').mockReturnValue(now + 750) // 50% of 1500ms
    state.scanInProgress = { target: { x: 0, y: 0 }, species: FloraSpecies.Clover, startTime: now }
    render(<ScanProgressBar state={state} />)
    const fill = screen.getByTestId('scan-progress-fill')
    expect(fill.style.width).toBe('50%')
    vi.restoreAllMocks()
  })

  it('clamps fill at 100% when elapsed exceeds SCAN_DURATION_MS', () => {
    const state = createTestState()
    const now = 1_000_000
    vi.spyOn(performance, 'now').mockReturnValue(now + 5000) // way past 1500ms
    state.scanInProgress = { target: { x: 0, y: 0 }, species: FloraSpecies.Clover, startTime: now }
    render(<ScanProgressBar state={state} />)
    const fill = screen.getByTestId('scan-progress-fill')
    expect(fill.style.width).toBe('100%')
    vi.restoreAllMocks()
  })
})
