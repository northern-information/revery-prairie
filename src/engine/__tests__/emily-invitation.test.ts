import {
  EMILY_DIALOG_AUTUMN,
  EMILY_DIALOG_SPRING,
  EMILY_DIALOG_SUMMER,
  EMILY_DIALOG_WINTER,
  getCharacterDialog,
} from '../characters'
import { advanceDialog, closeActiveDialog, tickDialogTyping } from '../interaction'
import { Season } from '../types'
import { createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

describe('precis #33 — getEmilyDialog seasonal dispatch', () => {
  it('returns the matching seasonal register', () => {
    const state = createTestState()
    setSeason(state, Season.Winter)
    expect(getCharacterDialog(state, 'emily')).toBe(EMILY_DIALOG_WINTER)
    setSeason(state, Season.Spring)
    expect(getCharacterDialog(state, 'emily')).toBe(EMILY_DIALOG_SPRING)
    setSeason(state, Season.Summer)
    expect(getCharacterDialog(state, 'emily')).toBe(EMILY_DIALOG_SUMMER)
    setSeason(state, Season.Autumn)
    expect(getCharacterDialog(state, 'emily')).toBe(EMILY_DIALOG_AUTUMN)
  })
})

describe('precis #33 — emilyInvitation initialization', () => {
  it('createGameState (via createTestState) initializes emilyInvitation to "unoffered"', () => {
    const state = createTestState()
    expect(state.emilyInvitation).toBe('unoffered')
    expect(state.emilyReveryReturn).toBe(null)
  })
})

describe('precis #33 — invitation arm', () => {
  it('arms awaitingConfirmation when the autumn last line completes typing', () => {
    const state = createTestState()
    setSeason(state, Season.Autumn)
    state.revery = null
    openEmilyDialog(state)
    advanceToLine(state, EMILY_DIALOG_AUTUMN, EMILY_DIALOG_AUTUMN.length - 1)
    expect(state.activeDialog).not.toBeNull()
    // Run tickDialogTyping enough times to complete the last line.
    state.lastDialogTypingTick = 0
    const lastLine = EMILY_DIALOG_AUTUMN[EMILY_DIALOG_AUTUMN.length - 1]
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
      const dialog = getCharacterDialog(state, 'emily')
      openEmilyDialog(state)
      advanceToLine(state, dialog, dialog.length - 1)
      state.lastDialogTypingTick = 0
      const lastLine = dialog[dialog.length - 1]
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
    advanceToLine(state, EMILY_DIALOG_AUTUMN, EMILY_DIALOG_AUTUMN.length - 1)
    state.lastDialogTypingTick = 0
    const lastLine = EMILY_DIALOG_AUTUMN[EMILY_DIALOG_AUTUMN.length - 1]
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
    state.activeDialog.lineIndex = EMILY_DIALOG_AUTUMN.length - 1
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

describe('precis #33 — cancel path', () => {
  it('closing the dialog mid-invitation reverts emilyInvitation to "unoffered"', () => {
    const state = createTestState()
    openEmilyDialog(state)
    if (!state.activeDialog) throw new Error('dialog not opened')
    state.activeDialog.awaitingConfirmation = true
    state.emilyInvitation = 'offered'

    closeActiveDialog(state)

    expect(state.activeDialog).toBeNull()
    expect(state.emilyInvitation).toBe('unoffered')
  })

  it('closing the dialog after a confirm leaves emilyInvitation as "confirmed"', () => {
    const state = createTestState()
    openEmilyDialog(state)
    if (!state.activeDialog) throw new Error('dialog not opened')
    state.emilyInvitation = 'confirmed'

    closeActiveDialog(state)

    expect(state.emilyInvitation).toBe('confirmed')
  })
})
