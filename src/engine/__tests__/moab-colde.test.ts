import { enterCave, exitCave } from '../cave'
import { getCharacterDefinition, getCharacterDialog } from '../characters'
import { advanceDialog, giveCharacterGift, interactWithCharacter } from '../interaction'
import { getBlockedPositions, movePlayer } from '../movement'
import { posKey } from '../position'
import { createGameState } from '../state'
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

  it('has single-line dialog', () => {
    const def = getCharacterDefinition('moab')
    expect(def.dialog).toHaveLength(1)
    expect(def.dialog[0]).toBe('...')
  })

  it('has fire revery gift configured', () => {
    const def = getCharacterDefinition('moab')
    expect(def.gift).toEqual({ kind: 'revery', id: 'fire' })
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
    expect(result.opened).toBe(true)
    expect(result.gift?.id).toBe('fire')
    expect(state.activeDialog?.characterId).toBe('moab')
    expect(state.activeDialog?.lineIndex).toBe(0)
    expect(state.activeDialog?.typingDone).toBe(false)
  })

  it('single line dialog opens and closes in one advance', () => {
    const state = makeCaveState()
    state.player = { x: state.caveNpcSpot.x - 1, y: state.caveNpcSpot.y }
    state.playerFacing = 'right'

    interactWithCharacter(state)
    expect(state.activeDialog?.lineIndex).toBe(0)

    // Mark typing done, only line -> close
    if (!state.activeDialog) throw new Error('no active dialog')
    state.activeDialog.typingDone = true
    expect(advanceDialog(state)).toBe(false)
    expect(state.activeDialog).toBeNull()
  })
})

describe('moab gift delivery', () => {
  it('gives fire revery on first dialog completion', () => {
    const state = makeCaveState()
    const result = giveCharacterGift(state, 'moab')

    expect(result).not.toBeNull()
    expect(result?.id).toBe('fire')
    expect(result?.name).toBe('Fire Revery')
    expect(state.reveries).toContain('fire')
    expect(state.giftsReceived.has('moab')).toBe(true)
  })

  it('auto-assigns fire revery to first action bar slot', () => {
    const state = makeCaveState()
    giveCharacterGift(state, 'moab')

    expect(state.actionBar[0]).not.toBeNull()
    expect(state.actionBar[0]?.kind).toBe('revery')
    expect(state.actionBar[0]?.id).toBe('fire')
  })

  it('returns null if already given', () => {
    const state = makeCaveState()
    giveCharacterGift(state, 'moab')

    const result = giveCharacterGift(state, 'moab')
    expect(result).toBeNull()
  })

  it('returns null for character with no gift', () => {
    const state = makeCaveState()
    const result = giveCharacterGift(state, 'ghost-1')
    expect(result).toBeNull()
  })

  it('records discovery for revery and gift event', () => {
    const state = makeCaveState()
    giveCharacterGift(state, 'moab')

    expect(state.manualDiscoveries.has('revery:fire')).toBe(true)
    expect(state.manualDiscoveries.has('event:moab-gift')).toBe(true)
  })
})

describe('moab subsequent interaction', () => {
  it('dialog switches to postGiftDialog after gift', () => {
    const state = makeCaveState()
    giveCharacterGift(state, 'moab')

    const dialog = getCharacterDialog(state, 'moab')
    expect(dialog).toEqual(['...'])
  })

  it('opens and closes dialog in one advance after gift', () => {
    const state = makeCaveState()
    giveCharacterGift(state, 'moab')

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
