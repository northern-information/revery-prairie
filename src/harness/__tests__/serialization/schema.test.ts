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
  'omniboxContainers',
  'nextOmniboxNumber',
  'discoveredRecipes',
  'previewFn',
  'weather',
  'path',
  'pathWaypoints',
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
  'lightning',
  'omniboxStrikeCounts',
  'cloverGrowthPreviews',
  'cloverLifecycle',
  'soilHealth',
  'elevation',
  'ponds',
  'rivers',
  'tileWater',
  'burnScars',
  'manualDiscoveries',
  'manualState',
  'reveries',
  'actionBar',
  'giftsReceived',
  'hoverPath',
  'hoverPathTarget',
  'pendingInteractionTarget',
  'heldDirection',
  'heldActionSlot',
  'targetingSlot',
  'sprinting',
  'trail',
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
  'zoom',
  'civilizationRuins',
  'deepTime',
  'postGiftActionsCompleted',
  'rainFrontOffset',
  'rainIntensity',
  'waterProximity',
  'genesis',
  'angelCantos',
  'nextAngelSpawnTime',
  'angelEncounterCount',
  'angelFlashTime',
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
