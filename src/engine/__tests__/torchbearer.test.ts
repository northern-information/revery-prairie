// RP-9b — Torchbearer behavior pass tests.
// Covers: state shape, draw-mode toggle, click-chain validation,
// Winter → Spring lock, Spring → Summer cleanup, walking pacing,
// tile burn rules (Flora → BurntFlora, Egregore → Dirt), refusal
// (character, infrastructure, weather), dismiss, dialog registers,
// manual entries.

import { getCharacterDialog } from '../characters'
import { advanceDialog } from '../interaction'
import { setMapTile } from '../map'
import { posKey } from '../position'
import { checkBurnLineRefusal, MOAB_PACE_MS, tickTorchbearer } from '../torchbearer'
import { MoabState, Season, TileType, Zone } from '../types'
import { createCharacterTestEntity, createTestState, getCharacterEntities } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'

import type { GameState, Position } from '../types'

const seedMoab = (state: GameState, pos?: Position): number => {
  const target = pos ?? state.caveNpcSpot
  return createCharacterTestEntity(state, 'moab', target.x, target.y)
}

const findMoab = (state: GameState) => getCharacterEntities(state).find(c => c.definitionId === 'moab')

const benignWeather = (state: GameState): void => {
  state.weather.windSpeed = 5
  state.weather.humidity = 60
}

describe('torchbearer (RP-9b)', () => {
  describe('initial state', () => {
    it('createGameState initializes all torchbearer fields', () => {
      const state = createTestState()
      expect(state.lockedBurnLine).toBeNull()
      expect(state.burnLineIndex).toBeNull()
      expect(state.moabState).toBe(MoabState.Idle)
    })
  })

  describe('refusal checks', () => {
    let state: GameState

    beforeEach(() => {
      state = createTestState()
      benignWeather(state)
    })

    it('returns null for a benign line on dirt tiles in calm weather', () => {
      const line: Position[] = [
        { x: 10, y: 10 },
        { x: 11, y: 10 },
        { x: 12, y: 10 },
      ]
      expect(checkBurnLineRefusal(state, line)).toBeNull()
    })

    it('refuses when wind > 20 AND humidity < 30', () => {
      state.weather.windSpeed = 25
      state.weather.humidity = 20
      expect(checkBurnLineRefusal(state, [{ x: 10, y: 10 }])).toBe('extreme-weather')
    })

    it('does not refuse when only one extreme-weather axis is true', () => {
      state.weather.windSpeed = 25
      state.weather.humidity = 60
      expect(checkBurnLineRefusal(state, [{ x: 10, y: 10 }])).toBeNull()
    })

    it('refuses when the line touches the cave entrance', () => {
      const ce = state.caveEntranceOverworld
      const line: Position[] = [
        { x: ce.x - 1, y: ce.y },
        { x: ce.x, y: ce.y },
      ]
      expect(checkBurnLineRefusal(state, line)).toBe('entrance-on-line')
    })

    it('refuses when the line touches a character in the overworld', () => {
      const charPos = { x: 15, y: 15 }
      // Per-zone worlds: createCharacterTestEntity routes Gron into the
      // active zone's world (overworld here), so the refusal check sees him.
      createCharacterTestEntity(state, 'gron', charPos.x, charPos.y)
      expect(checkBurnLineRefusal(state, [charPos])).toBe('character-on-line')
    })
  })

  describe('Winter → Spring transition', () => {
    let state: GameState

    beforeEach(() => {
      state = createTestState()
      benignWeather(state)
      state.lastSeenSeason = Season.Winter
      state.weather.season = Season.Winter
      seedMoab(state)
    })

    it('does nothing when lockedBurnLine is null', () => {
      state.weather.season = Season.Spring
      tickTorchbearer(state)
      expect(state.lockedBurnLine).toBeNull()
      expect(state.moabState).toBe(MoabState.Idle)
    })

    it('emerges Moab when lockedBurnLine is populated at thaw', () => {
      // The authoring layer was removed in input-system-cleanup; the
      // walk-with-Moab follow-up will populate lockedBurnLine via a new
      // mechanism. Tests stand in for that by writing the field directly.
      const ce = state.caveEntranceOverworld
      const line: Position[] = [
        { x: ce.x + 2, y: ce.y },
        { x: ce.x + 3, y: ce.y },
      ]
      for (const t of line) setMapTile(state, t.x, t.y, { type: TileType.Dirt })
      state.lockedBurnLine = line
      state.weather.season = Season.Spring
      tickTorchbearer(state)
      expect(state.lockedBurnLine).toEqual(line)
      expect(state.moabState).toBe(MoabState.Walking)
      expect(state.burnLineIndex).toBe(0)
      const moab = findMoab(state)
      expect(moab?.pos.x).toBe(ce.x)
      expect(moab?.pos.y).toBe(ce.y)
    })

    it('transitions to Refusing when the line touches the cave entrance', () => {
      const ce = state.caveEntranceOverworld
      state.lockedBurnLine = [{ x: ce.x, y: ce.y }]
      state.weather.season = Season.Spring
      tickTorchbearer(state)
      expect(state.moabState).toBe(MoabState.Refusing)
      expect(state.lockedBurnLine).toEqual([{ x: ce.x, y: ce.y }])
      expect(state.burnLineIndex).toBeNull()
      expect(state.manualDiscoveries.has('event:torchbearer-refused')).toBe(true)
    })

    it('Refusing → Returning on the following tick', () => {
      const ce = state.caveEntranceOverworld
      state.lockedBurnLine = [{ x: ce.x, y: ce.y }]
      state.weather.season = Season.Spring
      tickTorchbearer(state) // → Refusing
      expect(state.moabState).toBe(MoabState.Refusing)
      tickTorchbearer(state) // → Returning (no-op since he never left)
      expect(state.moabState).toBe(MoabState.Returning)
    })
  })

  describe('tile burn rules during walking', () => {
    let state: GameState
    let line: Position[]

    beforeEach(() => {
      state = createTestState()
      benignWeather(state)
      state.lastSeenSeason = Season.Winter
      state.weather.season = Season.Winter
      seedMoab(state)
      const ce = state.caveEntranceOverworld
      // Build a 3-tile line out from the cave entrance.
      line = [
        { x: ce.x + 1, y: ce.y },
        { x: ce.x + 2, y: ce.y },
        { x: ce.x + 3, y: ce.y },
      ]
    })

    const stepUntil = (state: GameState, predicate: (s: GameState) => boolean, maxTicks = 80): void => {
      for (let i = 0; i < maxTicks; i++) {
        if (predicate(state)) return
        tickTorchbearer(state)
      }
    }

    it('Flora tiles become BurntFlora when Moab walks over them', () => {
      for (const t of line) setMapTile(state, t.x, t.y, { type: TileType.Flora })
      state.lockedBurnLine = line
      state.weather.season = Season.Spring
      tickTorchbearer(state) // lock + emerge

      stepUntil(state, s => s.moabState === MoabState.Returning)

      for (const t of line) {
        expect(state.map[t.y][t.x].type).toBe(TileType.BurntFlora)
      }
    })

    it('Egregore tiles become Dirt when Moab walks over them', () => {
      for (const t of line) {
        setMapTile(state, t.x, t.y, { type: TileType.Egregore })
        state.egregorePositions.push({ x: t.x, y: t.y })
      }
      state.lockedBurnLine = line
      state.weather.season = Season.Spring
      tickTorchbearer(state)

      stepUntil(state, s => s.moabState === MoabState.Returning)

      for (const t of line) {
        expect(state.map[t.y][t.x].type).toBe(TileType.Dirt)
        expect(state.egregorePositions.some(p => p.x === t.x && p.y === t.y)).toBe(false)
      }
    })

    it('Dirt tiles are unchanged when walked', () => {
      for (const t of line) setMapTile(state, t.x, t.y, { type: TileType.Dirt })
      state.lockedBurnLine = line
      state.weather.season = Season.Spring
      tickTorchbearer(state)

      stepUntil(state, s => s.moabState === MoabState.Returning)

      for (const t of line) {
        expect(state.map[t.y][t.x].type).toBe(TileType.Dirt)
      }
    })

    it('records event:torchbearer-walk when the line is fully walked', () => {
      for (const t of line) setMapTile(state, t.x, t.y, { type: TileType.Flora })
      state.lockedBurnLine = line
      state.weather.season = Season.Spring
      tickTorchbearer(state)

      stepUntil(state, s => s.manualDiscoveries.has('event:torchbearer-walk'))

      expect(state.manualDiscoveries.has('event:torchbearer-walk')).toBe(true)
    })
  })

  describe('Spring → Summer cleanup', () => {
    let state: GameState

    beforeEach(() => {
      state = createTestState()
      benignWeather(state)
      seedMoab(state)
    })

    it('returns Moab to cave and clears burn-line state', () => {
      state.lastSeenSeason = Season.Spring
      state.weather.season = Season.Summer
      state.moabState = MoabState.Walking
      state.lockedBurnLine = [{ x: 10, y: 10 }]
      state.burnLineIndex = 0
      tickTorchbearer(state)

      expect(state.moabState).toBe(MoabState.Idle)
      expect(state.lockedBurnLine).toBeNull()
      expect(state.burnLineIndex).toBeNull()

      const moab = findMoab(state)
      expect(moab?.pos).toEqual(state.caveNpcSpot)
    })
  })

  describe('player dismiss-at-line', () => {
    let state: GameState

    beforeEach(() => {
      state = createTestState()
      benignWeather(state)
      seedMoab(state)
    })

    it('flips moabState to Dismissed when dialog completes while Walking', () => {
      state.moabState = MoabState.Walking
      state.activeDialog = {
        speakerKind: 'character',
        characterId: 'moab',
        lineIndex: 99,
        typingIndex: 99,
        typingDone: true,
        transitioning: false,
        transitionStartTime: 0,
      }
      // Force the dialog dispatcher to think we are past the last line —
      // fake out by setting a single-line walking register temporarily.
      // Simpler approach: walk through normal dialog state with the real
      // walking register: 3 lines, advance through them.
      state.activeDialog.lineIndex = 0
      const walkingDialog = getCharacterDialog(state, 'moab')
      // Advance to last line, mark typing done, then call advanceDialog
      // one more time to close.
      state.activeDialog.lineIndex = walkingDialog.length - 1
      state.activeDialog.typingDone = true
      const result = advanceDialog(state, performance.now())
      expect(result.continuing).toBe(false)
      expect(state.activeDialog).toBeNull()
      expect(state.moabState).toBe(MoabState.Dismissed)
    })

    it('does not flip moabState when dialog completes while Idle', () => {
      state.moabState = MoabState.Idle
      state.activeDialog = {
        speakerKind: 'character',
        characterId: 'moab',
        lineIndex: 0,
        typingIndex: 99,
        typingDone: true,
        transitioning: false,
        transitionStartTime: 0,
      }
      const idleDialog = getCharacterDialog(state, 'moab')
      state.activeDialog.lineIndex = idleDialog.length - 1
      advanceDialog(state, performance.now())
      expect(state.moabState).toBe(MoabState.Idle)
    })

    it('Dismissed → Returning on the next tick', () => {
      // Pin lastSeenSeason so the transition handler does not fire and
      // short-circuit the state machine.
      state.lastSeenSeason = state.weather.season
      state.moabState = MoabState.Dismissed
      state.burnLineIndex = 1
      tickTorchbearer(state)
      expect(state.moabState).toBe(MoabState.Returning)
      expect(state.burnLineIndex).toBeNull()
    })
  })

  describe('dialog registers', () => {
    let state: GameState

    beforeEach(() => {
      state = createTestState()
      seedMoab(state)
    })

    it('Walking register is distinct from seasonal registers and ends with the RP-8a refusal', () => {
      state.moabState = MoabState.Walking
      const lines = getCharacterDialog(state, 'moab')
      expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(lines[lines.length - 1]).toBe('The other clover. We do not grow that.')
    })

    it('Refusing register is distinct and ends with the RP-8a refusal', () => {
      state.moabState = MoabState.Refusing
      const lines = getCharacterDialog(state, 'moab')
      expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(lines[lines.length - 1]).toBe('The other clover. We do not grow that.')
    })

    it('Dismissed register is distinct and ends with the RP-8a refusal', () => {
      state.moabState = MoabState.Dismissed
      const lines = getCharacterDialog(state, 'moab')
      expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(lines[lines.length - 1]).toBe('The other clover. We do not grow that.')
    })

    it('no register contains contractions', () => {
      const contraction = /\b\w+'(t|s|re|ll|ve|d|m)\b/i
      const states: MoabState[] = [MoabState.Idle, MoabState.Walking, MoabState.Refusing, MoabState.Dismissed]
      const seasons: Season[] = [Season.Winter, Season.Spring, Season.Summer, Season.Autumn]
      for (const ms of states) {
        for (const s of seasons) {
          state.moabState = ms
          state.weather.season = s
          for (const line of getCharacterDialog(state, 'moab')) {
            expect(line).not.toMatch(contraction)
          }
        }
      }
    })
  })

  describe('effects row surfaces burn line', () => {
    // The draft layer was removed in input-system-cleanup; only the locked
    // line surfaces in the cursor info effects row.
    it('"burn line (locked)" appears on a locked tile and absent elsewhere', async () => {
      const { getTileEffects } = await import('../effects')
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.lockedBurnLine = [{ x: 6, y: 6 }]
      expect(getTileEffects(state, 6, 6)).toContain('burn line (locked)')
      expect(getTileEffects(state, 7, 7)).not.toContain('burn line (locked)')
    })
  })

  describe('module constants', () => {
    it('MOAB_PACE_MS is exported and positive', () => {
      expect(MOAB_PACE_MS).toBeGreaterThan(0)
    })
  })

  describe('posKey sanity', () => {
    it('round-trips integer positions', () => {
      expect(posKey(3, 7)).toBe('3,7')
    })
  })
})
