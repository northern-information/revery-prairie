import { describe, expect, it } from 'vitest'

import { getCharacterDialog } from '../characters'
import { combineFromBackpack } from '../combine'
import { ComponentType } from '../ecs/types'
import { createCharacterEntity } from '../entities'
import { RuinGenerationMode, RuinRole } from '../genesisTypes'
import { triggerStewardSeal, unlockRuinDoor } from '../interaction'
import { placeItem } from '../inventory'
import { recordDiscovery } from '../manual'
import { posKey } from '../position'
import { CoyoteMode, MainQuestPhase, TileType, Zone } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

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
    expect(getCharacterDialog(state, 'gron')).toEqual(['Ahhh, yes. You are indeed the steward.'])
  })

  it('falls through gracefully to sealed dialog for an unknown phase value', () => {
    const state = createTestState()
    // Force an unrecognized phase to exercise the default branch.
    ;(state as { mainQuestPhase: string }).mainQuestPhase = 'unknown-phase'
    expect(getCharacterDialog(state, 'gron')).toEqual(['Ahhh, yes. You are indeed the steward.'])
  })
})

describe('main questline > coyote rescue on door unlock', () => {
  it('switches coyote to Follow, advances quest phase, queues toast, records discovery', () => {
    const state = createTestState()
    installCoyoteRuin(state)
    // Place an idle coyote inside the vault to be rescued.
    createCharacterEntity(state, 'coyote', { x: state.player.x + 3, y: state.player.y }, { zone: Zone.Ruin, ruinIndex: 0 })

    expect(unlockRuinDoor(state)).toBe(true)

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
    state.mainQuestPhase = MainQuestPhase.Gathering // already past awaiting-coyote
    createCharacterEntity(state, 'coyote', { x: state.player.x + 3, y: state.player.y }, { zone: Zone.Ruin, ruinIndex: 0 })

    const before = state.queuedEvents.length
    expect(unlockRuinDoor(state)).toBe(true)

    expect(state.queuedEvents.find(e => e.text === 'Rescued Coyote!')).toBeUndefined()
    expect(state.queuedEvents.length).toBe(before)
  })

  it('does not fire the rescue when the unlocked ruin has a non-coyote role', () => {
    const state = createTestState()
    installCoyoteRuin(state)
    state.civilizationRuins[0].role = RuinRole.Bee // not the coyote ruin
    createCharacterEntity(state, 'coyote', { x: state.player.x + 3, y: state.player.y }, { zone: Zone.Ruin, ruinIndex: 0 })

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
