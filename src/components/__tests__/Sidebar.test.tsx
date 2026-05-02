import { createRef } from 'react'
import { Sidebar } from '../Sidebar'
import { render, screen } from '@testing-library/react'

import { combineBeeAndClover } from '@/engine/combine'
import { ComponentType } from '@/engine/ecs/types'
import { completeGenesis } from '@/engine/genesis'
import { worldToScreen } from '@/engine/projection'
import { createGameState } from '@/engine/state'
import { TileType } from '@/engine/types'
import type { CharMetrics, GameState } from '@/engine/types'
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
        activeScreen={null}
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
    combineBeeAndClover(state)
    render(
      <Sidebar
        state={state}
        activeScreen={null}
        itemInfoRef={defaultInfoRef}
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
        metricsRef={createRef()}
        refreshUI={noop}
      />
    )

    expect(screen.getByText(/°F/)).toBeInTheDocument()
    expect(screen.getByText(/mph/)).toBeInTheDocument()
  })

  describe('effects row honors isometric projection', () => {
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

    it('shows "rain" when hovering Gron rain aura in iso mode', () => {
      const state = createGameState('Test', 80, 40)
      completeGenesis(state)
      expect(state.isometricProjection).toBe(true)
      // Glint zones use Math.random() so they vary between runs and can add
      // ", glinting" to the cursor's effects label. Clear them so the
      // assertion only sees "rain".
      state.glintZones.clear()

      // Aim at a tile inside Gron's rain aura (radius 6).
      const gron = findGron(state)
      const target = { x: gron.x + 2, y: gron.y }

      // Place the camera so target is on-screen, then convert world → screen
      // via the same iso transform the renderer uses.
      state.camera = { x: target.x - Math.floor(state.viewportWidth / 2), y: target.y - Math.floor(state.viewportHeight / 2) }
      const screenPos = worldToScreen(
        target.x,
        target.y,
        state.camera,
        metrics.charWidth,
        metrics.charHeight,
        true,
        state.viewportWidth,
        state.viewportHeight,
      )
      // Nudge into the diamond's interior — anchors sit at the centerline so
      // exact-corner positions can floor either way.
      state.cursorScreenPos = { x: screenPos.px + 1, y: screenPos.py + 1 }

      const metricsRef = { current: metrics }
      render(
        <Sidebar
          state={state}
          activeScreen={null}
          itemInfoRef={defaultInfoRef}
          metricsRef={metricsRef}
          refreshUI={noop}
        />
      )

      expect(screen.getByText('rain')).toBeInTheDocument()
    })

    it('shows "rain" when hovering Gron rain aura in ortho mode (regression)', () => {
      const state = createGameState('Test', 80, 40)
      completeGenesis(state)
      state.isometricProjection = false
      // Glint zones use Math.random() so they vary between runs and can add
      // ", glinting" to the cursor's effects label. Clear them so the
      // assertion only sees "rain".
      state.glintZones.clear()

      const gron = findGron(state)
      const target = { x: gron.x + 2, y: gron.y }
      state.camera = { x: target.x - 4, y: target.y - 4 }
      state.cursorScreenPos = {
        x: (target.x - state.camera.x) * metrics.charWidth + 1,
        y: (target.y - state.camera.y) * metrics.charHeight + 1,
      }

      const metricsRef = { current: metrics }
      render(
        <Sidebar
          state={state}
          activeScreen={null}
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
          activeScreen={null}
          itemInfoRef={defaultInfoRef}
          metricsRef={metricsRef}
          refreshUI={noop}
        />
      )

      expect(container.textContent).not.toMatch(/Effects/)
    })
  })

  describe('genesis HUD', () => {
    it('renders the year/epoch HUD during genesis', () => {
      const state = createGameState('Test', 80, 40)
      // Do NOT call completeGenesis — exercise the genesis-active branch.
      const { container } = render(
        <Sidebar
          state={state}
          activeScreen={null}
          itemInfoRef={defaultInfoRef}
          metricsRef={createRef()}
          refreshUI={noop}
        />
      )

      expect(container.textContent).toContain('Year')
      expect(container.textContent).toContain('Epoch')
    })

    it('does not render epoch commentary text in the sidebar during genesis', () => {
      const state = createGameState('Test', 80, 40)
      const { container } = render(
        <Sidebar
          state={state}
          activeScreen={null}
          itemInfoRef={defaultInfoRef}
          metricsRef={createRef()}
          refreshUI={noop}
        />
      )

      // The first epoch's commentary string must not appear in the sidebar —
      // narration moved to the EventLog overlay (see event-log-overlay spec).
      expect(container.textContent).not.toContain('Simulating birth of cosmos')
    })
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
