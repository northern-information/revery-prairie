import { ManualPanel } from '../ManualPanel'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createTestState } from '@/engine/__tests__/helpers'
import { MANUAL_ENTRIES } from '@/engine/manual'
import { recipeKey, RECIPES } from '@/engine/recipes'

const renderManual = (overrides?: Partial<ReturnType<typeof createTestState>>) => {
  const state = { ...createTestState(), ...overrides }
  const result = render(<ManualPanel state={state} />)
  return { state, ...result }
}

describe('ManualPanel', () => {
  it('renders the ALL tab and category tabs', () => {
    renderManual()
    // All tabs are buttons
    const buttons = screen.getAllByRole('button')
    const tabLabels = buttons.map(b => b.textContent?.trim())
    expect(tabLabels).toContain('ALL')
    expect(tabLabels).toContain('LIFE')
    expect(tabLabels).toContain('RECIPES')
  })

  it('renders a search input', () => {
    renderManual()
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })

  it('renders entry names from the registry', () => {
    // Discover clover so the flora entry appears (precis #6 — undiscovered
    // flora are hidden until scanned).
    const state = createTestState()
    state.manualDiscoveries.add('flora:clover')
    render(<ManualPanel state={state} />)
    // Bee item and Clover flora-species entries should appear (may appear
    // multiple times as cross-refs).
    expect(screen.getAllByText('Bee').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Clover (Trifolium repens)').length).toBeGreaterThan(0)
  })

  it('updates manualState.activeCategory when tab is clicked', async () => {
    const { state } = renderManual()
    const buttons = screen.getAllByRole('button')
    const lifeTab = buttons.find(b => b.textContent?.trim() === 'LIFE')
    expect(lifeTab).toBeTruthy()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    await userEvent.click(lifeTab!)
    expect(state.manualState.activeCategory).toBe('life')
  })

  it('updates manualState.searchQuery when typing in search', async () => {
    const { state } = renderManual()
    const input = screen.getByPlaceholderText('Search...')
    await userEvent.type(input, 'meteorite')
    expect(state.manualState.searchQuery).toBe('meteorite')
  })

  it('shows ??? for undiscovered recipe results', () => {
    renderManual()
    // Recipes are undiscovered by default in test state
    const questionMarks = screen.getAllByText('???')
    expect(questionMarks.length).toBeGreaterThan(0)
  })

  it('shows discovered recipe result name', () => {
    const state = createTestState()
    for (const recipe of RECIPES) {
      state.manualDiscoveries.add(`recipe:${recipeKey(recipe)}`)
    }
    render(<ManualPanel state={state} />)
    // The prairie recipe result name should appear in the recipe entry
    expect(screen.getAllByText('Prairie').length).toBeGreaterThan(0)
  })

  it('renders entry glyphs in their real color regardless of discovery', () => {
    const state = createTestState()
    const { container } = render(<ManualPanel state={state} />)
    // The bee glyph should always be gold (#FFD700), even when undiscovered
    const goldSpans = container.querySelectorAll('span[style*="rgb(255, 215, 0)"]')
    expect(goldSpans.length).toBeGreaterThan(0)
  })

  it('toggles hint blocks on click', async () => {
    const state = createTestState()
    const entry = MANUAL_ENTRIES['item:bee']
    const originalHints = entry.hints
    entry.hints = [{ prompt: 'test hint question?', answer: 'test hint answer' }]

    render(<ManualPanel state={state} />)

    // Hint prompt visible, answer hidden
    expect(screen.getByText(/test hint question/)).toBeInTheDocument()
    expect(screen.queryByText('test hint answer')).not.toBeInTheDocument()

    // Click to reveal
    await userEvent.click(screen.getByText(/test hint question/))
    expect(screen.getByText('test hint answer')).toBeInTheDocument()
    expect(state.manualState.revealedHints.has('item:bee:0')).toBe(true)

    entry.hints = originalHints
  })

  it('persists revealed hints across renders', () => {
    const state = createTestState()
    state.manualState.revealedHints.add('item:bee:0')
    const entry = MANUAL_ENTRIES['item:bee']
    const originalHints = entry.hints
    entry.hints = [{ prompt: 'persisted hint?', answer: 'persisted answer' }]

    render(<ManualPanel state={state} />)
    expect(screen.getByText('persisted answer')).toBeInTheDocument()

    entry.hints = originalHints
  })

  it('renders always-visible entries', () => {
    renderManual()
    // Overworld and Shooting Star have unlockKey 'always' (may appear as cross-refs too)
    expect(screen.getAllByText(/The Prairie/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Shooting Star').length).toBeGreaterThan(0)
  })

  describe('flora entries — scan-to-discover (precis #6)', () => {
    it('hides undiscovered flora species entirely', () => {
      renderManual()
      // No flora:* species has been scanned, so none of their entries
      // render. The names come from MANUAL_ONLY_SKELETONS in manual.ts.
      expect(screen.queryByText('Clover (Trifolium repens)')).not.toBeInTheDocument()
      expect(screen.queryByText('Purple Coneflower (Echinacea purpurea)')).not.toBeInTheDocument()
      expect(screen.queryByText('Big Bluestem (Andropogon gerardii)')).not.toBeInTheDocument()
    })

    it('shows a flora entry once its species is discovered', () => {
      const state = createTestState()
      state.manualDiscoveries.add('flora:wildflower')
      render(<ManualPanel state={state} />)
      expect(screen.getByText('Purple Coneflower (Echinacea purpurea)')).toBeInTheDocument()
      // Clover and tall grass remain hidden.
      expect(screen.queryByText('Clover (Trifolium repens)')).not.toBeInTheDocument()
      expect(screen.queryByText('Big Bluestem (Andropogon gerardii)')).not.toBeInTheDocument()
    })

    it('renders the specimen stack for a scanned species', () => {
      const state = createTestState()
      state.manualDiscoveries.add('flora:clover')
      state.scannedSpecimens.set('clover', [
        { identity: 'a'.repeat(64), scannedAt: performance.now(), position: { x: 0, y: 0 } },
      ])
      render(<ManualPanel state={state} />)
      // The stack and its hex grid both render.
      expect(screen.getByTestId('specimen-stack')).toBeInTheDocument()
      expect(screen.getByTestId('hex-grid-view')).toBeInTheDocument()
    })

    it('does not render the hex grid for a discovered species without a cached specimen', () => {
      // Discovery alone (without scannedSpecimens entry) shouldn't crash —
      // the grid quietly skips. The entry still appears (per discovery).
      const state = createTestState()
      state.manualDiscoveries.add('flora:clover')
      render(<ManualPanel state={state} />)
      expect(screen.getByText('Clover (Trifolium repens)')).toBeInTheDocument()
      expect(screen.queryByTestId('hex-grid-view')).not.toBeInTheDocument()
    })

    it('search does not surface undiscovered flora entries', async () => {
      const user = userEvent.setup()
      renderManual()
      const input = screen.getByPlaceholderText('Search...')
      await user.type(input, 'Trifolium')
      // Even searching for the latin binomial returns no clover entry
      // because the entry was filtered out before rendering.
      expect(screen.queryByText('Clover (Trifolium repens)')).not.toBeInTheDocument()
    })

    it('applies a highlight container to the entry matching manualHighlightEntryId', () => {
      const state = createTestState()
      state.manualDiscoveries.add('flora:clover')
      state.scannedSpecimens.set('clover', [
        { identity: 'a'.repeat(64), scannedAt: performance.now(), position: { x: 0, y: 0 } },
      ])
      state.manualHighlightEntryId = 'flora:clover'
      const { container } = render(<ManualPanel state={state} />)
      const highlighted = container.querySelector('[data-highlighted="true"]')
      expect(highlighted).not.toBeNull()
      expect(highlighted?.id).toBe('manual-entry-flora:clover')
    })

    it('does not apply a highlight container when manualHighlightEntryId is null', () => {
      const state = createTestState()
      state.manualDiscoveries.add('flora:clover')
      state.manualHighlightEntryId = null
      const { container } = render(<ManualPanel state={state} />)
      expect(container.querySelector('[data-highlighted="true"]')).toBeNull()
    })
  })
})
