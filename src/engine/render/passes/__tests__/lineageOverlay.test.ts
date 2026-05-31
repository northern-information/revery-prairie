import { describe, expect, it } from 'vitest'
import { createFloraLifecycleEntry } from '../../../floraLifecycleEntry'
import { generateGenesisIdentity, generateTraitBag } from '../../../genetics'
import { posKey } from '../../../position'
import { FloraSpecies, OverlayMode, Zone } from '../../../types'
import { lineageOverlayPass } from '../lineageOverlay'
import { TEST_CHAR_METRICS, makeCanvasStub } from '../../../__tests__/canvasStub'
import { clearAroundPlayer, createTestState } from '../../../__tests__/helpers'

import type { GameState } from '../../../types'

const placeFlora = (
  state: GameState,
  x: number,
  y: number,
  species: FloraSpecies,
  opts: { parentPrefix?: string; crossDonorPrefix?: string; identitySeed?: string } = {}
): { key: string; identity: string } => {
  const identity = opts.identitySeed
    ? generateGenesisIdentity(species, 0, opts.identitySeed)
    : generateGenesisIdentity(species, 0, posKey(x, y))
  const traits = generateTraitBag(identity)
  const entry = createFloraLifecycleEntry({ time: 0, hasLight: true, species, identity, traits })
  if (opts.parentPrefix !== undefined) entry.parentPrefix = opts.parentPrefix
  if (opts.crossDonorPrefix !== undefined) entry.crossDonorPrefix = opts.crossDonorPrefix
  const key = posKey(x, y)
  state.floraLifecycle.set(key, entry)
  return { key, identity }
}

// Mark a species as "sequenced" by registering at least one scanned specimen.
const markSequenced = (state: GameState, species: FloraSpecies): void => {
  state.scannedSpecimens.set(species, [
    {
      identity: 'test-specimen',
      scannedAt: 0,
      position: { x: 0, y: 0 },
    },
  ])
}

describe('lineageOverlayPass', () => {
  describe('isActive', () => {
    it('is true on Overworld with OverlayMode.FamilyTree', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.overlayMode = OverlayMode.FamilyTree
      expect(lineageOverlayPass.isActive(state)).toBe(true)
    })

    it('is false when overlayMode is not FamilyTree', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.overlayMode = OverlayMode.Default
      expect(lineageOverlayPass.isActive(state)).toBe(false)
      state.overlayMode = OverlayMode.RootMycelium
      expect(lineageOverlayPass.isActive(state)).toBe(false)
    })

    it('is false in interior zones even when FamilyTree is on', () => {
      const state = createTestState()
      state.overlayMode = OverlayMode.FamilyTree
      for (const z of [Zone.Cave, Zone.HouseInterior, Zone.Ruin, Zone.LittleHouseYard] as const) {
        state.currentZone = z
        expect(lineageOverlayPass.isActive(state)).toBe(false)
      }
    })
  })

  describe('pass metadata', () => {
    it('registers in the effect slot with id "lineage-overlay"', () => {
      expect(lineageOverlayPass.id).toBe('lineage-overlay')
      expect(lineageOverlayPass.slot).toBe('effect')
    })
  })

  describe('draw', () => {
    it('draws nothing when no species is sequenced', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.overlayMode = OverlayMode.FamilyTree
      clearAroundPlayer(state, 5)
      // Place flora but do not sequence any species.
      placeFlora(state, state.player.x + 1, state.player.y, FloraSpecies.Clover, { identitySeed: 'a' })

      const { ctx, mocks } = makeCanvasStub()
      lineageOverlayPass.draw(ctx, state, TEST_CHAR_METRICS, 0)
      expect(mocks.stroke).not.toHaveBeenCalled()
    })

    it('draws a parent edge when a sequenced child has a matching parentPrefix in the index', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.overlayMode = OverlayMode.FamilyTree
      clearAroundPlayer(state, 8)
      markSequenced(state, FloraSpecies.Clover)

      // Parent tile.
      const parent = placeFlora(state, state.player.x + 1, state.player.y, FloraSpecies.Clover, { identitySeed: 'parent' })
      const parentPrefix = parent.identity.slice(0, 8)
      // Child tile referencing the parent via its identity prefix.
      placeFlora(state, state.player.x + 2, state.player.y, FloraSpecies.Clover, {
        identitySeed: 'child',
        parentPrefix,
      })

      const { ctx, mocks } = makeCanvasStub()
      lineageOverlayPass.draw(ctx, state, TEST_CHAR_METRICS, 0)
      expect(mocks.stroke).toHaveBeenCalled()
    })

    it('draws a donor edge when crossDonorPrefix resolves to an indexed flora', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.overlayMode = OverlayMode.FamilyTree
      clearAroundPlayer(state, 8)
      markSequenced(state, FloraSpecies.Clover)

      const donor = placeFlora(state, state.player.x + 1, state.player.y + 1, FloraSpecies.Clover, { identitySeed: 'donor' })
      const donorPrefix = donor.identity.slice(0, 8)
      placeFlora(state, state.player.x + 2, state.player.y, FloraSpecies.Clover, {
        identitySeed: 'crossed',
        crossDonorPrefix: donorPrefix,
      })

      const { ctx, mocks } = makeCanvasStub()
      lineageOverlayPass.draw(ctx, state, TEST_CHAR_METRICS, 0)
      expect(mocks.stroke).toHaveBeenCalled()
      // The donor pass sets a dashed line; verify setLineDash was called
      // with a non-empty dash pattern at some point.
      const dashCalls = mocks.setLineDash.mock.calls
      const sawDashedSet = dashCalls.some(call => Array.isArray(call[0]) && (call[0] as number[]).length > 0)
      expect(sawDashedSet).toBe(true)
    })

    it('restores globalAlpha and the prior dash pattern after drawing', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.overlayMode = OverlayMode.FamilyTree
      clearAroundPlayer(state, 8)
      markSequenced(state, FloraSpecies.Clover)
      placeFlora(state, state.player.x + 1, state.player.y, FloraSpecies.Clover, { identitySeed: 'x' })

      const { ctx } = makeCanvasStub()
      ctx.globalAlpha = 0.77
      lineageOverlayPass.draw(ctx, state, TEST_CHAR_METRICS, 0)
      expect(ctx.globalAlpha).toBe(0.77)
      expect(ctx.getLineDash()).toEqual([])
    })
  })
})
