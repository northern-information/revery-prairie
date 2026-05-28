import { initiateRevery, tickRevery } from '../revery'
import { OmenKind, ReveryPhase } from '../types'
import { createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

const driveReveryToClosingAndTick = (state: ReturnType<typeof createTestState>, time: number): void => {
  initiateRevery(state, time, OmenKind.BeeOnShoulder)
  tickRevery(state, 0, time + 100) // Omen → Observing
  if (state.revery) state.revery.phase = ReveryPhase.Closing
  tickRevery(state, 0, time + 200) // Closing → null
}

// RP-39 is RETIRED, subsumed by RP-62 ("fog returns to memory"). The
// post-Revery softening hook drained overworldFogDiscovered on Revery exit so
// the prairie dimmed back to memory. Under RP-62 that dimming is the permanent
// default the moment the steward looks away — there is no bright tier to drain,
// and overworldFogDiscovered no longer exists. These tests assert the hook is
// gone: Revery exit touches no fog state, and the overworld fog sets that DO
// exist (overworldFogExplored) are untouched by tickRevery.
describe('RP-39 post-revery memory softening (retired by RP-62)', () => {
  it('Closing tick nulls state.revery without mutating overworldFogExplored', () => {
    const state = createTestState()
    state.overworldFogExplored.add('20,20')
    state.overworldFogExplored.add('21,20')
    state.overworldFogExplored.add('22,20')
    const exploredSnapshot = new Set(state.overworldFogExplored)

    driveReveryToClosingAndTick(state, 1000)

    expect(state.revery).toBeNull()
    expect(state.overworldFogExplored.size).toBe(exploredSnapshot.size)
    for (const key of exploredSnapshot) {
      expect(state.overworldFogExplored.has(key)).toBe(true)
    }
  })

  it('Closing tick does not touch cave fog memory', () => {
    const state = createTestState()
    state.caveFogExplored.add('5,5')
    state.caveFogExplored.add('6,5')
    const exploredSnapshot = new Set(state.caveFogExplored)

    driveReveryToClosingAndTick(state, 3000)

    expect(state.caveFogExplored.size).toBe(exploredSnapshot.size)
    for (const key of exploredSnapshot) {
      expect(state.caveFogExplored.has(key)).toBe(true)
    }
  })

  it('every Revery exit nulls state.revery (no per-tenure gate)', () => {
    const state = createTestState()

    driveReveryToClosingAndTick(state, 4000)
    expect(state.revery).toBeNull()

    driveReveryToClosingAndTick(state, 8000)
    expect(state.revery).toBeNull()
  })
})
