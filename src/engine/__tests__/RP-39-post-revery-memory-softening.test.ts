import { describe, expect, it } from 'vitest'

import { initiateRevery, tickRevery } from '../revery'
import { computeZoneVisibility } from '../visibility'
import { OmenKind, ReveryPhase, Zone } from '../types'

import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'

const driveReveryToClosingAndTick = (state: ReturnType<typeof createTestState>, time: number): void => {
  initiateRevery(state, time, OmenKind.BeeOnShoulder)
  tickRevery(state, 0, time + 100) // Omen → Observing
  if (state.revery) state.revery.phase = ReveryPhase.Closing
  tickRevery(state, 0, time + 200) // Closing → null
}

describe('RP-39 post-revery memory softening', () => {
  it('softening-fires-on-revery-exit: Closing tick clears overworldFogDiscovered and nulls state.revery', () => {
    const state = createTestState()
    state.overworldFogDiscovered.add('10,10')
    state.overworldFogDiscovered.add('11,10')
    state.overworldFogDiscovered.add('12,12')
    expect(state.overworldFogDiscovered.size).toBe(3)

    driveReveryToClosingAndTick(state, 1000)

    expect(state.overworldFogDiscovered.size).toBe(0)
    expect(state.revery).toBeNull()
  })

  it('explored-set-untouched-on-exit: overworldFogExplored is set-equal before and after', () => {
    const state = createTestState()
    state.overworldFogDiscovered.add('20,20')
    state.overworldFogDiscovered.add('21,20')
    state.overworldFogExplored.add('20,20')
    state.overworldFogExplored.add('21,20')
    state.overworldFogExplored.add('22,20')
    state.overworldFogExplored.add('23,20')
    const exploredSnapshot = new Set(state.overworldFogExplored)

    driveReveryToClosingAndTick(state, 2000)

    expect(state.overworldFogExplored.size).toBe(exploredSnapshot.size)
    for (const key of exploredSnapshot) {
      expect(state.overworldFogExplored.has(key)).toBe(true)
    }
  })

  it('cave-memory-untouched-on-exit: caveFogDiscovered and caveFogExplored are unmodified', () => {
    const state = createTestState()
    state.caveFogDiscovered.add('5,5')
    state.caveFogDiscovered.add('6,5')
    state.caveFogExplored.add('5,5')
    state.caveFogExplored.add('6,5')
    state.caveFogExplored.add('7,5')
    state.overworldFogDiscovered.add('30,30')
    const discoveredSnapshot = new Set(state.caveFogDiscovered)
    const exploredSnapshot = new Set(state.caveFogExplored)

    driveReveryToClosingAndTick(state, 3000)

    expect(state.caveFogDiscovered.size).toBe(discoveredSnapshot.size)
    for (const key of discoveredSnapshot) {
      expect(state.caveFogDiscovered.has(key)).toBe(true)
    }
    expect(state.caveFogExplored.size).toBe(exploredSnapshot.size)
    for (const key of exploredSnapshot) {
      expect(state.caveFogExplored.has(key)).toBe(true)
    }
    expect(state.overworldFogDiscovered.size).toBe(0)
  })

  it('softening-fires-on-every-revery-exit: two sequential Reveries each drain overworldFogDiscovered', () => {
    const state = createTestState()
    state.overworldFogDiscovered.add('40,40')
    state.overworldFogDiscovered.add('41,40')

    driveReveryToClosingAndTick(state, 4000)
    expect(state.overworldFogDiscovered.size).toBe(0)

    state.overworldFogDiscovered.add('50,50')
    state.overworldFogDiscovered.add('51,50')
    state.overworldFogDiscovered.add('52,50')
    expect(state.overworldFogDiscovered.size).toBe(3)

    driveReveryToClosingAndTick(state, 8000)
    expect(state.overworldFogDiscovered.size).toBe(0)
  })

  it('walking-out-repromotes-tiles: computeZoneVisibility grows overworldFogDiscovered after softening', () => {
    const state = createTestState()
    state.overworldFogDiscovered.add('60,60')
    state.overworldFogDiscovered.add('61,60')

    driveReveryToClosingAndTick(state, 5000)
    expect(state.overworldFogDiscovered.size).toBe(0)

    swapToOverworldForTest(state)
    clearAroundPlayer(state, 3)
    expect(state.currentZone).toBe(Zone.Overworld)

    computeZoneVisibility(state)

    expect(state.overworldFogDiscovered.size).toBeGreaterThan(0)
  })
})
