import { CommandPanel } from '../CommandPanel'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createCharacterTestEntity, createTestState } from '@/engine/__tests__/helpers'
import { CoyoteMode } from '@/engine/types'

import type { Entity } from '@/engine/ecs/types'

const spawnCoyote = (): { state: ReturnType<typeof createTestState>; coyoteEid: Entity } => {
  const state = createTestState()
  const coyoteEid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y)
  return { state, coyoteEid }
}

const spawnGron = (): { state: ReturnType<typeof createTestState>; gronEid: Entity } => {
  const state = createTestState()
  const gronEid = createCharacterTestEntity(state, 'gron', state.player.x + 1, state.player.y)
  return { state, gronEid }
}

describe('coyote command panel', () => {
  it('returns null when no units are selected', () => {
    const { state } = spawnCoyote()
    const { container } = render(<CommandPanel state={state} refreshUI={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders follow and collect buttons when a coyote is selected', () => {
    const { state, coyoteEid } = spawnCoyote()
    state.selectedUnits.add(coyoteEid)

    const { getByText } = render(<CommandPanel state={state} refreshUI={vi.fn()} />)
    expect(getByText('follow')).toBeTruthy()
    expect(getByText('collect')).toBeTruthy()
  })

  it('clicking follow sets coyoteMode to Follow and clears coyotePath', () => {
    const { state, coyoteEid } = spawnCoyote()
    state.selectedUnits.add(coyoteEid)
    state.coyoteMode = CoyoteMode.Collect
    state.coyotePath = [{ x: 5, y: 5 }]

    const { getByText } = render(<CommandPanel state={state} refreshUI={vi.fn()} />)
    fireEvent.click(getByText('follow'))

    expect(state.coyoteMode).toBe(CoyoteMode.Follow)
    expect(state.coyotePath).toBeNull()
  })

  it('clicking collect sets coyoteMode to Collect and clears coyotePath', () => {
    const { state, coyoteEid } = spawnCoyote()
    state.selectedUnits.add(coyoteEid)
    state.coyoteMode = CoyoteMode.Follow
    state.coyotePath = [{ x: 5, y: 5 }]

    const { getByText } = render(<CommandPanel state={state} refreshUI={vi.fn()} />)
    fireEvent.click(getByText('collect'))

    expect(state.coyoteMode).toBe(CoyoteMode.Collect)
    expect(state.coyotePath).toBeNull()
  })

  it('does not render coyote-specific follow/collect buttons when only gron is selected', () => {
    const { state, gronEid } = spawnGron()
    state.selectedUnits.add(gronEid)

    const { queryByText, container } = render(<CommandPanel state={state} refreshUI={vi.fn()} />)
    expect(container.firstChild).not.toBeNull()
    expect(queryByText('follow')).toBeNull()
    expect(queryByText('collect')).toBeNull()
  })

  it('hides follow/collect when multiple units are selected', () => {
    const { state, coyoteEid } = spawnCoyote()
    const gronEid = createCharacterTestEntity(state, 'gron', state.player.x, state.player.y + 1)
    state.selectedUnits.add(coyoteEid)
    state.selectedUnits.add(gronEid)

    const { queryByText } = render(<CommandPanel state={state} refreshUI={vi.fn()} />)
    expect(queryByText('follow')).toBeNull()
    expect(queryByText('collect')).toBeNull()
  })

  it('skips dead entities — returns null when the only selected entity is dead', () => {
    const { state, coyoteEid } = spawnCoyote()
    state.selectedUnits.add(coyoteEid)
    state.world.destroyEntity(coyoteEid)

    const { container } = render(<CommandPanel state={state} refreshUI={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
