import { combineFromBackpack } from '../combine'
import { FRAMES_PER_TUBE, SEASONAL_PHASE_PERIOD_MS, STABILITY_THRESHOLD_TICKS } from '../constants'
import { ComponentType } from '../ecs/types'
import { completeGenesis } from '../genesis'
import { packUpPlaybackCamera, tryPlacedCameraInteraction } from '../interaction'
import { findFitPosition, placeItem } from '../inventory'
import { getDefinition, ITEM_DEFINITIONS } from '../items'
import { getPlaceableSpec } from '../placeable'
import { createGameState } from '../state'
import {
  archivePlacedCameraFrames,
  captureCells,
  captureIfChanged,
  createPlacedCamera,
  tickTimeLapseCapture,
} from '../timeLapse'
import { ItemCategory, TileType, Zone } from '../types'
import { getWorldForZone } from '../zone'
import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState, ItemInstance, PlacedCamera } from '../types'

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

// RP-59 — cameras are SET UP via the in-hand + left-click PlaceableSpec, not
// the [x] drop key. Deploy at the first walkable adjacent tile so the placed
// camera lands next to the player, matching the old dropItem behavior the
// recording/playback tests rely on. Returns the placed tile.
const deployCamera = (state: GameState, uid: string): { x: number; y: number } => {
  const spec = getPlaceableSpec('camera')
  if (!spec) throw new Error('no camera PlaceableSpec')
  for (const d of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]) {
    const tx = state.player.x + d.x
    const ty = state.player.y + d.y
    if (spec.canPlace(state, tx, ty, uid)) {
      spec.place(state, tx, ty, uid)
      return { x: tx, y: ty }
    }
  }
  throw new Error('no valid adjacent tile to deploy camera')
}

// Mutate a tile in the camera's 3x3 footprint to a known new state.
// Returns the (x, y) of the changed tile.
const mutateFootprintTile = (state: GameState, camera: PlacedCamera, newType: TileType): { x: number; y: number } => {
  const tx = camera.x + 1
  const ty = camera.y
  state.map[ty][tx] = { type: newType }
  return { x: tx, y: ty }
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
    it('drop creates a placedCamera entry, removes the item from the backpack, and captures a baseline frame', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)

      deployCamera(state, camera.uid)
      expect(state.backpack.items.some(i => i.definitionId === 'camera')).toBe(false)
      expect(state.placedCameras).toHaveLength(1)
      const placed = state.placedCameras[0]
      expect(placed.uid).toBe(camera.uid)
      expect(placed.expiresAt - placed.startedAt).toBe(SEASON_MS)
      // v11 R4 — baseline frame captured at placement.
      expect(placed.frames).toHaveLength(1)
      expect(placed.frames[0].cells).toHaveLength(9)
      expect(placed.frames[0].recordedAt).toBe(placed.startedAt)
      // Film decremented by 1 for the baseline.
      expect(state.cameraFilm.get(camera.uid)).toBe(FRAMES_PER_TUBE - 1)
      // The camera is a unique artifact — set-up clears the hand entirely.
      expect(state.equippedItemUid).toBeNull()
    })

    it('placement with no film leaves expiresAt === startedAt and skips baseline capture', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')

      deployCamera(state, camera.uid)
      const placed = state.placedCameras[0]
      expect(placed.expiresAt).toBe(placed.startedAt)
      // No baseline when unarmed — decoration only.
      expect(placed.frames).toEqual([])
    })

    it('pickup returns empty-frame (un-armed) camera to backpack with original uid', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      // No film — placement skips baseline, frames stays empty.
      deployCamera(state, camera.uid)

      const result = tryPlacedCameraInteraction(state)
      expect(result).toBe('picked-up')
      expect(state.placedCameras).toEqual([])
      const back = state.backpack.items.find(i => i.definitionId === 'camera')
      expect(back?.uid).toBe(camera.uid)
    })

    it('interaction with frames (baseline) opens playback instead of picking up', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      deployCamera(state, camera.uid)

      // Baseline frame alone is enough to open playback.
      expect(state.placedCameras[0].frames.length).toBe(1)

      const result = tryPlacedCameraInteraction(state)
      expect(result).toBe('playback')
      expect(state.playbackCameraUid).toBe(camera.uid)
      expect(state.placedCameras).toHaveLength(1)
    })

    it('Pack Up from playback migrates frames to cameraArchive and returns camera to backpack', () => {
      const state = setupOverworldState()
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      deployCamera(state, camera.uid)
      const placed = state.placedCameras[0]

      // Drive a stable diff: change a tile and run the tick N times.
      mutateFootprintTile(state, placed, TileType.Sand)
      for (let i = 0; i < STABILITY_THRESHOLD_TICKS; i++) {
        captureIfChanged(state, placed, placed.startedAt + 100 + i)
      }
      expect(placed.frames.length).toBe(2) // baseline + committed change

      const ok = packUpPlaybackCamera(state, camera.uid)
      expect(ok).toBe(true)
      expect(state.placedCameras).toEqual([])
      expect(state.playbackCameraUid).toBeNull()
      expect(state.cameraArchive.get(camera.uid)?.length).toBe(2)
      expect(state.backpack.items.find(i => i.definitionId === 'camera')?.uid).toBe(camera.uid)
    })
  })

  describe('diff-driven frame capture (v11 R4)', () => {
    const armCamera = (state: GameState): PlacedCamera => {
      const camera = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      deployCamera(state, camera.uid)
      return state.placedCameras[0]
    }

    it('appends exactly one frame after STABILITY_THRESHOLD_TICKS consecutive stable diffs', () => {
      const state = setupOverworldState()
      const placed = armCamera(state)
      // Baseline already at placement.
      expect(placed.frames.length).toBe(1)

      mutateFootprintTile(state, placed, TileType.Sand)

      for (let i = 0; i < STABILITY_THRESHOLD_TICKS; i++) {
        captureIfChanged(state, placed, placed.startedAt + 10 + i)
      }
      // Baseline + one committed change.
      expect(placed.frames.length).toBe(2)
      // Film 1:1 keyed: baseline + one diff = 2 decrements.
      expect(state.cameraFilm.get(placed.uid)).toBe(FRAMES_PER_TUBE - 2)

      // Further ticks at the same stable state do not commit more
      // frames.
      for (let i = 0; i < STABILITY_THRESHOLD_TICKS * 2; i++) {
        captureIfChanged(state, placed, placed.startedAt + 100 + i)
      }
      expect(placed.frames.length).toBe(2)
      expect(state.cameraFilm.get(placed.uid)).toBe(FRAMES_PER_TUBE - 2)
    })

    it('transient one-tick change (bee crossing) does not commit a frame', () => {
      const state = setupOverworldState()
      const placed = armCamera(state)
      expect(placed.frames.length).toBe(1) // baseline

      // Tick 1: a transient overlay enters the footprint.
      mutateFootprintTile(state, placed, TileType.Sand)
      captureIfChanged(state, placed, placed.startedAt + 10)
      // Candidate pending, not yet committed.
      expect(placed.frames.length).toBe(1)

      // Tick 2: the overlay reverts — back to baseline state.
      const tx = placed.x + 1
      state.map[placed.y][tx] = { type: TileType.Dirt }
      captureIfChanged(state, placed, placed.startedAt + 20)

      // The bee did not capture: still 1 frame on the roll, film
      // unchanged after the baseline decrement, candidate buffer
      // cleared.
      expect(placed.frames.length).toBe(1)
      expect(state.cameraFilm.get(placed.uid)).toBe(FRAMES_PER_TUBE - 1)
      expect(placed.pendingCells).toBeUndefined()
      expect(placed.pendingCount).toBeUndefined()
    })

    it('film count decrements 1:1 with captured stable changes including the baseline', () => {
      const state = setupOverworldState()
      const placed = armCamera(state)
      expect(state.cameraFilm.get(placed.uid)).toBe(FRAMES_PER_TUBE - 1) // baseline

      // Three sequential stable changes.
      mutateFootprintTile(state, placed, TileType.Sand)
      for (let i = 0; i < STABILITY_THRESHOLD_TICKS; i++) {
        captureIfChanged(state, placed, placed.startedAt + 10 + i)
      }
      mutateFootprintTile(state, placed, TileType.Flora)
      for (let i = 0; i < STABILITY_THRESHOLD_TICKS; i++) {
        captureIfChanged(state, placed, placed.startedAt + 100 + i)
      }
      mutateFootprintTile(state, placed, TileType.Dirt)
      for (let i = 0; i < STABILITY_THRESHOLD_TICKS; i++) {
        captureIfChanged(state, placed, placed.startedAt + 200 + i)
      }

      // Baseline + 3 stable changes = 4 frames, 4 film decrements.
      expect(placed.frames.length).toBe(4)
      expect(state.cameraFilm.get(placed.uid)).toBe(FRAMES_PER_TUBE - 4)
    })

    it('multiple cameras with overlapping footprints each commit their own frame for the same change', () => {
      const state = setupOverworldState()
      // Camera A at player + (1, 0); Camera B at player + (2, 0).
      // Both footprints include the tile at player + (2, 0) and the
      // tile at player + (3, 0) is in B's footprint only — for this
      // test we make a tile in the overlap region change.
      const camA = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camA.uid, FRAMES_PER_TUBE)
      const specA = getPlaceableSpec('camera')
      if (!specA) throw new Error('no spec')
      const aX = state.player.x + 1
      const aY = state.player.y
      specA.place(state, aX, aY, camA.uid)

      const camB = placeBackpackItem(state, 'camera')
      state.cameraFilm.set(camB.uid, FRAMES_PER_TUBE)
      const bX = state.player.x + 2
      const bY = state.player.y + 1
      // Ensure the tile is walkable for placement.
      state.map[bY][bX] = { type: TileType.Dirt }
      specA.place(state, bX, bY, camB.uid)

      const placedA = state.placedCameras.find(c => c.uid === camA.uid)
      const placedB = state.placedCameras.find(c => c.uid === camB.uid)
      if (!placedA || !placedB) throw new Error('missing placed cameras')
      // Both have baselines.
      expect(placedA.frames.length).toBe(1)
      expect(placedB.frames.length).toBe(1)

      // Overlap tile — both footprints include (player.x + 2, player.y).
      const ox = state.player.x + 2
      const oy = state.player.y
      state.map[oy][ox] = { type: TileType.Sand }

      for (let i = 0; i < STABILITY_THRESHOLD_TICKS; i++) {
        captureIfChanged(state, placedA, placedA.startedAt + 10 + i)
        captureIfChanged(state, placedB, placedB.startedAt + 10 + i)
      }

      expect(placedA.frames.length).toBe(2)
      expect(placedB.frames.length).toBe(2)
      expect(state.cameraFilm.get(camA.uid)).toBe(FRAMES_PER_TUBE - 2)
      expect(state.cameraFilm.get(camB.uid)).toBe(FRAMES_PER_TUBE - 2)
    })

    it('pickup mid-candidate discards the in-flight candidate; archive holds only committed frames', () => {
      const state = setupOverworldState()
      const placed = armCamera(state)

      mutateFootprintTile(state, placed, TileType.Sand)
      // Run only N-1 ticks — candidate is pending but not yet
      // committed.
      for (let i = 0; i < STABILITY_THRESHOLD_TICKS - 1; i++) {
        captureIfChanged(state, placed, placed.startedAt + 10 + i)
      }
      expect(placed.frames.length).toBe(1) // baseline only
      expect(placed.pendingCells).toBeDefined()

      // Pack up while the candidate is mid-stabilization.
      const ok = packUpPlaybackCamera(state, placed.uid)
      expect(ok).toBe(true)
      // Archive holds only the baseline; the candidate vanished.
      expect(state.cameraArchive.get(placed.uid)?.length).toBe(1)
      expect(state.cameraFilm.get(placed.uid)).toBe(FRAMES_PER_TUBE - 1)
    })

    it('is a no-op when film is exhausted; clears any candidate buffer', () => {
      const state = setupOverworldState()
      const placed = armCamera(state)
      // Pretend a candidate was building.
      placed.pendingCells = captureCells(state, placed.x, placed.y)
      placed.pendingCount = 2
      state.cameraFilm.set(placed.uid, 0)

      mutateFootprintTile(state, placed, TileType.Sand)
      captureIfChanged(state, placed, placed.startedAt + 10)

      // No commit. Candidate buffer cleared on the no-op branch.
      expect(placed.frames.length).toBe(1) // baseline only
      expect(placed.pendingCells).toBeUndefined()
      expect(placed.pendingCount).toBeUndefined()
    })

    it('is a no-op past the expiresAt boundary; clears any candidate buffer', () => {
      const state = setupOverworldState()
      const placed = armCamera(state)
      mutateFootprintTile(state, placed, TileType.Sand)

      // Build up a candidate, then cross expiresAt before commit.
      captureIfChanged(state, placed, placed.startedAt + 10)
      expect(placed.pendingCells).toBeDefined()

      captureIfChanged(state, placed, placed.expiresAt + 1)
      expect(placed.frames.length).toBe(1) // baseline only
      expect(placed.pendingCells).toBeUndefined()
    })

    it('cross-zone camera: tick is a no-op; candidate buffer cleared', () => {
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
      placed.pendingCells = captureCells(state, 5, 5)
      placed.pendingCount = 2

      captureIfChanged(state, placed, 10)
      // state.currentZone === Overworld, so cave camera is a no-op.
      expect(placed.pendingCells).toBeUndefined()
      expect(placed.pendingCount).toBeUndefined()
    })

    it('tickTimeLapseCapture is safe when placedCameras is empty', () => {
      const state = setupOverworldState()
      expect(() => {
        tickTimeLapseCapture(state, 1000)
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
      // Baseline captured by createPlacedCamera.
      expect(placed.frames.length).toBe(1)
      state.placedCameras.push(placed)
      // Force one stable diff.
      state.map[5][6] = { type: TileType.Sand }
      for (let i = 0; i < STABILITY_THRESHOLD_TICKS; i++) {
        captureIfChanged(state, placed, 10 + i)
      }
      expect(placed.frames.length).toBe(2)

      archivePlacedCameraFrames(state, placed)
      expect(state.cameraArchive.get(camera.uid)?.length).toBe(2)

      // Second placement (baseline + one stable diff → 2 frames).
      // Reset cameraFilm to ensure recording arms again.
      state.cameraFilm.set(camera.uid, FRAMES_PER_TUBE)
      const placed2 = createPlacedCamera(state, {
        uid: camera.uid,
        x: 8,
        y: 8,
        zone: Zone.Overworld,
        now: 1000,
        spanMs: SEASON_MS,
      })
      state.placedCameras.push(placed2)
      state.map[8][9] = { type: TileType.Sand }
      for (let i = 0; i < STABILITY_THRESHOLD_TICKS; i++) {
        captureIfChanged(state, placed2, 1010 + i)
      }
      expect(placed2.frames.length).toBe(2)
      archivePlacedCameraFrames(state, placed2)
      expect(state.cameraArchive.get(camera.uid)?.length).toBe(4)
    })
  })

  describe('tenure-start spawn (v9 R3)', () => {
    it('film roll spawns inside the little house; no camera ground-item in the house', () => {
      // Use createGameState directly — createTestState destroys all
      // groundItem entities for test hygiene, which would wipe the
      // tenure-start spawn we're verifying.
      const state = createGameState('Test', 20, 20)
      const houseGroundItems: { definitionId: string; x: number; y: number }[] = []
      const houseWorld = getWorldForZone(state, Zone.HouseInterior)
      for (const eid of houseWorld.query(ComponentType.EntityTag, ComponentType.ItemDrop, ComponentType.Position)) {
        const ez = houseWorld.getComponent(eid, ComponentType.EntityZone)
        if (ez?.zone !== Zone.HouseInterior) continue
        const pos = houseWorld.getComponent(eid, ComponentType.Position)
        const drop = houseWorld.getComponent(eid, ComponentType.ItemDrop)
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
      // so this test runs the full genesis pipeline. RP-24 also drops
      // a handful of predecessor cameras here; the inherited Field
      // Camera is the unique entry without a `predecessor` field.
      const state = createGameState('Test', 20, 20)
      completeGenesis(state, { skipTitleCard: true })
      const inheritedCameras = state.placedCameras.filter(c => c.predecessor === undefined)
      expect(inheritedCameras).toHaveLength(1)
      const placed = inheritedCameras[0]
      expect(placed.zone).toBe(Zone.Overworld)
      // Body inherits exhausted.
      expect(state.cameraFilm.get(placed.uid)).toBe(0)
      // Four pre-seeded frames in the archive — one per season.
      const archive = state.cameraArchive.get(placed.uid)
      expect(archive).toBeDefined()
      expect(archive?.length).toBe(4)
      // v11 R4 — frames carry only { recordedAt, cells }; the subject
      // field has retired with the event-driven model.
      archive?.forEach(f => {
        expect(typeof f.recordedAt).toBe('number')
        expect(f.cells.length).toBe(9)
        expect((f as { subject?: unknown }).subject).toBeUndefined()
      })
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
      deployCamera(state, camera.uid)
      const placed = state.placedCameras[0]
      // The underlying tile remains Dirt (or whatever was there) — the
      // placedCamera is an entity overlay, not a tile mutation.
      expect(state.map[placed.y][placed.x].type).toBe(TileType.Dirt)
    })
  })
})
