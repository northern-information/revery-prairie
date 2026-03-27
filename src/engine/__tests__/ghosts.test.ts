import { createGameState } from '../state'
import { tickGhosts } from '../entities'
import { advanceDialog, interactWithCharacter, tickDialogTransition } from '../interaction'
import { getBlockedPositions, movePlayer } from '../movement'
import { createGhostDefinition, getCharacterDefinition, registerGhosts } from '../characters'
import { TileType } from '../types'
import { posKey } from '../position'

import type { GameState } from '../types'

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

describe('ghost spawning', () => {
  it('spawns 3 ghosts on game start', () => {
    const state = makeState()
    expect(state.ghosts).toHaveLength(3)
  })

  it('ghosts have sequential numbers 1, 2, 3', () => {
    const state = makeState()
    const numbers = state.ghosts.map(g => g.number).sort()
    expect(numbers).toEqual([1, 2, 3])
  })

  it('ghosts are on walkable (non-Space, non-Sand) tiles', () => {
    const state = makeState()
    for (const ghost of state.ghosts) {
      const tile = state.map[ghost.pos.y][ghost.pos.x]
      expect(tile.type).not.toBe(TileType.Space)
      expect(tile.type).not.toBe(TileType.Sand)
    }
  })

  it('ghost positions do not overlap each other or player', () => {
    const state = makeState()
    const keys = new Set<string>()
    keys.add(posKey(state.player.x, state.player.y))
    for (const ghost of state.ghosts) {
      const key = posKey(ghost.pos.x, ghost.pos.y)
      expect(keys.has(key)).toBe(false)
      keys.add(key)
    }
  })

  it('creates corresponding character entries', () => {
    const state = makeState()
    for (const ghost of state.ghosts) {
      const charEntry = state.characters.find(c => c.definitionId === `ghost-${String(ghost.number)}`)
      expect(charEntry).toBeDefined()
      expect(charEntry?.pos.x).toBe(ghost.pos.x)
      expect(charEntry?.pos.y).toBe(ghost.pos.y)
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
    const state = makeState()
    registerGhosts(state.ghosts)
    for (const ghost of state.ghosts) {
      const def = getCharacterDefinition(`ghost-${String(ghost.number)}`)
      expect(def.name).toBe(`Ghost #${String(ghost.number)}`)
    }
  })
})

describe('ghost blocks player', () => {
  it('movePlayer returns false when target has a ghost', () => {
    const state = makeState()
    // Place a ghost directly to the right of player
    state.ghosts = [{ pos: { x: state.player.x + 1, y: state.player.y }, number: 99 }]
    state.characters = state.characters.filter(c => !c.definitionId.startsWith('ghost-'))
    state.characters.push({ definitionId: 'ghost-99', pos: { x: state.player.x + 1, y: state.player.y } })
    registerGhosts(state.ghosts)

    const result = movePlayer(state, 'right')
    expect(result).toBe(false)
  })

  it('ghosts appear in getBlockedPositions', () => {
    const state = makeState()
    const blocked = getBlockedPositions(state)
    for (const ghost of state.ghosts) {
      expect(blocked.has(posKey(ghost.pos.x, ghost.pos.y))).toBe(true)
    }
  })
})

describe('tickGhosts', () => {
  it('ghosts never move onto Space', () => {
    const state = makeState()
    // Surround a ghost with space on one side
    const ghost = state.ghosts[0]
    if (!ghost) return
    // Place ghost near space
    ghost.pos.x = state.player.x + 5
    ghost.pos.y = state.player.y
    // Set adjacent tile to Space
    state.map[ghost.pos.y][ghost.pos.x - 1] = { type: TileType.Space }

    for (let i = 0; i < 200; i++) {
      tickGhosts(state)
      const tile = state.map[ghost.pos.y][ghost.pos.x]
      expect(tile.type).not.toBe(TileType.Space)
    }
  })

  it('ghost stays in place when surrounded by blocked tiles', () => {
    const state = makeState()
    state.ghosts = [{ pos: { x: state.player.x + 3, y: state.player.y + 3 }, number: 1 }]
    state.characters = [{ definitionId: 'ghost-1', pos: { x: state.player.x + 3, y: state.player.y + 3 } }]
    const ghost = state.ghosts[0]

    // Surround ghost with Space
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        state.map[ghost.pos.y + dy][ghost.pos.x + dx] = { type: TileType.Space }
      }
    }

    const origX = ghost.pos.x
    const origY = ghost.pos.y
    for (let i = 0; i < 100; i++) {
      tickGhosts(state)
    }
    expect(ghost.pos.x).toBe(origX)
    expect(ghost.pos.y).toBe(origY)
  })

  it('ghost does not drift while player is talking to it', () => {
    const state = makeState()
    state.ghosts = [{ pos: { x: state.player.x + 5, y: state.player.y }, number: 1 }]
    state.characters = [{ definitionId: 'ghost-1', pos: { x: state.player.x + 5, y: state.player.y } }]
    state.activeDialog = { characterId: 'ghost-1', lineIndex: 0, typingIndex: 0, typingDone: false, transitioning: false, transitionStartTime: 0 }

    const origX = state.ghosts[0].pos.x
    const origY = state.ghosts[0].pos.y
    for (let i = 0; i < 200; i++) {
      tickGhosts(state)
    }
    expect(state.ghosts[0].pos.x).toBe(origX)
    expect(state.ghosts[0].pos.y).toBe(origY)
  })

  it('syncs character entry position when ghost moves', () => {
    const state = makeState()
    state.ghosts = [{ pos: { x: state.player.x + 5, y: state.player.y }, number: 1 }]
    state.characters = [{ definitionId: 'ghost-1', pos: { x: state.player.x + 5, y: state.player.y } }]
    registerGhosts(state.ghosts)

    // Tick many times to ensure movement happens
    for (let i = 0; i < 200; i++) {
      tickGhosts(state)
    }

    const ghost = state.ghosts[0]
    const charEntry = state.characters.find(c => c.definitionId === 'ghost-1')
    expect(charEntry?.pos.x).toBe(ghost.pos.x)
    expect(charEntry?.pos.y).toBe(ghost.pos.y)
  })
})

describe('ghost dialog', () => {
  it('interactWithCharacter works with ghost', () => {
    const state = makeState()
    // Place ghost adjacent to player
    state.ghosts = [{ pos: { x: state.player.x + 1, y: state.player.y }, number: 1 }]
    state.characters = [{ definitionId: 'ghost-1', pos: { x: state.player.x + 1, y: state.player.y } }]
    registerGhosts(state.ghosts)
    state.playerFacing = 'right'

    const result = interactWithCharacter(state)
    expect(result).toBe(true)
    expect(state.activeDialog?.characterId).toBe('ghost-1')
    expect(state.activeDialog?.lineIndex).toBe(0)
    expect(state.activeDialog?.typingDone).toBe(false)
  })

  it('advances through all 3 dialog lines then closes', () => {
    const state = makeState()
    state.ghosts = [{ pos: { x: state.player.x + 1, y: state.player.y }, number: 1 }]
    state.characters = [{ definitionId: 'ghost-1', pos: { x: state.player.x + 1, y: state.player.y } }]
    registerGhosts(state.ghosts)

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
