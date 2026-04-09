import { createRef } from 'react'
import { Sidebar } from '../Sidebar'
import { render, screen } from '@testing-library/react'

import { combineBeeAndClover } from '@/engine/combine'
import { createGameState } from '@/engine/state'
import { TileType } from '@/engine/types'
import type { ItemInfoHandle } from '../ItemInfo'

const defaultInfoRef = createRef<ItemInfoHandle>()
const noop = () => undefined

describe('Sidebar', () => {
  it('renders steward name', () => {
    const state = createGameState('Willow', 80, 40)
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

    expect(screen.getByText('no')).toBeInTheDocument()
  })

  it('shows prairie as yes after combining', () => {
    const state = createGameState('Test', 80, 40)
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

    expect(screen.getByText('spring')).toBeInTheDocument()
    expect(screen.getByText(/°C/)).toBeInTheDocument()
    expect(screen.getByText(/kph/)).toBeInTheDocument()
    expect(screen.getByText('humidity')).toBeInTheDocument()
  })

  it('renders weather in imperial when metric is false', () => {
    const state = createGameState('Test', 80, 40)
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
})
