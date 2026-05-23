import {
  SATELLITE_CRATER_DEPTH_CENTER,
  SATELLITE_CRATER_DEPTH_EDGE,
  SATELLITE_CRATER_DEPTH_RING,
  SATELLITE_IMPACT_RADIUS,
  SATELLITE_MAX_AGE,
  SATELLITE_MIN_SPAWN_INTERVAL_MS,
  SATELLITE_SOIL_DAMAGE,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { getTileEffects } from '../effects'
import { tickCharacterBehaviors } from '../entities'
import { posKey } from '../position'
import { findRecipe } from '../recipes'
import { getTierGrid } from '../render/tierGrid'
import { spawnSatellite, tickSatellites } from '../satellites'
import { createGameState } from '../state'
import { getCraterBgColor, getTileBgColor } from '../tileBg'
import { TileType, Zone } from '../types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Entity } from '../ecs/types'
import type { GameState, Position } from '../types'

const DRIFT_BEHAVIOR = { type: 'drift' as const, moveChance: 0.15, freezeOnDialog: true }

const clearArea = (state: GameState, cx: number, cy: number, radius: number) => {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x >= 0 && x < state.mapWidth && y >= 0 && y < state.mapHeight) {
        state.map[y][x] = { type: TileType.Dirt }
        // Also clear any pond/river the genesis terrain seeded here. The
        // rotated cardinal frame (precis-30) reshapes lowland water placement
        // on small test maps; clear explicitly so the tests stay deterministic.
        const k = posKey(x, y)
        state.ponds.delete(k)
        state.rivers.delete(k)
      }
    }
  }
}

const makeState = (): GameState => {
  const state = createGameState('test', 40, 30)
  // Convert all land tiles to plain Dirt so probabilistic spawn targets
  // (mocked Math.random landing positions) always hit valid terrain.
  for (let y = 0; y < state.mapHeight; y++) {
    for (let x = 0; x < state.mapWidth; x++) {
      const t = state.map[y][x].type
      if (t === TileType.Dirt || t === TileType.Flora || t === TileType.BurntFlora || t === TileType.Sand) {
        state.map[y][x] = { type: TileType.Dirt }
      }
    }
  }
  // Reset shooting stars and meteorites seeded by createGameState
  for (const eid of state.world.query(ComponentType.ShootingStarData)) {
    state.world.destroyEntity(eid)
  }
  state.meteorShower.active = false
  return state
}

const createSatelliteEntity = (
  state: GameState,
  overrides: Partial<{
    pos: Position
    dx: number
    dy: number
    length: number
    age: number
    landingTarget: Position
    payloadType: 'destructive' | 'seeds'
  }> = {}
): Entity => {
  const target = overrides.landingTarget ?? { x: 20, y: 15 }
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, overrides.pos ?? { x: 10, y: 5 })
  state.world.addComponent(e, ComponentType.Velocity, {
    dx: overrides.dx ?? 1,
    dy: overrides.dy ?? 1,
  })
  state.world.addComponent(e, ComponentType.SatelliteData, {
    length: overrides.length ?? 10,
    age: overrides.age ?? 0,
    landingTarget: target,
    payloadType: overrides.payloadType ?? 'destructive',
  })
  state.world.addComponent(e, ComponentType.EntityTag, 'satellite')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
  return e
}

const getSatelliteCount = (state: GameState): number => state.world.query(ComponentType.SatelliteData).length

const createGhostAt = (state: GameState, x: number, y: number): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.CharacterIdentity, { definitionId: 'ghost-test' })
  state.world.addComponent(e, ComponentType.Blocking, { blockMovement: true })
  state.world.addComponent(e, ComponentType.Behavior, DRIFT_BEHAVIOR)
  state.world.addComponent(e, ComponentType.EntityTag, 'character')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
  return e
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('satellite spawning', () => {
  it('spawns a satellite when conditions are met', () => {
    const state = makeState()
    state.lastSatelliteSpawnTime = 0

    vi.spyOn(Math, 'random').mockReturnValue(0.1) // below SATELLITE_SPAWN_CHANCE

    spawnSatellite(state, SATELLITE_MIN_SPAWN_INTERVAL_MS + 1)
    expect(getSatelliteCount(state)).toBe(1)
  })

  it('does not spawn when one is already active', () => {
    const state = makeState()
    createSatelliteEntity(state)

    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    spawnSatellite(state, SATELLITE_MIN_SPAWN_INTERVAL_MS + 1)
    expect(getSatelliteCount(state)).toBe(1) // still just the one we created
  })

  it('does not spawn before minimum interval', () => {
    const state = makeState()
    state.lastSatelliteSpawnTime = 100

    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    spawnSatellite(state, 100 + SATELLITE_MIN_SPAWN_INTERVAL_MS - 1)
    expect(getSatelliteCount(state)).toBe(0)
  })

  it('does not spawn when probability gate fails', () => {
    const state = makeState()
    state.lastSatelliteSpawnTime = 0

    vi.spyOn(Math, 'random').mockReturnValue(0.99) // above SATELLITE_SPAWN_CHANCE
    spawnSatellite(state, SATELLITE_MIN_SPAWN_INTERVAL_MS + 1)
    expect(getSatelliteCount(state)).toBe(0)
  })

  it('is suppressed during deep time', () => {
    const state = makeState()
    state.lastSatelliteSpawnTime = 0
    state.deepTime = {
      active: true,
      phase: 'burning' as never,
      startTime: 0,
      phaseStartTime: 0,
      playerGlyph: 'ö',
      playerGlyphColor: '#FFFFFF',
    } as never

    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    spawnSatellite(state, SATELLITE_MIN_SPAWN_INTERVAL_MS + 1)
    expect(getSatelliteCount(state)).toBe(0)
  })

  it('is suppressed during meteor shower', () => {
    const state = makeState()
    state.lastSatelliteSpawnTime = 0
    state.meteorShower.active = true

    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    spawnSatellite(state, SATELLITE_MIN_SPAWN_INTERVAL_MS + 1)
    expect(getSatelliteCount(state)).toBe(0)
  })

  it('is suppressed in cave zone', () => {
    const state = makeState()
    state.lastSatelliteSpawnTime = 0
    state.currentZone = Zone.Cave

    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    spawnSatellite(state, SATELLITE_MIN_SPAWN_INTERVAL_MS + 1)
    expect(getSatelliteCount(state)).toBe(0)
  })
})

describe('satellite movement', () => {
  it('advances position by velocity each tick', () => {
    const state = makeState()
    const eid = createSatelliteEntity(state, { pos: { x: 10, y: 10 }, dx: 1, dy: 1 })

    tickSatellites(state, 1000)

    const pos = state.world.getComponent(eid, ComponentType.Position)
    expect(pos?.x).toBe(11)
    expect(pos?.y).toBe(11)
  })

  it('increments age each tick', () => {
    const state = makeState()
    const eid = createSatelliteEntity(state, { pos: { x: 5, y: 5 } })

    tickSatellites(state, 1000)

    const data = state.world.getComponent(eid, ComponentType.SatelliteData)
    expect(data?.age).toBe(1)
  })

  it('destroys satellite when max age exceeded', () => {
    const state = makeState()
    createSatelliteEntity(state, { pos: { x: 5, y: 5 }, age: SATELLITE_MAX_AGE + 1 })

    tickSatellites(state, 1000)
    expect(getSatelliteCount(state)).toBe(0)
  })

  it('destroys satellite when off-map', () => {
    const state = makeState()
    createSatelliteEntity(state, {
      pos: { x: state.mapWidth + 20, y: 5 },
      dx: 1,
      dy: 0,
    })

    tickSatellites(state, 1000)
    expect(getSatelliteCount(state)).toBe(0)
  })
})

describe('satellite impact', () => {
  it('marks tiles in 5x5 zone as craters on landing (tile type unchanged)', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    // Place satellite at the target so it lands immediately
    createSatelliteEntity(state, {
      pos: target,
      landingTarget: target,
    })

    tickSatellites(state, 1000)

    // Check tiles in the 5x5 zone are in state.craters and still Dirt
    const r = SATELLITE_IMPACT_RADIUS
    let craterCount = 0
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = target.x + dx
        const ty = target.y + dy
        if (state.craters.has(posKey(tx, ty))) craterCount++
      }
    }
    expect(craterCount).toBeGreaterThan(0)
    expect(state.craters.has(posKey(target.x, target.y))).toBe(true)
    expect(state.map[target.y][target.x].type).toBe(TileType.Dirt)
  })

  it('reduces soil health in impact zone', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    // Set soil health to known value
    const key = posKey(target.x, target.y)
    state.soilHealth.set(key, 80)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    const health = state.soilHealth.get(key)
    expect(health).toBe(80 - SATELLITE_SOIL_DAMAGE)
  })

  it('clamps soil health to minimum 0', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    const key = posKey(target.x, target.y)
    state.soilHealth.set(key, 10)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    expect(state.soilHealth.get(key)).toBe(0)
  })

  it('does not convert protected tiles (space, sand, cave entrance)', () => {
    const state = makeState()
    const tx = 20
    const ty = 15
    clearArea(state, tx, ty, 5)

    // Place some protected tiles in the zone
    state.map[ty - 1][tx] = { type: TileType.Sand }
    state.map[ty + 1][tx] = { type: TileType.CaveEntrance }

    createSatelliteEntity(state, {
      pos: { x: tx, y: ty },
      landingTarget: { x: tx, y: ty },
    })
    tickSatellites(state, 1000)

    expect(state.map[ty - 1][tx].type).toBe(TileType.Sand)
    expect(state.map[ty + 1][tx].type).toBe(TileType.CaveEntrance)
  })

  it('marks clover tiles as craters without changing their tile type', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)
    state.map[target.y][target.x + 1] = { type: TileType.Flora }

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    expect(state.map[target.y][target.x + 1].type).toBe(TileType.Flora)
    expect(state.craters.has(posKey(target.x + 1, target.y))).toBe(true)
  })

  it('spawns satellite impact timed effect', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    const impacts = state.world
      .query(ComponentType.TimedEffect, ComponentType.EntityTag)
      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'satelliteImpact')
    expect(impacts).toHaveLength(1)
  })

  it('records satellite-impact discovery', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    expect(state.manualDiscoveries.has('event:satellite-impact')).toBe(true)
  })

  it('handles impact zone partially off-map', () => {
    const state = makeState()
    // Place target near top-left edge
    const target = { x: 1, y: 1 }
    clearArea(state, target.x, target.y, 3)

    createSatelliteEntity(state, { pos: target, landingTarget: target })

    // Should not throw
    expect(() => {
      tickSatellites(state, 1000)
    }).not.toThrow()
    expect(state.craters.has(posKey(target.x, target.y))).toBe(true)
    expect(state.map[target.y][target.x].type).toBe(TileType.Dirt)
  })
})

describe('satellite ghost interaction', () => {
  it('destroys ghosts within impact zone', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    // Place a ghost in the impact zone
    const ghostEid = createGhostAt(state, target.x + 1, target.y)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    expect(state.world.isAlive(ghostEid)).toBe(false)
  })

  it('does not destroy ghosts outside impact zone', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 10)

    // Place a ghost well outside the 5x5 zone
    const ghostEid = createGhostAt(state, target.x + 10, target.y)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    expect(state.world.isAlive(ghostEid)).toBe(true)
  })

  it('destroys multiple ghosts in zone', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    const ghost1 = createGhostAt(state, target.x, target.y + 1)
    const ghost2 = createGhostAt(state, target.x - 1, target.y)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    expect(state.world.isAlive(ghost1)).toBe(false)
    expect(state.world.isAlive(ghost2)).toBe(false)
  })
})

describe('ghost crater avoidance', () => {
  it('ghosts do not move onto crater tiles', () => {
    const state = makeState()
    const gx = 20
    const gy = 15
    clearArea(state, gx, gy, 5)

    // Surround the ghost position with craters on all sides except one
    for (const d of [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      // leave (1, 1) as uncratered dirt — the only escape
    ]) {
      state.craters.add(posKey(gx + d.x, gy + d.y))
    }

    // Create ghost at gx, gy with 100% move chance
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: gx, y: gy })
    state.world.addComponent(e, ComponentType.CharacterIdentity, { definitionId: 'ghost-avoidance' })
    state.world.addComponent(e, ComponentType.Blocking, { blockMovement: true })
    state.world.addComponent(e, ComponentType.Behavior, {
      type: 'drift' as const,
      moveChance: 1.0,
      freezeOnDialog: false,
    })
    state.world.addComponent(e, ComponentType.EntityTag, 'character')
    state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })

    // Mock random to always pick first candidate
    vi.spyOn(Math, 'random').mockReturnValue(0)

    tickCharacterBehaviors(state, Zone.Overworld)

    const pos = state.world.getComponent(e, ComponentType.Position)
    expect(pos).toBeTruthy()
    // Should have moved to the only non-crater neighbor (1,1) = (gx+1, gy+1)
    expect(pos?.x).toBe(gx + 1)
    expect(pos?.y).toBe(gy + 1)
  })
})

describe('satellite payload', () => {
  // Seed items were deleted in precis #1 — the good-payload satellite
  // scatter is a no-op until precis #11 rehydrates them.
  it('scatters no ground items for good payload after seed deletion', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    // Clear any existing ground items
    for (const eid of state.world.query(ComponentType.EntityTag)) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem') {
        state.world.destroyEntity(eid)
      }
    }

    createSatelliteEntity(state, {
      pos: { x: target.x, y: target.y },
      landingTarget: { x: target.x, y: target.y },
      payloadType: 'seeds',
    })
    tickSatellites(state, 1000)

    const groundItems = state.world
      .query(ComponentType.EntityTag, ComponentType.ItemDrop)
      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem')

    expect(groundItems.length).toBe(0)
  })

  it('does not scatter seeds for destructive payload', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    // Clear all existing ground items first
    for (const eid of state.world.query(ComponentType.EntityTag)) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem') {
        state.world.destroyEntity(eid)
      }
    }

    createSatelliteEntity(state, {
      pos: target,
      landingTarget: target,
      payloadType: 'destructive',
    })
    tickSatellites(state, 1000)

    const groundItems = state.world
      .query(ComponentType.EntityTag, ComponentType.ItemDrop)
      .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem')
    expect(groundItems.length).toBe(0)
  })
})

describe('crater effect semantics', () => {
  it('cratered tiles are still walkable dirt', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    expect(state.map[target.y][target.x].type).toBe(TileType.Dirt)
    expect(state.craters.has(posKey(target.x, target.y))).toBe(true)
  })

  it('hovering a cratered tile surfaces "crater" via getTileEffects', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    const effects = getTileEffects(state, target.x, target.y)
    expect(effects).toContain('crater')
  })

  it('soil health on a cratered dirt tile remains readable via map key', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)

    const key = posKey(target.x, target.y)
    state.soilHealth.set(key, 80)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    // Tile type is still Dirt and soil value is damaged
    expect(state.map[target.y][target.x].type).toBe(TileType.Dirt)
    expect(state.soilHealth.get(key)).toBe(80 - SATELLITE_SOIL_DAMAGE)
  })

  it('planting clover on a cratered tile preserves the crater entry', () => {
    const state = makeState()
    const target = { x: 20, y: 15 }
    clearArea(state, target.x, target.y, 5)
    // Move player to the impact center so the prairie combine runs there
    state.player.x = target.x
    state.player.y = target.y

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    const key = posKey(target.x, target.y)
    expect(state.craters.has(key)).toBe(true)

    const recipe = findRecipe('bee', 'clover')
    expect(recipe).not.toBeNull()
    if (!recipe) return
    const ok = recipe.execute(state)
    expect(ok).toBe(true)

    // Tile becomes Clover; crater entry persists beneath it
    expect(state.map[target.y][target.x].type).toBe(TileType.Flora)
    expect(state.craters.has(key)).toBe(true)
  })
})

describe('satellite impact elevation deformation', () => {
  it('drops elevation in a radial bowl: center deepest, edges shallowest', () => {
    const state = makeState()
    const target: Position = { x: 20, y: 15 }
    const r = SATELLITE_IMPACT_RADIUS

    // Seed a flat plateau across the impact zone so falloff is observable.
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        state.elevation.set(posKey(target.x + dx, target.y + dy), 80)
      }
    }

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    const elevAt = (x: number, y: number) => state.elevation.get(posKey(x, y))
    expect(elevAt(target.x, target.y)).toBe(80 - SATELLITE_CRATER_DEPTH_CENTER)
    expect(elevAt(target.x + 1, target.y)).toBe(80 - SATELLITE_CRATER_DEPTH_RING)
    expect(elevAt(target.x, target.y + 1)).toBe(80 - SATELLITE_CRATER_DEPTH_RING)
    expect(elevAt(target.x + 1, target.y + 1)).toBe(80 - SATELLITE_CRATER_DEPTH_RING)
    expect(elevAt(target.x + 2, target.y)).toBe(80 - SATELLITE_CRATER_DEPTH_EDGE)
    expect(elevAt(target.x - 2, target.y - 2)).toBe(80 - SATELLITE_CRATER_DEPTH_EDGE)
  })

  it('clamps elevation to 0 when drop would go negative', () => {
    const state = makeState()
    const target: Position = { x: 20, y: 15 }
    state.elevation.set(posKey(target.x, target.y), 5)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    expect(state.elevation.get(posKey(target.x, target.y))).toBe(0)
  })

  it('treats missing elevation entries as default 50', () => {
    const state = makeState()
    const target: Position = { x: 20, y: 15 }
    state.elevation.delete(posKey(target.x, target.y))

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    expect(state.elevation.get(posKey(target.x, target.y))).toBe(50 - SATELLITE_CRATER_DEPTH_CENTER)
  })

  it('stacks additively when impacts overlap on the same tile', () => {
    const state = makeState()
    const target: Position = { x: 20, y: 15 }
    state.elevation.set(posKey(target.x, target.y), 90)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)
    expect(state.elevation.get(posKey(target.x, target.y))).toBe(90 - SATELLITE_CRATER_DEPTH_CENTER)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 2000)
    expect(state.elevation.get(posKey(target.x, target.y))).toBe(90 - SATELLITE_CRATER_DEPTH_CENTER * 2)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 3000)
    // 90 - 75 = 15
    expect(state.elevation.get(posKey(target.x, target.y))).toBe(15)

    // Fourth impact would drop to -10; clamps to 0
    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 4000)
    expect(state.elevation.get(posKey(target.x, target.y))).toBe(0)
  })

  it('does not modify elevation on protected tiles (sand, cave entrance, walls)', () => {
    const state = makeState()
    const target: Position = { x: 20, y: 15 }

    // Place a protected tile inside the zone and seed its elevation
    const protectedX = target.x + 1
    const protectedY = target.y
    state.map[protectedY][protectedX] = { type: TileType.Sand }
    const before = 60
    state.elevation.set(posKey(protectedX, protectedY), before)

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    expect(state.elevation.get(posKey(protectedX, protectedY))).toBe(before)
  })

  it('invalidates the tier grid cache so the next read sees deformed elevation', () => {
    const state = makeState()
    const target: Position = { x: 20, y: 15 }
    state.elevation.set(posKey(target.x, target.y), 80)

    // Prime the cache
    const before = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
    const idx = target.x + target.y * state.mapWidth
    const tierBefore = before[idx]

    createSatelliteEntity(state, { pos: target, landingTarget: target })
    tickSatellites(state, 1000)

    // After deformation, grid must reflect the new elevation
    const after = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
    expect(after[idx]).toBeLessThan(tierBefore)
  })
})

describe('crater bg color', () => {
  it('cratered dirt tile returns CRATER_BG_PALETTE color, not DIRT_BG_PALETTE color', () => {
    const target = { x: 20, y: 15 }
    const dirtBg = getTileBgColor(TileType.Dirt, target.x, target.y)
    const craterBg = getCraterBgColor(target.x, target.y)

    expect(craterBg).not.toBe(dirtBg)

    // Each channel of crater bg must be darker than the corresponding dirt bg channel
    const parse = (hex: string) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]
    const [dr, dg, db] = parse(dirtBg)
    const [cr, cg, cb] = parse(craterBg)
    expect(cr).toBeLessThan(dr)
    expect(cg).toBeLessThan(dg)
    expect(cb).toBeLessThan(db)
  })

  it('cratered clover tile keeps standard clover bg (plant covers the scar)', () => {
    // Sanity: the cratered-bg override is gated on tileType === Dirt. A clover
    // tile that also appears in state.craters must return the standard clover bg.
    const cloverBg = getTileBgColor(TileType.Flora, 20, 15)
    const craterBg = getCraterBgColor(20, 15)
    expect(cloverBg).not.toBe(craterBg)
  })
})
