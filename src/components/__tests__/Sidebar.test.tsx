import { createRef } from 'react'
import { Sidebar } from '../Sidebar'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { combineBeeAndClover } from '@/engine/actions'
import { createOmniboxContainer } from '@/engine/inventory'
import { createGameState } from '@/engine/state'
import { TileType } from '@/engine/types'
import type { ItemInfoHandle } from '../ItemInfo'

const defaultInfoRef = createRef<ItemInfoHandle>()
const noop = vi.fn()

describe('Sidebar', () => {
  it('renders steward name', () => {
    const state = createGameState('Willow', 80, 40)
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    expect(screen.getByText('Willow')).toBeInTheDocument()
  })

  it('renders total land count', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    expect(screen.getByText('16,150')).toBeInTheDocument()
  })

  it('shows prairie as no initially', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    expect(screen.getByText('no')).toBeInTheDocument()
  })

  it('shows prairie as yes after combining', () => {
    const state = createGameState('Test', 80, 40)
    combineBeeAndClover(state)
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    expect(screen.getByText('yes')).toBeInTheDocument()
  })

  it('shows clover count after combining', () => {
    const state = createGameState('Test', 20, 20)
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
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('shows bee count after combining', () => {
    const state = createGameState('Test', 20, 20)
    combineBeeAndClover(state)
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    const ones = screen.getAllByText('1')
    expect(ones.length).toBeGreaterThanOrEqual(1)
  })

  it('renders control hints', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    expect(screen.getByText('[wasd] move')).toBeInTheDocument()
    expect(screen.getByText('invento[r]y')).toBeInTheDocument()
    expect(screen.getByText('int[e]ract')).toBeInTheDocument()
    expect(screen.getByText('[esc] menu')).toBeInTheDocument()
  })

  it('renders [e] as dim when nothing adjacent', () => {
    const state = createGameState('Test', 80, 40)
    state.characters = []
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    const el = screen.getByText('int[e]ract')
    expect(el.className).toContain('text-dim')
  })

  it('renders [e] as highlighted when adjacent ground omnibox exists', () => {
    const state = createGameState('Test', 80, 40)
    createOmniboxContainer(state, 'uid-1')
    state.groundOmniboxes.push({ uid: 'uid-1', pos: { x: state.player.x + 1, y: state.player.y } })
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    const el = screen.getByText('int[e]ract')
    expect(el.className).toContain('text-text')
  })

  it('renders [e] as highlighted when adjacent to character', () => {
    const state = createGameState('Test', 80, 40)
    state.characters = [{ definitionId: 'gron', pos: { x: state.player.x + 1, y: state.player.y } }]
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    const el = screen.getByText('int[e]ract')
    expect(el.className).toContain('text-text')
  })

  it('renders weather section in metric by default', () => {
    const state = createGameState('Test', 80, 40)
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    expect(screen.getByText('spring')).toBeInTheDocument()
    expect(screen.getByText(/°C/)).toBeInTheDocument()
    expect(screen.getByText(/kph/)).toBeInTheDocument()
    expect(screen.getByText(/%/)).toBeInTheDocument()
  })

  it('renders weather in imperial when metric is false', () => {
    const state = createGameState('Test', 80, 40)
    state.metric = false
    render(
      <Sidebar
        state={state}
        activePanel={null}
        setActivePanel={noop}
        itemInfoRef={defaultInfoRef}
        eventLog={[]}
        metricsRef={createRef()}
      />
    )

    expect(screen.getByText(/°F/)).toBeInTheDocument()
    expect(screen.getByText(/mph/)).toBeInTheDocument()
  })
})
