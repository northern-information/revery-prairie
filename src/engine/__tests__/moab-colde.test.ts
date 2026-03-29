import { createGameState } from '../state'
import { advanceDialog, giveMoabGift, interactWithCharacter, tickDialogTransition } from '../interaction'
import { getBlockedPositions, movePlayer } from '../movement'
import { getCharacterDefinition } from '../characters'
import { enterCave, exitCave } from '../cave'
import { posKey } from '../position'
import { Zone } from '../types'
import { getCharacterEntities } from './helpers'

import type { GameState } from '../types'

const makeState = (): GameState => {
  const state = createGameState('test', 40, 30)
  return state
}

const makeCaveState = (): GameState => {
  const state = makeState()
  enterCave(state)
  return state
}

describe('moab character definition', () => {
  it('has correct name, glyph, and color', () => {
    const def = getCharacterDefinition('moab')
    expect(def.name).toBe('Moab Coldë')
    expect(def.glyph).toBe('M')
    expect(def.glyphColor).toBe('#FFFFFF')
  })

  it('has 3-line dialog before gift', () => {
    const def = getCharacterDefinition('moab')
    expect(def.dialog).toHaveLength(3)
    expect(def.dialog[0]).toBe('...')
    expect(def.dialog[1]).toBe('...')
    expect(def.dialog[2]).toBe('...fine.')
  })
})

describe('moab cave placement', () => {
  it('spawns moab as ECS entity on enterCave', () => {
    const state = makeCaveState()
    const moab = getCharacterEntities(state).find(c => c.definitionId === 'moab')
    expect(moab).toBeDefined()
  })

  it('places moab at caveNpcSpot', () => {
    const state = makeCaveState()
    const moab = getCharacterEntities(state).find(c => c.definitionId === 'moab')
    expect(moab?.pos.x).toBe(state.caveNpcSpot.x)
    expect(moab?.pos.y).toBe(state.caveNpcSpot.y)
  })

  it('sets zone to cave', () => {
    const state = makeCaveState()
    expect(state.currentZone).toBe(Zone.Cave)
  })

  it('re-spawns moab on subsequent enterCave calls', () => {
    const state = makeState()
    enterCave(state)
    expect(getCharacterEntities(state).find(c => c.definitionId === 'moab')).toBeDefined()

    // Exit and re-enter
    exitCave(state)
    expect(state.currentZone).toBe(Zone.Overworld)
    enterCave(state)
    expect(getCharacterEntities(state).find(c => c.definitionId === 'moab')).toBeDefined()
  })
})

describe('moab blocks player', () => {
  it('moab position is in getBlockedPositions', () => {
    const state = makeCaveState()
    const blocked = getBlockedPositions(state)
    expect(blocked.has(posKey(state.caveNpcSpot.x, state.caveNpcSpot.y))).toBe(true)
  })

  it('movePlayer returns false when targeting moab tile', () => {
    const state = makeCaveState()
    // Place player adjacent to moab
    state.player = { x: state.caveNpcSpot.x - 1, y: state.caveNpcSpot.y }
    state.playerFacing = 'right'

    const result = movePlayer(state, 'right')
    expect(result).toBe(false)
  })
})

describe('moab first interaction dialog', () => {
  it('opens dialog when facing moab and pressing e', () => {
    const state = makeCaveState()
    state.player = { x: state.caveNpcSpot.x - 1, y: state.caveNpcSpot.y }
    state.playerFacing = 'right'

    const result = interactWithCharacter(state)
    expect(result).toBe(true)
    expect(state.activeDialog?.characterId).toBe('moab')
    expect(state.activeDialog?.lineIndex).toBe(0)
    expect(state.activeDialog?.typingDone).toBe(false)
  })

  it('advances through 3 dialog lines then closes', () => {
    const state = makeCaveState()
    state.player = { x: state.caveNpcSpot.x - 1, y: state.caveNpcSpot.y }
    state.playerFacing = 'right'

    interactWithCharacter(state)

    const dialog = () => {
      if (!state.activeDialog) throw new Error('no active dialog')
      return state.activeDialog
    }

    // Mark typing done, advance starts transition for line 0 -> 1
    dialog().typingDone = true
    expect(advanceDialog(state)).toBe(true)
    expect(dialog().transitioning).toBe(true)
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

describe('moab gift delivery', () => {
  it('gives an omnibox packed with 25 bees', () => {
    const state = makeCaveState()
    const omniboxesBefore = state.backpack.items.filter(i => i.definitionId === 'omnibox')
    const result = giveMoabGift(state)

    expect(result).toBe(true)
    expect(state.moabGiftGiven).toBe(true)

    // Find the new omnibox (not any pre-existing ones)
    const omniboxesAfter = state.backpack.items.filter(i => i.definitionId === 'omnibox')
    expect(omniboxesAfter.length).toBe(omniboxesBefore.length + 1)
    const newOmnibox = omniboxesAfter.find(
      o => !omniboxesBefore.some(b => b.uid === o.uid)
    )
    if (!newOmnibox) throw new Error('new omnibox not found')

    // Check the container has 25 bees
    const container = state.omniboxContainers.get(newOmnibox.uid)
    if (!container) throw new Error('omnibox container not found')
    expect(container.items).toHaveLength(25)
    expect(container.items.every(i => i.definitionId === 'bee')).toBe(true)
  })

  it('increments nextOmniboxNumber', () => {
    const state = makeCaveState()
    const before = state.nextOmniboxNumber
    giveMoabGift(state)
    expect(state.nextOmniboxNumber).toBe(before + 1)
  })

  it('returns false if backpack is full', () => {
    const state = makeCaveState()

    // Fill backpack completely by placing bees in every cell
    state.backpack.items = []
    for (let y = 0; y < state.backpack.height; y++) {
      for (let x = 0; x < state.backpack.width; x++) {
        state.backpack.items.push({
          uid: crypto.randomUUID(),
          definitionId: 'bee',
          rotation: 0,
          gridX: x,
          gridY: y,
        })
      }
    }

    const result = giveMoabGift(state)
    expect(result).toBe(false)
    expect(state.moabGiftGiven).toBe(false)
  })

  it('returns false if already given', () => {
    const state = makeCaveState()
    giveMoabGift(state)
    expect(state.moabGiftGiven).toBe(true)

    const result = giveMoabGift(state)
    expect(result).toBe(false)
  })
})

describe('moab subsequent interaction', () => {
  it('dialog is single line after gift', () => {
    const state = makeCaveState()
    giveMoabGift(state)

    const def = getCharacterDefinition('moab')
    expect(def.dialog).toEqual(['...'])
  })

  it('opens and closes dialog in one advance after gift', () => {
    const state = makeCaveState()
    giveMoabGift(state)

    state.player = { x: state.caveNpcSpot.x - 1, y: state.caveNpcSpot.y }
    state.playerFacing = 'right'

    interactWithCharacter(state)
    expect(state.activeDialog?.characterId).toBe('moab')
    expect(state.activeDialog?.lineIndex).toBe(0)

    // Mark typing done, only line -> close
    if (!state.activeDialog) throw new Error('no active dialog')
    state.activeDialog.typingDone = true
    expect(advanceDialog(state)).toBe(false)
    expect(state.activeDialog).toBeNull()
  })
})
