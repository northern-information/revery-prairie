import { EMILY_DIALOG, getCharacterDialog } from '../characters'
import { advanceDialog, interactWithCharacter, tickDialogTyping } from '../interaction'
import { createGameState, enterHouseAtTenureStart } from '../state'
import { Season } from '../types'
import { createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameState } from '../types'

afterEach(() => {
  vi.restoreAllMocks()
})

const setSeason = (state: ReturnType<typeof createTestState>, season: Season) => {
  state.weather.season = season
}

const openEmilyDialog = (state: ReturnType<typeof createTestState>) => {
  state.activeDialog = {
    characterId: 'emily',
    lineIndex: 0,
    typingIndex: 0,
    typingDone: false,
    transitioning: false,
    transitionStartTime: 0,
  }
}

const advanceToLine = (state: ReturnType<typeof createTestState>, dialog: string[], targetIndex: number) => {
  while (state.activeDialog && state.activeDialog.lineIndex < targetIndex) {
    const line = dialog[state.activeDialog.lineIndex]
    state.activeDialog.typingIndex = line.length
    state.activeDialog.typingDone = true
    state.activeDialog.transitioning = false
    state.activeDialog.lineIndex++
    state.activeDialog.typingIndex = 0
    state.activeDialog.typingDone = false
  }
}

describe('Emily dialog dispatch', () => {
  it('returns the unified EMILY_DIALOG register in every season', () => {
    const state = createTestState()
    for (const season of [Season.Winter, Season.Spring, Season.Summer, Season.Autumn]) {
      setSeason(state, season)
      expect(getCharacterDialog(state, 'emily')).toBe(EMILY_DIALOG)
    }
  })
})

describe('precis #33 — emilyInvitation initialization', () => {
  it('createGameState (via createTestState) initializes emilyInvitation to "unoffered"', () => {
    const state = createTestState()
    expect(state.emilyInvitation).toBe('unoffered')
    expect(state.emilyReveryReturn).toBe(null)
  })
})

describe('precis #33 — invitation arm (autumn-only)', () => {
  it('arms awaitingConfirmation when the last line completes typing in autumn', () => {
    const state = createTestState()
    setSeason(state, Season.Autumn)
    state.revery = null
    openEmilyDialog(state)
    advanceToLine(state, EMILY_DIALOG, EMILY_DIALOG.length - 1)
    expect(state.activeDialog).not.toBeNull()
    state.lastDialogTypingTick = 0
    const lastLine = EMILY_DIALOG[EMILY_DIALOG.length - 1]
    for (let t = 50; t < 50 + lastLine.length * 50 + 100; t += 50) {
      tickDialogTyping(state, t)
    }
    expect(state.activeDialog?.typingDone).toBe(true)
    expect(state.activeDialog?.awaitingConfirmation).toBe(true)
    expect(state.emilyInvitation).toBe('offered')
  })

  it('does NOT arm in winter, spring, or summer', () => {
    for (const season of [Season.Winter, Season.Spring, Season.Summer]) {
      const state = createTestState()
      setSeason(state, season)
      state.revery = null
      openEmilyDialog(state)
      advanceToLine(state, EMILY_DIALOG, EMILY_DIALOG.length - 1)
      state.lastDialogTypingTick = 0
      const lastLine = EMILY_DIALOG[EMILY_DIALOG.length - 1]
      for (let t = 50; t < 50 + lastLine.length * 50 + 100; t += 50) {
        tickDialogTyping(state, t)
      }
      expect(state.activeDialog?.awaitingConfirmation).toBeUndefined()
      expect(state.emilyInvitation).toBe('unoffered')
    }
  })

  it('does NOT arm when a Revery is already active', () => {
    const state = createTestState()
    setSeason(state, Season.Autumn)
    // Forge a non-null revery — only the truthy check matters for the arm gate.
    state.revery = { active: true } as unknown as typeof state.revery
    openEmilyDialog(state)
    advanceToLine(state, EMILY_DIALOG, EMILY_DIALOG.length - 1)
    state.lastDialogTypingTick = 0
    const lastLine = EMILY_DIALOG[EMILY_DIALOG.length - 1]
    for (let t = 50; t < 50 + lastLine.length * 50 + 100; t += 50) {
      tickDialogTyping(state, t)
    }
    expect(state.activeDialog?.awaitingConfirmation).toBeUndefined()
  })
})

describe('precis #33 — confirm path', () => {
  it('[f] press while armed contributes pressure to threshold and closes the dialog', () => {
    const state = createTestState()
    setSeason(state, Season.Autumn)
    state.revery = null
    state.dormancyPressure = 0
    openEmilyDialog(state)
    if (!state.activeDialog) throw new Error('dialog not opened')
    state.activeDialog.lineIndex = EMILY_DIALOG.length - 1
    state.activeDialog.typingDone = true
    state.activeDialog.awaitingConfirmation = true
    state.emilyInvitation = 'offered'

    advanceDialog(state)

    expect(state.activeDialog).toBeNull()
    expect(state.emilyInvitation).toBe('confirmed')
    expect(state.dormancyPressure).toBeGreaterThanOrEqual(1.0 - 1e-9)
    expect(state.manualDiscoveries.has('event:emily-invitation-confirmed')).toBe(true)
  })
})

describe('Emily dialog content lock', () => {
  it('exports the three locked lines in order', () => {
    expect(EMILY_DIALOG).toEqual([
      'Happy first day of spring, steward.',
      "I wonder what this year's knot will hold?",
      'You will return before the winter solstice, to revery.',
    ])
  })
})

describe('precis #34 — manual [f] skips the spring-equinox greeting', () => {
  it('opens Emily at lineIndex 1 regardless of season', () => {
    // Construct a real state so Emily's ECS entity is present (createTestState
    // destroys character entities).
    const state = createGameState('Test', 20, 20)
    enterHouseAtTenureStart(state)
    // Player walks one tile west of Emily (Emily at (5, 2)) and faces left.
    state.player = { x: 6, y: 2 }
    state.playerFacing = 'left'

    for (const season of [Season.Spring, Season.Summer, Season.Autumn, Season.Winter]) {
      state.weather.season = season
      state.activeDialog = null
      const result = interactWithCharacter(state)
      expect(result.opened).toBe(true)
      const dialog = state.activeDialog as GameState['activeDialog']
      expect(dialog?.characterId).toBe('emily')
      expect(dialog?.lineIndex).toBe(1)
    }
  })
})
