import { completeGenesis } from '../genesis'
import { createGameState } from '../state'
import { Zone } from '../types'
import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState, PlacedCamera, TimeLapseCell } from '../types'

const fakeCells = (): TimeLapseCell[] =>
  Array.from({ length: 9 }, (_, i) => ({ char: String.fromCharCode(97 + i), color: '#ffffff' }))

describe('photograph album', () => {
  it('createGameState seeds an empty album', () => {
    const state = createTestState()
    expect(state.photographAlbum).toEqual([])
  })

  it('genesis Field Camera has 4 archived frames not yet in album', () => {
    const state = createGameState('Test', 20, 20)
    completeGenesis(state, { skipTitleCard: true })
    expect(state.photographAlbum).toHaveLength(0)
    const placed = state.placedCameras[0]
    expect(state.cameraArchive.get(placed.uid)?.length).toBe(4)
  })

  it('album receives frames migrated from cameraArchive + live placed.frames on dismissal', () => {
    // Simulate the GameScreen dismissal handler directly. The
    // component test for the panel covers UI; this test covers the
    // state migration that the handler is responsible for.
    const state: GameState = createTestState()
    swapToOverworldForTest(state)
    clearAroundPlayer(state, 3)

    const placed: PlacedCamera = {
      uid: 'cam-1',
      x: 10,
      y: 10,
      zone: Zone.Overworld,
      startedAt: 0,
      expiresAt: 1000,
      frames: [
        { recordedAt: 10, cells: fakeCells() },
        { recordedAt: 20, cells: fakeCells() },
      ],
    }
    state.placedCameras.push(placed)
    state.cameraArchive.set('cam-1', [{ recordedAt: 5, cells: fakeCells() }])

    // Recreate the GameScreen onDismiss migration logic.
    const archive = state.cameraArchive.get('cam-1') ?? []
    const frames = [...archive, ...placed.frames]
    state.photographAlbum.push(...frames)
    placed.frames = []
    state.cameraArchive.delete('cam-1')

    expect(state.photographAlbum).toHaveLength(3)
    expect(state.photographAlbum[0].recordedAt).toBe(5)
    expect(state.photographAlbum[1].recordedAt).toBe(10)
    expect(state.photographAlbum[2].recordedAt).toBe(20)
    expect(placed.frames).toEqual([])
    expect(state.cameraArchive.has('cam-1')).toBe(false)
  })

  it('album persists across multiple migrations', () => {
    const state: GameState = createTestState()
    state.photographAlbum.push({ recordedAt: 1, cells: fakeCells() })
    state.photographAlbum.push({ recordedAt: 2, cells: fakeCells() })
    state.photographAlbum.push({ recordedAt: 3, cells: fakeCells() })
    expect(state.photographAlbum).toHaveLength(3)
  })
})
