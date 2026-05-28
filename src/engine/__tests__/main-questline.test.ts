import { getCharacterDialog } from '../characters'
import { combineFromBackpack } from '../combine'
import { ComponentType } from '../ecs/types'
import { createCharacterEntity } from '../entities'
import { RuinGenerationMode, RuinRole } from '../genesisTypes'
import { triggerStewardSeal, unlockRuinDoor } from '../interaction'
import { placeItem } from '../inventory'
import { recordDiscovery } from '../manual'
import { movePlayer } from '../movement'
import { posKey } from '../position'
import { MainQuestPhase, TileType, Zone } from '../types'
import { clearAroundPlayer, createTestState, getBeeEntities } from './helpers'
import { describe, expect, it } from 'vitest'

import type { CivilizationRuin } from '../genesisTypes'
import type { GameState } from '../types'

const requireValue = <T>(val: T | null | undefined): T => {
  expect(val).toBeTruthy()
  return val as T
}

const findCharacterEid = (state: GameState, definitionId: string): number | null => {
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (ident?.definitionId === definitionId) return eid
  }
  return null
}

const installCoyoteRuin = (state: GameState): { ruinIndex: number; ruin: CivilizationRuin } => {
  // Build a minimal coyote-role ruin record + matching interior so
  // unlockRuinDoor can resolve the role and find the locked-door tile.
  const ruin: CivilizationRuin = {
    position: { x: 0, y: 0 },
    name: 'Test Ruin',
    radius: 3,
    age: 1000,
    aqueductPaths: [],
    buildingFootprints: [],
    role: RuinRole.Coyote,
  }
  state.civilizationRuins = [ruin]
  state.currentRuinIndex = 0
  state.currentZone = Zone.Ruin

  const interior = {
    ruinIndex: 0,
    archetype: 'dormantGarden' as const,
    name: 'Test Ruin',
    map: state.map,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    entranceInterior: { x: state.player.x, y: state.player.y + 1 },
    entranceOverworld: { x: 0, y: 0 },
    explored: true,
    cleared: false,
    dormantGarden: {
      aqueductTiles: new Set<string>(),
      breakPoints: [],
      repairedBreaks: new Set<string>(),
      seedVault: { x: state.player.x + 3, y: state.player.y },
      seedDecayTimers: new Map<string, number>(),
      seedDecayAcceleration: 1,
      waterFlowing: true,
      keyPosition: null,
      tabletPosition: null,
      doorPositions: [{ x: state.player.x, y: state.player.y - 1 }],
      collapseBarrier: null,
    },
    fogExplored: new Set<string>(),
    fogDiscovered: new Set<string>(),
  }
  state.ruinInteriors = [interior]
  state.map[state.player.y - 1][state.player.x] = { type: TileType.RuinDoorLocked }
  state.playerFacing = 'up'
  placeItem(state.backpack, 'aqueductKey', 0, 0)
  return { ruinIndex: 0, ruin }
}

describe('main questline > quest phase state model', () => {
  it('createGameState seeds mainQuestPhase to AwaitingCoyote and ruinGenerationMode to Starter', () => {
    const state = createTestState()
    expect(state.mainQuestPhase).toBe(MainQuestPhase.AwaitingCoyote)
    expect(state.ruinGenerationMode).toBe(RuinGenerationMode.Starter)
  })
})

describe('main questline > starting state', () => {
  it('starts with no bees or clovers in the backpack', () => {
    const state = createTestState()
    expect(state.backpack.items.find(i => i.definitionId === 'bee')).toBeUndefined()
    expect(state.backpack.items.find(i => i.definitionId === 'clover')).toBeUndefined()
  })

  it('starts with no coyote character entity in the world', () => {
    const state = createTestState()
    expect(findCharacterEid(state, 'coyote')).toBeNull()
  })
})

describe('main questline > Gron dialog phase dispatch', () => {
  it('returns the round-5 awaiting-coyote opener', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.AwaitingCoyote
    expect(getCharacterDialog(state, 'gron')).toEqual(['...', 'A steward.', 'A steward goes to the ruins.'])
  })

  it('returns the Dickinson-correct gathering line when player has only one of bee/clover', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Gathering
    placeItem(state.backpack, 'bee', 0, 0)
    expect(getCharacterDialog(state, 'gron')).toEqual(['A clover and a bee.'])
  })

  it('returns the combining beat when player has both bee and clover', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Gathering
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    expect(getCharacterDialog(state, 'gron')).toEqual(['A clover. A bee.', 'Now.'])
  })

  it('returns the sealed declaration', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Sealed
    expect(getCharacterDialog(state, 'gron')).toEqual(['A steward.'])
  })

  it('falls through gracefully to sealed dialog for an unknown phase value', () => {
    const state = createTestState()
    // Force an unrecognized phase to exercise the default branch.
    ;(state as { mainQuestPhase: string }).mainQuestPhase = 'unknown-phase'
    expect(getCharacterDialog(state, 'gron')).toEqual(['A steward.'])
  })
})

describe('main questline > coyote rescue on approach', () => {
  // Spawn coyote adjacent to player, then have player walk one tile so the
  // post-step adjacency hook fires.
  const setupApproach = (state: GameState): void => {
    // Walkable tiles around player + coyote spawn so movePlayer can step.
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const x = state.player.x + dx
        const y = state.player.y + dy
        if (state.map[y]?.[x]) state.map[y][x] = { type: TileType.RuinFloor }
      }
    }
    // Place coyote two tiles east; player will step right and become adjacent.
    createCharacterEntity(
      state,
      'coyote',
      { x: state.player.x + 2, y: state.player.y },
      { zone: Zone.Ruin, ruinIndex: 0 }
    )
  }

  it('advances quest phase and records discovery on rescue', () => {
    const state = createTestState()
    installCoyoteRuin(state)
    setupApproach(state)

    expect(movePlayer(state, 'right')).toBe(true)

    expect(state.mainQuestPhase).toBe(MainQuestPhase.Gathering)
    expect(state.manualDiscoveries.has('character:coyote')).toBe(true)
    expect(state.manualDiscoveries.has('event:rescue-coyote')).toBe(true)
  })

  it('does not re-fire the rescue if the phase has already advanced', () => {
    const state = createTestState()
    installCoyoteRuin(state)
    setupApproach(state)
    state.mainQuestPhase = MainQuestPhase.Gathering

    expect(movePlayer(state, 'right')).toBe(true)

    // Phase stays where caller set it; rescue path no-ops once Gathering is in.
    expect(state.mainQuestPhase).toBe(MainQuestPhase.Gathering)
  })

  it('does not fire the rescue in a non-coyote-role ruin', () => {
    const state = createTestState()
    installCoyoteRuin(state)
    setupApproach(state)
    state.civilizationRuins[0].role = RuinRole.Bee

    expect(movePlayer(state, 'right')).toBe(true)
    expect(state.mainQuestPhase).toBe(MainQuestPhase.AwaitingCoyote)
  })

  it('does not fire on door unlock — rescue is decoupled from the door', () => {
    const state = createTestState()
    installCoyoteRuin(state)
    // Stash coyote far away; unlock alone must not rescue.
    createCharacterEntity(
      state,
      'coyote',
      { x: state.player.x + 10, y: state.player.y },
      { zone: Zone.Ruin, ruinIndex: 0 }
    )

    expect(unlockRuinDoor(state)).toBe(true)
    expect(state.mainQuestPhase).toBe(MainQuestPhase.AwaitingCoyote)
  })
})

describe('main questline > combine seal', () => {
  const stockAndClear = (state: GameState): void => {
    clearAroundPlayer(state, 2)
    state.ponds.delete(posKey(state.player.x, state.player.y))
    state.rivers.delete(posKey(state.player.x, state.player.y))
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
  }

  it('teleports Gron adjacent and opens dialog when bee+clover combine succeeds on the overworld', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.mainQuestPhase = MainQuestPhase.Gathering
    stockAndClear(state)
    const gronEid = createCharacterEntity(
      state,
      'gron',
      { x: state.player.x + 5, y: state.player.y + 5 },
      { zone: Zone.Overworld }
    )

    expect(combineFromBackpack(state, 'bee', 'clover')).toBe(true)

    expect(state.mainQuestPhase).toBe(MainQuestPhase.Sealed)
    const gronPos = requireValue(state.world.getComponent(gronEid, ComponentType.Position))
    const dx = Math.abs(gronPos.x - state.player.x)
    const dy = Math.abs(gronPos.y - state.player.y)
    expect(dx + dy).toBe(1)
    expect(state.activeDialog?.characterId).toBe('gron')
    expect(state.manualDiscoveries.has('event:steward-sealed')).toBe(true)
  })

  it('does not seal the steward when the combine succeeds in a non-overworld zone', () => {
    const state = createTestState()
    state.currentZone = Zone.Cave
    state.mainQuestPhase = MainQuestPhase.Gathering
    stockAndClear(state)
    const gronEid = createCharacterEntity(
      state,
      'gron',
      { x: state.player.x + 5, y: state.player.y + 5 },
      { zone: Zone.Overworld }
    )

    expect(combineFromBackpack(state, 'bee', 'clover')).toBe(true)

    expect(state.mainQuestPhase).toBe(MainQuestPhase.Gathering)
    const gronPos = requireValue(state.world.getComponent(gronEid, ComponentType.Position))
    expect(gronPos.x).toBe(state.player.x + 5)
    expect(gronPos.y).toBe(state.player.y + 5)
    expect(state.activeDialog).toBeNull()
    expect(state.manualDiscoveries.has('event:steward-sealed')).toBe(false)
  })

  it('does not re-fire when the steward is already sealed', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.mainQuestPhase = MainQuestPhase.Sealed
    const gronEid = createCharacterEntity(
      state,
      'gron',
      { x: state.player.x + 5, y: state.player.y + 5 },
      { zone: Zone.Overworld }
    )

    triggerStewardSeal(state)

    expect(state.mainQuestPhase).toBe(MainQuestPhase.Sealed)
    const gronPos = requireValue(state.world.getComponent(gronEid, ComponentType.Position))
    expect(gronPos.x).toBe(state.player.x + 5)
    expect(gronPos.y).toBe(state.player.y + 5)
    expect(state.activeDialog).toBeNull()
  })

  it('spawns 4 bees at the combine moment (1 from RP-17 ceremony wave + 3 from the prairie inheritance via triggerStewardSeal — RP-21 decoupled this from Gron dialog close)', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.mainQuestPhase = MainQuestPhase.Gathering
    stockAndClear(state)
    // Stack the 3x3 with clover so all 3 inheritance candidates land.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx].type = TileType.Flora
      }
    }
    createCharacterEntity(state, 'gron', { x: state.player.x + 5, y: state.player.y + 5 }, { zone: Zone.Overworld })

    const before = getBeeEntities(state).length
    expect(combineFromBackpack(state, 'bee', 'clover')).toBe(true)
    expect(getBeeEntities(state).length - before).toBe(4)
  })

  it('sets angelFlashTime when Gron teleports on combine seal', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.mainQuestPhase = MainQuestPhase.Gathering
    stockAndClear(state)
    createCharacterEntity(state, 'gron', { x: state.player.x + 5, y: state.player.y + 5 }, { zone: Zone.Overworld })
    state.angelFlashTime = 0

    const flashTime = 12345
    expect(combineFromBackpack(state, 'bee', 'clover', flashTime)).toBe(true)

    expect(state.angelFlashTime).toBe(flashTime)
  })

  it('does not update angelFlashTime when no walkable adjacent tile exists for Gron', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.mainQuestPhase = MainQuestPhase.Gathering
    stockAndClear(state)
    // Wall off all 4 cardinal neighbors so pickAdjacentWalkableTile returns null.
    // Player tile stays walkable so combineFromBackpack's standing-tile check passes.
    const px = state.player.x
    const py = state.player.y
    state.map[py][px - 1].type = TileType.Space
    state.map[py][px + 1].type = TileType.Space
    state.map[py - 1][px].type = TileType.Space
    state.map[py + 1][px].type = TileType.Space
    const gronEid = createCharacterEntity(
      state,
      'gron',
      { x: state.player.x + 5, y: state.player.y + 5 },
      { zone: Zone.Overworld }
    )
    const priorFlash = 999
    state.angelFlashTime = priorFlash

    expect(combineFromBackpack(state, 'bee', 'clover', 54321)).toBe(true)

    // Gron did not move
    const gronPos = requireValue(state.world.getComponent(gronEid, ComponentType.Position))
    expect(gronPos.x).toBe(state.player.x + 5)
    expect(gronPos.y).toBe(state.player.y + 5)
    // Flash did not fire
    expect(state.angelFlashTime).toBe(priorFlash)
    // Seal still completes
    expect(state.mainQuestPhase).toBe(MainQuestPhase.Sealed)
    expect(state.activeDialog?.characterId).toBe('gron')
  })
})

describe('main questline > Gron sealed dialog', () => {
  it('returns the round-5 single-line declaration', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Sealed
    const dialog = getCharacterDialog(state, 'gron')
    expect(dialog).toEqual(['A steward.'])
  })
})

describe('main questline > combine bee release (RP-21 — at-combine, not at-dialog-close)', () => {
  const stockAndClear = (state: GameState): void => {
    clearAroundPlayer(state, 2)
    state.ponds.delete(posKey(state.player.x, state.player.y))
    state.rivers.delete(posKey(state.player.x, state.player.y))
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
  }

  it('spawns 4 bees synchronously when the combine fires on the overworld with a 3x3 clover bed (1 ceremony + 3 inheritance)', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.mainQuestPhase = MainQuestPhase.Gathering
    stockAndClear(state)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx].type = TileType.Flora
      }
    }
    createCharacterEntity(state, 'gron', { x: state.player.x + 5, y: state.player.y + 5 }, { zone: Zone.Overworld })
    const before = getBeeEntities(state).length
    expect(combineFromBackpack(state, 'bee', 'clover')).toBe(true)
    expect(getBeeEntities(state).length - before).toBe(4)
  })

  it('the inheritance pool falls back to walkable non-clover tiles when no clover is available in the 3x3', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.mainQuestPhase = MainQuestPhase.Gathering
    stockAndClear(state)
    // All dirt — no clover, but all walkable. The ceremony still plants
    // a clover at the player tile, but the 8 neighbors stay dirt.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx].type = TileType.Dirt
      }
    }
    createCharacterEntity(state, 'gron', { x: state.player.x + 5, y: state.player.y + 5 }, { zone: Zone.Overworld })
    const before = getBeeEntities(state).length
    expect(combineFromBackpack(state, 'bee', 'clover')).toBe(true)
    // 1 ceremony bee + 3 inheritance bees (any walkable tile is fair game).
    expect(getBeeEntities(state).length - before).toBe(4)
  })

  it('seal-bound bee spawn fires only once — re-firing triggerStewardSeal on an already-sealed state is a no-op', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.mainQuestPhase = MainQuestPhase.Gathering
    stockAndClear(state)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx].type = TileType.Flora
      }
    }
    createCharacterEntity(state, 'gron', { x: state.player.x + 5, y: state.player.y + 5 }, { zone: Zone.Overworld })
    const before = getBeeEntities(state).length

    expect(combineFromBackpack(state, 'bee', 'clover')).toBe(true)
    const afterFirst = getBeeEntities(state).length
    expect(afterFirst - before).toBe(4)

    // Already sealed — triggerStewardSeal's early-return kicks in. No more bees.
    triggerStewardSeal(state)
    expect(getBeeEntities(state).length).toBe(afterFirst)
  })
})

describe('main questline > manual entries', () => {
  it('records both quest events idempotently', () => {
    const state = createTestState()
    recordDiscovery(state, 'event:rescue-coyote')
    recordDiscovery(state, 'event:rescue-coyote')
    recordDiscovery(state, 'event:steward-sealed')
    expect(state.manualDiscoveries.has('event:rescue-coyote')).toBe(true)
    expect(state.manualDiscoveries.has('event:steward-sealed')).toBe(true)
  })
})
