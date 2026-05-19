import { ScanProgressBar } from '../ScanProgressBar'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { clearAroundPlayer, createTestState } from '@/engine/__tests__/helpers'
import { createTestFloraEntry } from '@/engine/__tests__/helpers/createTestFloraEntry'
import { posKey } from '@/engine/position'
import { FloraSpecies, TileType } from '@/engine/types'

const placeFlora = (state: ReturnType<typeof createTestState>, x: number, y: number, species: FloraSpecies): void => {
  state.map[y][x] = { type: TileType.Flora }
  const key = posKey(x, y)
  state.floraLifecycle.set(key, createTestFloraEntry({ posKey: key, species }))
}

describe('ScanProgressBar', () => {
  describe('active scan', () => {
    it('renders the "Sequencing..." label when scanInProgress is non-null', () => {
      const state = createTestState()
      clearAroundPlayer(state, 2)
      state.scanInProgress = { target: { x: 0, y: 0 }, species: FloraSpecies.Clover, startTime: performance.now() }
      render(<ScanProgressBar state={state} activeScreen={null} />)
      expect(screen.getByTestId('scan-progress-bar')).toBeInTheDocument()
      expect(screen.getByText('Sequencing...')).toBeInTheDocument()
    })

    it('fill width matches elapsed / SCAN_DURATION_MS', () => {
      const state = createTestState()
      clearAroundPlayer(state, 2)
      const now = 1_000_000
      vi.spyOn(performance, 'now').mockReturnValue(now + 750) // 50% of 1500ms
      state.scanInProgress = { target: { x: 0, y: 0 }, species: FloraSpecies.Clover, startTime: now }
      render(<ScanProgressBar state={state} activeScreen={null} />)
      const fill = screen.getByTestId('scan-progress-fill')
      expect(fill.style.width).toBe('50%')
      vi.restoreAllMocks()
    })

    it('clamps fill at 100% when elapsed exceeds SCAN_DURATION_MS', () => {
      const state = createTestState()
      clearAroundPlayer(state, 2)
      const now = 1_000_000
      vi.spyOn(performance, 'now').mockReturnValue(now + 5000)
      state.scanInProgress = { target: { x: 0, y: 0 }, species: FloraSpecies.Clover, startTime: now }
      render(<ScanProgressBar state={state} activeScreen={null} />)
      const fill = screen.getByTestId('scan-progress-fill')
      expect(fill.style.width).toBe('100%')
      vi.restoreAllMocks()
    })
  })

  describe('idle with target available', () => {
    it('renders the "[f] to sequence." prompt when a scan target is nearby', () => {
      const state = createTestState()
      clearAroundPlayer(state, 2)
      placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
      state.scanInProgress = null
      render(<ScanProgressBar state={state} activeScreen={null} />)
      expect(screen.getByTestId('scan-prompt')).toBeInTheDocument()
      expect(screen.getByText(/to sequence/)).toBeInTheDocument()
    })

    it('does not render the prompt when no flora is in range', () => {
      const state = createTestState()
      clearAroundPlayer(state, 2)
      state.scanInProgress = null
      render(<ScanProgressBar state={state} activeScreen={null} />)
      expect(screen.queryByTestId('scan-prompt')).not.toBeInTheDocument()
      expect(screen.queryByTestId('scan-progress-bar')).not.toBeInTheDocument()
    })

    it('hides the prompt when a permacomputer screen is open', () => {
      const state = createTestState()
      clearAroundPlayer(state, 2)
      placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
      render(<ScanProgressBar state={state} activeScreen={'manual'} />)
      expect(screen.queryByTestId('scan-prompt')).not.toBeInTheDocument()
    })

    it('hides the prompt when a dialog is active', () => {
      const state = createTestState()
      clearAroundPlayer(state, 2)
      placeFlora(state, state.player.x, state.player.y, FloraSpecies.Clover)
      state.activeDialog = { characterId: 'gron', lineIndex: 0 } as typeof state.activeDialog
      render(<ScanProgressBar state={state} activeScreen={null} />)
      expect(screen.queryByTestId('scan-prompt')).not.toBeInTheDocument()
    })
  })
})
