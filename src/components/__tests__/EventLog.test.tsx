import { fireEvent, render, screen } from '@testing-library/react'

import { EventLog } from '../EventLog'

import { createGameState } from '@/engine/state'
import type { GameEvent } from '@/hooks/useEventLog'

const makeEvent = (id: string, text: string): GameEvent => ({
  id,
  kind: 'pickup',
  text,
  icon: '!',
  iconColor: '#fff',
  timestamp: 0,
  worldX: 0,
  worldY: 0,
})

describe('EventLog', () => {
  it('returns null when log is empty', () => {
    const state = createGameState('Test', 80, 40)
    const { container } = render(<EventLog state={state} eventLog={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders newest entry at the bottom (terminal-style ordering)', () => {
    const state = createGameState('Test', 80, 40)
    // useEventLog stores newest at index 0
    const eventLog = [makeEvent('3', 'newest'), makeEvent('2', 'middle'), makeEvent('1', 'oldest')]
    render(<EventLog state={state} eventLog={eventLog} />)
    const entries = screen.getAllByText(/newest|middle|oldest/)
    expect(entries.map(e => e.textContent?.trim())).toEqual(['! oldest', '! middle', '! newest'])
  })

  it('applies position-based opacity with the bottom (newest) entry at full opacity', () => {
    const state = createGameState('Test', 80, 40)
    const eventLog = [makeEvent('3', 'newest'), makeEvent('2', 'middle'), makeEvent('1', 'oldest')]
    render(<EventLog state={state} eventLog={eventLog} />)
    const newest = screen.getByTestId('event-log-entry-3')
    const oldest = screen.getByTestId('event-log-entry-1')
    expect(newest.style.opacity).toBe('1')
    expect(Number(oldest.style.opacity)).toBeLessThan(1)
    expect(Number(oldest.style.opacity)).toBeGreaterThan(0)
  })

  it('clamps opacity at MIN_OPACITY for entries far from the bottom', () => {
    const state = createGameState('Test', 80, 40)
    // 12 entries: top of buffer should be clamped at MIN_OPACITY (0.15)
    const eventLog = Array.from({ length: 12 }, (_, i) =>
      makeEvent(String(12 - i), `entry-${String(12 - i)}`)
    )
    render(<EventLog state={state} eventLog={eventLog} />)
    const oldest = screen.getByTestId('event-log-entry-1')
    expect(Number(oldest.style.opacity)).toBeCloseTo(0.15, 2)
  })

  it('nulls state.cursorScreenPos / cursorTile on hover', () => {
    const state = createGameState('Test', 80, 40)
    state.cursorScreenPos = { x: 20, y: 20 }
    state.cursorTile = { x: 5, y: 5 }
    const eventLog = [makeEvent('1', 'one')]
    render(<EventLog state={state} eventLog={eventLog} />)
    const panel = screen.getByText('one').closest('[data-panel="event-log"]')
    expect(panel).not.toBeNull()
    fireEvent.mouseEnter(panel as HTMLElement)
    expect(state.cursorScreenPos).toBeNull()
    expect(state.cursorTile).toBeNull()
  })

  it('panel is pointer-events-auto so wheel events do not fall through to canvas', () => {
    const state = createGameState('Test', 80, 40)
    const eventLog = [makeEvent('1', 'one')]
    render(<EventLog state={state} eventLog={eventLog} />)
    const panel = screen.getByText('one').closest('[data-panel="event-log"]')
    expect(panel?.className).toMatch(/pointer-events-auto/)
  })

  describe('new entry flash animation', () => {
    it('applies the flash class to newly-appended entries', () => {
      const state = createGameState('Test', 80, 40)
      const initial = [makeEvent('1', 'one')]
      const { rerender } = render(<EventLog state={state} eventLog={initial} />)

      const grown = [makeEvent('2', 'two'), makeEvent('1', 'one')]
      rerender(<EventLog state={state} eventLog={grown} />)

      const newest = screen.getByTestId('event-log-entry-2')
      expect(newest.className).toMatch(/animate-event-log-flash/)
    })

    it('does NOT apply the flash class to entries already present at mount', () => {
      const state = createGameState('Test', 80, 40)
      const initial = [makeEvent('2', 'two'), makeEvent('1', 'one')]
      render(<EventLog state={state} eventLog={initial} />)

      const oldest = screen.getByTestId('event-log-entry-1')
      const newest = screen.getByTestId('event-log-entry-2')
      expect(oldest.className).not.toMatch(/animate-event-log-flash/)
      expect(newest.className).not.toMatch(/animate-event-log-flash/)
    })

    it('flashes each entry in a burst of appends independently', () => {
      const state = createGameState('Test', 80, 40)
      const initial = [makeEvent('1', 'one')]
      const { rerender } = render(<EventLog state={state} eventLog={initial} />)

      const burst = [makeEvent('3', 'three'), makeEvent('2', 'two'), makeEvent('1', 'one')]
      rerender(<EventLog state={state} eventLog={burst} />)

      const e2 = screen.getByTestId('event-log-entry-2')
      const e3 = screen.getByTestId('event-log-entry-3')
      const e1 = screen.getByTestId('event-log-entry-1')
      expect(e2.className).toMatch(/animate-event-log-flash/)
      expect(e3.className).toMatch(/animate-event-log-flash/)
      expect(e1.className).not.toMatch(/animate-event-log-flash/)
    })
  })

  describe('auto-scroll resume + unread counter', () => {
    // jsdom does not lay out scrollable elements; stub scroll geometry per test
    const stubScroll = (el: HTMLElement, opts: { scrollHeight: number; clientHeight: number; scrollTop: number }) => {
      Object.defineProperty(el, 'scrollHeight', { configurable: true, value: opts.scrollHeight })
      Object.defineProperty(el, 'clientHeight', { configurable: true, value: opts.clientHeight })
      Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: opts.scrollTop })
    }

    const requireEl = (root: ParentNode, selector: string): HTMLElement => {
      const el = root.querySelector(selector)
      expect(el).not.toBeNull()
      return el as HTMLElement
    }

    const findScrollContainer = (panel: ParentNode): HTMLElement => requireEl(panel, '.scrollbar-custom')

    it('shows "N new events" indicator when new events arrive while user has scrolled away from bottom', () => {
      const state = createGameState('Test', 80, 40)
      const initial = [makeEvent('1', 'one')]
      const { rerender, container } = render(<EventLog state={state} eventLog={initial} />)
      const panel = requireEl(container, '[data-panel="event-log"]')
      const scroll = findScrollContainer(panel)

      // Simulate user scrolling away from bottom
      stubScroll(scroll, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 })
      fireEvent.scroll(scroll)

      // Two new events arrive while user is scrolled up
      const grown = [makeEvent('3', 'three'), makeEvent('2', 'two'), makeEvent('1', 'one')]
      rerender(<EventLog state={state} eventLog={grown} />)

      const indicator = screen.getByTestId('event-log-unread-indicator')
      expect(indicator.textContent).toMatch(/2 new events/)
    })

    it('resumes auto-scroll on mouseleave and clears the unread counter', () => {
      const state = createGameState('Test', 80, 40)
      const initial = [makeEvent('1', 'one')]
      const { rerender, container } = render(<EventLog state={state} eventLog={initial} />)
      const panel = requireEl(container, '[data-panel="event-log"]')
      const scroll = findScrollContainer(panel)

      stubScroll(scroll, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 })
      fireEvent.scroll(scroll)

      const grown = [makeEvent('2', 'two'), makeEvent('1', 'one')]
      rerender(<EventLog state={state} eventLog={grown} />)
      expect(screen.queryByTestId('event-log-unread-indicator')).not.toBeNull()

      // Cursor leaves the log overlay → resume auto-scroll
      fireEvent.mouseLeave(panel)
      expect(screen.queryByTestId('event-log-unread-indicator')).toBeNull()
      expect(scroll.scrollTop).toBe(scroll.scrollHeight)
    })

    it('resumes auto-scroll when user scrolls back to bottom and clears the unread counter', () => {
      const state = createGameState('Test', 80, 40)
      const initial = [makeEvent('1', 'one')]
      const { rerender, container } = render(<EventLog state={state} eventLog={initial} />)
      const panel = requireEl(container, '[data-panel="event-log"]')
      const scroll = findScrollContainer(panel)

      stubScroll(scroll, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 })
      fireEvent.scroll(scroll)

      const grown = [makeEvent('2', 'two'), makeEvent('1', 'one')]
      rerender(<EventLog state={state} eventLog={grown} />)
      expect(screen.queryByTestId('event-log-unread-indicator')).not.toBeNull()

      // User scrolls back to bottom (within 4px threshold)
      stubScroll(scroll, { scrollHeight: 200, clientHeight: 100, scrollTop: 100 })
      fireEvent.scroll(scroll)
      expect(screen.queryByTestId('event-log-unread-indicator')).toBeNull()
    })

    it('clicking the unread indicator scrolls to bottom and resumes auto-scroll', () => {
      const state = createGameState('Test', 80, 40)
      const initial = [makeEvent('1', 'one')]
      const { rerender, container } = render(<EventLog state={state} eventLog={initial} />)
      const panel = requireEl(container, '[data-panel="event-log"]')
      const scroll = findScrollContainer(panel)

      stubScroll(scroll, { scrollHeight: 200, clientHeight: 100, scrollTop: 0 })
      fireEvent.scroll(scroll)

      const grown = [makeEvent('2', 'two'), makeEvent('1', 'one')]
      rerender(<EventLog state={state} eventLog={grown} />)
      const indicator = screen.getByTestId('event-log-unread-indicator')

      fireEvent.click(indicator)
      expect(screen.queryByTestId('event-log-unread-indicator')).toBeNull()
      expect(scroll.scrollTop).toBe(scroll.scrollHeight)
    })
  })
})
