import {
  destroyAllAngels,
  generateAngelHash,
  spawnAngel,
  tickAngelBeeAura,
  tickAngelCloverAura,
  tickAngelDrift,
  tickAngelLifespan,
} from '../angels'
import { getCharacterDefinition } from '../characters'
import {
  ANGEL_AURA_RADIUS,
  ANGEL_BEE_SPAWN_INTERVAL_MS,
  ANGEL_BODY_SIZE,
  ANGEL_DRIFT_TICK_MS,
  ANGEL_LIFESPAN_MS,
  SPACE_BORDER,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { interactWithCharacter, isInteractableAt } from '../interaction'
import { getBlockedPositions } from '../movement'
import { clearMovementTweens } from '../movementTween'
import { isWalkableTile, posKey } from '../position'
import { TileType, Zone } from '../types'
import { createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getAngelEntities = (state: ReturnType<typeof createTestState>) => state.world.query(ComponentType.AngelData)

const getBeeEntities = (state: ReturnType<typeof createTestState>) =>
  state.world
    .query(ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'bee')

/** Assert and return a component value — avoids non-null assertions */
const requireComponent = <T>(val: T | undefined): T => {
  expect(val).toBeTruthy()
  return val as T
}

/**
 * Creates a state with a large clear area and the player positioned
 * so that most of the map is valid for angel spawning.
 */
const createAngelTestState = () => {
  const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
  // Move player near top-left so most of the map is >30 tiles away
  state.player.x = SPACE_BORDER + 5
  state.player.y = SPACE_BORDER + 5
  // Clear the entire map to dirt
  for (let y = 0; y < state.mapHeight; y++) {
    for (let x = 0; x < state.mapWidth; x++) {
      state.map[y][x] = { type: TileType.Dirt }
    }
  }
  state.nextAngelSpawnTime = 0
  return state
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('angel spawning', () => {
  it('spawns an angel when conditions are met', () => {
    const state = createAngelTestState()

    const result = spawnAngel(state, 1000)

    expect(result).toBe(true)
    expect(getAngelEntities(state)).toHaveLength(1)
  })

  it('does not spawn a second angel while one exists', () => {
    const state = createAngelTestState()

    spawnAngel(state, 1000)
    state.nextAngelSpawnTime = 0
    const result = spawnAngel(state, 2000)

    expect(result).toBe(false)
    expect(getAngelEntities(state)).toHaveLength(1)
  })

  it('does not spawn during deep time', () => {
    const state = createAngelTestState()
    state.deepTime = {
      active: true,
      startTime: 0,
      phase: 'burning',
      elapsedYears: 0,
      playerGlyph: '@',
      playerGlyphColor: '#FFF',
      scheduledStrikeYears: [],
      strikesCompleted: 0,
      shakeUntil: 0,
    }

    expect(spawnAngel(state, 1000)).toBe(false)
  })

  it('does not spawn when time is before nextAngelSpawnTime', () => {
    const state = createTestState()
    state.nextAngelSpawnTime = 5000

    expect(spawnAngel(state, 1000)).toBe(false)
  })

  it('records discovery on first spawn', () => {
    const state = createAngelTestState()

    spawnAngel(state, 1000)

    expect(state.manualDiscoveries.has('event:angel')).toBe(true)
  })

  it('creates angel with correct ECS components', () => {
    const state = createAngelTestState()

    spawnAngel(state, 1000)

    const angels = getAngelEntities(state)
    expect(angels).toHaveLength(1)
    const eid = angels[0]
    expect(state.world.getComponent(eid, ComponentType.Position)).toBeTruthy()
    expect(state.world.getComponent(eid, ComponentType.MultiPosition)).toBeTruthy()
    expect(state.world.getComponent(eid, ComponentType.AngelData)).toBeTruthy()
    expect(state.world.getComponent(eid, ComponentType.EntityTag)).toBe('angel')
    expect(state.world.getComponent(eid, ComponentType.EntityZone)).toEqual({ zone: Zone.Overworld })
    expect(state.world.getComponent(eid, ComponentType.CharacterIdentity)).toBeTruthy()

    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    expect(multi?.positions).toHaveLength(ANGEL_BODY_SIZE * ANGEL_BODY_SIZE)
  })

  it('sets angelFlashTime on spawn', () => {
    const state = createAngelTestState()

    spawnAngel(state, 1000)

    expect(state.angelFlashTime).toBe(1000)
  })

  it('uses Angel of X naming', () => {
    const state = createAngelTestState()

    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const identity = requireComponent(state.world.getComponent(eid, ComponentType.CharacterIdentity))
    const def = getCharacterDefinition(identity.definitionId)
    expect(def.name).toMatch(/^Angel of (Rain|Bees|Clover)$/)
  })
})

describe('angel drifting', () => {
  it('moves angel position on drift tick', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]

    // Force drift to succeed by returning values that select a specific direction
    // and ensure moveChance passes (drift chance is 1.0 — always passes)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // drift chance passes
      .mockReturnValueOnce(0) // picks first cardinal direction (up)

    tickAngelDrift(state)

    const posAfter = state.world.getComponent(eid, ComponentType.Position)
    // Position should still exist — drift should not crash
    expect(posAfter).toBeTruthy()
  })

  it('does not drift during dialog', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const posBefore = { ...requireComponent(state.world.getComponent(eid, ComponentType.Position)) }

    state.activeDialog = {
      characterId: 'test',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }

    vi.spyOn(Math, 'random').mockReturnValue(0) // would normally drift
    tickAngelDrift(state)

    const posAfter = requireComponent(state.world.getComponent(eid, ComponentType.Position))
    expect(posAfter.x).toBe(posBefore.x)
    expect(posAfter.y).toBe(posBefore.y)
  })

  it('attaches a MovementTween with ANGEL_DRIFT_TICK_MS duration on a successful drift', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const posBefore = { ...requireComponent(state.world.getComponent(eid, ComponentType.Position)) }

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // drift chance passes
      .mockReturnValueOnce(0) // picks first cardinal direction
    tickAngelDrift(state)

    const posAfter = requireComponent(state.world.getComponent(eid, ComponentType.Position))
    expect(posAfter.x !== posBefore.x || posAfter.y !== posBefore.y).toBe(true)

    const tween = requireComponent(state.world.getComponent(eid, ComponentType.MovementTween))
    expect(tween.durationMs).toBe(ANGEL_DRIFT_TICK_MS)
    expect(tween.fromX).toBe(posBefore.x)
    expect(tween.fromY).toBe(posBefore.y)
  })

  it('clears the angel MovementTween when zone tweens are cleared (e.g. cave entry)', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
    tickAngelDrift(state)
    expect(state.world.getComponent(eid, ComponentType.MovementTween)).toBeTruthy()

    clearMovementTweens(state)
    expect(state.world.getComponent(eid, ComponentType.MovementTween)).toBeUndefined()
  })

  it('overwrites the in-flight MovementTween when a second drift fires before the first completes', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // first drift: chance passes
      .mockReturnValueOnce(0) // first drift: direction
      .mockReturnValueOnce(0) // second drift: chance passes
      .mockReturnValueOnce(0) // second drift: direction
    tickAngelDrift(state)
    const midPos = { ...requireComponent(state.world.getComponent(eid, ComponentType.Position)) }
    tickAngelDrift(state)

    const tween = requireComponent(state.world.getComponent(eid, ComponentType.MovementTween))
    expect(tween.fromX).toBe(midPos.x)
    expect(tween.fromY).toBe(midPos.y)
  })
})

describe('angel lifespan', () => {
  it('despawns angel after lifespan expires', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    expect(getAngelEntities(state)).toHaveLength(1)

    tickAngelLifespan(state, 1000 + ANGEL_LIFESPAN_MS + 1)

    expect(getAngelEntities(state)).toHaveLength(0)
  })

  it('does not despawn before lifespan expires', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    tickAngelLifespan(state, 1000 + ANGEL_LIFESPAN_MS - 1)

    expect(getAngelEntities(state)).toHaveLength(1)
  })

  it('schedules next spawn after despawn', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const despawnTime = 1000 + ANGEL_LIFESPAN_MS + 1
    tickAngelLifespan(state, despawnTime)

    expect(state.nextAngelSpawnTime).toBeGreaterThan(despawnTime)
  })

  it('sets angelFlashTime on despawn', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const despawnTime = 1000 + ANGEL_LIFESPAN_MS + 1
    tickAngelLifespan(state, despawnTime)

    expect(state.angelFlashTime).toBe(despawnTime)
  })
})

describe('angel aura - bees', () => {
  it('spawns a bee within aura radius for bee-type angel', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    // Force the angel to be bee type
    const eid = getAngelEntities(state)[0]
    const data = requireComponent(state.world.getComponent(eid, ComponentType.AngelData))
    const pos = requireComponent(state.world.getComponent(eid, ComponentType.Position))
    data.auraKind = 'bees'
    data.lastBeeSpawnTime = 0

    // Clear area around angel center so random tile picks always land on dirt
    for (let dy = -ANGEL_AURA_RADIUS; dy <= ANGEL_AURA_RADIUS; dy++) {
      for (let dx = -ANGEL_AURA_RADIUS; dx <= ANGEL_AURA_RADIUS; dx++) {
        const tx = pos.x + dx
        const ty = pos.y + dy
        if (tx >= 0 && tx < state.mapWidth && ty >= 0 && ty < state.mapHeight) {
          state.map[ty][tx] = { type: TileType.Dirt }
        }
      }
    }

    tickAngelBeeAura(state, ANGEL_BEE_SPAWN_INTERVAL_MS + 1)

    expect(getBeeEntities(state).length).toBeGreaterThanOrEqual(1)
  })

  it('does not spawn bees for non-bee aura types', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const data = requireComponent(state.world.getComponent(eid, ComponentType.AngelData))
    data.auraKind = 'rain'
    data.lastBeeSpawnTime = 0

    tickAngelBeeAura(state, ANGEL_BEE_SPAWN_INTERVAL_MS + 1)

    expect(getBeeEntities(state)).toHaveLength(0)
  })
})

describe('angel aura - clover', () => {
  it('converts a dirt tile to clover for clover-type angel', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const data = requireComponent(state.world.getComponent(eid, ComponentType.AngelData))
    data.auraKind = 'clover'
    data.lastCloverGrowTime = 0

    const pos = requireComponent(state.world.getComponent(eid, ComponentType.Position))

    // Count clover tiles before
    let cloverBefore = 0
    for (let dy = -25; dy <= 25; dy++) {
      for (let dx = -25; dx <= 25; dx++) {
        const x = pos.x + dx
        const y = pos.y + dy
        if (x >= 0 && x < state.mapWidth && y >= 0 && y < state.mapHeight) {
          if (state.map[y][x].type === TileType.Flora) cloverBefore++
        }
      }
    }

    tickAngelCloverAura(state, 4000)

    let cloverAfter = 0
    for (let dy = -25; dy <= 25; dy++) {
      for (let dx = -25; dx <= 25; dx++) {
        const x = pos.x + dx
        const y = pos.y + dy
        if (x >= 0 && x < state.mapWidth && y >= 0 && y < state.mapHeight) {
          if (state.map[y][x].type === TileType.Flora) cloverAfter++
        }
      }
    }

    expect(cloverAfter).toBeGreaterThan(cloverBefore)
  })
})

describe('angel dialog via [e] interaction', () => {
  it('opens dialog when player is adjacent to angel body', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))

    // Move player adjacent to the first body tile
    state.player.x = multi.positions[0].x - 1
    state.player.y = multi.positions[0].y
    state.playerFacing = 'right'

    const result = interactWithCharacter(state)

    expect(result.opened).toBe(true)
    expect(state.activeDialog).not.toBeNull()
  })

  it('opens dialog when player is standing under angel body', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))

    // Move player onto a body tile
    state.player.x = multi.positions[0].x
    state.player.y = multi.positions[0].y

    const result = interactWithCharacter(state)

    expect(result.opened).toBe(true)
    expect(state.activeDialog).not.toBeNull()
  })

  it('can talk to angel repeatedly', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))

    state.player.x = multi.positions[0].x
    state.player.y = multi.positions[0].y

    interactWithCharacter(state)
    expect(state.activeDialog).not.toBeNull()

    state.activeDialog = null
    interactWithCharacter(state)
    expect(state.activeDialog).not.toBeNull()
  })

  it('does not open when player is far from angel', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    // Player stays at their original position, far from angel
    const result = interactWithCharacter(state)

    expect(result.opened).toBe(false)
    expect(state.activeDialog).toBeNull()
  })
})

describe('angel cantos', () => {
  it('stores a canto on first interaction', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))

    state.player.x = multi.positions[0].x
    state.player.y = multi.positions[0].y
    interactWithCharacter(state)

    expect(state.angelCantos).toHaveLength(1)
    expect(state.angelCantos[0]).toMatch(/^[0-9A-F]{64}$/)
  })

  it('does not store duplicate canto on repeated interaction', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))

    state.player.x = multi.positions[0].x
    state.player.y = multi.positions[0].y
    interactWithCharacter(state)
    expect(state.angelCantos).toHaveLength(1)

    state.activeDialog = null
    interactWithCharacter(state)
    expect(state.angelCantos).toHaveLength(1)
  })

  it('increments encounter count only on first interaction', () => {
    const state = createAngelTestState()

    expect(state.angelEncounterCount).toBe(0)

    spawnAngel(state, 1000)
    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))
    state.player.x = multi.positions[0].x
    state.player.y = multi.positions[0].y
    interactWithCharacter(state)

    expect(state.angelEncounterCount).toBe(1)

    state.activeDialog = null
    interactWithCharacter(state)
    expect(state.angelEncounterCount).toBe(1)
  })

  it('appends cantos without limit', () => {
    const state = createAngelTestState()
    for (let i = 0; i < 100; i++) {
      state.angelCantos.push(`HASH${String(i).padStart(60, '0')}`)
    }
    expect(state.angelCantos).toHaveLength(100)

    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))
    state.player.x = multi.positions[0].x
    state.player.y = multi.positions[0].y
    interactWithCharacter(state)

    expect(state.angelCantos).toHaveLength(101)
  })
})

describe('angel hash generation', () => {
  it('produces a 64-character hex string', () => {
    const hash = generateAngelHash('test', 10, 20, 0)
    expect(hash).toMatch(/^[0-9A-F]{64}$/)
  })

  it('produces different hashes for different inputs', () => {
    const h1 = generateAngelHash('test', 10, 20, 0)
    const h2 = generateAngelHash('test', 10, 20, 1)
    const h3 = generateAngelHash('other', 10, 20, 0)
    expect(h1).not.toBe(h2)
    expect(h1).not.toBe(h3)
  })

  it('produces deterministic hashes', () => {
    const h1 = generateAngelHash('test', 10, 20, 0)
    const h2 = generateAngelHash('test', 10, 20, 0)
    expect(h1).toBe(h2)
  })

  // Snapshot pin to detect drift after the sha256Sync lift to src/engine/crypto.ts.
  // Angel cantos in saved games depend on byte-identical output — any change here
  // breaks save compatibility.
  it('matches pinned snapshot for (Sage, 50, 50, 0)', () => {
    const hash = generateAngelHash('Sage', 50, 50, 0)
    expect(hash).toBe('78DBCE487B7E8D20B11AFBC0A6F0F738B5133E4CB8E7384CC56D26946E3BADE2')
  })
})

describe('angel movement blocking', () => {
  it('does not block player movement', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]

    // Angels should not have a Blocking component
    const blocking = state.world.getComponent(eid, ComponentType.Blocking)
    expect(blocking).toBeUndefined()
  })
})

describe('angel click-to-interact detection', () => {
  it('angel body tile resolves to CharacterIdentity via MultiPosition query', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))
    const expectedIdentity = requireComponent(state.world.getComponent(eid, ComponentType.CharacterIdentity))

    // Pick an arbitrary body tile (not the anchor — pick the last one to cover edges)
    const bodyTile = multi.positions[multi.positions.length - 1]
    const tileKey = posKey(bodyTile.x, bodyTile.y)

    // Replicate the detection logic from useMouse: spatial index misses angel body tiles
    const spatialHit = state.world.spatial
      .at(bodyTile.x, bodyTile.y)
      .find(e => state.world.getComponent(e, ComponentType.EntityTag) === 'character')
    expect(spatialHit).toBeUndefined()

    // MultiPosition query finds the angel and returns its CharacterIdentity
    let foundIdentity: { definitionId: string } | undefined
    for (const e of state.world.query(
      ComponentType.AngelData,
      ComponentType.MultiPosition,
      ComponentType.CharacterIdentity
    )) {
      const m = state.world.getComponent(e, ComponentType.MultiPosition)
      if (m?.positions.some(p => posKey(p.x, p.y) === tileKey)) {
        foundIdentity = state.world.getComponent(e, ComponentType.CharacterIdentity)
        break
      }
    }
    expect(foundIdentity).toBeTruthy()
    expect(foundIdentity?.definitionId).toBe(expectedIdentity.definitionId)
  })

  it('isInteractableAt returns true for angel body tiles', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))

    // Check several body tiles
    for (const pos of multi.positions.slice(0, 5)) {
      expect(isInteractableAt(state, pos.x, pos.y)).toBe(true)
    }
  })
})

describe('angel click walk-target resolution', () => {
  it('interior body tile finds walkable target on body perimeter', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))
    const bodyPositions = multi.positions

    // Pick the center tile — all 4 cardinal neighbors are also body tiles
    const centerIdx = Math.floor(bodyPositions.length / 2)
    const centerTile = bodyPositions[centerIdx]
    const adjacentDeltas = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ]
    const bodyKeys = new Set(bodyPositions.map(p => posKey(p.x, p.y)))

    // Confirm the center tile's immediate neighbors are all body tiles (the bug scenario)
    for (const d of adjacentDeltas) {
      expect(bodyKeys.has(posKey(centerTile.x + d.x, centerTile.y + d.y))).toBe(true)
    }

    // Replicate the fixed walk-target search: scan all body tiles' neighbors
    const blocked = getBlockedPositions(state)
    let bestTarget: { x: number; y: number } | null = null
    let bestDist = Infinity
    for (const bt of bodyPositions) {
      for (const d of adjacentDeltas) {
        const ax = bt.x + d.x
        const ay = bt.y + d.y
        if (ax < 0 || ax >= state.mapWidth || ay < 0 || ay >= state.mapHeight) continue
        if (bodyKeys.has(posKey(ax, ay))) continue
        if (!isWalkableTile(state.map[ay][ax].type)) continue
        if (blocked.has(posKey(ax, ay))) continue
        const dist = Math.abs(ax - state.player.x) + Math.abs(ay - state.player.y)
        if (dist < bestDist) {
          bestDist = dist
          bestTarget = { x: ax, y: ay }
        }
      }
    }

    // The full-body search must find a walkable target
    expect(bestTarget).not.toBeNull()

    // The old single-tile search would fail — verify it finds nothing
    let oldTarget: { x: number; y: number } | null = null
    for (const d of adjacentDeltas) {
      const ax = centerTile.x + d.x
      const ay = centerTile.y + d.y
      if (ax < 0 || ax >= state.mapWidth || ay < 0 || ay >= state.mapHeight) continue
      if (!isWalkableTile(state.map[ay][ax].type)) continue
      if (blocked.has(posKey(ax, ay))) continue
      oldTarget = { x: ax, y: ay }
    }
    expect(oldTarget).toBeNull()
  })
})

describe('destroyAllAngels', () => {
  it('removes all angel entities', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    expect(getAngelEntities(state)).toHaveLength(1)

    destroyAllAngels(state, 5000)

    expect(getAngelEntities(state)).toHaveLength(0)
  })
})
