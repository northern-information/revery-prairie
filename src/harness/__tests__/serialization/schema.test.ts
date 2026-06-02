import { withSeededRandom } from '@/harness/prng'
import { deserializeState, serializeState } from '@/harness/serialize'

import { createGameState } from '@/engine/state'
import { Zone } from '@/engine/types'
import type { PlacedCamera, PredecessorRecord } from '@/engine/types'

const SEED = 42

/**
 * Explicit field list for GameState.
 * If a field is added or removed from GameState, this test fails —
 * forcing the developer to acknowledge the schema change.
 */
const EXPECTED_FIELDS = [
  'stewardName',
  'map',
  'mapWidth',
  'mapHeight',
  'player',
  'backpack',
  'playerFacing',
  'facingEntityPos',
  'camera',
  'viewportWidth',
  'viewportHeight',
  'activeDialog',
  'discoveredRecipes',
  'previewFn',
  'weather',
  'path',
  'pathWaypoints',
  'pathIsChained',
  'pendingAction',
  'cursorTile',
  'cursorScreenPos',
  'rainSeed',
  'metric',
  'currentZone',
  'overworldMap',
  'overworldMapWidth',
  'overworldMapHeight',
  'caveMap',
  'caveMapWidth',
  'caveMapHeight',
  'caveEntranceOverworld',
  'caveEntranceInterior',
  'caveRevealed',
  'caveHiddenPositions',
  'caveNpcSpot',
  'caveBreakableWallPositions',
  'houseMap',
  'houseMapWidth',
  'houseMapHeight',
  'houseEntranceOverworld',
  'houseEntranceInterior',
  'houseDoorInteriorEntry',
  'thresholdZones',
  'whineEntranceOverworld',
  'cellarMap',
  'cellarMapWidth',
  'cellarMapHeight',
  'cellarDoorSpawn',
  'cellarBulkheadInterior',
  'cellarBulkheadYard',
  'cellarRoomCount',
  'cellarFogExplored',
  'emilyInvitation',
  'tenureOpened',
  'meteorShower',
  'lastSatelliteSpawnTime',
  'screenShakeUntil',
  'lightning',
  'floraGrowthPreviews',
  'floraLifecycle',
  'activeWaves',
  'overlayMode',
  'egregorePositions',
  'egregoreLifecycle',
  'lastEgregoreSpreadYear',
  'placedMeteorites',
  'dragHoverTile',
  'soilHealth',
  'elevation',
  'reachableMass',
  'waterfalls',
  'ponds',
  'rivers',
  'tileWater',
  'burnScars',
  'craters',
  'manualDiscoveries',
  'manualState',
  'giftsReceived',
  'pendingInteractionTarget',
  'heldDirection',
  'sprinting',
  'trail',
  'playerTween',
  'audioEnabled',
  'fontScale',
  'world',
  'lastDialogTypingTick',
  'glintingCoins',
  'coinGlintPopTimes',
  'seedGenomes',
  'equippedItemUid',
  'divinedHexagrams',
  'glintZones',
  'glintPatches',
  'glintOpacity',
  'lastGlintSpawnTime',
  'civilizationRuins',
  'mainQuestPhase',
  'ruinGenerationMode',
  'deepTime',
  'deepTimeTransition',
  'revery',
  'reveryCount',
  'lastReveryEndTime',
  'cosmologicalDrift',
  'revealedPhenotypes',
  'dormancyPressure',
  'collapsedStewardTile',
  'playerStationarySince',
  'postGiftActionsCompleted',
  'rainFrontOffset',
  'precipitationIntensity',
  'seasonalPhase',
  'currentDate',
  'lockedBurnLine',
  'burnLineIndex',
  'lastSeenSeason',
  'moabState',
  'wind',
  'pollen',
  'pollenTrailDepth',
  'waterProximity',
  'genesis',
  'bootTitleCard',
  'zoneTransition',
  'reentryLock',
  'nextAngelSpawnTime',
  'angelFlashTime',
  'coyoteCargo',
  'ruinInteriors',
  'currentRuinIndex',
  'caveFogExplored',
  'caveFloraMemory',
  'overworldFogExplored',
  'overworldFloraMemory',
  'autoHidePanels',
  'panelOpenMoveCount',
  'multiplayerSession',
  'remotePlayers',
  'scannedSpecimens',
  'oakSpecimens',
  'egregoreSpecimens',
  'scanInProgress',
  'manualHighlightEntryId',
  'onPlayerMoved',
  'onGenesisComplete',
  'heldKeys',
  'cameraFilm',
  'placedCameras',
  'placedMarkers',
  'cameraArchive',
  'playbackCameraUid',
  'photographAlbum',
  'itemWear',
  'namedRegions',
  'chronicle',
  'knotDelivery',
  'bedKnotPresent',
  'archivedKnots',
  'lastKnotDeliveryArmed',
  'lastKnotPickupAt',
  'lastKnotPickupTile',
  'lastKnotPickupHarvestYear',
  'lastArchiveReveryCount',
  'knotHarvestYearCounter',
  'knotHarvestYears',
].sort((a, b) => a.localeCompare(b))

// Genesis is the expensive part of createGameState (~180ms). Build the
// seeded base once and let the schema + camera roundtrip tests share
// it. Per-test mutations (the camera pushes below) are rewound in
// afterEach so each test sees the original baseline.
const _baseState = withSeededRandom(SEED, () => createGameState('test', 40, 30))
const _baseCameraCount = _baseState.placedCameras.length

afterEach(() => {
  _baseState.placedCameras.length = _baseCameraCount
})

describe('GameState schema', () => {
  it('has exactly the expected fields', () => {
    const actualFields = Object.keys(_baseState).sort((a, b) => a.localeCompare(b))

    expect(actualFields).toEqual(EXPECTED_FIELDS)
  })

  it('field count matches', () => {
    expect(Object.keys(_baseState)).toHaveLength(EXPECTED_FIELDS.length)
  })
})

// RP-24 — PlacedCamera grows an optional `predecessor` field. The
// roundtrip below confirms both fate variants survive serialize/load.
describe('PlacedCamera.predecessor roundtrip (RP-24)', () => {
  const makeCamera = (predecessor: PredecessorRecord | undefined): PlacedCamera => {
    const camera: PlacedCamera = {
      uid: 'cam-test',
      x: 4,
      y: 5,
      zone: Zone.Overworld,
      startedAt: 0,
      expiresAt: 0,
      frames: [],
    }
    if (predecessor) camera.predecessor = predecessor
    return camera
  }

  it('survives roundtrip for fate = field tile', () => {
    const predecessor: PredecessorRecord = {
      stewardName: 'Foo',
      tenure: 7,
      fate: { kind: 'field', tile: { x: 12, y: 34 } },
    }
    _baseState.placedCameras.push(makeCamera(predecessor))

    const restored = deserializeState(serializeState(_baseState))
    const restoredCamera = restored.placedCameras[restored.placedCameras.length - 1]

    expect(restoredCamera.predecessor).toEqual(predecessor)
  })

  it("survives roundtrip for fate = 'bed'", () => {
    const predecessor: PredecessorRecord = {
      stewardName: 'Bar',
      tenure: 3,
      fate: 'bed',
    }
    _baseState.placedCameras.push(makeCamera(predecessor))

    const restored = deserializeState(serializeState(_baseState))
    const restoredCamera = restored.placedCameras[restored.placedCameras.length - 1]

    expect(restoredCamera.predecessor).toEqual(predecessor)
  })

  it('omits the predecessor field for cameras without one', () => {
    _baseState.placedCameras.push(makeCamera(undefined))

    const restored = deserializeState(serializeState(_baseState))
    const restoredCamera = restored.placedCameras[restored.placedCameras.length - 1]

    expect(restoredCamera.predecessor).toBeUndefined()
  })
})
