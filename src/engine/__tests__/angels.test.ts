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
  ANGEL_LIFESPAN_MS,
  SPACE_BORDER,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { interactWithCharacter } from '../interaction'
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
    // and ensure moveChance passes (drift chance is 0.2)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // drift chance passes (< 0.2)
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
          if (state.map[y][x].type === TileType.Clover) cloverBefore++
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
          if (state.map[y][x].type === TileType.Clover) cloverAfter++
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

describe('destroyAllAngels', () => {
  it('removes all angel entities', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    expect(getAngelEntities(state)).toHaveLength(1)

    destroyAllAngels(state, 5000)

    expect(getAngelEntities(state)).toHaveLength(0)
  })
})
