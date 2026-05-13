import { describe, expect, it } from 'vitest'

import { getCharacterDialog } from '../characters'
import { combineFromBackpack } from '../combine'
import { ComponentType } from '../ecs/types'
import { createCharacterEntity } from '../entities'
import { RuinGenerationMode, RuinRole } from '../genesisTypes'
import { advanceDialog, triggerStewardSeal, unlockRuinDoor } from '../interaction'
import { movePlayer } from '../movement'
import { placeItem } from '../inventory'
import { recordDiscovery } from '../manual'
import { posKey } from '../position'
import { CoyoteMode, MainQuestPhase, TileType, Zone } from '../types'

import { clearAroundPlayer, createTestState, getBeeEntities } from './helpers'

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
      debrisPositions: [],
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
    fogIllumination: new Map<string, number>(),
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
  it('returns the awaiting-coyote 5-line block', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.AwaitingCoyote
    const dialog = getCharacterDialog(state, 'gron')
    expect(dialog).toHaveLength(5)
    expect(dialog[1]).toBe('Oh, you must be the new steward.')
    expect(dialog[4]).toBe('What is a steward without their coyote?')
  })

  it('returns the gathering hint when player has only one of bee/clover', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Gathering
    placeItem(state.backpack, 'bee', 0, 0)
    expect(getCharacterDialog(state, 'gron')).toEqual(['It takes one clover and one bee.'])
  })

  it('returns the impatient prompt when player has both bee and clover', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Gathering
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    expect(getCharacterDialog(state, 'gron')).toEqual([
      'Well what are you waiting for, steward? One clover and one bee.',
    ])
  })

  it('returns the sealed acknowledgement', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Sealed
    expect(getCharacterDialog(state, 'gron')).toEqual([
      'Ahhh, yes. You are indeed the steward.',
      "Here, I've been saving these.",
    ])
  })

  it('falls through gracefully to sealed dialog for an unknown phase value', () => {
    const state = createTestState()
    // Force an unrecognized phase to exercise the default branch.
    ;(state as { mainQuestPhase: string }).mainQuestPhase = 'unknown-phase'
    expect(getCharacterDialog(state, 'gron')).toEqual([
      'Ahhh, yes. You are indeed the steward.',
      "Here, I've been saving these.",
    ])
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
      { zone: Zone.Ruin, ruinIndex: 0 },
    )
  }

  it('switches coyote to Follow, advances quest phase, queues toast, records discovery', () => {
    const state = createTestState()
    installCoyoteRuin(state)
    setupApproach(state)

    expect(movePlayer(state, 'right')).toBe(true)

    expect(state.mainQuestPhase).toBe(MainQuestPhase.Gathering)
    expect(state.coyoteMode).toBe(CoyoteMode.Follow)
    expect(state.manualDiscoveries.has('character:coyote')).toBe(true)
    expect(state.manualDiscoveries.has('event:rescue-coyote')).toBe(true)
    const rescueToast = state.queuedEvents.find(e => e.text === 'Rescued Coyote!')
    expect(rescueToast).toBeTruthy()
  })

  it('does not re-fire the rescue if the phase has already advanced', () => {
    const state = createTestState()
    installCoyoteRuin(state)
    setupApproach(state)
    state.mainQuestPhase = MainQuestPhase.Gathering

    const before = state.queuedEvents.length
    expect(movePlayer(state, 'right')).toBe(true)

    expect(state.queuedEvents.find(e => e.text === 'Rescued Coyote!')).toBeUndefined()
    expect(state.queuedEvents.length).toBe(before)
  })

  it('does not fire the rescue in a non-coyote-role ruin', () => {
    const state = createTestState()
    installCoyoteRuin(state)
    setupApproach(state)
    state.civilizationRuins[0].role = RuinRole.Bee

    expect(movePlayer(state, 'right')).toBe(true)
    expect(state.mainQuestPhase).toBe(MainQuestPhase.AwaitingCoyote)
    expect(state.queuedEvents.find(e => e.text === 'Rescued Coyote!')).toBeUndefined()
  })

  it('does not fire on door unlock — rescue is decoupled from the door', () => {
    const state = createTestState()
    installCoyoteRuin(state)
    // Stash coyote far away; unlock alone must not rescue.
    createCharacterEntity(
      state,
      'coyote',
      { x: state.player.x + 10, y: state.player.y },
      { zone: Zone.Ruin, ruinIndex: 0 },
    )

    expect(unlockRuinDoor(state)).toBe(true)
    expect(state.mainQuestPhase).toBe(MainQuestPhase.AwaitingCoyote)
    expect(state.queuedEvents.find(e => e.text === 'Rescued Coyote!')).toBeUndefined()
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

  it('flips pendingSavedBees on seal', () => {
    const state = createTestState()
    state.currentZone = Zone.Overworld
    state.mainQuestPhase = MainQuestPhase.Gathering
    stockAndClear(state)
    createCharacterEntity(state, 'gron', { x: state.player.x + 5, y: state.player.y + 5 }, { zone: Zone.Overworld })

    expect(state.pendingSavedBees).toBe(false)
    expect(combineFromBackpack(state, 'bee', 'clover')).toBe(true)
    expect(state.pendingSavedBees).toBe(true)
  })
})

describe('main questline > Gron sealed dialog', () => {
  it('shows two lines on the sealed beat ending with the saving-bees teaser', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Sealed
    const dialog = getCharacterDialog(state, 'gron')
    expect(dialog).toEqual(['Ahhh, yes. You are indeed the steward.', "Here, I've been saving these."])
  })
})

describe('main questline > saving bees release', () => {
  const openGronDialogAtLastLine = (state: GameState, lineIndex: number, characterId = 'gron'): void => {
    state.activeDialog = {
      characterId,
      lineIndex,
      typingIndex: 999,
      typingDone: true,
      transitioning: false,
      transitionStartTime: 0,
    }
  }

  it('spawns 3 bees when Gron dialog closes with pendingSavedBees=true', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Sealed
    state.pendingSavedBees = true
    clearAroundPlayer(state, 2)
    // Set a 3x3 of clover around player so candidates are plentiful.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx].type = TileType.Clover
      }
    }
    const before = getBeeEntities(state).length
    openGronDialogAtLastLine(state, 1)
    advanceDialog(state)
    expect(getBeeEntities(state).length - before).toBe(3)
    expect(state.pendingSavedBees).toBe(false)
  })

  it('does not consume the flag when another character\'s dialog closes', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Sealed
    state.pendingSavedBees = true
    clearAroundPlayer(state, 2)
    const before = getBeeEntities(state).length
    openGronDialogAtLastLine(state, 0, 'moab')
    advanceDialog(state)
    expect(getBeeEntities(state).length).toBe(before)
    expect(state.pendingSavedBees).toBe(true)
  })

  it('fires only once across repeated Gron dialog closes', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Sealed
    state.pendingSavedBees = true
    clearAroundPlayer(state, 2)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx].type = TileType.Clover
      }
    }
    const before = getBeeEntities(state).length

    openGronDialogAtLastLine(state, 1)
    advanceDialog(state)
    const afterFirst = getBeeEntities(state).length

    openGronDialogAtLastLine(state, 1)
    advanceDialog(state)
    const afterSecond = getBeeEntities(state).length

    expect(afterFirst - before).toBe(3)
    expect(afterSecond - afterFirst).toBe(0)
  })

  it('falls back to walkable non-clover tiles when no clover is available', () => {
    const state = createTestState()
    state.mainQuestPhase = MainQuestPhase.Sealed
    state.pendingSavedBees = true
    clearAroundPlayer(state, 2)
    // All dirt — no clover, but all walkable.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx].type = TileType.Dirt
      }
    }
    const before = getBeeEntities(state).length
    openGronDialogAtLastLine(state, 1)
    advanceDialog(state)
    expect(getBeeEntities(state).length - before).toBe(3)
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
