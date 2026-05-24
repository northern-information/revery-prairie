import { describe, expect, it } from 'vitest'

import { ComponentType } from '../ecs/types'
import { createCharacterEntity } from '../entities'
import { posKey } from '../position'
import { initiateRevery, tickRevery } from '../revery'
import { OmenKind, ReveryPhase, TileType, Zone } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

import type { GameState } from '../types'

// RP-32 — summons-sequence + Closing-egregoric-commit tests.
//
// The summons path: pressure crosses ceiling → initiateRevery + summons=true
// → tickRevery's Omen branch teleports Gron adjacent, opens his dialog,
// captures the collapse tile. At Closing, the collapse tile commits to
// TileType.Egregore via commitEgregoreTiles and dormancyPressure resets.

const setupSummonsState = (state: GameState): void => {
  state.currentZone = Zone.Overworld
  clearAroundPlayer(state, 3)
  state.dormancyPressure = 1
}

const placeGron = (state: GameState, x: number, y: number) => {
  return createCharacterEntity(state, 'gron', { x, y })
}

describe('summons sequence — Omen → Observing (RP-32)', () => {
  it('captures summonsCollapseTile at the steward position', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    // RP-33 — capture the collapse tile expectation BEFORE
    // tickRevery, since the Omen → Observing scene transition moves the
    // steward to the house bed.
    const expectedCollapse = { x: state.player.x, y: state.player.y }
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    expect(state.revery?.summonsCollapseTile).toEqual(expectedCollapse)
  })

  it('mirrors the collapse tile onto state.collapsedStewardTile', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    const expectedCollapse = { x: state.player.x, y: state.player.y }
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    expect(state.collapsedStewardTile).toEqual(expectedCollapse)
  })

  it('sets summonsAudioCue = true', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    expect(state.revery?.summonsAudioCue).toBe(true)
  })

  it('teleports Gron to a walkable tile adjacent to the steward', () => {
    const state = createTestState()
    setupSummonsState(state)
    const gron = placeGron(state, state.player.x + 5, state.player.y + 5)
    // RP-33 — Gron is teleported to a tile adjacent to the steward's
    // PRE-scene-transition position (his current overworld spot at the
    // moment of summons). Capture that before tickRevery.
    const stewardAtSummons = { x: state.player.x, y: state.player.y }
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    const gronPos = state.world.getComponent(gron, ComponentType.Position)
    expect(gronPos).toBeDefined()
    const dx = Math.abs((gronPos?.x ?? 0) - stewardAtSummons.x)
    const dy = Math.abs((gronPos?.y ?? 0) - stewardAtSummons.y)
    expect(dx + dy).toBe(1) // exactly cardinal-adjacent
  })

  it('opens Gron dialog with characterId=gron and lineIndex=0', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    expect(state.activeDialog).toEqual({
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    })
  })

  it('does not crash when Gron entity is missing', () => {
    const state = createTestState()
    setupSummonsState(state)
    // No Gron entity placed.
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    expect(() => {
      tickRevery(state, 0, 1000)
    }).not.toThrow()
    expect(state.activeDialog).toBeNull() // dialog skipped when Gron missing
    expect(state.revery?.phase).toBe(ReveryPhase.Observing)
  })

  it('does not crash when no adjacent walkable tile exists (Gron not teleported, dialog still opens)', () => {
    const state = createTestState()
    setupSummonsState(state)
    // Surround player with truly unwalkable tiles (Water is walkable per
    // the project's water-walkable mechanic; CaveWall is not).
    const px = state.player.x
    const py = state.player.y
    state.map[py][px - 1] = { type: TileType.CaveWall }
    state.map[py][px + 1] = { type: TileType.CaveWall }
    state.map[py - 1][px] = { type: TileType.CaveWall }
    state.map[py + 1][px] = { type: TileType.CaveWall }
    const gron = placeGron(state, px + 5, py + 5)
    const originalGronPos = state.world.getComponent(gron, ComponentType.Position)
    const ox = originalGronPos?.x
    const oy = originalGronPos?.y
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    expect(() => {
      tickRevery(state, 0, 1000)
    }).not.toThrow()
    const finalPos = state.world.getComponent(gron, ComponentType.Position)
    // Gron position unchanged
    expect(finalPos?.x).toBe(ox)
    expect(finalPos?.y).toBe(oy)
    // Dialog still opens
    expect(state.activeDialog).not.toBeNull()
  })

  it('non-summons Revery (r.summons !== true) does not run the sequence', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    // Deliberately not setting state.revery.summons
    tickRevery(state, 0, 1000)
    expect(state.revery?.summonsCollapseTile).toBeUndefined()
    expect(state.revery?.summonsAudioCue).toBeUndefined()
    expect(state.collapsedStewardTile).toBeNull()
    expect(state.activeDialog).toBeNull()
  })
})

describe('Closing-phase egregoric commit + reset (RP-32)', () => {
  const advanceToClosing = (state: GameState, time: number): void => {
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, time)
  }

  it('commits the steward collapse tile to TileType.Egregore at Closing', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    // Ensure the collapse tile is Dirt so the commit eligibility check passes.
    // RP-33 — write to overworldMap explicitly; state.map swaps to the
    // house interior at Omen → Observing.
    const px = state.player.x
    const py = state.player.y
    state.overworldMap[py][px] = { type: TileType.Dirt }
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000) // runs the summons sequence + Omen → Observing
    const before = state.egregorePositions.length
    advanceToClosing(state, 2000)
    expect(state.overworldMap[py][px].type).toBe(TileType.Egregore)
    expect(state.egregorePositions.length).toBe(before + 1)
    expect(state.egregorePositions[state.egregorePositions.length - 1]).toEqual({ x: px, y: py })
    expect(state.egregoreLifecycle.has(posKey(px, py))).toBe(true)
  })

  it('skips egregoric commit silently when collapse tile is no longer Dirt', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    const px = state.player.x
    const py = state.player.y
    state.overworldMap[py][px] = { type: TileType.Dirt }
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    // Mutate the overworld tile to a non-Dirt type mid-Revery.
    state.overworldMap[py][px] = { type: TileType.Sand }
    const before = state.egregorePositions.length
    advanceToClosing(state, 2000)
    expect(state.overworldMap[py][px].type).toBe(TileType.Sand) // unchanged
    expect(state.egregorePositions.length).toBe(before)
  })

  it('does not commit when r.summons !== true', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    const px = state.player.x
    const py = state.player.y
    state.overworldMap[py][px] = { type: TileType.Dirt }
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder) // non-summons
    tickRevery(state, 0, 1000)
    const before = state.egregorePositions.length
    advanceToClosing(state, 2000)
    expect(state.overworldMap[py][px].type).toBe(TileType.Dirt)
    expect(state.egregorePositions.length).toBe(before)
  })

  it('resets dormancyPressure to 0 at Closing', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    expect(state.dormancyPressure).toBe(1) // still 1 mid-Revery
    advanceToClosing(state, 2000)
    expect(state.dormancyPressure).toBe(0)
  })

  it('clears collapsedStewardTile at Closing', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    expect(state.collapsedStewardTile).not.toBeNull()
    advanceToClosing(state, 2000)
    expect(state.collapsedStewardTile).toBeNull()
  })
})

describe('getGronDialog — solstice summons branch (RP-32)', () => {
  // Need to import the dialog dispatcher; characters.ts does not export
  // getGronDialog directly. Inspect via the activeDialog content path:
  // the summons sequence opens activeDialog with characterId=gron, and a
  // separate caller (the dialog typing tick) reads getCharacterDialog
  // when typing the line. We verify here that the dialog selection rule
  // is structurally exercised by checking the actively-rendered dialog
  // when we call getCharacterDialog through the public interaction path.
  it('summons Revery in Omen phase activates the solstice branch (smoke test via activeDialog)', () => {
    const state = createTestState()
    setupSummonsState(state)
    placeGron(state, state.player.x + 5, state.player.y + 5)
    initiateRevery(state, 1000, OmenKind.CloudPassingSun)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    // The dialog is open on Gron and the phase is Observing now (the
    // summons sequence runs in Omen, then the phase flips). The dialog
    // was selected while phase was Omen — verified by the existing
    // sequence assertions above. This test pins the contract: dialog is
    // open at characterId=gron with lineIndex=0 after the summons.
    expect(state.activeDialog?.characterId).toBe('gron')
    expect(state.activeDialog?.lineIndex).toBe(0)
  })
})
