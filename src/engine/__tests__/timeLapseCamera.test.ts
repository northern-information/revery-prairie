import { combineFromBackpack } from '../combine'
import { FRAMES_PER_TUBE, SEASONAL_PHASE_PERIOD_MS } from '../constants'
import { ComponentType } from '../ecs/types'
import { dropItem } from '../entities'
import { completeGenesis } from '../genesis'
import { packUpPlaybackCamera, tryPlacedCameraInteraction } from '../interaction'
import { findFitPosition, placeItem } from '../inventory'
import { getDefinition, ITEM_DEFINITIONS } from '../items'
import { createGameState } from '../state'
import { archivePlacedCameraFrames, captureCells, createPlacedCamera, recordCameraSubjectEvent } from '../timeLapse'
import { CameraSubject, ItemCategory, TileType, Zone } from '../types'
import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState, ItemInstance } from '../types'

const SEASON_MS = SEASONAL_PHASE_PERIOD_MS / 4

const setupOverworldState = (): GameState => {
  const state = createTestState()
  swapToOverworldForTest(state)
  clearAroundPlayer(state, 3)
  // createTestState invokes completeGenesis which spawns the
  // tenure-start Field Camera near the nearest oak. Tests in the
  // "placement and pickup" + "frame capture" describes work with a
  // clean state.placedCameras, so reset the camera state here. The
  // genesis-spawn behavior is exercised separately in the
  // "tenure-start spawn (v9 R3)" describe.
  state.placedCameras = []
  state.cameraFilm.clear()
  state.cameraArchive.clear()
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'placedCamera') {
      state.world.destroyEntity(eid)
    }
  }
  return state
}

const placeBackpackItem = (state: GameState, defId: string): ItemInstance => {
  const fit = findFitPosition(state.backpack, defId)
  if (!fit) throw new Error(`no backpack slot for ${defId}`)
  const item = placeItem(state.backpack, defId, fit.gridX, fit.gridY)
  if (!item) throw new Error(`placeItem failed for ${defId}`)
  return item
}

describe('time-lapse camera', () => {
  describe('item definitions', () => {
    it('registers camera with the bee/gold palette as a Tool', () => {
      const def = getDefinition('camera')
      expect(def.name).toBe('Field Camera')
      expect(def.glyph).toBe('⌖')
      expect(def.glyphColor).toBe('#FFD700')
      expect(def.category).toBe(ItemCategory.Tool)
    })

    it('registers filmRoll with a tan glyph as a Tool', () => {
      const def = getDefinition('filmRoll')
      expect(def.name).toBe('Film Roll')
      expect(def.glyph).toBe('⊐')
      expect(def.glyphColor).toBe('#C2B280')
      expect(def.category).toBe(ItemCategory.Tool)
    })

    it('exposes both items in ITEM_DEFINITIONS', () => {
      expect(ITEM_DEFINITIONS.camera).toBeDefined()
      expect(ITEM_DEFINITIONS.filmRoll).toBeDefined()
    })
  })

  describe('GameState shape', () => {
    it('camera fields have the expected shape', () => {
      const state = setupOverworldState()
      expect(state.cameraFilm).toBeInstanceOf(Map)
      expect(state.placedCameras).toEqual([])
      expect(state.cameraArchive).toBeInstanceOf(Map)
      expect(state.playbackCameraUid).toBeNull()
    })
  })

  describe('load-film recipe', () => {
    it('consumes filmRoll, preserves camera with original uid, sets cameraFilm to FRAMES_PER_TUBE', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      placeBackpackItem(state, 'filmRoll')

      const ok = combineFromBackpack(state, 'filmRoll', 'camera')
      expect(ok).toBe(true)

      const survivingCamera = state.backpack.items.find(i => i.definitionId === 'camera')
      expect(survivingCamera?.uid).toBe(camera.uid)
      expect(state.backpack.items.some(i => i.definitionId === 'filmRoll')).toBe(false)
      expect(state.cameraFilm.get(camera.uid)).toBe(FRAMES_PER_TUBE)
    })

    it('rejects load onto a camera with unexposed film still on it (filmRemaining > 0)', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, 17) // any positive count
      placeBackpackItem(state, 'filmRoll')

      const ok = combineFromBackpack(state, 'filmRoll', 'camera')
      expect(ok).toBe(false)
      expect(state.backpack.items.some(i => i.definitionId === 'filmRoll')).toBe(true)
      expect(state.cameraFilm.get(camera.uid)).toBe(17)
    })

    it('reloads an exhausted camera body (filmRemaining === 0) — Round 3 lock', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, 0) // inherited / spent body
      placeBackpackItem(state, 'filmRoll')

      const ok = combineFromBackpack(state, 'filmRoll', 'camera')
      expect(ok).toBe(true)
      expect(state.backpack.items.some(i => i.definitionId === 'filmRoll')).toBe(false)
      expect(state.cameraFilm.get(camera.uid)).toBe(FRAMES_PER_TUBE)
    })
  })

  describe('placement and pickup', () => {
    it('drop creates a placedCamera entry and removes the item from the backpack', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)

      const ok = dropItem(state, 'camera', 1000)
      expect(ok).toBe(true)
      expect(state.backpack.items.some(i => i.definitionId === 'camera')).toBe(false)
      expect(state.placedCameras).toHaveLength(1)
      const placed = state.placedCameras[0]
      expect(placed.uid).toBe(camera.uid)
      expect(placed.expiresAt - placed.startedAt).toBe(SEASON_MS)
      expect(placed.frames).toEqual([])
    })

    it('placement with no film leaves expiresAt === startedAt (no recording window)', () => {
      const state = setupOverworldState()
      placeBackpackItem(state, 'camera')

      const ok = dropItem(state, 'camera', 1000)
      expect(ok).toBe(true)
      const placed = state.placedCameras[0]
      expect(placed.expiresAt).toBe(placed.startedAt)
    })

    it('pickup returns empty-frame camera to backpack with original uid', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      dropItem(state, 'camera', 1000)

      const result = tryPlacedCameraInteraction(state)
      expect(result).toBe('picked-up')
      expect(state.placedCameras).toEqual([])
      const back = state.backpack.items.find(i => i.definitionId === 'camera')
      expect(back?.uid).toBe(camera.uid)
      // Film count preserved across pickup.
      expect(state.cameraFilm.get(camera.uid)).toBe(FRAMES_PER_TUBE)
    })

    it('interaction with frames opens playback instead of picking up', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      dropItem(state, 'camera', 1000)

      // Fire one event inside the footprint so frames.length > 0.
      const placed = state.placedCameras[0]
      recordCameraSubjectEvent(state, placed.x, placed.y, CameraSubject.Pollination, placed.startedAt + 100)
      expect(placed.frames.length).toBe(1)

      const result = tryPlacedCameraInteraction(state)
      expect(result).toBe('playback')
      expect(state.playbackCameraUid).toBe(camera.uid)
      // Placement is preserved while playback is open.
      expect(state.placedCameras).toHaveLength(1)
    })

    it('Pack Up from playback migrates frames to cameraArchive and returns camera to backpack', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      dropItem(state, 'camera', 1000)
      const placed = state.placedCameras[0]
      recordCameraSubjectEvent(state, placed.x, placed.y, CameraSubject.Pollination, placed.startedAt + 50)
      recordCameraSubjectEvent(state, placed.x, placed.y, CameraSubject.Rain, placed.startedAt + 100)

      const ok = packUpPlaybackCamera(state, camera.uid)
      expect(ok).toBe(true)
      expect(state.placedCameras).toEqual([])
      expect(state.playbackCameraUid).toBeNull()
      expect(state.cameraArchive.get(camera.uid)?.length).toBe(2)
      expect(state.backpack.items.find(i => i.definitionId === 'camera')?.uid).toBe(camera.uid)
    })
  })

  describe('frame capture', () => {
    it('appends a frame and decrements cameraFilm for events inside the 3x3 footprint', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      dropItem(state, 'camera', 1000)
      const placed = state.placedCameras[0]

      recordCameraSubjectEvent(state, placed.x + 1, placed.y, CameraSubject.Pollination, placed.startedAt + 100)

      expect(placed.frames.length).toBe(1)
      expect(placed.frames[0].subject).toBe(CameraSubject.Pollination)
      expect(placed.frames[0].cells.length).toBe(9)
      expect(state.cameraFilm.get(camera.uid)).toBe(FRAMES_PER_TUBE - 1)
    })

    it('ignores events outside the 3x3 footprint', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      dropItem(state, 'camera', 1000)
      const placed = state.placedCameras[0]

      recordCameraSubjectEvent(state, placed.x + 5, placed.y, CameraSubject.Pollination, placed.startedAt + 100)

      expect(placed.frames.length).toBe(0)
      expect(state.cameraFilm.get(camera.uid)).toBe(FRAMES_PER_TUBE)
    })

    it('is a no-op when film is exhausted', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      dropItem(state, 'camera', 1000)
      const placed = state.placedCameras[0]
      state.cameraFilm.set(camera.uid, 0)

      recordCameraSubjectEvent(state, placed.x, placed.y, CameraSubject.Pollination, placed.startedAt + 100)

      expect(placed.frames.length).toBe(0)
      expect(state.cameraFilm.get(camera.uid)).toBe(0)
    })

    it('is a no-op past the expiresAt boundary', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      dropItem(state, 'camera', 1000)
      const placed = state.placedCameras[0]

      recordCameraSubjectEvent(state, placed.x, placed.y, CameraSubject.Pollination, placed.expiresAt + 1)

      expect(placed.frames.length).toBe(0)
      expect(state.cameraFilm.get(camera.uid)).toBe(FRAMES_PER_TUBE)
    })

    it('is a no-op when placedCameras is empty', () => {
      const state = setupOverworldState()
      expect(() => {
        recordCameraSubjectEvent(state, state.player.x, state.player.y, CameraSubject.Pollination, 1000)
      }).not.toThrow()
    })

    it('captureCells returns 9 row-major cells', () => {
      const state = setupOverworldState()
      const cells = captureCells(state, state.player.x, state.player.y)
      expect(cells.length).toBe(9)
      cells.forEach(c => {
        expect(typeof c.char).toBe('string')
        expect(typeof c.color).toBe('string')
      })
    })
  })

  describe('archive lifecycle', () => {
    it('archivePlacedCameraFrames appends new frames to existing archive entries', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      const placed = createPlacedCamera(state, {
        uid: camera.uid,
        x: 5,
        y: 5,
        zone: Zone.Overworld,
        now: 0,
        spanMs: SEASON_MS,
      })
      state.placedCameras.push(placed)
      recordCameraSubjectEvent(state, 5, 5, CameraSubject.Pollination, 10)
      recordCameraSubjectEvent(state, 5, 5, CameraSubject.Rain, 20)
      // First archive call moves 2 frames.
      archivePlacedCameraFrames(state, placed)
      expect(state.cameraArchive.get(camera.uid)?.length).toBe(2)

      // Second placement, 3 more frames, archive should hold 5.
      const placed2 = createPlacedCamera(state, {
        uid: camera.uid,
        x: 8,
        y: 8,
        zone: Zone.Overworld,
        now: 1000,
        spanMs: SEASON_MS,
      })
      state.placedCameras.push(placed2)
      recordCameraSubjectEvent(state, 8, 8, CameraSubject.Pollination, 1010)
      recordCameraSubjectEvent(state, 8, 8, CameraSubject.Rain, 1020)
      recordCameraSubjectEvent(state, 8, 8, CameraSubject.Bloom, 1030)
      archivePlacedCameraFrames(state, placed2)
      expect(state.cameraArchive.get(camera.uid)?.length).toBe(5)
    })
  })

  describe('zone scoping', () => {
    it('does not record events for cameras in a different zone', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      const placed = createPlacedCamera(state, {
        uid: camera.uid,
        x: 5,
        y: 5,
        zone: Zone.Cave,
        now: 0,
        spanMs: SEASON_MS,
      })
      state.placedCameras.push(placed)
      // state.currentZone is Overworld via swapToOverworldForTest.
      recordCameraSubjectEvent(state, 5, 5, CameraSubject.Pollination, 100)
      expect(placed.frames.length).toBe(0)
    })
  })

  describe('tenure-start spawn (v9 R3)', () => {
    it('film roll spawns inside the little house; no camera ground-item in the house', () => {
      // Use createGameState directly — createTestState destroys all
      // groundItem entities for test hygiene, which would wipe the
      // tenure-start spawn we're verifying.
      const state = createGameState('Test', 20, 20)
      const houseGroundItems: { definitionId: string; x: number; y: number }[] = []
      for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.ItemDrop, ComponentType.Position)) {
        const ez = state.world.getComponent(eid, ComponentType.EntityZone)
        if (ez?.zone !== Zone.HouseInterior) continue
        const pos = state.world.getComponent(eid, ComponentType.Position)
        const drop = state.world.getComponent(eid, ComponentType.ItemDrop)
        if (!pos || !drop) continue
        houseGroundItems.push({ definitionId: drop.definitionId, x: pos.x, y: pos.y })
      }
      const cameras = houseGroundItems.filter(i => i.definitionId === 'camera')
      const films = houseGroundItems.filter(i => i.definitionId === 'filmRoll')
      expect(cameras).toHaveLength(0)
      expect(films).toHaveLength(1)
      expect(films[0].x).toBe(2)
      expect(films[0].y).toBe(6)
    })

    it('seeds one deployed Field Camera in the overworld with exhausted body and four pre-seeded frames', () => {
      // Field Camera spawn lives in completeGenesis (post-seedOaks),
      // so this test runs the full genesis pipeline.
      const state = createGameState('Test', 20, 20)
      completeGenesis(state, { skipTitleCard: true })
      expect(state.placedCameras).toHaveLength(1)
      const placed = state.placedCameras[0]
      expect(placed.zone).toBe(Zone.Overworld)
      // Body inherits exhausted.
      expect(state.cameraFilm.get(placed.uid)).toBe(0)
      // Four pre-seeded frames in the archive — one per season.
      const archive = state.cameraArchive.get(placed.uid)
      expect(archive).toBeDefined()
      expect(archive?.length).toBe(4)
      const subjects = archive?.map(f => f.subject)
      expect(subjects?.every(s => s === CameraSubject.SeasonalLandmark)).toBe(true)
    })

    it('initializes photographAlbum as an empty array', () => {
      const state = createGameState('Test', 20, 20)
      expect(Array.isArray(state.photographAlbum)).toBe(true)
      expect(state.photographAlbum).toHaveLength(0)
    })
  })

  describe('player visible state', () => {
    it('placedCamera tiles count as walkable terrain (player can walk over the camera)', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      dropItem(state, 'camera', 1000)
      const placed = state.placedCameras[0]
      // The underlying tile remains Dirt (or whatever was there) — the
      // placedCamera is an entity overlay, not a tile mutation.
      expect(state.map[placed.y][placed.x].type).toBe(TileType.Dirt)
    })
  })
})
