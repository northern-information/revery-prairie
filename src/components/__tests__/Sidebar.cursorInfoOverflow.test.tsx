import { createRef } from 'react'
import { Sidebar } from '../Sidebar'
import { render, screen } from '@testing-library/react'

import { completeGenesis } from '@/engine/genesis'
import { posKey } from '@/engine/position'
import { worldToScreen } from '@/engine/projection'
import { createGameState } from '@/engine/state'
import { TileType } from '@/engine/types'
import type { CharMetrics, GameState } from '@/engine/types'
import type { ItemInfoHandle } from '../ItemInfo'

const defaultInfoRef = createRef<ItemInfoHandle>()
const noop = () => undefined

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

const aimAt = (state: GameState, x: number, y: number) => {
  state.camera = {
    x: x - Math.floor(state.viewportWidth / 2),
    y: y - Math.floor(state.viewportHeight / 2),
  }
  const sp = worldToScreen(x, y, state.camera, metrics.charWidth, metrics.charHeight, state.viewportWidth, state.viewportHeight)
  state.cursorScreenPos = { x: sp.px + 1, y: sp.py + 1 }
}

describe('cursor info overflow', () => {
  it('renders elevation rounded to nearest integer (not raw float)', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    state.glintZones.clear()

    const x = 20
    const y = 20
    state.map[y][x] = { type: TileType.Dirt }
    state.elevation.set(posKey(x, y), 50.962029139403)
    aimAt(state, x, y)

    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        metricsRef={{ current: metrics }}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('51')).toBeInTheDocument()
    expect(screen.queryByText('50.962029139403')).toBeNull()
  })

  it('falls back to "—" when elevation is undefined', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    state.glintZones.clear()

    const x = 21
    const y = 21
    state.map[y][x] = { type: TileType.Dirt }
    state.elevation.delete(posKey(x, y))
    aimAt(state, x, y)

    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        metricsRef={{ current: metrics }}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders water as integer percent on dirt tiles', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    state.glintZones.clear()

    const x = 22
    const y = 22
    state.map[y][x] = { type: TileType.Dirt }
    state.tileWater.set(posKey(x, y), 98.25)
    state.elevation.set(posKey(x, y), 50)
    aimAt(state, x, y)

    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        metricsRef={{ current: metrics }}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('98%')).toBeInTheDocument()
    expect(screen.queryByText('98.25/100')).toBeNull()
  })

  it('renders water as integer percent on clover tiles', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    state.glintZones.clear()

    const x = 23
    const y = 23
    state.map[y][x] = { type: TileType.Clover }
    state.tileWater.set(posKey(x, y), 12.7)
    state.elevation.set(posKey(x, y), 40)
    aimAt(state, x, y)

    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        metricsRef={{ current: metrics }}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('13%')).toBeInTheDocument()
  })

  it('renders water 0 as "0%" (not blank)', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    state.glintZones.clear()

    const x = 24
    const y = 24
    state.map[y][x] = { type: TileType.Dirt }
    state.tileWater.set(posKey(x, y), 0)
    state.elevation.set(posKey(x, y), 50)
    aimAt(state, x, y)

    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        metricsRef={{ current: metrics }}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('applies truncation classes so long values clip instead of expanding the column', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    state.glintZones.clear()

    const x = 25
    const y = 25
    state.map[y][x] = { type: TileType.Dirt }
    state.elevation.set(posKey(x, y), 50)
    aimAt(state, x, y)

    const { container } = render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
        metricsRef={{ current: metrics }}
        refreshUI={noop}
      />
    )

    const cursorHeader = Array.from(container.querySelectorAll('*')).find(el => el.textContent === 'Cursor')
    expect(cursorHeader).toBeTruthy()
    const table = cursorHeader?.parentElement?.querySelector('table')
    expect(table).toBeTruthy()
    expect(table?.className).toMatch(/table-fixed/)

    const valueCells = table?.querySelectorAll('td.text-right') ?? []
    expect(valueCells.length).toBeGreaterThan(0)
    valueCells.forEach(td => {
      const cls = td.className
      expect(cls).toMatch(/truncate|overflow-hidden/)
    })
  })
})
