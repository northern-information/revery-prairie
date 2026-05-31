import { ComponentType } from '../ecs/types'
import { pickUpGroundItems } from '../entities'
import { containerHasItem } from '../inventory'
import { createTestState } from './helpers'
import { TileType, Zone } from '../types'
import { clearAroundPlayer, createGroundItemEntity, getGroundItemEntities } from './helpers'
import { describe, expect, it } from 'vitest'

import type { Entity } from '../ecs/types'
import type { GameState, RuinInterior, Tile } from '../types'

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
}

const createGroundItemInZone = (
  state: GameState,
  definitionId: string,
  x: number,
  y: number,
  zone: Zone,
  ruinIndex?: number
): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.ItemDrop, { definitionId })
  state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
  state.world.addComponent(e, ComponentType.EntityZone, ruinIndex !== undefined ? { zone, ruinIndex } : { zone })
  return e
}

const createMeteoriteInZone = (state: GameState, x: number, y: number, zone: Zone, ruinIndex?: number): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.EntityTag, 'meteorite')
  state.world.addComponent(e, ComponentType.EntityZone, ruinIndex !== undefined ? { zone, ruinIndex } : { zone })
  return e
}

// pickup zone filter
//
// Regression coverage for harness/specs/pickup-zone-filter.yaml. The bug:
// scanTagged3x3 used raw state.world.spatial.at, so a ruin-tagged
// aqueductKey at coordinates (x, y) was picked up when the player walked
// over (x, y) in the overworld. Same defect applied to the meteorite
// branch (meteorites are Zone.Overworld-tagged).
describe('pickup zone filter', () => {
  it('does not pick up a ruin-tagged ground item from the overworld', () => {
    const state = createTestState({ viewportWidth: 30, viewportHeight: 30 })
    clearAroundPlayer(state)
    expect(state.currentZone).toBe(Zone.Overworld)

    const entity = createGroundItemInZone(state, 'aqueductKey', state.player.x, state.player.y, Zone.Ruin, 0)

    const result = pickUpGroundItems(state, 5000)

    expect(result.pickedUp).not.toContain('aqueductKey')
    expect(containerHasItem(state.backpack, 'aqueductKey')).toBe(false)
    expect(state.world.getComponent(entity, ComponentType.Position)).toBeDefined()
    const ez = state.world.getComponent(entity, ComponentType.EntityZone)
    expect(ez?.zone).toBe(Zone.Ruin)
    expect(ez?.ruinIndex).toBe(0)
  })

  it('does not pick up an overworld meteorite while inside a ruin', () => {
    const state = createTestState({ viewportWidth: 30, viewportHeight: 30 })
    const interior = makeRuinInterior(0, 30, 25)
    enterRuinWithInterior(state, interior)
    state.player = { x: 10, y: 10 }

    const entity = createMeteoriteInZone(state, state.player.x, state.player.y, Zone.Overworld)

    const result = pickUpGroundItems(state, 5000)

    expect(result.pickedUp).not.toContain('meteorite')
    expect(state.world.getComponent(entity, ComponentType.Position)).toBeDefined()
    const ez = state.world.getComponent(entity, ComponentType.EntityZone)
    expect(ez?.zone).toBe(Zone.Overworld)
  })

  it('does not pick up an item tagged to a different ruin', () => {
    const state = createTestState({ viewportWidth: 30, viewportHeight: 30 })
    const interior = makeRuinInterior(1, 30, 25)
    enterRuinWithInterior(state, interior)
    state.player = { x: 10, y: 10 }

    const entity = createGroundItemInZone(
      state,
      'aqueductKey',
      state.player.x,
      state.player.y,
      Zone.Ruin,
      0 // different ruinIndex than the player's current ruin (1)
    )

    const result = pickUpGroundItems(state, 5000)

    expect(result.pickedUp).not.toContain('aqueductKey')
    expect(containerHasItem(state.backpack, 'aqueductKey')).toBe(false)
    expect(state.world.getComponent(entity, ComponentType.Position)).toBeDefined()
  })

  it('still picks up same-zone ground items normally', () => {
    const state = createTestState({ viewportWidth: 30, viewportHeight: 30 })
    clearAroundPlayer(state)
    createGroundItemEntity(state, 'clover', state.player.x, state.player.y)

    const result = pickUpGroundItems(state, 5000)

    expect(result.pickedUp).toContain('clover')
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
    const cloverDrops = getGroundItemEntities(state).filter(eid => {
      const drop = state.world.getComponent(eid, ComponentType.ItemDrop)
      return drop?.definitionId === 'clover'
    })
    expect(cloverDrops).toHaveLength(0)
  })

  it('still picks up same-ruin ground items when inside the matching ruin', () => {
    const state = createTestState({ viewportWidth: 30, viewportHeight: 30 })
    const interior = makeRuinInterior(0, 30, 25)
    enterRuinWithInterior(state, interior)
    state.player = { x: 10, y: 10 }

    const entity = createGroundItemInZone(state, 'aqueductKey', state.player.x, state.player.y, Zone.Ruin, 0)

    const result = pickUpGroundItems(state, 5000)

    expect(result.pickedUp).toContain('aqueductKey')
    expect(containerHasItem(state.backpack, 'aqueductKey')).toBe(true)
    expect(state.world.getComponent(entity, ComponentType.Position)).toBeUndefined()
  })
})
