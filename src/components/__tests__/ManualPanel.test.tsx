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
    expect(tabLabels).toContain('FLORA')
    expect(tabLabels).toContain('FAUNA')
    expect(tabLabels).toContain('RECIPES')
  })

  it('renders a search input', () => {
    renderManual()
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
  })

  it('renders entry names from the registry', () => {
    renderManual()
    // Bee and Clover entries should appear (may appear multiple times as cross-refs)
    expect(screen.getAllByText('Bee').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Clover').length).toBeGreaterThan(0)
  })

  it('updates manualState.activeCategory when tab is clicked', async () => {
    const { state } = renderManual()
    // Find the FAUNA button (tab)
    const buttons = screen.getAllByRole('button')
    const faunaTab = buttons.find(b => b.textContent?.trim() === 'FAUNA')
    expect(faunaTab).toBeTruthy()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted above
    await userEvent.click(faunaTab!)
    expect(state.manualState.activeCategory).toBe('fauna')
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
    expect(screen.getAllByText('prairie').length).toBeGreaterThan(0)
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
})
