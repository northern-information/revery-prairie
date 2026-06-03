// @vitest-environment jsdom

import { ComponentType } from '../ecs/types'
import { tileHasClickable } from '../clickResolution'
import { enterHouse } from '../house'
import { spawnOak, spawnZoneOak } from '../oaks'
import { selectScanTarget } from '../scan'
import { createGameState } from '../state'
import { Zone } from '../types'
import { enterLittleHouseYardFromApron } from '../yard'
import { getWorldForZone, worldKey } from '../zone'
import { clearArea, clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

// Per-zone-worlds regression coverage. Replaces the placeholder file that
// satisfied spec validation during plan drafting. Every case here would
// have caught at least one of the cross-zone leaks documented in
// docs/claude/per-zone-worlds-audit.md if it had existed earlier.

describe('per-zone-worlds — structural', () => {
  it('state.worlds is pre-populated for every non-Ruin Zone enum value', () => {
    const state = createGameState('Test', 20, 20)
    const expected: Zone[] = [
      Zone.Overworld,
      Zone.Cave,
      Zone.HouseInterior,
      Zone.LittleHouseYard,
      Zone.KnotCellar,
      Zone.WhineVillage,
      Zone.WhineHomeYard,
    ]
    for (const zone of expected) {
      expect(state.worlds.get(worldKey(zone))).toBeDefined()
    }
  })

  it('state.world resolves to the active zone world via the getter', () => {
    const state = createGameState('Test', 20, 20)
    // createGameState leaves currentZone as Overworld; useGameEngine's
    // production path then calls enterHouseAtTenureStart. Verify both
    // halves of the getter directly.
    expect(state.world).toBe(state.worlds.get(worldKey(Zone.Overworld)))
    enterHouse(state)
    expect(state.world).toBe(state.worlds.get(worldKey(Zone.HouseInterior)))
  })

  it('each Ruin instance gets its own world keyed by ruin index', () => {
    const state = createGameState('Test', 20, 20)
    const ruin0World = getWorldForZone(state, Zone.Ruin, 0)
    const ruin5World = getWorldForZone(state, Zone.Ruin, 5)
    expect(ruin0World).not.toBe(ruin5World)
    expect(state.worlds.get('ruin:0')).toBe(ruin0World)
    expect(state.worlds.get('ruin:5')).toBe(ruin5World)
  })
})

describe('per-zone-worlds — genesis seeding lands in target worlds', () => {
  it('Moab lives in the Cave world, not the Overworld world', () => {
    const state = createGameState('Test', 20, 20)
    const cave = getWorldForZone(state, Zone.Cave)
    const overworld = getWorldForZone(state, Zone.Overworld)

    const inCave = cave
      .query(ComponentType.CharacterIdentity)
      .some(eid => cave.getComponent(eid, ComponentType.CharacterIdentity)?.definitionId === 'moab')
    const inOverworld = overworld
      .query(ComponentType.CharacterIdentity)
      .some(eid => overworld.getComponent(eid, ComponentType.CharacterIdentity)?.definitionId === 'moab')

    expect(inCave).toBe(true)
    expect(inOverworld).toBe(false)
  })

  it('Emily lives in the HouseInterior world, not the Overworld world', () => {
    const state = createGameState('Test', 20, 20)
    const house = getWorldForZone(state, Zone.HouseInterior)
    const overworld = getWorldForZone(state, Zone.Overworld)

    const inHouse = house
      .query(ComponentType.CharacterIdentity)
      .some(eid => house.getComponent(eid, ComponentType.CharacterIdentity)?.definitionId === 'emily')
    const inOverworld = overworld
      .query(ComponentType.CharacterIdentity)
      .some(eid => overworld.getComponent(eid, ComponentType.CharacterIdentity)?.definitionId === 'emily')

    expect(inHouse).toBe(true)
    expect(inOverworld).toBe(false)
  })

  it('KnotCellar holds the map plus 7 markers; none leak to overworld', () => {
    const state = createGameState('Test', 20, 20)
    const cellar = getWorldForZone(state, Zone.KnotCellar)
    const overworld = getWorldForZone(state, Zone.Overworld)

    const cellarItems = cellar
      .query(ComponentType.EntityTag, ComponentType.ItemDrop)
      .filter(eid => cellar.getComponent(eid, ComponentType.EntityTag) === 'groundItem')
      .map(eid => cellar.getComponent(eid, ComponentType.ItemDrop)?.definitionId)
    const overworldCellarItems = overworld
      .query(ComponentType.EntityTag, ComponentType.ItemDrop)
      .filter(eid => {
        const drop = overworld.getComponent(eid, ComponentType.ItemDrop)
        return drop?.definitionId === 'map' || drop?.definitionId === 'geodeticMarker'
      })

    expect(cellarItems.filter(d => d === 'map')).toHaveLength(1)
    expect(cellarItems.filter(d => d === 'geodeticMarker')).toHaveLength(7)
    expect(overworldCellarItems).toHaveLength(0)
  })

  it('film roll lives in the HouseInterior world, not the Overworld world', () => {
    const state = createGameState('Test', 20, 20)
    const house = getWorldForZone(state, Zone.HouseInterior)
    const overworld = getWorldForZone(state, Zone.Overworld)

    const inHouse = house
      .query(ComponentType.EntityTag, ComponentType.ItemDrop)
      .some(eid => house.getComponent(eid, ComponentType.ItemDrop)?.definitionId === 'filmRoll')
    const inOverworld = overworld
      .query(ComponentType.EntityTag, ComponentType.ItemDrop)
      .some(eid => overworld.getComponent(eid, ComponentType.ItemDrop)?.definitionId === 'filmRoll')

    expect(inHouse).toBe(true)
    expect(inOverworld).toBe(false)
  })
})

describe('per-zone-worlds — cross-zone leaks are structurally impossible', () => {
  it('scan in the little house yard cannot return an overworld oak at the same numeric coord', () => {
    const state = createTestState()
    // Pick yard-bounded coords. The yard map is small (~20x20 in test
    // fixtures); (8, 8) sits inside its playable interior. Place an
    // overworld oak whose 5x5 body covers those coords.
    const ax = 8
    const ay = 8
    clearArea(state, ax, ay, 8)
    spawnOak(state, ax, ay, 0)

    enterLittleHouseYardFromApron(state, { x: state.player.x, y: state.player.y })
    state.player = { x: ax, y: ay }

    // Pre-refactor: scan.ts oakAt iterated state.world without a zone
    // gate; the overworld oak's MultiPosition covered (ax, ay) and the
    // scan returned a target. Post-refactor: the yard world has no
    // OakData entities at all.
    expect(selectScanTarget(state)).toBeNull()

    // Confirm the oak still exists in the overworld world (test setup
    // hasn't accidentally destroyed it).
    const overworld = getWorldForZone(state, Zone.Overworld)
    expect(overworld.query(ComponentType.OakData)).toHaveLength(1)
  })

  it('tileHasClickable in HouseInterior ignores a character entity at the same numeric coord in the Overworld', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)

    // Spawn a character entity at (5, 5) in the overworld via the
    // overworld world directly (test helper would route to current
    // zone). The character has CharacterIdentity + EntityTag 'character'
    // — the tags tileHasClickable checks for.
    const overworld = getWorldForZone(state, Zone.Overworld)
    const eid = overworld.createEntity()
    overworld.addComponent(eid, ComponentType.Position, { x: 5, y: 5 })
    overworld.addComponent(eid, ComponentType.CharacterIdentity, { definitionId: 'test-character' })
    overworld.addComponent(eid, ComponentType.EntityTag, 'character')
    overworld.addComponent(eid, ComponentType.EntityZone, { zone: Zone.Overworld })

    // Switch into the house. tileHasClickable now reads state.world
    // (HouseInterior world), which has no entity at (5, 5).
    enterHouse(state)
    expect(tileHasClickable(state, { x: 5, y: 5 })).toBe(false)

    // Sanity check the inverse: back in the overworld, the character IS
    // clickable. Done via direct state mutation rather than a transition
    // helper to keep the test focused on the leak invariant.
    state.currentZone = Zone.Overworld
    state.map = state.overworldMap
    state.mapWidth = state.overworldMapWidth
    state.mapHeight = state.overworldMapHeight
    expect(tileHasClickable(state, { x: 5, y: 5 })).toBe(true)
  })

  it('Whine village oaks are still scannable when the player is in the WhineVillage zone', () => {
    const state = createTestState()
    // Spawn an oak directly into the WhineVillage world via spawnZoneOak.
    const ax = 10
    const ay = 10
    spawnZoneOak(state, ax, ay, 0, Zone.WhineVillage, 'per-zone-worlds-test')

    state.currentZone = Zone.WhineVillage
    state.player = { x: ax, y: ay }

    const target = selectScanTarget(state)
    expect(target?.kind).toBe('oak')
    if (target?.kind === 'oak') {
      expect(target.position).toEqual({ x: ax, y: ay })
    }
  })

  it('an entity in ruin 0 is invisible to queries against ruin 1', () => {
    const state = createTestState()
    const ruin0 = getWorldForZone(state, Zone.Ruin, 0)
    const ruin1 = getWorldForZone(state, Zone.Ruin, 1)

    const eid = ruin0.createEntity()
    ruin0.addComponent(eid, ComponentType.Position, { x: 10, y: 10 })
    ruin0.addComponent(eid, ComponentType.EntityTag, 'groundItem')
    ruin0.addComponent(eid, ComponentType.ItemDrop, { definitionId: 'coin' })

    expect(ruin0.spatial.at(10, 10)).toContain(eid)
    expect(ruin1.spatial.at(10, 10)).toHaveLength(0)
    expect(ruin1.query(ComponentType.EntityTag)).toHaveLength(0)
  })
})
