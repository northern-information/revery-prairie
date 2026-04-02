import { createGhostDefinition, getCharacterDefinition, registerGhostDefinitions } from '../characters'
import { ComponentType } from '../ecs/types'
import { tickCharacterBehaviors } from '../entities'
import { advanceDialog, interactWithCharacter, tickDialogTransition } from '../interaction'
import { getBlockedPositions, movePlayer } from '../movement'
import { posKey } from '../position'
import { createGameState } from '../state'
import { TileType } from '../types'
import { createCharacterTestEntity, destroyAllCharacterEntities, getCharacterEntities } from './helpers'

import type { GameState } from '../types'

const DRIFT_BEHAVIOR = { type: 'drift' as const, moveChance: 0.15, freezeOnDialog: true }

const clearAroundPlayer = (state: GameState) => {
  const { player, map } = state
  for (let dy = -10; dy <= 10; dy++) {
    for (let dx = -10; dx <= 10; dx++) {
      const x = player.x + dx
      const y = player.y + dy
      if (x >= 0 && x < state.mapWidth && y >= 0 && y < state.mapHeight) {
        map[y][x] = { type: TileType.Dirt }
      }
    }
  }
}

const makeState = (): GameState => {
  const state = createGameState('test', 40, 30)
  clearAroundPlayer(state)
  return state
}

const getGhostCharacters = (state: GameState) => getCharacterEntities(state).filter(c => c.behavior?.type === 'drift')

describe('ghost spawning', () => {
  it('spawns 3 ghosts on game start', () => {
    const state = makeState()
    expect(getGhostCharacters(state)).toHaveLength(3)
  })

  it('ghosts have sequential definitionIds ghost-1, ghost-2, ghost-3', () => {
    const state = makeState()
    const ids = getGhostCharacters(state)
      .map(c => c.definitionId)
      .sort()
    expect(ids).toEqual(['ghost-1', 'ghost-2', 'ghost-3'])
  })

  it('ghosts are on walkable (non-Space, non-Sand) tiles', () => {
    const state = makeState()
    for (const ghost of getGhostCharacters(state)) {
      const tile = state.map[ghost.pos.y][ghost.pos.x]
      expect(tile.type).not.toBe(TileType.Space)
      expect(tile.type).not.toBe(TileType.Sand)
    }
  })

  it('ghost positions do not overlap each other or player', () => {
    const state = makeState()
    const keys = new Set<string>()
    keys.add(posKey(state.player.x, state.player.y))
    for (const ghost of getGhostCharacters(state)) {
      const key = posKey(ghost.pos.x, ghost.pos.y)
      expect(keys.has(key)).toBe(false)
      keys.add(key)
    }
  })

  it('ghost characters have drift behavior', () => {
    const state = makeState()
    for (const ghost of getGhostCharacters(state)) {
      expect(ghost.behavior).toEqual(DRIFT_BEHAVIOR)
    }
  })
})

describe('ghost character definitions', () => {
  it('creates definition with correct name and glyph', () => {
    const def = createGhostDefinition(1)
    expect(def.id).toBe('ghost-1')
    expect(def.name).toBe('Ghost #1')
    expect(def.glyph).toBe('ö')
    expect(def.glyphColor).toBe('#FFFFFF')
  })

  it('has 3-line dialog', () => {
    const def = createGhostDefinition(1)
    expect(def.dialog).toHaveLength(3)
    expect(def.dialog[0]).toBe('...')
    expect(def.dialog[1]).toBe('Oh... a steward...')
    expect(def.dialog[2]).toBe('... I sure would love some clover tea.')
  })

  it('registers ghost definitions in CHARACTER_DEFINITIONS', () => {
    registerGhostDefinitions([1, 2, 3])
    for (let n = 1; n <= 3; n++) {
      const def = getCharacterDefinition(`ghost-${String(n)}`)
      expect(def.name).toBe(`Ghost #${String(n)}`)
    }
  })
})

describe('ghost blocks player', () => {
  it('movePlayer returns false when target has a ghost', () => {
    const state = makeState()
    // Remove all ghosts and create a single ghost to the right of player
    destroyAllCharacterEntities(state)
    createCharacterTestEntity(state, 'ghost-99', state.player.x + 1, state.player.y, {
      behavior: DRIFT_BEHAVIOR,
    })
    registerGhostDefinitions([99])

    const result = movePlayer(state, 'right')
    expect(result).toBe(false)
  })

  it('ghosts appear in getBlockedPositions', () => {
    const state = makeState()
    const blocked = getBlockedPositions(state)
    for (const ghost of getGhostCharacters(state)) {
      expect(blocked.has(posKey(ghost.pos.x, ghost.pos.y))).toBe(true)
    }
  })
})

describe('tickCharacterBehaviors', () => {
  it('ghosts never move onto Space', () => {
    const state = makeState()
    const ghosts = getGhostCharacters(state)
    const ghost = ghosts[0]
    if (!ghost) return
    // Move ghost away from player
    state.world.moveEntity(ghost.eid, state.player.x + 5, state.player.y)
    // Set adjacent tile to Space
    const gpos = state.world.getComponent(ghost.eid, ComponentType.Position)
    expect(gpos).toBeDefined()
    if (!gpos) return
    state.map[gpos.y][gpos.x - 1] = { type: TileType.Space }

    for (let i = 0; i < 200; i++) {
      tickCharacterBehaviors(state)
      const pos = state.world.getComponent(ghost.eid, ComponentType.Position)
      expect(pos).toBeDefined()
      if (!pos) return
      const tile = state.map[pos.y][pos.x]
      expect(tile.type).not.toBe(TileType.Space)
    }
  })

  it('ghost stays in place when surrounded by blocked tiles', () => {
    const state = makeState()
    destroyAllCharacterEntities(state)
    const eid = createCharacterTestEntity(state, 'ghost-1', state.player.x + 3, state.player.y + 3, {
      behavior: DRIFT_BEHAVIOR,
    })
    const gpos = state.world.getComponent(eid, ComponentType.Position)
    expect(gpos).toBeDefined()
    if (!gpos) return

    // Surround ghost with Space
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        state.map[gpos.y + dy][gpos.x + dx] = { type: TileType.Space }
      }
    }

    const origX = gpos.x
    const origY = gpos.y
    for (let i = 0; i < 100; i++) {
      tickCharacterBehaviors(state)
    }
    const posAfter = state.world.getComponent(eid, ComponentType.Position)
    expect(posAfter).toBeDefined()
    expect(posAfter?.x).toBe(origX)
    expect(posAfter?.y).toBe(origY)
  })

  it('ghost does not drift while player is talking to it', () => {
    const state = makeState()
    destroyAllCharacterEntities(state)
    const eid = createCharacterTestEntity(state, 'ghost-1', state.player.x + 5, state.player.y, {
      behavior: DRIFT_BEHAVIOR,
    })
    state.activeDialog = {
      characterId: 'ghost-1',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }

    const posBefore = state.world.getComponent(eid, ComponentType.Position)
    expect(posBefore).toBeDefined()
    if (!posBefore) return
    const origX = posBefore.x
    const origY = posBefore.y
    for (let i = 0; i < 200; i++) {
      tickCharacterBehaviors(state)
    }
    const posAfter = state.world.getComponent(eid, ComponentType.Position)
    expect(posAfter).toBeDefined()
    expect(posAfter?.x).toBe(origX)
    expect(posAfter?.y).toBe(origY)
  })

  it('drift behavior moves character position', () => {
    const state = makeState()
    destroyAllCharacterEntities(state)
    const eid = createCharacterTestEntity(state, 'ghost-1', state.player.x + 5, state.player.y, {
      behavior: DRIFT_BEHAVIOR,
    })
    registerGhostDefinitions([1])

    const posBefore = state.world.getComponent(eid, ComponentType.Position)
    expect(posBefore).toBeDefined()
    if (!posBefore) return
    const origX = posBefore.x
    const origY = posBefore.y

    // Tick many times to ensure movement happens
    for (let i = 0; i < 200; i++) {
      tickCharacterBehaviors(state)
    }

    const posAfter = state.world.getComponent(eid, ComponentType.Position)
    expect(posAfter).toBeDefined()
    if (!posAfter) return
    const moved = posAfter.x !== origX || posAfter.y !== origY
    expect(moved).toBe(true)
  })
})

describe('ghost dialog', () => {
  it('interactWithCharacter works with ghost', () => {
    const state = makeState()
    // Place ghost adjacent to player
    destroyAllCharacterEntities(state)
    createCharacterTestEntity(state, 'ghost-1', state.player.x + 1, state.player.y, {
      behavior: DRIFT_BEHAVIOR,
    })
    registerGhostDefinitions([1])
    state.playerFacing = 'right'

    const result = interactWithCharacter(state)
    expect(result).toBe(true)
    expect(state.activeDialog?.characterId).toBe('ghost-1')
    expect(state.activeDialog?.lineIndex).toBe(0)
    expect(state.activeDialog?.typingDone).toBe(false)
  })

  it('advances through all 3 dialog lines then closes', () => {
    const state = makeState()
    destroyAllCharacterEntities(state)
    createCharacterTestEntity(state, 'ghost-1', state.player.x + 1, state.player.y, {
      behavior: DRIFT_BEHAVIOR,
    })
    registerGhostDefinitions([1])

    interactWithCharacter(state)

    const dialog = () => {
      if (!state.activeDialog) throw new Error('no active dialog')
      return state.activeDialog
    }

    // Mark typing done, advance starts transition for line 0 -> 1
    dialog().typingDone = true
    expect(advanceDialog(state)).toBe(true)
    expect(dialog().transitioning).toBe(true)
    // Simulate transition completing
    tickDialogTransition(state, dialog().transitionStartTime + 500)
    expect(dialog().lineIndex).toBe(1)

    // Mark typing done, advance starts transition for line 1 -> 2
    dialog().typingDone = true
    expect(advanceDialog(state)).toBe(true)
    expect(dialog().transitioning).toBe(true)
    tickDialogTransition(state, dialog().transitionStartTime + 500)
    expect(dialog().lineIndex).toBe(2)

    // Mark typing done, advance closes on last line
    dialog().typingDone = true
    expect(advanceDialog(state)).toBe(false)
    expect(state.activeDialog).toBeNull()
  })
})
