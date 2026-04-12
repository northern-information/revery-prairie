import { getCharacterDefinition, getCharacterDialog } from '../characters'
import { advanceDialog, giveCharacterGift } from '../interaction'
import { createGameState } from '../state'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const makeState = (): GameState => createGameState('test', 40, 30)

describe('gron character definition', () => {
  it('has water revery gift configured', () => {
    const def = getCharacterDefinition('gron')
    expect(def.gift).toEqual({ kind: 'revery', id: 'water' })
  })

  it('has postGiftDialog with deep time warning', () => {
    const def = getCharacterDefinition('gron')
    expect(def.postGiftDialog).toHaveLength(2)
    expect(def.postGiftDialog?.[0]).toContain('Deep Time revery')
    expect(def.postGiftDialog?.[1]).toContain('ready to burn')
  })

  it('has postGift for deep-time revery', () => {
    const def = getCharacterDefinition('gron')
    expect(def.postGift).toEqual({ kind: 'revery', id: 'deep-time' })
  })
})

describe('gron gift delivery', () => {
  it('gives water revery', () => {
    const state = makeState()
    const result = giveCharacterGift(state, 'gron')

    expect(result).not.toBeNull()
    expect(result?.id).toBe('water')
    expect(result?.name).toBe('Water Revery')
    expect(state.reveries).toContain('water')
    expect(state.giftsReceived.has('gron')).toBe(true)
  })

  it('auto-assigns water revery to action bar', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    // Slot 0 = earth, slot 1 = lightning (pre-assigned), slot 2 = water
    expect(state.actionBar[2]?.kind).toBe('revery')
    expect(state.actionBar[2]?.id).toBe('water')
  })

  it('records discovery', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    expect(state.manualDiscoveries.has('revery:water')).toBe(true)
    expect(state.manualDiscoveries.has('event:gron-gift')).toBe(true)
  })

  it('returns null if already given', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    const result = giveCharacterGift(state, 'gron')
    expect(result).toBeNull()
  })

  it('switches to postGiftDialog after gift', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    const dialog = getCharacterDialog(state, 'gron')
    expect(dialog).toHaveLength(2)
    expect(dialog[0]).toContain('Deep Time revery')
  })

  it('returns original dialog before gift', () => {
    const state = makeState()
    const dialog = getCharacterDialog(state, 'gron')
    expect(dialog).toHaveLength(3)
    expect(dialog[0]).toBe('...')
    expect(dialog[1]).toContain('new steward')
    expect(dialog[2]).toContain("you'll need this")
  })
})

describe('gron postGift', () => {
  const advanceToEnd = (state: GameState): void => {
    while (state.activeDialog) {
      state.activeDialog.typingDone = true
      advanceDialog(state)
      if (state.activeDialog?.transitioning) {
        state.activeDialog.transitioning = false
        state.activeDialog.lineIndex++
        state.activeDialog.typingIndex = 0
        state.activeDialog.typingDone = false
      }
    }
  }

  it('grants deep-time revery on postGiftDialog completion', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    // Open dialog (simulating interactWithCharacter)
    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }

    advanceToEnd(state)

    expect(state.activeDialog).toBeNull()
    expect(state.reveries).toContain('deep-time')
    expect(state.postGiftActionsCompleted.has('gron')).toBe(true)
  })

  it('auto-assigns deep-time revery to action bar', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }

    advanceToEnd(state)

    // Slot 0 = earth, 1 = lightning, 2 = water, 3 = deep-time
    expect(state.actionBar[3]?.kind).toBe('revery')
    expect(state.actionBar[3]?.id).toBe('deep-time')
  })

  it('records deep-time discovery', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }

    advanceToEnd(state)

    expect(state.manualDiscoveries.has('event:gron-deep-time')).toBe(true)
  })

  it('does not grant deep-time revery twice', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    // First dialog completion
    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }
    advanceToEnd(state)

    const reveryCount = state.reveries.filter(r => r === 'deep-time').length
    expect(reveryCount).toBe(1)

    // Second dialog completion
    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }
    advanceToEnd(state)

    const reveryCount2 = state.reveries.filter(r => r === 'deep-time').length
    expect(reveryCount2).toBe(1)
  })

  it('initial dialog gives water revery not deep-time', () => {
    const state = makeState()
    // Open dialog without prior gift
    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }

    advanceToEnd(state)

    // Initial dialog gives the water gift, not deep-time
    expect(state.activeDialog).toBeNull()
    expect(state.reveries).toContain('water')
    expect(state.reveries).not.toContain('deep-time')
    expect(state.postGiftActionsCompleted.has('gron')).toBe(false)
  })
})

describe('multiple gifts', () => {
  it('both moab and gron can give gifts', () => {
    const state = makeState()
    const fire = giveCharacterGift(state, 'moab')
    const water = giveCharacterGift(state, 'gron')

    expect(fire?.id).toBe('fire')
    expect(water?.id).toBe('water')
    expect(state.reveries).toEqual(['earth', 'lightning', 'fire', 'water'])
    expect(state.actionBar[0]?.id).toBe('earth')
    expect(state.actionBar[1]?.id).toBe('lightning')
    expect(state.actionBar[2]?.id).toBe('fire')
    expect(state.actionBar[3]?.id).toBe('water')
  })
})
