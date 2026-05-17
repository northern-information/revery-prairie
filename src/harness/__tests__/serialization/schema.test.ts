import { withSeededRandom } from '@/harness/prng'

import { createGameState } from '@/engine/state'

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
  'openContainer',
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
  'meteorShower',
  'playerSpawn',
  'lastSatelliteSpawnTime',
  'screenShakeUntil',
  'lightning',
  'cloverGrowthPreviews',
  'cloverLifecycle',
  'soilHealth',
  'elevation',
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
  'musicEnabled',
  'fontScale',
  'rightInsetTiles',
  'world',
  'lastDialogTypingTick',
  'glintingCoins',
  'divinedHexagrams',
  'glintZones',
  'glintPatches',
  'glintOpacity',
  'lastGlintSpawnTime',
  'civilizationRuins',
  'mainQuestPhase',
  'ruinGenerationMode',
  'pendingSavedBees',
  'deepTime',
  'deepTimeTransition',
  'postGiftActionsCompleted',
  'rainFrontOffset',
  'rainIntensity',
  'wind',
  'pollen',
  'pollenTrailDepth',
  'waterProximity',
  'genesis',
  'bootTitleCard',
  'zoneTransition',
  'angelCantos',
  'nextAngelSpawnTime',
  'angelEncounterCount',
  'angelFlashTime',
  'coyoteMode',
  'coyoteCargo',
  'coyotePath',
  'ruinInteriors',
  'currentRuinIndex',
  'queuedEvents',
  'caveFogExplored',
  'caveFogDiscovered',
  'caveFogIllumination',
  'selectedUnits',
  'selectionBox',
  'unitCommands',
  'moveOrderMarkers',
  'autoHidePanels',
  'panelOpenMoveCount',
  'devPanelOpen',
  'devPaintPreview',
  'devEntityPreview',
  'multiplayerSession',
  'remotePlayers',
  'onPlayerMoved',
  'onGenesisEpochStart',
  'onGenesisComplete',
  'heldKeys',
].sort((a, b) => a.localeCompare(b))

describe('GameState schema', () => {
  it('has exactly the expected fields', () => {
    const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
    const actualFields = Object.keys(state).sort((a, b) => a.localeCompare(b))

    expect(actualFields).toEqual(EXPECTED_FIELDS)
  })

  it('field count matches', () => {
    const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))

    expect(Object.keys(state)).toHaveLength(EXPECTED_FIELDS.length)
  })
})
