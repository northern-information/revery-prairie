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

  it('nulls state.edgeScrollPos / cursorScreenPos / cursorTile on hover', () => {
    const state = createGameState('Test', 80, 40)
    state.edgeScrollPos = { x: 10, y: 10 }
    state.cursorScreenPos = { x: 20, y: 20 }
    state.cursorTile = { x: 5, y: 5 }
    const eventLog = [makeEvent('1', 'one')]
    render(<EventLog state={state} eventLog={eventLog} />)
    const panel = screen.getByText('one').closest('[data-panel="event-log"]')
    expect(panel).not.toBeNull()
    fireEvent.mouseEnter(panel as HTMLElement)
    expect(state.edgeScrollPos).toBeNull()
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
})
