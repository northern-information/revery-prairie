import { breakWall, updateFacingEntity } from '../interaction'
import { checkTransition, enterCave, exitCave, generateCave } from '../cave'
import { CAVE_HEIGHT, CAVE_WIDTH } from '../constants'
import { ComponentType } from '../ecs/types'
import { getBlockedPositions } from '../movement'
import { findPath } from '../pathfinding'
import { isWalkableTile } from '../position'
import { createGameState } from '../state'
import { TileType, Zone } from '../types'
import { createBeeEntity, createCharacterTestEntity, createTestState, getBeeEntities, getCharacterEntities } from './helpers'
import { describe, expect, it } from 'vitest'

describe('generateCave', () => {
  it('generates a map with correct dimensions', () => {
    const { map } = generateCave(CAVE_WIDTH, CAVE_HEIGHT)
    expect(map.length).toBe(CAVE_HEIGHT)
    expect(map[0].length).toBe(CAVE_WIDTH)
  })

  it('has a CaveEntrance tile at the entrance position', () => {
    const { map, entrance } = generateCave(CAVE_WIDTH, CAVE_HEIGHT)
    expect(map[entrance.y][entrance.x].type).toBe(TileType.CaveEntrance)
  })

  it('contains at least one CaveBreakableWall tile', () => {
    const { map } = generateCave(CAVE_WIDTH, CAVE_HEIGHT)
    let found = false
    for (const row of map) {
      for (const tile of row) {
        if (tile.type === TileType.CaveBreakableWall) {
          found = true
          break
        }
      }
      if (found) break
    }
    expect(found).toBe(true)
  })

  it('has CaveFloor tiles forming a walkable passage', () => {
    const { map } = generateCave(CAVE_WIDTH, CAVE_HEIGHT)
    let floorCount = 0
    for (const row of map) {
      for (const tile of row) {
        if (tile.type === TileType.CaveFloor) floorCount++
      }
    }
    expect(floorCount).toBeGreaterThan(10)
  })

  it('has a walkable path from entrance to the main passage', () => {
    const { map, entrance } = generateCave(CAVE_WIDTH, CAVE_HEIGHT)
    // Find a floor tile in the main passage area (between entrance and breakable wall)
    // Scan from entrance upward, skip immediately adjacent tiles
    let target = null
    for (let y = entrance.y - 5; y >= 0; y--) {
      for (let x = 0; x < CAVE_WIDTH; x++) {
        if (map[y][x].type === TileType.CaveFloor) {
          target = { x, y }
          break
        }
      }
      if (target) break
    }
    expect(target).not.toBeNull()
    // Path from the landing area (one tile above entrance) to the distant floor
    const start = { x: entrance.x, y: entrance.y - 1 }
    expect(map[start.y][start.x].type).toBe(TileType.CaveFloor)
    if (!target) throw new Error('no target found')
    const path = findPath(map, CAVE_WIDTH, CAVE_HEIGHT, start, target)
    expect(path).not.toBeNull()
  })

  it('breakable wall blocks pathfinding to hidden chamber', () => {
    const { map, npcSpot, entrance } = generateCave(CAVE_WIDTH, CAVE_HEIGHT)
    const startAbove = { x: entrance.x, y: entrance.y - 1 }
    const path = findPath(map, CAVE_WIDTH, CAVE_HEIGHT, startAbove, npcSpot)
    expect(path).toBeNull()
  })

  it('produces different layouts with different rng seeds', () => {
    const rng1 = (() => {
      let s = 42
      return () => {
        s = (s * 16807) % 2147483647
        return s / 2147483647
      }
    })()
    const rng2 = (() => {
      let s = 999
      return () => {
        s = (s * 16807) % 2147483647
        return s / 2147483647
      }
    })()

    const cave1 = generateCave(CAVE_WIDTH, CAVE_HEIGHT, rng1)
    const cave2 = generateCave(CAVE_WIDTH, CAVE_HEIGHT, rng2)

    // At least some tiles should differ
    let diffs = 0
    for (let y = 0; y < CAVE_HEIGHT; y++) {
      for (let x = 0; x < CAVE_WIDTH; x++) {
        if (cave1.map[y][x].type !== cave2.map[y][x].type) diffs++
      }
    }
    expect(diffs).toBeGreaterThan(0)
  })

  it('returns non-empty hiddenChamberPositions', () => {
    const { hiddenChamberPositions } = generateCave(CAVE_WIDTH, CAVE_HEIGHT)
    expect(hiddenChamberPositions.length).toBeGreaterThan(0)
  })

  it('returns non-empty breakableWallPositions', () => {
    const { breakableWallPositions } = generateCave(CAVE_WIDTH, CAVE_HEIGHT)
    expect(breakableWallPositions.length).toBeGreaterThan(0)
  })

  it('hidden chamber positions are all CaveFloor tiles', () => {
    const { map, hiddenChamberPositions } = generateCave(CAVE_WIDTH, CAVE_HEIGHT)
    for (const pos of hiddenChamberPositions) {
      expect(map[pos.y][pos.x].type).toBe(TileType.CaveFloor)
    }
  })

  it('breakable wall positions are all CaveBreakableWall tiles', () => {
    const { map, breakableWallPositions } = generateCave(CAVE_WIDTH, CAVE_HEIGHT)
    for (const pos of breakableWallPositions) {
      expect(map[pos.y][pos.x].type).toBe(TileType.CaveBreakableWall)
    }
  })
})

describe('isWalkableTile', () => {
  it('returns true for walkable tiles', () => {
    expect(isWalkableTile(TileType.Dirt)).toBe(true)
    expect(isWalkableTile(TileType.Clover)).toBe(true)
    expect(isWalkableTile(TileType.Sand)).toBe(true)
    expect(isWalkableTile(TileType.CaveFloor)).toBe(true)
    expect(isWalkableTile(TileType.CaveEntrance)).toBe(true)
  })

  it('returns false for non-walkable tiles', () => {
    expect(isWalkableTile(TileType.Space)).toBe(false)
    expect(isWalkableTile(TileType.CaveWall)).toBe(false)
    expect(isWalkableTile(TileType.CaveBreakableWall)).toBe(false)
  })
})

describe('enterCave', () => {
  it('swaps to cave map and sets zone to cave', () => {
    const state = createTestState()
    const overworldMap = state.map
    enterCave(state)
    expect(state.currentZone).toBe(Zone.Cave)
    expect(state.map).toBe(state.caveMap)
    expect(state.mapWidth).toBe(state.caveMapWidth)
    expect(state.mapHeight).toBe(state.caveMapHeight)
    expect(state.map).not.toBe(overworldMap)
  })

  it('preserves all entities across zone transition', () => {
    const state = createTestState()
    createBeeEntity(state, 10, 10)
    createCharacterTestEntity(state, 'ghost-99', 15, 15, {
      behavior: { type: 'drift', speed: 0.15, freezeOnDialog: true },
    })
    const beesBefore = getBeeEntities(state).length
    const charsBefore = getCharacterEntities(state).length
    enterCave(state)
    // All entities persist — no snapshot/destroy
    expect(getBeeEntities(state)).toHaveLength(beesBefore)
    expect(getCharacterEntities(state)).toHaveLength(charsBefore)
  })

  it('places player adjacent to cave entrance interior, not on it', () => {
    const state = createTestState()
    enterCave(state)
    expect(state.player.x).toBe(state.caveEntranceInterior.x)
    expect(state.player.y).toBe(state.caveEntranceInterior.y - 1)
  })

  it('clears navigation state', () => {
    const state = createTestState()
    state.path = [{ x: 1, y: 1 }]
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    state.pendingAction = () => {}
    enterCave(state)
    expect(state.path).toBeNull()
    expect(state.pendingAction).toBeNull()
    expect(state.previewFn).toBeNull()
  })
})

describe('exitCave', () => {
  it('restores overworld map', () => {
    const state = createTestState()
    enterCave(state)
    exitCave(state)
    expect(state.currentZone).toBe(Zone.Overworld)
    expect(state.map).toBe(state.overworldMap)
    expect(state.mapWidth).toBe(state.overworldMapWidth)
    expect(state.mapHeight).toBe(state.overworldMapHeight)
  })

  it('preserves all entities across round-trip', () => {
    const state = createTestState()
    createBeeEntity(state, 10, 10)
    createCharacterTestEntity(state, 'ghost-99', 15, 15, {
      behavior: { type: 'drift', speed: 0.15, freezeOnDialog: true },
    })
    const beesBefore = getBeeEntities(state).length
    const charsBefore = getCharacterEntities(state).length
    enterCave(state)
    exitCave(state)
    expect(getBeeEntities(state)).toHaveLength(beesBefore)
    expect(getCharacterEntities(state)).toHaveLength(charsBefore)
  })

  it('places player one tile south of cave entrance to avoid re-entry', () => {
    const state = createTestState()
    enterCave(state)
    exitCave(state)
    expect(state.player.x).toBe(state.caveEntranceOverworld.x)
    expect(state.player.y).toBe(state.caveEntranceOverworld.y + 1)
  })

  it('is a no-op when already on overworld', () => {
    const state = createTestState()
    exitCave(state)
    // exitCave still runs (swaps map to overworld, which is already active)
    // but player gets repositioned to cave entrance south
    expect(state.currentZone).toBe(Zone.Overworld)
  })
})

describe('checkTransition', () => {
  it('enters cave when standing on overworld CaveEntrance', () => {
    const state = createTestState()
    state.player = { ...state.caveEntranceOverworld }
    state.map[state.player.y][state.player.x] = { type: TileType.CaveEntrance }
    const result = checkTransition(state)
    expect(result).toBe(true)
    expect(state.currentZone).toBe(Zone.Cave)
  })

  it('exits cave when standing on cave CaveEntrance', () => {
    const state = createTestState()
    enterCave(state)
    state.player = { ...state.caveEntranceInterior }
    const result = checkTransition(state)
    expect(result).toBe(true)
    expect(state.currentZone).toBe(Zone.Overworld)
  })

  it('returns false when not on a CaveEntrance tile', () => {
    const state = createTestState()
    state.map[state.player.y][state.player.x] = { type: TileType.Dirt }
    const result = checkTransition(state)
    expect(result).toBe(false)
    expect(state.currentZone).toBe(Zone.Overworld)
  })
})

describe('breakWall', () => {
  it('converts breakable wall tiles to CaveFloor', () => {
    const state = createTestState()
    enterCave(state)
    const wallPos = state.caveBreakableWallPositions[0]
    state.player = { x: wallPos.x, y: wallPos.y + 1 }
    state.playerFacing = 'up'
    state.map[state.player.y][state.player.x] = { type: TileType.CaveFloor }

    const result = breakWall(state, 1000)
    expect(result).toBe(true)

    for (const pos of state.caveBreakableWallPositions) {
      expect(state.map[pos.y][pos.x].type).toBe(TileType.CaveFloor)
    }
  })

  it('sets caveRevealed to true', () => {
    const state = createTestState()
    enterCave(state)
    const wallPos = state.caveBreakableWallPositions[0]
    state.player = { x: wallPos.x, y: wallPos.y + 1 }
    state.playerFacing = 'up'
    state.map[state.player.y][state.player.x] = { type: TileType.CaveFloor }

    expect(state.caveRevealed).toBe(false)
    breakWall(state, 1000)
    expect(state.caveRevealed).toBe(true)
  })

  it('creates a crumble effect', () => {
    const state = createTestState()
    enterCave(state)
    const wallPos = state.caveBreakableWallPositions[0]
    state.player = { x: wallPos.x, y: wallPos.y + 1 }
    state.playerFacing = 'up'
    state.map[state.player.y][state.player.x] = { type: TileType.CaveFloor }

    breakWall(state, 1000)
    const crumbles = state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)
      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'crumble')
    expect(crumbles).toHaveLength(1)
    const effect = state.world.getComponent(crumbles[0], ComponentType.TimedEffect)
    const multiPos = state.world.getComponent(crumbles[0], ComponentType.MultiPosition)
    expect(effect?.startTime).toBe(1000)
    expect(multiPos?.positions.length).toBe(state.caveBreakableWallPositions.length)
  })

  it('returns false when already revealed', () => {
    const state = createTestState()
    enterCave(state)
    state.caveRevealed = true
    expect(breakWall(state, 1000)).toBe(false)
  })

  it('returns false when not in cave zone', () => {
    const state = createTestState()
    expect(breakWall(state, 1000)).toBe(false)
  })

  it('returns false when not facing a breakable wall', () => {
    const state = createTestState()
    enterCave(state)
    state.playerFacing = 'down'
    expect(breakWall(state, 1000)).toBe(false)
  })
})

describe('breakable wall interactable', () => {
  it('highlights breakable wall as facing entity in cave', () => {
    const state = createTestState()
    enterCave(state)
    const wallPos = state.caveBreakableWallPositions[0]
    state.player = { x: wallPos.x, y: wallPos.y + 1 }
    state.playerFacing = 'up'
    state.map[state.player.y][state.player.x] = { type: TileType.CaveFloor }

    updateFacingEntity(state)
    expect(state.facingEntityPos).toEqual({ x: wallPos.x, y: wallPos.y })
  })

  it('does not highlight breakable wall after revealed', () => {
    const state = createTestState()
    enterCave(state)
    state.caveRevealed = true
    const wallPos = state.caveBreakableWallPositions[0]
    state.player = { x: wallPos.x, y: wallPos.y + 1 }
    state.playerFacing = 'up'
    state.map[state.player.y][state.player.x] = { type: TileType.CaveFloor }
    // Breakable walls are already converted to floor after reveal in real flow,
    // but even if the tile type somehow persisted, revealed=true should skip
    updateFacingEntity(state)
    expect(state.facingEntityPos).toBeNull()
  })
})

describe('persistent dual-zone', () => {
  it('overworld entities are zone-tagged', () => {
    const state = createTestState()
    createBeeEntity(state, 10, 10)
    const bees = getBeeEntities(state)
    expect(bees).toHaveLength(1)
    const zone = state.world.getComponent(bees[0], ComponentType.EntityZone)
    expect(zone?.zone).toBe(Zone.Overworld)
  })

  it('overworld meteorites do not appear in cave queries filtered by zone', () => {
    const state = createTestState()
    // Create meteorite in overworld
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.Position, { x: 5, y: 5 })
    state.world.addComponent(eid, ComponentType.EntityTag, 'meteorite')
    state.world.addComponent(eid, ComponentType.EntityZone, { zone: Zone.Overworld })

    enterCave(state)

    // Query meteorites filtered by current zone (cave) — should find none
    const caveMeteorites = state.world.query(ComponentType.EntityTag)
      .filter(e => state.world.getComponent(e, ComponentType.EntityTag) === 'meteorite')
      .filter(e => state.world.getComponent(e, ComponentType.EntityZone)?.zone === state.currentZone)
    expect(caveMeteorites).toHaveLength(0)
  })

  it('overworld blockers do not affect cave movement', () => {
    const state = createTestState()
    // Create a blocking entity in overworld at coords that overlap with cave
    createCharacterTestEntity(state, 'ghost-99', 5, 5, {
      behavior: { type: 'drift', speed: 0.15, freezeOnDialog: true },
    })
    enterCave(state)

    // getBlockedPositions in cave should not include the overworld ghost
    const blocked = getBlockedPositions(state)
    expect(blocked.has('5,5')).toBe(false)
  })

  it('Moab exists as a cave-zone entity from game init', () => {
    const state = createGameState('Test', 20, 20)
    const moab = getCharacterEntities(state).find(c => c.definitionId === 'moab')
    expect(moab).toBeDefined()
    const moabEid = state.world.query(ComponentType.CharacterIdentity)
      .find(eid => state.world.getComponent(eid, ComponentType.CharacterIdentity)?.definitionId === 'moab')
    expect(moabEid).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const zone = state.world.getComponent(moabEid!, ComponentType.EntityZone)
    expect(zone?.zone).toBe(Zone.Cave)
  })
})
