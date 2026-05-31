import { advanceDialog, getAdjacentCharacter, interactWithCharacter } from '../interaction'
import { clearAroundPlayer, createCharacterTestEntity, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

describe('getAdjacentCharacter', () => {
  it('finds a character to the right', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createCharacterTestEntity(state, 'gron', state.player.x + 1, state.player.y)
    const char = getAdjacentCharacter(state)
    expect(char).not.toBeNull()
    expect(char?.definitionId).toBe('gron')
  })

  it('finds a character above', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createCharacterTestEntity(state, 'gron', state.player.x, state.player.y - 1)
    expect(getAdjacentCharacter(state)).not.toBeNull()
  })

  it('returns null when no character is adjacent', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createCharacterTestEntity(state, 'gron', state.player.x + 5, state.player.y)
    expect(getAdjacentCharacter(state)).toBeNull()
  })

  it('does not detect diagonal characters', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createCharacterTestEntity(state, 'gron', state.player.x + 1, state.player.y + 1)
    expect(getAdjacentCharacter(state)).toBeNull()
  })
})

describe('interactWithCharacter', () => {
  it('sets activeDialog when adjacent to a character', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createCharacterTestEntity(state, 'gron', state.player.x + 1, state.player.y)
    const result = interactWithCharacter(state)
    expect(result.opened).toBe(true)
    expect(state.activeDialog).toMatchObject({ speakerKind: 'character', characterId: 'gron' })
    expect(state.activeDialog?.lineIndex).toBe(0)
    expect(state.activeDialog?.typingDone).toBe(false)
  })

  it('returns opened false when no character is adjacent', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const result = interactWithCharacter(state)
    expect(result.opened).toBe(false)
    expect(state.activeDialog).toBeNull()
  })
})

describe('advanceDialog', () => {
  it('reveals full line on first press when typing', () => {
    const state = createTestState()
    state.activeDialog = {
      speakerKind: 'character',
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 5,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }
    const result = advanceDialog(state)
    expect(result.continuing).toBe(true)
    expect(state.activeDialog?.typingDone).toBe(true)
    expect(state.activeDialog?.lineIndex).toBe(0)
  })

  it('starts transition on second press when typing is done', () => {
    const state = createTestState()
    // Ghost has 3 dialog lines — can transition from line 0 to 1
    state.activeDialog = {
      speakerKind: 'character',
      characterId: 'ghost-1',
      lineIndex: 0,
      typingIndex: 100,
      typingDone: true,
      transitioning: false,
      transitionStartTime: 0,
    }
    const result = advanceDialog(state)
    expect(result.continuing).toBe(true)
    expect(state.activeDialog?.transitioning).toBe(true)
  })

  it('clears dialog on last line', () => {
    const state = createTestState()
    // Ghost has 3 dialog lines — index 2 is the last
    state.activeDialog = {
      speakerKind: 'character',
      characterId: 'ghost-1',
      lineIndex: 2,
      typingIndex: 100,
      typingDone: true,
      transitioning: false,
      transitionStartTime: 0,
    }
    const result = advanceDialog(state)
    expect(result.continuing).toBe(false)
    expect(state.activeDialog).toBeNull()
  })

  it('returns continuing false when no dialog is active', () => {
    const state = createTestState()
    state.activeDialog = null
    const result = advanceDialog(state)
    expect(result.continuing).toBe(false)
  })
})
