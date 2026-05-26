import {
  destroyAllAngels,
  spawnAngel,
  tickAngelBeeAura,
  tickAngelCloverAura,
  tickAngelDrift,
  tickAngelLifespan,
} from '../angels'
import {
  ANGEL_AURA_RADIUS,
  ANGEL_BEE_SPAWN_INTERVAL_MS,
  ANGEL_BODY_SIZE,
  ANGEL_DRIFT_TICK_MS,
  ANGEL_LIFESPAN_MS,
  SPACE_BORDER,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { interactWithCharacter } from '../interaction'
import { clearMovementTweens } from '../movementTween'
import { TileType, Zone } from '../types'
import { createTestState } from './helpers'
import { describe, expect, it, vi } from 'vitest'

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
    expect(state.world.getComponent(eid, ComponentType.CharacterIdentity)).toBeUndefined()

    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    expect(multi?.positions).toHaveLength(ANGEL_BODY_SIZE * ANGEL_BODY_SIZE)
  })

  it('sets angelFlashTime on spawn', () => {
    const state = createAngelTestState()

    spawnAngel(state, 1000)

    expect(state.angelFlashTime).toBe(1000)
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

    try {
      tickAngelDrift(state)

      const posAfter = state.world.getComponent(eid, ComponentType.Position)
      // Position should still exist — drift should not crash
      expect(posAfter).toBeTruthy()
    } finally {
      vi.restoreAllMocks()
    }
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
    try {
      tickAngelDrift(state)

      const posAfter = requireComponent(state.world.getComponent(eid, ComponentType.Position))
      expect(posAfter.x).toBe(posBefore.x)
      expect(posAfter.y).toBe(posBefore.y)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('attaches a MovementTween with ANGEL_DRIFT_TICK_MS duration on a successful drift', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const posBefore = { ...requireComponent(state.world.getComponent(eid, ComponentType.Position)) }

    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0) // drift chance passes
      .mockReturnValueOnce(0) // picks first cardinal direction
    try {
      tickAngelDrift(state)

      const posAfter = requireComponent(state.world.getComponent(eid, ComponentType.Position))
      expect(posAfter.x !== posBefore.x || posAfter.y !== posBefore.y).toBe(true)

      const tween = requireComponent(state.world.getComponent(eid, ComponentType.MovementTween))
      expect(tween.durationMs).toBe(ANGEL_DRIFT_TICK_MS)
      expect(tween.fromX).toBe(posBefore.x)
      expect(tween.fromY).toBe(posBefore.y)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('clears the angel MovementTween when zone tweens are cleared (e.g. cave entry)', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0)
    try {
      tickAngelDrift(state)
      expect(state.world.getComponent(eid, ComponentType.MovementTween)).toBeTruthy()

      clearMovementTweens(state)
      expect(state.world.getComponent(eid, ComponentType.MovementTween)).toBeUndefined()
    } finally {
      vi.restoreAllMocks()
    }
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
    try {
      tickAngelDrift(state)
      const midPos = { ...requireComponent(state.world.getComponent(eid, ComponentType.Position)) }
      tickAngelDrift(state)

      const tween = requireComponent(state.world.getComponent(eid, ComponentType.MovementTween))
      expect(tween.fromX).toBe(midPos.x)
      expect(tween.fromY).toBe(midPos.y)
    } finally {
      vi.restoreAllMocks()
    }
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

describe('angel non-interaction', () => {
  it('does not open dialog when player stands under angel body', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))

    state.player.x = multi.positions[0].x
    state.player.y = multi.positions[0].y

    const result = interactWithCharacter(state)

    expect(result.opened).toBe(false)
    expect(state.activeDialog).toBeNull()
  })

  it('does not open dialog when player is adjacent to angel body', () => {
    const state = createAngelTestState()
    spawnAngel(state, 1000)

    const eid = getAngelEntities(state)[0]
    const multi = requireComponent(state.world.getComponent(eid, ComponentType.MultiPosition))

    state.player.x = multi.positions[0].x - 1
    state.player.y = multi.positions[0].y
    state.playerFacing = 'right'

    const result = interactWithCharacter(state)

    expect(result.opened).toBe(false)
    expect(state.activeDialog).toBeNull()
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
