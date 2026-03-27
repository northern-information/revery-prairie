import { pickUpGroundItems, tickShootingStars } from '../actions'
import { PICKUP_EFFECT_DURATION_MS } from '../constants'

import { clearAroundPlayer, createTestState } from './helpers'

describe('meteoritePickupEffect', () => {
  it('creates a pickup effect when a meteorite is picked up with time', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.meteorites = [{ pos: { x: state.player.x, y: state.player.y } }]

    pickUpGroundItems(state, 5000)

    expect(state.meteoritePickupEffects).toHaveLength(1)
    expect(state.meteoritePickupEffects[0].pos).toEqual({
      x: state.player.x,
      y: state.player.y,
    })
    expect(state.meteoritePickupEffects[0].startTime).toBe(5000)
  })

  it('does not create an effect when no meteorite is present', () => {
    const state = createTestState()
    clearAroundPlayer(state)

    pickUpGroundItems(state, 5000)

    expect(state.meteoritePickupEffects).toHaveLength(0)
  })

  it('does not create an effect when time is omitted', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.meteorites = [{ pos: { x: state.player.x, y: state.player.y } }]

    pickUpGroundItems(state)

    expect(state.meteoritePickupEffects).toHaveLength(0)
  })

  it('cleans up expired effects in tickShootingStars', () => {
    const state = createTestState()
    state.meteoritePickupEffects = [
      { pos: { x: 10, y: 10 }, startTime: 1000 },
    ]

    tickShootingStars(state, 1000 + PICKUP_EFFECT_DURATION_MS + 1)

    expect(state.meteoritePickupEffects).toHaveLength(0)
  })

  it('retains non-expired effects in tickShootingStars', () => {
    const state = createTestState()
    state.meteoritePickupEffects = [
      { pos: { x: 10, y: 10 }, startTime: 1000 },
    ]

    tickShootingStars(state, 1000 + PICKUP_EFFECT_DURATION_MS - 100)

    expect(state.meteoritePickupEffects).toHaveLength(1)
  })

  it('still picks up the meteorite normally', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.meteorites = [{ pos: { x: state.player.x, y: state.player.y } }]

    // Prevent chain explosion from spawning extra meteorites
    const orig = Math.random
    Math.random = () => 0.9
    try {
      const result = pickUpGroundItems(state, 5000)

      expect(result.pickedUp).toContain('meteorite')
      expect(state.meteorites).toHaveLength(0)
      expect(state.backpack.items.some(i => i.definitionId === 'meteorite')).toBe(true)
    } finally {
      Math.random = orig
    }
  })
})
