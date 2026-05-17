import { enterCave } from '../cave'
import { ComponentType } from '../ecs/types'
import { createCharacterEntity, dropItem } from '../entities'
import { getAdjacentCharacter, interactWithCharacter, isInteractableAt } from '../interaction'
import { placeItem } from '../inventory'
import { getBlockedPositions } from '../movement'
import { posKey } from '../position'
import { createGameState } from '../state'
import { TileType, Zone } from '../types'
import { getCurrentEntityZone, isEntityInCurrentZone, spatialAtInCurrentZone } from '../zone'
import { describe, expect, it } from 'vitest'

import type { Entity } from '../ecs/types'
import type { GameState, RuinInterior, Tile } from '../types'

// Minimal state builder: skip genesis by passing 30x30 viewport to createGameState
// (it still runs default terrain gen, but that's cheap).
const makeState = (): GameState => createGameState('test', 30, 30)

// Build a ruin interior floor map and put state into ruin mode with it.
const makeRuinMap = (w: number, h: number): Tile[][] => {
  const map: Tile[][] = []
  for (let y = 0; y < h; y++) {
    const row: Tile[] = []
    for (let x = 0; x < w; x++) row.push({ type: TileType.RuinFloor })
    map.push(row)
  }
  return map
}

const makeRuinInterior = (ruinIndex: number, w: number, h: number): RuinInterior => ({
  ruinIndex,
  archetype: 'dormantGarden',
  name: `Test Ruin ${String(ruinIndex)}`,
  map: makeRuinMap(w, h),
  mapWidth: w,
  mapHeight: h,
  entranceOverworld: { x: 50 + ruinIndex, y: 50 },
  entranceInterior: { x: Math.floor(w / 2), y: h - 2 },
  explored: true,
  cleared: false,
  dormantGarden: null,
  fogExplored: new Set<string>(),
  fogDiscovered: new Set<string>(),
  fogIllumination: new Map<string, number>(),
})

const enterRuinWithInterior = (state: GameState, interior: RuinInterior): void => {
  state.ruinInteriors[interior.ruinIndex] = interior
  state.currentRuinIndex = interior.ruinIndex
  state.currentZone = Zone.Ruin
  state.map = interior.map
  state.mapWidth = interior.mapWidth
  state.mapHeight = interior.mapHeight
}

describe('zone isolation: Moab not reachable from outside cave', () => {
  it('isInteractableAt returns false for Moab coordinates when in a ruin', () => {
    const state = makeState()
    // Spawn Moab in the cave (simulating createGameState) and confirm placement
    enterCave(state)
    const moabPos = { x: state.caveNpcSpot.x, y: state.caveNpcSpot.y }
    // Exit cave path: swap into a ruin whose interior happens to contain moabPos
    const interior = makeRuinInterior(0, 40, 25)
    enterRuinWithInterior(state, interior)
    state.player = { x: moabPos.x - 1, y: moabPos.y }
    state.playerFacing = 'right'

    // Moab ECS entity still exists at his cave coordinates, tagged Zone.Cave
    // (not destroyed on exit/enter). Confirm the bug predicate: old code would
    // have returned true here because spatial.at is zone-agnostic.
    expect(isInteractableAt(state, moabPos.x, moabPos.y)).toBe(false)
  })

  it('getAdjacentCharacter returns null when facing Moab from a ruin', () => {
    const state = makeState()
    enterCave(state)
    const moabPos = { x: state.caveNpcSpot.x, y: state.caveNpcSpot.y }
    const interior = makeRuinInterior(0, 40, 25)
    enterRuinWithInterior(state, interior)
    state.player = { x: moabPos.x - 1, y: moabPos.y }
    state.playerFacing = 'right'

    expect(getAdjacentCharacter(state)).toBeNull()
  })

  it('interactWithCharacter does not open Moab dialog from a ruin', () => {
    const state = makeState()
    enterCave(state)
    const moabPos = { x: state.caveNpcSpot.x, y: state.caveNpcSpot.y }
    const interior = makeRuinInterior(0, 40, 25)
    enterRuinWithInterior(state, interior)
    state.player = { x: moabPos.x - 1, y: moabPos.y }
    state.playerFacing = 'right'

    const result = interactWithCharacter(state)
    expect(result.opened).toBe(false)
    expect(state.activeDialog).toBeNull()
  })
})

describe('zone isolation: cross-ruin entity bleed', () => {
  it('ground item in ruin 0 is invisible to consumers in ruin 1', () => {
    const state = makeState()
    // Create two ruin interiors, put an item in ruin 0, then enter ruin 1
    const ruin0 = makeRuinInterior(0, 30, 20)
    const ruin1 = makeRuinInterior(1, 30, 20)
    state.ruinInteriors[0] = ruin0
    state.ruinInteriors[1] = ruin1

    // Place a ground item in ruin 0 at (10, 10)
    const itemEid = state.world.createEntity()
    state.world.addComponent(itemEid, ComponentType.Position, { x: 10, y: 10 })
    state.world.addComponent(itemEid, ComponentType.ItemDrop, { definitionId: 'coin' })
    state.world.addComponent(itemEid, ComponentType.EntityTag, 'groundItem')
    state.world.addComponent(itemEid, ComponentType.EntityZone, { zone: Zone.Ruin, ruinIndex: 0 })

    // Enter ruin 1
    enterRuinWithInterior(state, ruin1)

    // The spatial index DOES have the entity at (10, 10)
    expect(state.world.spatial.at(10, 10)).toContain(itemEid)
    // But zone-scoped lookup excludes it
    expect(spatialAtInCurrentZone(state, 10, 10)).not.toContain(itemEid)
    expect(isEntityInCurrentZone(state, itemEid)).toBe(false)
  })

  it('NPC in ruin 0 does not block movement in ruin 1', () => {
    const state = makeState()
    const ruin0 = makeRuinInterior(0, 30, 20)
    const ruin1 = makeRuinInterior(1, 30, 20)
    state.ruinInteriors[0] = ruin0
    state.ruinInteriors[1] = ruin1

    // Spawn a blocking NPC in ruin 0 at (5, 5)
    enterRuinWithInterior(state, ruin0)
    createCharacterEntity(
      state,
      'ghost-1',
      { x: 5, y: 5 },
      { zone: Zone.Ruin, ruinIndex: 0, behavior: { type: 'drift', moveChance: 0, freezeOnDialog: false } }
    )

    // Now enter ruin 1
    enterRuinWithInterior(state, ruin1)

    const blocked = getBlockedPositions(state)
    expect(blocked.has(posKey(5, 5))).toBe(false)
  })

  it('dropItem in ruin 1 succeeds even when ruin 0 has a ground item at the same tile', () => {
    const state = makeState()
    const ruin0 = makeRuinInterior(0, 30, 20)
    const ruin1 = makeRuinInterior(1, 30, 20)
    state.ruinInteriors[0] = ruin0
    state.ruinInteriors[1] = ruin1

    // Seed ruin 0 with a ground item at (15, 10)
    const foreign = state.world.createEntity()
    state.world.addComponent(foreign, ComponentType.Position, { x: 15, y: 10 })
    state.world.addComponent(foreign, ComponentType.ItemDrop, { definitionId: 'coin' })
    state.world.addComponent(foreign, ComponentType.EntityTag, 'groundItem')
    state.world.addComponent(foreign, ComponentType.EntityZone, { zone: Zone.Ruin, ruinIndex: 0 })

    // Enter ruin 1, put player at (15, 11) with a coin in backpack, face up toward (15, 10)
    enterRuinWithInterior(state, ruin1)
    state.player = { x: 15, y: 11 }
    state.playerFacing = 'up'
    state.backpack.items = []
    expect(placeItem(state.backpack, 'coin', 0, 0)).not.toBeNull()

    const dropped = dropItem(state, 'coin')
    expect(dropped).toBe(true)

    // Confirm a new ground item exists in ruin 1 at the adjacent tile, separate from ruin 0's
    const items = state.world
      .query(ComponentType.EntityTag, ComponentType.EntityZone, ComponentType.Position)
      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem')
    const ruinIndexes = items
      .map(eid => state.world.getComponent(eid, ComponentType.EntityZone)?.ruinIndex)
      .filter((i): i is number => i !== undefined)
    expect(ruinIndexes).toContain(0)
    expect(ruinIndexes).toContain(1)
  })
})

describe('zone isolation: producer contract', () => {
  it('getCurrentEntityZone returns ruinIndex when in a ruin', () => {
    const state = makeState()
    const ruin = makeRuinInterior(2, 20, 20)
    state.ruinInteriors[2] = ruin
    enterRuinWithInterior(state, ruin)

    const ez = getCurrentEntityZone(state)
    expect(ez.zone).toBe(Zone.Ruin)
    expect(ez.ruinIndex).toBe(2)
  })

  it('getCurrentEntityZone omits ruinIndex in overworld and cave', () => {
    const state = makeState()
    expect(getCurrentEntityZone(state)).toEqual({ zone: Zone.Overworld })
    enterCave(state)
    expect(getCurrentEntityZone(state)).toEqual({ zone: Zone.Cave })
  })

  it('dropItem in a ruin tags the new ground item with the correct ruinIndex', () => {
    const state = makeState()
    const ruin = makeRuinInterior(3, 20, 20)
    state.ruinInteriors[3] = ruin
    enterRuinWithInterior(state, ruin)

    state.player = { x: 10, y: 10 }
    state.playerFacing = 'up'
    state.backpack.items = []
    expect(placeItem(state.backpack, 'coin', 0, 0)).not.toBeNull()
    // sanity: player tile and neighbours are walkable RuinFloor
    expect(state.map[10][10].type).toBe(TileType.RuinFloor)

    expect(dropItem(state, 'coin')).toBe(true)

    const ruinDrops = state.world.query(ComponentType.EntityTag, ComponentType.EntityZone).filter((eid: Entity) => {
      if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundItem') return false
      const ez = state.world.getComponent(eid, ComponentType.EntityZone)
      return ez?.zone === Zone.Ruin && ez.ruinIndex === 3
    })
    expect(ruinDrops.length).toBe(1)
    const ez = state.world.getComponent(ruinDrops[0], ComponentType.EntityZone)
    expect(ez?.zone).toBe(Zone.Ruin)
    expect(ez?.ruinIndex).toBe(3)
  })
})

describe('zone isolation: strict isEntityInCurrentZone', () => {
  it('returns false for an entity with no EntityZone component', () => {
    const state = makeState()
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: 5, y: 5 })
    expect(isEntityInCurrentZone(state, e)).toBe(false)
  })

  it('returns false for a ruin-tagged entity with undefined ruinIndex when in a ruin', () => {
    const state = makeState()
    const ruin = makeRuinInterior(0, 20, 20)
    state.ruinInteriors[0] = ruin
    enterRuinWithInterior(state, ruin)

    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: 5, y: 5 })
    state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Ruin })

    expect(isEntityInCurrentZone(state, e)).toBe(false)
  })
})
