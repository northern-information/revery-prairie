import { enterCave, exitCave } from '../cave'
import { getCharacterDefinition, getCharacterDialog } from '../characters'
import { advanceDialog, giveCharacterGift, interactWithCharacter } from '../interaction'
import { getLore } from '../manual'
import { getBlockedPositions, movePlayer } from '../movement'
import { posKey } from '../position'
import { createGameState } from '../state'
import { Season, Zone } from '../types'
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

  it('has two dialog lines (precis #8a added an egregore refusal line)', () => {
    const def = getCharacterDefinition('moab')
    expect(def.dialog).toHaveLength(2)
    expect(def.dialog[0]).toBe('...')
    // The second line is Moab's egregore refusal. Folk register —
    // never names the egregores. Specific text is human-authored and
    // may change without breaking this assertion.
    expect(def.dialog[1].toLowerCase()).not.toContain('invasive')
    expect(def.dialog[1].toLowerCase()).not.toContain('egregore')
  })

  it('has no gift configured (re-anchored in precis #9)', () => {
    const def = getCharacterDefinition('moab')
    expect(def.gift).toBeUndefined()
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
    expect(state.activeDialog?.characterId).toBe('moab')
    expect(state.activeDialog?.lineIndex).toBe(0)
    expect(state.activeDialog?.typingDone).toBe(false)
  })

  it('two-line dialog advances through both lines before closing', () => {
    const state = makeCaveState()
    // Pin to Summer so getCharacterDialog returns the 2-line default
    // register — precis #9a routes Moab through a season-dispatched
    // dialog and Winter/Spring would otherwise add a third line.
    state.weather.season = Season.Summer
    state.player = { x: state.caveNpcSpot.x - 1, y: state.caveNpcSpot.y }
    state.playerFacing = 'right'

    interactWithCharacter(state)
    expect(state.activeDialog?.lineIndex).toBe(0)

    // First advance: typing done on line 0 -> transition to line 1
    if (!state.activeDialog) throw new Error('no active dialog')
    state.activeDialog.typingDone = true
    expect(advanceDialog(state).continuing).toBe(true)

    // Skip the transition fade and finish typing on line 1, then close.
    if (!state.activeDialog) throw new Error('no active dialog')
    state.activeDialog.transitioning = false
    state.activeDialog.lineIndex = 1
    state.activeDialog.typingDone = true
    expect(advanceDialog(state).continuing).toBe(false)
    expect(state.activeDialog).toBeNull()
  })
})

describe('moab gift delivery', () => {
  it('grants nothing — Moab is re-anchored in precis #9', () => {
    const state = makeCaveState()
    const result = giveCharacterGift(state, 'moab')
    expect(result).toBeNull()
    expect(state.giftsReceived.has('moab')).toBe(false)
  })

  it('returns null for character with no gift', () => {
    const state = makeCaveState()
    const result = giveCharacterGift(state, 'ghost-1')
    expect(result).toBeNull()
  })
})

describe('moab torchbearer voice (precis #9a)', () => {
  describe('title field', () => {
    it('moab has title "drip torchbearer"', () => {
      const def = getCharacterDefinition('moab')
      expect(def.title).toBe('drip torchbearer')
    })

    it('characters without a title return title === undefined', () => {
      expect(getCharacterDefinition('gron').title).toBeUndefined()
      expect(getCharacterDefinition('coyote').title).toBeUndefined()
      expect(getCharacterDefinition('gate').title).toBeUndefined()
    })
  })

  describe('music field stub', () => {
    it('moab has music set to /music/moab.mp3', () => {
      const def = getCharacterDefinition('moab')
      expect(def.music).toBe('/music/moab.mp3')
    })
  })

  describe('seasonal dialog registers', () => {
    const dialogForSeason = (season: Season): string[] => {
      const state = makeState()
      state.weather.season = season
      return getCharacterDialog(state, 'moab')
    }

    it('returns the Winter register in Winter', () => {
      const lines = dialogForSeason(Season.Winter)
      expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(lines).toContain('The line waits.')
    })

    it('returns the Spring register in Spring', () => {
      const lines = dialogForSeason(Season.Spring)
      expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(lines).toContain('The thaw.')
    })

    it('returns the same default register for Summer and Autumn', () => {
      const summer = dialogForSeason(Season.Summer)
      const autumn = dialogForSeason(Season.Autumn)
      expect(summer).toBe(autumn)
    })

    it("every register's last line is the precis #8a egregore refusal", () => {
      const seasons: Season[] = [Season.Winter, Season.Spring, Season.Summer, Season.Autumn]
      for (const season of seasons) {
        const lines = dialogForSeason(season)
        expect(lines[lines.length - 1]).toBe('The other clover. We do not grow that.')
      }
    })

    it('Winter and Spring registers differ from the default register', () => {
      const winter = dialogForSeason(Season.Winter)
      const spring = dialogForSeason(Season.Spring)
      const summer = dialogForSeason(Season.Summer)
      expect(winter).not.toBe(summer)
      expect(spring).not.toBe(summer)
      expect(winter).not.toBe(spring)
    })
  })

  describe('folk-Coldë voice rules', () => {
    const contractionPattern = /\b\w+'(t|s|re|ll|ve|d|m)\b/i

    it('no register contains contractions', () => {
      const state = makeState()
      const seasons: Season[] = [Season.Winter, Season.Spring, Season.Summer, Season.Autumn]
      for (const season of seasons) {
        state.weather.season = season
        const lines = getCharacterDialog(state, 'moab')
        for (const line of lines) {
          expect(line).not.toMatch(contractionPattern)
        }
      }
    })
  })

  describe('static dialog fallback', () => {
    it('CHARACTERS["moab"].dialog is preserved as the 2-line default fallback', () => {
      const def = getCharacterDefinition('moab')
      expect(def.dialog).toHaveLength(2)
      expect(def.dialog[0]).toBe('...')
      expect(def.dialog[1]).toBe('The other clover. We do not grow that.')
    })
  })

  describe('manual lore placeholder', () => {
    it('character:moab lore is reset to TODO pending human authoring', () => {
      expect(getLore('character:moab')).toBe('TODO')
    })
  })
})
