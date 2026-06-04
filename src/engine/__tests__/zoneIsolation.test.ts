import { enterCave } from '../cave'
import { ComponentType } from '../ecs/types'
import { createCharacterEntity, dropItem } from '../entities'
import { getAdjacentCharacter, interactWithCharacter, isInteractableAt } from '../interaction'
import { placeItem } from '../inventory'
import { getBlockedPositions } from '../movement'
import { posKey } from '../position'
import { createGameState } from '../state'
import { TileType, Zone } from '../types'
import { getWorldForZone } from '../zone'
import { describe, expect, it } from 'vitest'

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
  floraMemory: new Map(),
})

const enterRuinWithInterior = (state: GameState, interior: RuinInterior): void => {
  state.ruinInteriors[interior.ruinIndex] = interior
  state.currentRuinIndex = interior.ruinIndex
  state.currentZone = Zone.Ruin
  state.map = interior.map
  state.mapWidth = interior.mapWidth
  state.mapHeight = interior.mapHeight
  // Lazy-create the per-ruin ECS world so state.world resolves.
  getWorldForZone(state, Zone.Ruin, interior.ruinIndex)
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

    // Moab ECS entity still exists in the Cave world; the Ruin world has
    // no entity at moabPos. Per-zone worlds: state.world resolves to the
    // ruin world here, so isInteractableAt cannot see Moab structurally.
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

    // Place a ground item in ruin 0's world at (10, 10)
    const ruin0World = getWorldForZone(state, Zone.Ruin, 0)
    const itemEid = ruin0World.createEntity()
    ruin0World.addComponent(itemEid, ComponentType.Position, { x: 10, y: 10 })
    ruin0World.addComponent(itemEid, ComponentType.ItemDrop, { definitionId: 'coin' })
    ruin0World.addComponent(itemEid, ComponentType.EntityTag, 'groundItem')

    // Enter ruin 1
    enterRuinWithInterior(state, ruin1)

    // Ruin 0's spatial index DOES have the entity at (10, 10).
    expect(ruin0World.spatial.at(10, 10)).toContain(itemEid)
    // The active zone is ruin 1; state.world resolves to ruin 1's world,
    // which has no entity at (10, 10) — different World entirely.
    expect(state.world.spatial.at(10, 10)).not.toContain(itemEid)
    // And the eid (namespaced per-world) is not in ruin 1's world at all:
    // ruin1 has its own id counter starting at 0, so even if numerically
    // equal, the entity wouldn't have ItemDrop/Position there.
    expect(state.world.hasComponent(itemEid, ComponentType.ItemDrop)).toBe(false)
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

    // Seed ruin 0 with a ground item at (15, 10), in ruin 0's world
    const ruin0World = getWorldForZone(state, Zone.Ruin, 0)
    const foreign = ruin0World.createEntity()
    ruin0World.addComponent(foreign, ComponentType.Position, { x: 15, y: 10 })
    ruin0World.addComponent(foreign, ComponentType.ItemDrop, { definitionId: 'coin' })
    ruin0World.addComponent(foreign, ComponentType.EntityTag, 'groundItem')

    // Enter ruin 1, put player at (15, 11) with a coin in backpack, face up toward (15, 10)
    enterRuinWithInterior(state, ruin1)
    state.player = { x: 15, y: 11 }
    state.playerFacing = 'up'
    state.backpack.items = []
    expect(placeItem(state.backpack, 'coin', 0, 0)).not.toBeNull()

    const dropped = dropItem(state, 'coin')
    expect(dropped).toBe(true)

    // The foreign drop is still in ruin 0's world (the active world is
    // ruin 1, so dropItem only adds to ruin 1).
    expect(ruin0World.hasComponent(foreign, ComponentType.Position)).toBe(true)
    // And ruin 1 now has at least one ground-item entity — the freshly
    // dropped coin — confirming dropItem wrote to the active world.
    const ruin1World = getWorldForZone(state, Zone.Ruin, 1)
    const ruin1Drops = ruin1World
      .query(ComponentType.ItemDrop, ComponentType.EntityTag)
      .filter(eid => ruin1World.getComponent(eid, ComponentType.EntityTag) === 'groundItem')
    expect(ruin1Drops.length).toBeGreaterThanOrEqual(1)
  })
})

describe('zone isolation: producer contract', () => {
  it('dropItem in a ruin places the new ground item in that ruin world', () => {
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

    // Capture other-world ground-item counts BEFORE the drop (createGameState
    // seeds overworld groundItems; they are unrelated to the drop under test).
    const countDrops = (key: string): number => {
      const world = state.worlds.get(key)
      if (!world) return 0
      return world
        .query(ComponentType.ItemDrop, ComponentType.EntityTag)
        .filter(eid => world.getComponent(eid, ComponentType.EntityTag) === 'groundItem').length
    }
    const beforeCounts = new Map<string, number>()
    for (const [key] of state.worlds) {
      if (key === `ruin:3`) continue
      beforeCounts.set(key, countDrops(key))
    }

    expect(dropItem(state, 'coin')).toBe(true)

    // Per-zone worlds: state.world is ruin 3's world; the drop lands here.
    const ruinDrops = state.world
      .query(ComponentType.ItemDrop, ComponentType.EntityTag)
      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem')
    expect(ruinDrops.length).toBe(1)

    // And no other world's ground-item count changed.
    for (const [key, before] of beforeCounts) {
      expect(countDrops(key)).toBe(before)
    }
  })
})
