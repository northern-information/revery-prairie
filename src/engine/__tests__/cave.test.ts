import { breakWall, updateFacingEntity } from '../interaction'
import { checkTransition, enterCave, exitCave, generateCave } from '../cave'
import { CAVE_HEIGHT, CAVE_WIDTH } from '../constants'
import { ComponentType } from '../ecs'
import { findPath } from '../pathfinding'
import { isWalkableTile } from '../position'
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

  it('snapshots overworld state', () => {
    const state = createTestState()
    const overworldPlayer = { ...state.player }
    createBeeEntity(state, 10, 10)
    enterCave(state)
    expect(state.overworldSnapshot).not.toBeNull()
    expect(state.overworldSnapshot?.player).toEqual(overworldPlayer)
  })

  it('replaces overworld character entities with cave characters', () => {
    const state = createTestState()
    createBeeEntity(state, 10, 10)
    createCharacterTestEntity(state, 'ghost-99', 15, 15, {
      behavior: { type: 'drift', speed: 0.15, freezeOnDialog: true },
    })
    const charsBefore = getCharacterEntities(state)
    expect(charsBefore).toHaveLength(1)
    enterCave(state)
    // Bees are ECS entities and persist across zone transitions
    expect(getBeeEntities(state)).toHaveLength(1)
    // Overworld ghost is gone, Moab is created
    const charsAfter = getCharacterEntities(state)
    expect(charsAfter).toHaveLength(1)
    expect(charsAfter[0].definitionId).toBe('moab')
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
  it('restores overworld state', () => {
    const state = createTestState()
    const overworldMap = state.map
    const overworldWidth = state.mapWidth
    const overworldHeight = state.mapHeight
    createBeeEntity(state, 10, 10)
    enterCave(state)
    exitCave(state)
    expect(state.currentZone).toBe(Zone.Overworld)
    expect(state.map).toBe(overworldMap)
    expect(state.mapWidth).toBe(overworldWidth)
    expect(state.mapHeight).toBe(overworldHeight)
  })

  it('restores overworld character entities (bees persist)', () => {
    const state = createTestState()
    createBeeEntity(state, 10, 10)
    createCharacterTestEntity(state, 'ghost-99', 15, 15, {
      behavior: { type: 'drift', speed: 0.15, freezeOnDialog: true },
    })
    const overworldCharCount = getCharacterEntities(state).length
    enterCave(state)
    exitCave(state)
    // Bees are ECS entities and persist across zone transitions
    expect(getBeeEntities(state)).toHaveLength(1)
    expect(getCharacterEntities(state)).toHaveLength(overworldCharCount)
  })

  it('places player one tile south of cave entrance to avoid re-entry', () => {
    const state = createTestState()
    enterCave(state)
    exitCave(state)
    expect(state.player.x).toBe(state.caveEntranceOverworld.x)
    expect(state.player.y).toBe(state.caveEntranceOverworld.y + 1)
  })

  it('clears the snapshot', () => {
    const state = createTestState()
    enterCave(state)
    exitCave(state)
    expect(state.overworldSnapshot).toBeNull()
  })

  it('does nothing without a snapshot', () => {
    const state = createTestState()
    const playerBefore = { ...state.player }
    exitCave(state)
    expect(state.player).toEqual(playerBefore)
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
