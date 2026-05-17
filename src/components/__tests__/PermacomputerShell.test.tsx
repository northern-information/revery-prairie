import { PermacomputerShell } from '../PermacomputerShell'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createGameState } from '@/engine/state'
import type { GameState } from '@/engine/types'

const buildState = (mutate?: (state: GameState) => void): GameState => {
  const state = createGameState('Tester', 80, 40)
  if (mutate) mutate(state)
  return state
}

const renderShell = (
  overrides: Partial<Parameters<typeof PermacomputerShell>[0]> = {},
  state: GameState = buildState()
) => {
  const props = {
    state,
    activeScreen: 'pack' as const,
    onClose: vi.fn(),
    onSwitchScreen: vi.fn(),
    children: <div>content</div>,
    ...overrides,
  }
  return { ...render(<PermacomputerShell {...props} />), props }
}

describe('PermacomputerShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children in the content area', () => {
    renderShell({ children: <div>test content</div> })
    expect(screen.getByText('test content')).toBeInTheDocument()
  })

  it('calls onSwitchScreen when a visible tab is clicked', async () => {
    const onSwitchScreen = vi.fn()
    renderShell({ onSwitchScreen })

    await userEvent.click(screen.getByTestId('tab-manual'))
    expect(onSwitchScreen).toHaveBeenCalledWith('manual')
  })

  it('calls onClose when backdrop is clicked (non-pack screen)', async () => {
    const onClose = vi.fn()
    renderShell({ activeScreen: 'manual', onClose })

    await userEvent.click(screen.getByTestId('permacomputer-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close on backdrop click when pack screen is active', async () => {
    const onClose = vi.fn()
    renderShell({ activeScreen: 'pack', onClose })

    // Backdrop has pointer-events-none on pack screen, so click goes through
    await userEvent.click(screen.getByTestId('permacomputer-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders the permacomputer shell', () => {
    renderShell()
    expect(screen.getByTestId('permacomputer-shell')).toBeInTheDocument()
  })

  // Bottom bar (GameScreen) is fixed bottom-2 h-48 (~200px). Shell and backdrop must
  // stop short of it via bottom-52 so the minimap and event log stay clickable.
  it('reserves space at the bottom for the minimap and event log', () => {
    renderShell({ activeScreen: 'manual' })

    expect(screen.getByTestId('permacomputer-shell').className).toContain('bottom-52')
    expect(screen.getByTestId('permacomputer-backdrop').className).toContain('bottom-52')
  })

  describe('tab visibility', () => {
    it('always renders PACK, MANUAL, and SYS tabs', () => {
      renderShell()

      expect(screen.getByTestId('tab-pack')).toBeInTheDocument()
      expect(screen.getByTestId('tab-manual')).toBeInTheDocument()
      expect(screen.getByTestId('tab-system')).toBeInTheDocument()
    })

    it('hides COYOTE tab before rescue', () => {
      renderShell()
      expect(screen.queryByTestId('tab-coyote')).not.toBeInTheDocument()
    })

    it('shows COYOTE tab once event:rescue-coyote is discovered', () => {
      const state = buildState(s => {
        s.manualDiscoveries.add('event:rescue-coyote')
      })
      renderShell({}, state)
      expect(screen.getByTestId('tab-coyote')).toBeInTheDocument()
    })

    it('hides CANTOS tab when angelCantos is empty', () => {
      renderShell()
      expect(screen.queryByTestId('tab-cantos')).not.toBeInTheDocument()
    })

    it('shows CANTOS tab once at least one canto is received', () => {
      const state = buildState(s => {
        s.angelCantos.push('first-canto')
      })
      renderShell({}, state)
      expect(screen.getByTestId('tab-cantos')).toBeInTheDocument()
    })

    it('no longer renders REVERIES tab (action bar deleted in precis #0)', () => {
      renderShell()
      expect(screen.queryByTestId('tab-reveries')).not.toBeInTheDocument()
    })

    it('hides DIVINATION tab when fewer than 3 glinting coins are in the pack', () => {
      renderShell()
      expect(screen.queryByTestId('tab-divination')).not.toBeInTheDocument()
    })

    it('shows DIVINATION tab when canCast is true (>=3 glinting coins in pack)', () => {
      const state = buildState(s => {
        // Place three glinting coins directly in the backpack.
        for (let i = 0; i < 3; i++) {
          const uid = `test-coin-${String(i)}`
          s.backpack.items.push({ uid, definitionId: 'coin', gridX: i, gridY: 0 })
          s.glintingCoins.add(uid)
        }
      })
      renderShell({}, state)
      expect(screen.getByTestId('tab-divination')).toBeInTheDocument()
    })

    it('shows only PACK, MANUAL, SYS on a fresh game with no unlocks', () => {
      renderShell()

      expect(screen.getByTestId('tab-pack')).toBeInTheDocument()
      expect(screen.getByTestId('tab-manual')).toBeInTheDocument()
      expect(screen.getByTestId('tab-system')).toBeInTheDocument()

      expect(screen.queryByTestId('tab-divination')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tab-cantos')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tab-coyote')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tab-reveries')).not.toBeInTheDocument()
    })

    it('renders all visible tabs in canonical order', () => {
      const state = buildState(s => {
        s.angelCantos.push('canto-a')
        s.manualDiscoveries.add('event:rescue-coyote')
        for (let i = 0; i < 3; i++) {
          const uid = `coin-${String(i)}`
          s.backpack.items.push({ uid, definitionId: 'coin', gridX: i, gridY: 0 })
          s.glintingCoins.add(uid)
        }
      })
      renderShell({}, state)

      const order = [
        screen.getByTestId('tab-pack'),
        screen.getByTestId('tab-manual'),
        screen.getByTestId('tab-divination'),
        screen.getByTestId('tab-cantos'),
        screen.getByTestId('tab-coyote'),
        screen.getByTestId('tab-system'),
      ]
      for (let i = 1; i < order.length; i++) {
        const prev = order[i - 1]
        const cur = order[i]
        expect(prev.compareDocumentPosition(cur) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      }
    })
  })
})
