import { ZONE_TRANSITION_FADE_IN_MS, ZONE_TRANSITION_FADE_OUT_MS, ZONE_TRANSITION_HOLD_MS } from '../constants'
import { completeGenesis, finalizeGenesisHandoff, GENESIS_EPOCHS, tickGenesis } from '../genesis'
import { Season, Zone } from '../types'
import { tickZoneTransition } from '../zoneTransition'

import type { GameState } from '../types'
import type { GameLoopCallbacks, TickSystem } from './types'

export const lifecycleSystems = (callbacks: GameLoopCallbacks): TickSystem[] => [
  {
    id: 'genesis',
    intervalMs: 0,
    zone: 'always' as const,
    phase: 'genesis' as const,
    priority: -25,
    fn: (() => {
      let lastRefresh = 0
      return (state: GameState, time: number) => {
        if (!state.genesis) return
        if (state.genesis.epochIndex >= GENESIS_EPOCHS.length) return

        const done = tickGenesis(state.genesis, GENESIS_EPOCHS, time)
        if (done) {
          completeGenesis(state)
          callbacks.onRefreshUI?.()
        } else if (time - lastRefresh >= 100) {
          // Throttled refresh during the genesis lerp.
          lastRefresh = time
          callbacks.onRefreshUI?.()
        }
      }
    })(),
  },
  {
    id: 'bootTitleCardTick',
    // Fast tick — the midpoint swap should land within ~1 frame of
    // its scheduled time so the renderer change is invisible under
    // full-black cover.
    intervalMs: 16,
    zone: 'always' as const,
    // 'always' so this fires both while state.genesis is set (during
    // the fade-in) and after it's cleared (during the fade-out).
    phase: 'always' as const,
    priority: -20,
    fn: (state: GameState, time: number) => {
      if (!state.bootTitleCard) return
      const elapsed = time - state.bootTitleCard.startTime
      const holdMidpoint = ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS / 2
      const total = ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS + ZONE_TRANSITION_FADE_OUT_MS

      // Hold-midpoint swap: clear genesis under full-black cover so the
      // renderer change is invisible. finalizeGenesisHandoff is a
      // no-op if state.genesis is already null.
      if (state.genesis && elapsed >= holdMidpoint) {
        finalizeGenesisHandoff(state, time)
        callbacks.onRefreshUI?.()
      }

      if (elapsed >= total) {
        state.bootTitleCard = null
        callbacks.onRefreshUI?.()
      }
    },
  },
  {
    // Drives the iris + ASCII dissolve transition between overworld
    // and cave / ruin interiors. Fires the deferred map swap at
    // midpoint and clears state.zoneTransition at progress >= 1.
    id: 'zoneTransitionTick',
    intervalMs: 0,
    zone: 'always' as const,
    phase: 'gameplay' as const,
    priority: -19,
    fn: (state: GameState, time: number) => {
      if (!state.zoneTransition) return
      const wasApplied = state.zoneTransition.swapApplied
      tickZoneTransition(state, time)
      // Request a UI refresh both when the swap fires at midpoint (so
      // useMusic / sidebar see the new zone immediately) and when the
      // transition clears at progress=1.
      if (state.zoneTransition?.swapApplied && !wasApplied) {
        callbacks.onRefreshUI?.()
      }
      if (state.zoneTransition === null) {
        callbacks.onRefreshUI?.()
      }
    },
  },
  {
    id: 'deepTimeTransitionCleanup',
    intervalMs: 100,
    zone: 'always' as const,
    phase: 'gameplay' as const,
    priority: -19,
    fn: (state: GameState, time: number) => {
      if (!state.deepTimeTransition) return
      const elapsed = time - state.deepTimeTransition.startTime
      if (elapsed >= state.deepTimeTransition.duration) {
        state.deepTimeTransition = null
        callbacks.onRefreshUI?.()
      }
    },
  },
  {
    // RP-34 — first-wake dialog with Emily. Fires on the first
    // eligible gameplay frame after the bootTitleCard clears, opening
    // Emily's auto-dialog before the steward has agency to move.
    // Latches state.tenureOpened so it never re-fires this tenure.
    // Priority -18 places it after bootTitleCardTick (-20) and
    // deepTimeTransitionCleanup (-19), and before movement (path -10).
    id: 'firstWakeTrigger',
    intervalMs: 0,
    zone: 'always' as const,
    phase: 'gameplay' as const,
    priority: -18,
    fn: (state: GameState) => {
      // Genesis is gated by phase: 'gameplay' above (see the phase
      // filter in tick()); no inline genesis check is needed or
      // permitted here.
      if (state.tenureOpened) return
      if (state.bootTitleCard) return
      if (state.currentZone !== Zone.HouseInterior) return
      if (state.activeDialog) return
      if (state.revery) return
      if (state.zoneTransition) return
      // EMILY_DIALOG[0] is the spring-equinox greeting ("Happy first
      // day of spring, steward."). On a non-spring tenure-open the
      // greeting is skipped — start at lineIndex 1 instead. The
      // greeting is reserved for first-wake-in-spring only; manual
      // [f] re-engagements also skip it (see interaction.ts).
      const startLineIndex = state.weather.season === Season.Spring ? 0 : 1
      state.activeDialog = {
        speakerKind: 'character',
        characterId: 'emily',
        lineIndex: startLineIndex,
        typingIndex: 0,
        typingDone: false,
        transitioning: false,
        transitionStartTime: 0,
      }
      state.tenureOpened = true
      callbacks.onRefreshUI?.()
    },
  },
]
