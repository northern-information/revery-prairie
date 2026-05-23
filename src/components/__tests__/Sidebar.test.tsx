import { createRef } from 'react'
import { Sidebar } from '../Sidebar'
import { render, screen } from '@testing-library/react'

import { combineFromBackpack } from '@/engine/combine'
import { ComponentType } from '@/engine/ecs/types'
import { completeGenesis } from '@/engine/genesis'
import { placeItem } from '@/engine/inventory'
import { posKey } from '@/engine/position'
import { worldToScreen } from '@/engine/projection'
import { createGameState } from '@/engine/state'
import { Season, Sky, TileType } from '@/engine/types'
import type { ItemInfoHandle } from '../ItemInfo'
import type { CharMetrics, GameState } from '@/engine/types'

const stockBackpackForCombine = (state: GameState): void => {
  placeItem(state.backpack, 'bee', 0, 0)
  placeItem(state.backpack, 'clover', 1, 0)
}

const defaultInfoRef = createRef<ItemInfoHandle>()
const noop = () => undefined

describe('Sidebar', () => {
  it('renders null during genesis (no genesis HUD in the sidebar)', () => {
    const state = createGameState('Willow', 80, 40)
    // Do not call completeGenesis — state.genesis is non-null and
    // epochIndex < GENESIS_EPOCHS.length, so the Sidebar should
    // render nothing.
    const { container } = render(
      <Sidebar
        state={state}
        itemInfoRef={defaultInfoRef}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(container.querySelector('[data-panel="sidebar"]')).toBeNull()
  })

  it('renders steward name', () => {
    const state = createGameState('Willow', 80, 40)
    completeGenesis(state)
    render(
      <Sidebar
        state={state}
        itemInfoRef={defaultInfoRef}
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
        itemInfoRef={defaultInfoRef}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('21,609')).toBeInTheDocument()
  })

  it('shows prairie as no initially', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    render(
      <Sidebar
        state={state}
        itemInfoRef={defaultInfoRef}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('shows prairie as yes after combining', () => {
    const state = createGameState('Test', 80, 40)
    completeGenesis(state)
    // Ensure the player's standing tile is dirt — combineFromBackpack
    // bails early if the player is on sand/non-walkable terrain, and
    // the randomized coastline can drop the player on either depending
    // on Math.random consumption upstream.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx] = { type: TileType.Dirt }
      }
    }
    stockBackpackForCombine(state)
    combineFromBackpack(state, 'bee', 'clover')
    render(
      <Sidebar
        state={state}
        itemInfoRef={defaultInfoRef}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText('Yes')).toBeInTheDocument()
  })

  it('shows clover count after combining (precis-17 ceremony seed is a single tile)', () => {
    const state = createGameState('Test', 20, 20)
    completeGenesis(state)
    // Ensure 3x3 around player is dirt — and clear any clover that
    // genesis may have placed there.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx] = { type: TileType.Dirt }
        state.floraLifecycle.delete(posKey(state.player.x + dx, state.player.y + dy))
      }
    }
    // Zero out any leftover clover globally so the sidebar count starts at 0.
    for (const row of state.map) {
      for (let x = 0; x < row.length; x++) {
        if (row[x].type === TileType.Flora) {
          row[x] = { type: TileType.Dirt }
        }
      }
    }
    state.floraLifecycle.clear()

    stockBackpackForCombine(state)
    combineFromBackpack(state, 'bee', 'clover')
    render(
      <Sidebar
        state={state}
        itemInfoRef={defaultInfoRef}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    // The ceremony seeds exactly one clover tile at the player position.
    // Wave-painted tiles arrive on subsequent tickFloraWaves calls,
    // which this test does not run. Multiple cells render "1" (bees,
    // wave count, etc.), so scope the assertion to the Clover row's
    // value cell via its text-clover class.
    const cloverCell = document.querySelector('td.text-clover.text-right')
    expect(cloverCell?.textContent).toBe('1')
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
    stockBackpackForCombine(state)
    // Force non-rain so spawnBeeOrMonarch deterministically spawns a bee.
    state.weather.sky = Sky.Sun
    combineFromBackpack(state, 'bee', 'clover')
    render(
      <Sidebar
        state={state}
        itemInfoRef={defaultInfoRef}
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
    // Pin a spring day — generateWeather is initial-phase based and may
    // produce other seasons in fresh states. (precis #2)
    state.weather.season = Season.Spring
    render(
      <Sidebar
        state={state}
        itemInfoRef={defaultInfoRef}
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
        itemInfoRef={defaultInfoRef}
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText(/°F/)).toBeInTheDocument()
    expect(screen.getByText(/mph/)).toBeInTheDocument()
  })

  describe('effects row resolves cursor through projection', () => {
    const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

    const findGron = (state: GameState): { x: number; y: number } => {
      for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
        const id = state.world.getComponent(eid, ComponentType.CharacterIdentity)
        if (id?.definitionId !== 'gron') continue
        const pos = state.world.getComponent(eid, ComponentType.Position)
        if (pos) return { x: pos.x, y: pos.y }
      }
      throw new Error('Gron not found')
    }

    it('shows "rain" when hovering Gron rain aura', () => {
      const state = createGameState('Test', 80, 40)
      completeGenesis(state)
      // Glint zones use Math.random() so they vary between runs and can add
      // ", glinting" to the cursor's effects label. Clear them so the
      // assertion only sees "rain".
      state.glintZones.clear()

      // Aim at a tile inside Gron's rain aura (radius 6).
      const gron = findGron(state)
      const target = { x: gron.x + 2, y: gron.y }

      // Place the camera so target is on-screen, then convert world → screen
      // via the same transform the renderer uses.
      state.camera = {
        x: target.x - Math.floor(state.viewportWidth / 2),
        y: target.y - Math.floor(state.viewportHeight / 2),
      }
      const screenPos = worldToScreen(
        target.x,
        target.y,
        state.camera,
        metrics.charWidth,
        metrics.charHeight,
        state.viewportWidth,
        state.viewportHeight
      )
      // Nudge into the diamond's interior — anchors sit at the centerline so
      // exact-corner positions can floor either way.
      state.cursorScreenPos = { x: screenPos.px + 1, y: screenPos.py + 1 }

      const metricsRef = { current: metrics }
      render(
        <Sidebar
          state={state}
          itemInfoRef={defaultInfoRef}
          metricsRef={metricsRef}
          refreshUI={noop}
        />
      )

      expect(screen.getByText('rain')).toBeInTheDocument()
    })

    it('hides the cursor section entirely when cursorScreenPos is null', () => {
      const state = createGameState('Test', 80, 40)
      completeGenesis(state)
      state.cursorScreenPos = null

      const metricsRef = { current: metrics }
      const { container } = render(
        <Sidebar
          state={state}
          itemInfoRef={defaultInfoRef}
          metricsRef={metricsRef}
          refreshUI={noop}
        />
      )

      expect(container.textContent).not.toMatch(/Effects/)
    })

    it('keeps the cursor section visible while WASD is held', () => {
      const state = createGameState('Test', 80, 40)
      completeGenesis(state)
      state.glintZones.clear()
      const gron = findGron(state)
      const target = { x: gron.x + 2, y: gron.y }
      state.camera = {
        x: target.x - Math.floor(state.viewportWidth / 2),
        y: target.y - Math.floor(state.viewportHeight / 2),
      }
      const screenPos = worldToScreen(
        target.x,
        target.y,
        state.camera,
        metrics.charWidth,
        metrics.charHeight,
        state.viewportWidth,
        state.viewportHeight
      )
      state.cursorScreenPos = { x: screenPos.px + 1, y: screenPos.py + 1 }
      state.heldDirection = 'right'

      const metricsRef = { current: metrics }
      render(
        <Sidebar
          state={state}
          itemInfoRef={defaultInfoRef}
          metricsRef={metricsRef}
          refreshUI={noop}
        />
      )

      expect(screen.getByText('rain')).toBeInTheDocument()
    })

    it('keeps the cursor section visible while a click-to-move path is active', () => {
      const state = createGameState('Test', 80, 40)
      completeGenesis(state)
      state.glintZones.clear()
      const gron = findGron(state)
      const target = { x: gron.x + 2, y: gron.y }
      state.camera = {
        x: target.x - Math.floor(state.viewportWidth / 2),
        y: target.y - Math.floor(state.viewportHeight / 2),
      }
      const screenPos = worldToScreen(
        target.x,
        target.y,
        state.camera,
        metrics.charWidth,
        metrics.charHeight,
        state.viewportWidth,
        state.viewportHeight
      )
      state.cursorScreenPos = { x: screenPos.px + 1, y: screenPos.py + 1 }
      state.path = [{ x: target.x, y: target.y }]

      const metricsRef = { current: metrics }
      render(
        <Sidebar
          state={state}
          itemInfoRef={defaultInfoRef}
          metricsRef={metricsRef}
          refreshUI={noop}
        />
      )

      expect(screen.getByText('rain')).toBeInTheDocument()
    })
  })

  describe('boot title card sidebar behavior', () => {
    it('renders the sidebar at full opacity while bootTitleCard is active', () => {
      // The black title-card overlay covers the renderer swap, so the
      // sidebar no longer needs a fade-in CSS animation.
      const state = createGameState('Test', 80, 40)
      completeGenesis(state)
      expect(state.bootTitleCard).not.toBeNull()

      const { container } = render(
        <Sidebar
          state={state}
          itemInfoRef={defaultInfoRef}
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

    it('still applies the deep-time fade when deepTimeTransition is active', () => {
      // Deep-time transition still uses the fade-in mechanism.
      const state = createGameState('Test', 80, 40)
      completeGenesis(state, { skipTitleCard: true })
      state.deepTimeTransition = { startTime: 0, duration: 1000 }

      const { container } = render(
        <Sidebar
          state={state}
          itemInfoRef={defaultInfoRef}
          metricsRef={createRef()}
          refreshUI={noop}
        />
      )

      const backdrop = container.querySelector<HTMLElement>('[data-panel="sidebar"]')
      const content = backdrop?.querySelector<HTMLElement>(':scope > div')
      expect(content?.style.opacity).toBe('0')
      expect(content?.style.animation).toContain('fade-in')
    })
  })
})
