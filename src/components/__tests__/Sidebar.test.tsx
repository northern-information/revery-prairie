import { createRef } from 'react'
import { Sidebar } from '../Sidebar'
import { render, screen } from '@testing-library/react'

import { combineBeeAndClover } from '@/engine/combine'
import { completeGenesis } from '@/engine/genesis'
import { createGameState } from '@/engine/state'
import { TileType } from '@/engine/types'
import type { ItemInfoHandle } from '../ItemInfo'

const defaultInfoRef = createRef<ItemInfoHandle>()
const noop = () => undefined

describe('Sidebar', () => {
  it('renders steward name', () => {
    const state = createGameState('Willow', 80, 40)
    completeGenesis(state)
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('Willow')).toBeInTheDocument()
  })

  it('renders total land count', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('16,150')).toBeInTheDocument()
  })

  it('shows prairie as no initially', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('shows prairie as yes after combining', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    combineBeeAndClover(state)
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('Yes')).toBeInTheDocument()
  })

  it('shows clover count after combining', () => {
    const state = createGameState('Test', 20, 20)
    completeGenesis(state)
    // Ensure 3x3 around player is dirt
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx] = { type: TileType.Dirt }
      }
    }
    combineBeeAndClover(state)
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('shows bee count after combining', () => {
    const state = createGameState('Test', 20, 20)
    completeGenesis(state)
    // Ensure 3x3 around player is dirt so combine succeeds on small maps
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx] = { type: TileType.Dirt }
      }
    }
    combineBeeAndClover(state)
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    const ones = screen.getAllByText('1')
    expect(ones.length).toBeGreaterThanOrEqual(1)
  })

  it('renders weather section in metric by default', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('Spring')).toBeInTheDocument()
    expect(screen.getByText(/°C/)).toBeInTheDocument()
    expect(screen.getByText(/kph/)).toBeInTheDocument()
    expect(screen.getByText('Humidity')).toBeInTheDocument()
  })

  it('renders weather in imperial when metric is false', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    state.metric = false
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText(/°F/)).toBeInTheDocument()
    expect(screen.getByText(/mph/)).toBeInTheDocument()
  })

  it('log scroll container has pointer-events-auto so wheel events do not fall through to canvas zoom', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    const eventLog = [
      { id: '1', kind: 'pickup' as const, text: 'test event', icon: '!', iconColor: '#fff', timestamp: 0, worldX: 0, worldY: 0 },
    ]
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        eventLog={eventLog}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    const logEntry = screen.getByText('test event')
    const scrollContainer = logEntry.closest('.overflow-y-auto')
    expect(scrollContainer).toBeInTheDocument()
    expect(scrollContainer?.className).toMatch(/pointer-events-auto/)
  })

  describe('genesis transition backdrop continuity', () => {
    it('keeps the outer backdrop at full opacity during genesisTransition', () => {
      const state = createGameState('Test', 80, 40)
      completeGenesis(state)
      expect(state.genesisTransition).not.toBeNull()

      const { container } = render(
        <Sidebar
          state={state}
          activeScreen={null}
          itemInfoRef={defaultInfoRef}
          eventLog={[]}
          metricsRef={createRef()}
          refreshUI={noop}
        />
      )

      const backdrop = container.querySelector<HTMLElement>('[data-panel="sidebar"]')
      expect(backdrop).not.toBeNull()
      expect(backdrop?.style.opacity).toBe('')
      expect(backdrop?.style.animation).toBe('')
    })

    it('applies the fade-in to the inner content wrapper during genesisTransition', () => {
      const state = createGameState('Test', 80, 40)
      completeGenesis(state)

      const { container } = render(
        <Sidebar
          state={state}
          activeScreen={null}
          itemInfoRef={defaultInfoRef}
          eventLog={[]}
          metricsRef={createRef()}
          refreshUI={noop}
        />
      )

      const backdrop = container.querySelector<HTMLElement>('[data-panel="sidebar"]')
      const content = backdrop?.querySelector<HTMLElement>(':scope > div')
      expect(content).not.toBeNull()
      expect(content?.style.opacity).toBe('0')
      expect(content?.style.animation).toContain('fade-in')
    })

    it('applies no fade style once genesisTransition is cleared', () => {
      const state = createGameState('Test', 80, 40)
      completeGenesis(state)
      state.genesisTransition = null

      const { container } = render(
        <Sidebar
          state={state}
          activeScreen={null}
          itemInfoRef={defaultInfoRef}
          eventLog={[]}
          metricsRef={createRef()}
          refreshUI={noop}
        />
      )

      const backdrop = container.querySelector<HTMLElement>('[data-panel="sidebar"]')
      const content = backdrop?.querySelector<HTMLElement>(':scope > div')
      expect(backdrop?.style.opacity).toBe('')
      expect(content?.style.opacity).toBe('')
      expect(content?.style.animation).toBe('')
    })
  })
})
